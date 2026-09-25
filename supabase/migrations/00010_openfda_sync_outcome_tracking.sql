-- ==============================================================================
-- Migration: 00010_openfda_sync_outcome_tracking.sql
-- Description: Concurrency-safe outcome tracking (created / updated / unchanged)
--              using transaction-level advisory locks for openFDA drug sync RPC
--              and enhanced sync runs reporting metrics.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. ترقية جدول drug_sync_runs بحقول إحصائية صريحة وتوافقية رجعية
-- ------------------------------------------------------------------------------
ALTER TABLE public.drug_sync_runs
    ADD COLUMN IF NOT EXISTS accepted_count INT NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
    ADD COLUMN IF NOT EXISTS rejected_count INT NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
    ADD COLUMN IF NOT EXISTS created_count INT NOT NULL DEFAULT 0 CHECK (created_count >= 0),
    ADD COLUMN IF NOT EXISTS unchanged_count INT NOT NULL DEFAULT 0 CHECK (unchanged_count >= 0);

COMMENT ON COLUMN public.drug_sync_runs.accepted_count IS 'عدد السجلات المقبولة شكلياً وسريرياً في الدفعة';
COMMENT ON COLUMN public.drug_sync_runs.rejected_count IS 'عدد السجلات المرفوضة في مرحلة التحقق (مثل نقص المكونات الفعالة)';
COMMENT ON COLUMN public.drug_sync_runs.created_count IS 'عدد المنتجات الجديدة التي تم إدراجها لأول مرة';
COMMENT ON COLUMN public.drug_sync_runs.unchanged_count IS 'عدد المنتجات المطابقة تماماً للحمولة السابقة دون أي تغيير';

-- ------------------------------------------------------------------------------
-- 2. إعادة تعريف دالة upsert_openfda_drug_product لتعيد JSONB صريح بالنتيجة
--    تستخدم pg_advisory_xact_lock(hashtextextended(...)) لضمان التزامن الكامل (Concurrency-Safe)
--    النتائج الممكنة للحقل outcome:
--      - 'created':   لم يكن موجوداً وأُنشئ حديثاً.
--      - 'updated':   كان موجوداً وتغير payload_hash أو محتواه وتم تحديثه.
--      - 'unchanged': كان موجوداً وله نفس payload_hash تماماً.
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.upsert_openfda_drug_product(JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.upsert_openfda_drug_product(
    p_product JSONB,
    p_ingredients JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_product_id UUID;
    v_existing_id UUID;
    v_existing_hash TEXT;
    v_payload_hash TEXT;
    v_outcome TEXT;
    v_source_system VARCHAR(50);
    v_source_identifier VARCHAR(100);
    v_generic_name TEXT;
    v_display_name TEXT;
    v_dosage_form TEXT;
    v_brand_name TEXT;
    v_route TEXT;
    v_marketing_category TEXT;
    v_application_number TEXT;
    v_labeler_name TEXT;
    v_mkt_start_date DATE;
    v_mkt_end_date DATE;
    v_source_updated_at TIMESTAMPTZ;
    v_source_payload JSONB;
    v_item JSONB;
    v_ingredient_id UUID;
    v_current_ingredient_ids UUID[] := ARRAY[]::UUID[];
    v_order INT := 0;
    v_num_val NUMERIC;
    v_den_val NUMERIC;
BEGIN
    -- 1. التحقق من نوع p_product
    IF p_product IS NULL OR jsonb_typeof(p_product) != 'object' THEN
        RAISE EXCEPTION 'p_product must be a valid JSON object';
    END IF;

    -- 2. التحقق من أن source_system هو حصراً FDA_NDC
    v_source_system := TRIM(COALESCE(p_product->>'source_system', ''));
    IF v_source_system != 'FDA_NDC' THEN
        RAISE EXCEPTION 'source_system must strictly be FDA_NDC, received: %', v_source_system;
    END IF;

    -- 3. التحقق من source_identifier (product_ndc)
    v_source_identifier := NULLIF(TRIM(p_product->>'source_identifier'), '');
    IF v_source_identifier IS NULL THEN
        RAISE EXCEPTION 'source_identifier (product_ndc) is required';
    END IF;

    -- 4. التحقق الصارم من الحقول الإلزامية ورفض الفارغ تماماً دون استبدال مصطنع
    v_generic_name := NULLIF(TRIM(p_product->>'generic_name'), '');
    IF v_generic_name IS NULL THEN
        RAISE EXCEPTION 'generic_name is required and cannot be empty';
    END IF;

    v_display_name := NULLIF(TRIM(p_product->>'display_name'), '');
    IF v_display_name IS NULL THEN
        RAISE EXCEPTION 'display_name is required and cannot be empty';
    END IF;

    v_dosage_form := NULLIF(TRIM(p_product->>'dosage_form'), '');
    IF v_dosage_form IS NULL THEN
        RAISE EXCEPTION 'dosage_form is required and cannot be empty (unspecified values rejected)';
    END IF;

    v_brand_name := NULLIF(TRIM(p_product->>'brand_name'), '');
    v_route := NULLIF(TRIM(p_product->>'route'), '');
    v_marketing_category := NULLIF(TRIM(p_product->>'marketing_category'), '');
    v_application_number := NULLIF(TRIM(p_product->>'application_number'), '');
    v_labeler_name := NULLIF(TRIM(p_product->>'labeler_name'), '');
    v_mkt_start_date := public.safe_parse_iso_or_compact_date(p_product->>'marketing_start_date');
    v_mkt_end_date := public.safe_parse_iso_or_compact_date(p_product->>'marketing_end_date');
    v_source_updated_at := NULLIF(TRIM(p_product->>'source_updated_at'), '')::TIMESTAMPTZ;
    v_payload_hash := NULLIF(TRIM(p_product->>'payload_hash'), '');
    v_source_payload := p_product->'source_payload';

    -- 5. التحقق من أن p_ingredients مصفوفة JSON غير فارغة
    IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) != 'array' OR jsonb_array_length(p_ingredients) = 0 THEN
        RAISE EXCEPTION 'p_ingredients must be a non-empty JSON array';
    END IF;

    -- 6. قفل تزامني معاملي ذري على مستوى مفتاح الدواء (Deterministic Transaction Advisory Lock)
    -- يحمي حالة عدم وجود الصف ويمنع تماماً تنازع الاتصالات المتزامنة على نفس المنتج
    PERFORM pg_advisory_xact_lock(hashtextextended(v_source_system || ':' || v_source_identifier, 0));

    -- فحص وجود المنتج وهاش حمولته السابقة بأمان تام تحت القفل
    SELECT id, payload_hash
    INTO v_existing_id, v_existing_hash
    FROM public.drug_products
    WHERE source_system = v_source_system
      AND source_identifier = v_source_identifier;

    IF v_existing_id IS NULL THEN
        -- المنتج غير موجود: عملية INSERT مؤكدة أنها جديدة (created)
        INSERT INTO public.drug_products (
            source_system,
            source_identifier,
            brand_name,
            generic_name,
            display_name,
            dosage_form,
            route,
            country,
            is_local_product,
            status,
            marketing_category,
            application_number,
            labeler_name,
            marketing_start_date,
            marketing_end_date,
            source_updated_at,
            payload_hash,
            source_payload,
            retrieved_at,
            updated_at
        ) VALUES (
            v_source_system,
            v_source_identifier,
            v_brand_name,
            v_generic_name,
            v_display_name,
            v_dosage_form,
            v_route,
            'US',
            FALSE,
            'cached'::public.drug_product_status_type,
            v_marketing_category,
            v_application_number,
            v_labeler_name,
            v_mkt_start_date,
            v_mkt_end_date,
            v_source_updated_at,
            v_payload_hash,
            v_source_payload,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_product_id;

        v_outcome := 'created';

    ELSIF v_existing_hash IS NOT NULL AND v_payload_hash IS NOT NULL AND v_existing_hash = v_payload_hash THEN
        -- المنتج موجود والهاش المعياري متطابق 100%: تحديث وقت الاسترجاع فقط دون المساس بـ updated_at
        v_product_id := v_existing_id;
        v_outcome := 'unchanged';

        UPDATE public.drug_products
        SET retrieved_at = NOW()
        WHERE id = v_existing_id;

    ELSE
        -- المنتج موجود ولكن الهاش تغير أو كان فارغاً: تحديث كامل للبيانات وتحديث updated_at
        v_product_id := v_existing_id;
        v_outcome := 'updated';

        UPDATE public.drug_products
        SET
            brand_name = v_brand_name,
            generic_name = v_generic_name,
            display_name = v_display_name,
            dosage_form = v_dosage_form,
            route = v_route,
            marketing_category = v_marketing_category,
            application_number = v_application_number,
            labeler_name = v_labeler_name,
            marketing_start_date = v_mkt_start_date,
            marketing_end_date = v_mkt_end_date,
            source_updated_at = v_source_updated_at,
            payload_hash = v_payload_hash,
            source_payload = v_source_payload,
            retrieved_at = NOW(),
            updated_at = NOW()
        WHERE id = v_existing_id;
    END IF;

    -- 7. معالجة ومزامنة المكونات عند الإنشاء أو التحديث فقط
    -- في حالة unchanged: المكونات والروابط والأسماء متطابقة حتماً وموثقة بالهاش المعياري
    IF v_outcome IN ('created', 'updated') THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_ingredients)
        LOOP
            v_order := v_order + 1;

            IF NULLIF(TRIM(v_item->>'preferred_name'), '') IS NULL OR NULLIF(TRIM(v_item->>'normalized_name'), '') IS NULL THEN
                RAISE EXCEPTION 'Ingredient preferred_name and normalized_name cannot be empty';
            END IF;

            -- أ) Upsert للمادة الفعالة في drug_ingredients
            INSERT INTO public.drug_ingredients (
                source_system,
                source_identifier,
                preferred_name,
                normalized_name,
                status,
                retrieved_at,
                updated_at
            ) VALUES (
                v_source_system,
                TRIM(v_item->>'normalized_name'),
                TRIM(v_item->>'preferred_name'),
                TRIM(v_item->>'normalized_name'),
                'active'::public.drug_ingredient_status_type,
                NOW(),
                NOW()
            )
            ON CONFLICT (source_system, normalized_name) DO UPDATE SET
                preferred_name = EXCLUDED.preferred_name,
                updated_at = NOW()
            RETURNING id INTO v_ingredient_id;

            v_current_ingredient_ids := array_append(v_current_ingredient_ids, v_ingredient_id);

            -- تحويل قيم التركيز بأمان
            v_num_val := NULL;
            IF v_item->>'strength_numerator_value' IS NOT NULL AND (v_item->>'strength_numerator_value') != '' THEN
                v_num_val := (v_item->>'strength_numerator_value')::NUMERIC;
            END IF;

            v_den_val := NULL;
            IF v_item->>'strength_denominator_value' IS NOT NULL AND (v_item->>'strength_denominator_value') != '' THEN
                v_den_val := (v_item->>'strength_denominator_value')::NUMERIC;
            END IF;

            -- ب) Upsert لرابط المكون في drug_product_ingredients
            INSERT INTO public.drug_product_ingredients (
                product_id,
                ingredient_id,
                strength_numerator_value,
                strength_numerator_unit,
                strength_denominator_value,
                strength_denominator_unit,
                display_order
            ) VALUES (
                v_product_id,
                v_ingredient_id,
                v_num_val,
                NULLIF(TRIM(v_item->>'strength_numerator_unit'), ''),
                v_den_val,
                NULLIF(TRIM(v_item->>'strength_denominator_unit'), ''),
                COALESCE((v_item->>'display_order')::INT, v_order)
            )
            ON CONFLICT (product_id, ingredient_id) DO UPDATE SET
                strength_numerator_value = EXCLUDED.strength_numerator_value,
                strength_numerator_unit = EXCLUDED.strength_numerator_unit,
                strength_denominator_value = EXCLUDED.strength_denominator_value,
                strength_denominator_unit = EXCLUDED.strength_denominator_unit,
                display_order = EXCLUDED.display_order;
        END LOOP;

        -- 8. مزامنة دقيقة: حذف الروابط القديمة لهذا المنتج التي لم تعد موجودة في القائمة الجديدة
        DELETE FROM public.drug_product_ingredients
        WHERE product_id = v_product_id
          AND NOT (ingredient_id = ANY(v_current_ingredient_ids));

        -- 9. إدراج الاسم التجاري كمرادف إذا وجد ومختلف عن العلمي
        IF v_brand_name IS NOT NULL AND UPPER(v_brand_name) != UPPER(v_generic_name) THEN
            INSERT INTO public.drug_aliases (
                product_id,
                ingredient_id,
                alias_name,
                normalized_alias,
                alias_type,
                language,
                is_active
            ) VALUES (
                v_product_id,
                NULL,
                v_brand_name,
                LOWER(v_brand_name),
                'local_brand'::public.drug_alias_type,
                'en',
                TRUE
            )
            ON CONFLICT (product_id, normalized_alias, alias_type, language) WHERE product_id IS NOT NULL
            DO NOTHING;
        END IF;
    END IF;

    -- تنبيه: لا يتم لمس جدول clinic_drug_catalog إطلاقاً في عملية المزامنة
    RETURN jsonb_build_object(
        'product_id', v_product_id,
        'outcome', v_outcome
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. الصلاحيات: حجب كامل عن anon وauthenticated وإتاحة حصرياً لدور service_role
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.upsert_openfda_drug_product(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_openfda_drug_product(JSONB, JSONB) TO service_role;

COMMIT;

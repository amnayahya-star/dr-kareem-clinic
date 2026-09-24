-- ==============================================================================
-- Migration: OpenFDA Sync Hardening & Transactional Upsert RPC
-- Version: 00009_openfda_sync_hardening.sql
-- ==============================================================================
-- ⚠️  بيئة تطوير واختبار فقط — لم يُطبَّق على Supabase Production
-- ==============================================================================
-- الأهداف المعمارية والضمانات الصارمة:
--   1. إضافة أعمدة صريحة لبيانات التسويق وتحديث المصدر ولقطة source_payload في drug_products.
--   2. تطبيق قيود فريدة صريحة (Uniqueness constraints) على مستوى قاعدة البيانات
--      لمنع التكرار في drug_products و drug_ingredients.
--   3. دالة فحص وتفسير التواريخ الصارمة (safe_parse_iso_or_compact_date) التي
--      ترفض قطعياً التواريخ غير الصالحة كـ 30 فبراير وتحولها لـ NULL دون تدوير (No Rollover).
--   4. دالة RPC معاملية موحدة (upsert_openfda_drug_product) تضمن:
--      - حصر source_system بـ 'FDA_NDC' فقط.
--      - التحقق من أن p_product كائن JSON و p_ingredients مصفوفة غير فارغة.
--      - رفض السجل قطعياً إذا كان generic_name أو display_name أو dosage_form فارغاً (دون استخدام قيم مصطنعة مثل "Unspecified").
--      - مزامنة دقيقة للمكونات (Exact Synchronization): حذف روابط المكونات القديمة
--        غير الموجودة في الدفعة الجديدة من drug_product_ingredients، مع بقاء drug_ingredients العامة دون حذف.
--      - تحديث retrieved_at = NOW() و updated_at = NOW().
--      - Rollback كامل وتلقائي إذا فشل أي جزء من المعاملة.
--      - عدم لمس جدول clinic_drug_catalog نهائياً.
--   5. حصر الأذونات على service_role وحجبها عن anon و authenticated و PUBLIC.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. إضافة الأعمدة الصريحة لبيانات openFDA في public.drug_products
-- ------------------------------------------------------------------------------
ALTER TABLE public.drug_products
    ADD COLUMN IF NOT EXISTS marketing_category TEXT,
    ADD COLUMN IF NOT EXISTS application_number TEXT,
    ADD COLUMN IF NOT EXISTS labeler_name TEXT,
    ADD COLUMN IF NOT EXISTS marketing_start_date DATE,
    ADD COLUMN IF NOT EXISTS marketing_end_date DATE,
    ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS source_payload JSONB;

-- ------------------------------------------------------------------------------
-- 2. قيود الفرادة (Uniqueness Constraints)
-- ------------------------------------------------------------------------------

-- أ) قيد فريد لمنتجات الدواء بحسب نظام المصدر والمعرف
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_drug_products_source_system_identifier'
    ) THEN
        ALTER TABLE public.drug_products
            ADD CONSTRAINT uq_drug_products_source_system_identifier
            UNIQUE (source_system, source_identifier);
    END IF;
END $$;

-- ب) قيد فريد للمواد الفعالة بحسب نظام المصدر والاسم الموحد المطبع
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_drug_ingredients_source_normalized_name'
    ) THEN
        ALTER TABLE public.drug_ingredients
            ADD CONSTRAINT uq_drug_ingredients_source_normalized_name
            UNIQUE (source_system, normalized_name);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. قيد فحص طول payload_hash للتأكد من أنه SHA-256 hex string مكون من 64 خانة
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_dp_payload_hash_format'
    ) THEN
        ALTER TABLE public.drug_products
            ADD CONSTRAINT chk_dp_payload_hash_format
            CHECK (payload_hash IS NULL OR payload_hash ~ '^[a-f0-9]{64}$');
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. دالة التحقق الصارم من التواريخ (Strict Date Parsing Helper)
-- ترفض التواريخ المستحيلة كـ 30 فبراير وتحولها صراحةً إلى NULL دون تدوير
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.safe_parse_iso_or_compact_date(p_date_text TEXT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    v_trimmed TEXT;
    v_year INT;
    v_month INT;
    v_day INT;
    v_result DATE;
BEGIN
    IF p_date_text IS NULL THEN
        RETURN NULL;
    END IF;
    v_trimmed := TRIM(p_date_text);
    IF v_trimmed = '' THEN
        RETURN NULL;
    END IF;

    -- YYYYMMDD
    IF v_trimmed ~ '^\d{8}$' THEN
        v_year := SUBSTRING(v_trimmed FROM 1 FOR 4)::INT;
        v_month := SUBSTRING(v_trimmed FROM 5 FOR 2)::INT;
        v_day := SUBSTRING(v_trimmed FROM 7 FOR 2)::INT;
    -- YYYY-MM-DD
    ELSIF v_trimmed ~ '^\d{4}-\d{2}-\d{2}$' THEN
        v_year := SUBSTRING(v_trimmed FROM 1 FOR 4)::INT;
        v_month := SUBSTRING(v_trimmed FROM 6 FOR 2)::INT;
        v_day := SUBSTRING(v_trimmed FROM 9 FOR 2)::INT;
    ELSE
        RETURN NULL;
    END IF;

    -- الفحص المنطقي الأساسي
    IF v_year < 1900 OR v_year > 2100 OR v_month < 1 OR v_month > 12 OR v_day < 1 OR v_day > 31 THEN
        RETURN NULL;
    END IF;

    -- محاولة البناء الدقيق: تمنع التفاف الأيام (مثل 2026-02-30) وترمي استثناءً نلتقطه ونعيد NULL
    BEGIN
        v_result := make_date(v_year, v_month, v_day);
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. الدالة المعاملية الموحدة (Transactional Upsert RPC): upsert_openfda_drug_product
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_openfda_drug_product(
    p_product JSONB,
    p_ingredients JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_product_id UUID;
    v_source_system VARCHAR(50);
    v_source_identifier VARCHAR(100);
    v_generic_name TEXT;
    v_display_name TEXT;
    v_dosage_form TEXT;
    v_brand_name TEXT;
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

    -- 5. التحقق من أن p_ingredients مصفوفة JSON غير فارغة
    IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) != 'array' OR jsonb_array_length(p_ingredients) = 0 THEN
        RAISE EXCEPTION 'p_ingredients must be a non-empty JSON array';
    END IF;

    -- 6. إدراج أو تحديث المنتج في drug_products
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
        NULLIF(TRIM(p_product->>'route'), ''),
        'US',
        FALSE,
        'cached'::public.drug_product_status_type,
        NULLIF(TRIM(p_product->>'marketing_category'), ''),
        NULLIF(TRIM(p_product->>'application_number'), ''),
        NULLIF(TRIM(p_product->>'labeler_name'), ''),
        public.safe_parse_iso_or_compact_date(p_product->>'marketing_start_date'),
        public.safe_parse_iso_or_compact_date(p_product->>'marketing_end_date'),
        NULLIF(TRIM(p_product->>'source_updated_at'), '')::TIMESTAMPTZ,
        NULLIF(TRIM(p_product->>'payload_hash'), ''),
        p_product->'source_payload',
        NOW(),
        NOW()
    )
    ON CONFLICT (source_system, source_identifier) DO UPDATE SET
        brand_name = EXCLUDED.brand_name,
        generic_name = EXCLUDED.generic_name,
        display_name = EXCLUDED.display_name,
        dosage_form = EXCLUDED.dosage_form,
        route = EXCLUDED.route,
        marketing_category = EXCLUDED.marketing_category,
        application_number = EXCLUDED.application_number,
        labeler_name = EXCLUDED.labeler_name,
        marketing_start_date = EXCLUDED.marketing_start_date,
        marketing_end_date = EXCLUDED.marketing_end_date,
        source_updated_at = EXCLUDED.source_updated_at,
        payload_hash = EXCLUDED.payload_hash,
        source_payload = EXCLUDED.source_payload,
        retrieved_at = NOW(),
        updated_at = NOW()
    RETURNING id INTO v_product_id;

    -- 7. معالجة المكونات ومزامنتها الدقيقة (Exact Synchronization)
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

        -- تجميع معرف المادة الحالية
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
    -- ملاحظة: لا نحذف المادة من drug_ingredients العامة، نحذف فقط الرابط من drug_product_ingredients
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

    -- تنبيه: لا يتم لمس جدول clinic_drug_catalog إطلاقاً في عملية المزامنة
    RETURN v_product_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. الصلاحيات: حجب كامل عن العميل وإتاحة حصرياً لدور service_role
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.safe_parse_iso_or_compact_date(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.safe_parse_iso_or_compact_date(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_openfda_drug_product(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_openfda_drug_product(JSONB, JSONB) TO service_role;

COMMIT;

-- ==============================================================================
-- Migration: OpenFDA Drug Label Synchronization & Provenance Storage
-- Version: 00019_openfda_drug_label_sync.sql
-- Description:
--   1. Non-destructively expands public.drug_labels to store official openFDA
--      drug labeling texts, provenance identifiers, and clinical review status.
--   2. Enforces deterministic advisory locking and atomic upsert semantics via
--      public.upsert_openfda_drug_label RPC.
--   3. Restricts write access exclusively to service_role (revoked from anon/auth).
--   4. Preserves clinical review trail: approved labels with changed upstream
--      content transition safely to 'needs_re_review' without auto-approval.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. توسيع جدول public.drug_labels بصورة غير إتلافية (Non-Destructive Expansion)
-- ------------------------------------------------------------------------------

-- السماح لـ dailymed_set_id بأن يكون NULL لدعم مصادر النشرات المختلفة
ALTER TABLE public.drug_labels
    ALTER COLUMN dailymed_set_id DROP NOT NULL;

-- توسيع الحقول لإضافة معرفات SPL ونصوص النشرة الرسمية وبيانات المراجعة
ALTER TABLE public.drug_labels
    ADD COLUMN IF NOT EXISTS spl_set_id TEXT,
    ADD COLUMN IF NOT EXISTS spl_id TEXT,
    ADD COLUMN IF NOT EXISTS effective_time TEXT,
    ADD COLUMN IF NOT EXISTS application_number TEXT,
    ADD COLUMN IF NOT EXISTS marketing_category TEXT,
    ADD COLUMN IF NOT EXISTS dosage_and_administration TEXT,
    ADD COLUMN IF NOT EXISTS pediatric_use TEXT,
    ADD COLUMN IF NOT EXISTS indications_and_usage TEXT,
    ADD COLUMN IF NOT EXISTS contraindications TEXT,
    ADD COLUMN IF NOT EXISTS warnings_and_cautions TEXT,
    ADD COLUMN IF NOT EXISTS boxed_warning TEXT,
    ADD COLUMN IF NOT EXISTS drug_interactions TEXT,
    ADD COLUMN IF NOT EXISTS use_in_specific_populations TEXT,
    ADD COLUMN IF NOT EXISTS source_payload JSONB,
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(30) NOT NULL DEFAULT 'pending_review',
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS previous_review_status VARCHAR(30),
    ADD COLUMN IF NOT EXISTS previous_reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS previous_reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------------------
-- 2. قيود التحقق والفرادة (Constraints & Indexes)
-- ------------------------------------------------------------------------------

-- أ) قيد التحقق من حالات المراجعة الطبية المعتمدة
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_drug_labels_review_status'
    ) THEN
        ALTER TABLE public.drug_labels
            ADD CONSTRAINT chk_drug_labels_review_status
            CHECK (review_status IN ('pending_review', 'approved', 'rejected', 'needs_re_review'));
    END IF;
END $$;

-- ب) قيد التحقق من صيغة payload_hash (SHA-256 مكون من 64 خانة سداسية عشرية)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_dl_payload_hash_format'
    ) THEN
        ALTER TABLE public.drug_labels
            ADD CONSTRAINT chk_dl_payload_hash_format
            CHECK (payload_hash IS NULL OR payload_hash ~ '^[a-f0-9]{64}$');
    END IF;
END $$;

-- ج) قيد فريد يضمن وجود نشرة واحدة فقط لكل منتج من نفس نظام المصدر
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_drug_labels_product_source'
    ) THEN
        ALTER TABLE public.drug_labels
            ADD CONSTRAINT uq_drug_labels_product_source
            UNIQUE (product_id, source_system);
    END IF;
END $$;

-- د) فهارس الأداء للمراجعة السريرية والبحث بمعرفات SPL
CREATE INDEX IF NOT EXISTS idx_drug_labels_product_id ON public.drug_labels(product_id);
CREATE INDEX IF NOT EXISTS idx_drug_labels_spl_set_id ON public.drug_labels(spl_set_id);
CREATE INDEX IF NOT EXISTS idx_drug_labels_review_status ON public.drug_labels(review_status);

-- ------------------------------------------------------------------------------
-- 3. دالة Upsert المعاملية الذرية: public.upsert_openfda_drug_label
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_openfda_drug_label(
    p_label JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_product_id UUID;
    v_source_system VARCHAR(50);
    v_source_identifier VARCHAR(100);
    v_spl_set_id TEXT;
    v_spl_id TEXT;
    v_label_version TEXT;
    v_effective_time TEXT;
    v_application_number TEXT;
    v_marketing_category TEXT;
    v_label_url TEXT;
    v_dosage_and_admin TEXT;
    v_pediatric_use TEXT;
    v_indications TEXT;
    v_contraindications TEXT;
    v_warnings TEXT;
    v_boxed_warning TEXT;
    v_drug_interactions TEXT;
    v_specific_populations TEXT;
    v_payload_hash TEXT;
    v_source_payload JSONB;

    v_existing_id UUID;
    v_existing_hash TEXT;
    v_existing_status VARCHAR(30);
    v_existing_reviewed_by UUID;
    v_existing_reviewed_at TIMESTAMPTZ;
    v_existing_prev_status VARCHAR(30);
    v_existing_prev_reviewed_by UUID;
    v_existing_prev_reviewed_at TIMESTAMPTZ;

    v_existing_dosage TEXT;
    v_existing_pediatric TEXT;
    v_existing_indications TEXT;
    v_existing_contraindications TEXT;
    v_existing_warnings TEXT;
    v_existing_boxed TEXT;
    v_existing_interactions TEXT;
    v_existing_populations TEXT;

    v_label_id UUID;
    v_outcome TEXT;
    v_target_review_status VARCHAR(30);
    v_target_reviewed_by UUID;
    v_target_reviewed_at TIMESTAMPTZ;
    v_target_prev_status VARCHAR(30);
    v_target_prev_reviewed_by UUID;
    v_target_prev_reviewed_at TIMESTAMPTZ;
BEGIN
    -- 1. التحقق الصارم من نوع المعامل
    IF p_label IS NULL OR jsonb_typeof(p_label) != 'object' THEN
        RAISE EXCEPTION 'p_label must be a valid JSON object';
    END IF;

    -- 2. التحقق من product_id ووجوده الفعلي في drug_products
    IF NULLIF(TRIM(p_label->>'product_id'), '') IS NULL THEN
        RAISE EXCEPTION 'product_id is required';
    END IF;

    BEGIN
        v_product_id := (p_label->>'product_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'product_id must be a valid UUID, received: %', p_label->>'product_id';
    END;

    IF NOT EXISTS (SELECT 1 FROM public.drug_products WHERE id = v_product_id) THEN
        RAISE EXCEPTION 'product_id % does not exist in public.drug_products', v_product_id;
    END IF;

    -- 3. تحديد نظام المصدر والتحقق منه
    v_source_system := TRIM(COALESCE(p_label->>'source_system', 'OPENFDA_LABEL'));
    IF v_source_system = '' THEN
        v_source_system := 'OPENFDA_LABEL';
    END IF;

    v_source_identifier := NULLIF(TRIM(p_label->>'source_identifier'), '');
    v_spl_set_id := NULLIF(TRIM(p_label->>'spl_set_id'), '');
    v_spl_id := NULLIF(TRIM(p_label->>'spl_id'), '');
    v_label_version := NULLIF(TRIM(p_label->>'label_version'), '');
    v_effective_time := NULLIF(TRIM(p_label->>'effective_time'), '');
    v_application_number := NULLIF(TRIM(p_label->>'application_number'), '');
    v_marketing_category := NULLIF(TRIM(p_label->>'marketing_category'), '');
    v_label_url := NULLIF(TRIM(p_label->>'label_url'), '');
    v_dosage_and_admin := NULLIF(TRIM(p_label->>'dosage_and_administration'), '');
    v_pediatric_use := NULLIF(TRIM(p_label->>'pediatric_use'), '');
    v_indications := NULLIF(TRIM(p_label->>'indications_and_usage'), '');
    v_contraindications := NULLIF(TRIM(p_label->>'contraindications'), '');
    v_warnings := NULLIF(TRIM(p_label->>'warnings_and_cautions'), '');
    v_boxed_warning := NULLIF(TRIM(p_label->>'boxed_warning'), '');
    v_drug_interactions := NULLIF(TRIM(p_label->>'drug_interactions'), '');
    v_specific_populations := NULLIF(TRIM(p_label->>'use_in_specific_populations'), '');
    v_payload_hash := NULLIF(TRIM(p_label->>'payload_hash'), '');
    v_source_payload := p_label->'source_payload';

    -- 4. قفل تزامني ذري على مستوى معرّف الدواء لمنع التنازع
    PERFORM pg_advisory_xact_lock(hashtextextended('openfda_label:' || v_product_id::TEXT || ':' || v_source_system, 0));

    -- 5. فحص وجود السجل السابق وبيانات اعتماده
    SELECT
        id,
        payload_hash,
        review_status,
        reviewed_by,
        reviewed_at,
        previous_review_status,
        previous_reviewed_by,
        previous_reviewed_at,
        dosage_and_administration,
        pediatric_use,
        indications_and_usage,
        contraindications,
        warnings_and_cautions,
        boxed_warning,
        drug_interactions,
        use_in_specific_populations
    INTO
        v_existing_id,
        v_existing_hash,
        v_existing_status,
        v_existing_reviewed_by,
        v_existing_reviewed_at,
        v_existing_prev_status,
        v_existing_prev_reviewed_by,
        v_existing_prev_reviewed_at,
        v_existing_dosage,
        v_existing_pediatric,
        v_existing_indications,
        v_existing_contraindications,
        v_existing_warnings,
        v_existing_boxed,
        v_existing_interactions,
        v_existing_populations
    FROM public.drug_labels
    WHERE product_id = v_product_id
      AND source_system = v_source_system;

    IF v_existing_id IS NULL THEN
        -- 6. إنشاء سجل نشرة جديد لأول مرة
        -- يبدأ دائماً بحالة pending_review، وتظل حقول المراجعة NULL
        INSERT INTO public.drug_labels (
            product_id,
            source_system,
            source_identifier,
            dailymed_set_id,
            spl_set_id,
            spl_id,
            label_version,
            effective_time,
            application_number,
            marketing_category,
            label_url,
            dosage_and_administration,
            pediatric_use,
            indications_and_usage,
            contraindications,
            warnings_and_cautions,
            boxed_warning,
            drug_interactions,
            use_in_specific_populations,
            source_payload,
            payload_hash,
            review_status,
            reviewed_by,
            reviewed_at,
            retrieved_at,
            last_synced_at
        ) VALUES (
            v_product_id,
            v_source_system,
            v_source_identifier,
            COALESCE(v_spl_set_id, v_source_identifier),
            v_spl_set_id,
            v_spl_id,
            v_label_version,
            v_effective_time,
            v_application_number,
            v_marketing_category,
            v_label_url,
            v_dosage_and_admin,
            v_pediatric_use,
            v_indications,
            v_contraindications,
            v_warnings,
            v_boxed_warning,
            v_drug_interactions,
            v_specific_populations,
            v_source_payload,
            v_payload_hash,
            'pending_review',
            NULL,
            NULL,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_label_id;

        v_outcome := 'created';
        v_target_review_status := 'pending_review';

    ELSIF v_existing_hash IS NOT NULL AND v_payload_hash IS NOT NULL AND v_existing_hash = v_payload_hash THEN
        -- 7. السجل موجود والحمولة مطابقة تماماً (unchanged)
        -- تحديث وقت الاسترجاع والمزامنة فقط دون كتابة نصية غير ضرورية ودون مساس بحالة المراجعة
        UPDATE public.drug_labels
        SET
            retrieved_at = NOW(),
            last_synced_at = NOW()
        WHERE id = v_existing_id;

        v_label_id := v_existing_id;
        v_outcome := 'unchanged';
        v_target_review_status := v_existing_status;

    ELSE
        -- 8. السجل موجود وتغير محتوى النشرة أو لم يكن له هاش سابق (updated)
        -- إدارة حالة المراجعة بأمان:
        -- إذا كانت معتمدة سابقاً: تصبح needs_re_review مع أرشفة بيانات الاعتماد السابق
        -- إذا كانت pending_review أو rejected أو needs_re_review: تبقى كما هي
        IF v_existing_status = 'approved' THEN
            v_target_review_status := 'needs_re_review';
            v_target_prev_status := 'approved';
            v_target_prev_reviewed_by := v_existing_reviewed_by;
            v_target_prev_reviewed_at := v_existing_reviewed_at;
            v_target_reviewed_by := NULL;
            v_target_reviewed_at := NULL;
        ELSE
            v_target_review_status := v_existing_status;
            v_target_prev_status := v_existing_prev_status;
            v_target_prev_reviewed_by := v_existing_prev_reviewed_by;
            v_target_prev_reviewed_at := v_existing_prev_reviewed_at;
            v_target_reviewed_by := v_existing_reviewed_by;
            v_target_reviewed_at := v_existing_reviewed_at;
        END IF;

        -- التحديث غير الإتلافي للنصوص: لا نستبدل النص الصحيح بنص فارغ إذا نقص في التحديث الجديد
        UPDATE public.drug_labels
        SET
            source_identifier = COALESCE(v_source_identifier, source_identifier),
            dailymed_set_id = COALESCE(v_spl_set_id, dailymed_set_id),
            spl_set_id = COALESCE(v_spl_set_id, spl_set_id),
            spl_id = COALESCE(v_spl_id, spl_id),
            label_version = COALESCE(v_label_version, label_version),
            effective_time = COALESCE(v_effective_time, effective_time),
            application_number = COALESCE(v_application_number, application_number),
            marketing_category = COALESCE(v_marketing_category, marketing_category),
            label_url = COALESCE(v_label_url, label_url),
            dosage_and_administration = COALESCE(v_dosage_and_admin, v_existing_dosage),
            pediatric_use = COALESCE(v_pediatric_use, v_existing_pediatric),
            indications_and_usage = COALESCE(v_indications, v_existing_indications),
            contraindications = COALESCE(v_contraindications, v_existing_contraindications),
            warnings_and_cautions = COALESCE(v_warnings, v_existing_warnings),
            boxed_warning = COALESCE(v_boxed_warning, v_existing_boxed),
            drug_interactions = COALESCE(v_drug_interactions, v_existing_interactions),
            use_in_specific_populations = COALESCE(v_specific_populations, v_existing_populations),
            source_payload = COALESCE(v_source_payload, source_payload),
            payload_hash = v_payload_hash,
            review_status = v_target_review_status,
            reviewed_by = v_target_reviewed_by,
            reviewed_at = v_target_reviewed_at,
            previous_review_status = v_target_prev_status,
            previous_reviewed_by = v_target_prev_reviewed_by,
            previous_reviewed_at = v_target_prev_reviewed_at,
            retrieved_at = NOW(),
            last_synced_at = NOW()
        WHERE id = v_existing_id;

        v_label_id := v_existing_id;
        v_outcome := 'updated';
    END IF;

    -- إرجاع استجابة ذرية مفصلة
    RETURN jsonb_build_object(
        'success', true,
        'outcome', v_outcome,
        'label_id', v_label_id,
        'product_id', v_product_id,
        'review_status', v_target_review_status
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. تقييد الصلاحيات وحصرها بـ service_role فقط
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.upsert_openfda_drug_label(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_openfda_drug_label(JSONB) TO service_role;

COMMIT;

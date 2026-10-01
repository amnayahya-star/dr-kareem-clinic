-- ==============================================================================
-- Migration: Pediatric Dosage Calculator & Structured Clinical Rules (Phase 1)
-- Version: 00021_pediatric_dosage_calculator.sql
-- ==============================================================================
-- الضمانات والمعايير السريرية الصارمة:
-- 1. إنشاء جدول قواعد جرعات الأطفال المنظمة (public.pediatric_dosage_rules)
--    مع تمثيل صريح لحدود العمر الشاملة وغير الشاملة (age > 3 months)
--    وتمثيل صريح لحد الوزن الأقصى الصارم للقاعدة (weight < 40 kg).
-- 2. حظر استخدام أي قاعدة داخل الحاسبة ما لم تكن حالتها 'approved' صراحةً من طبيب مصرح له.
-- 3. توثيق وحفظ Snapshot كامل للمعايير التي اعتمدها الطبيب مع تاريخ ومعرف الطبيب.
-- 4. إبطال آلي (Auto-Invalidation): عند تحديث النشرة أو تغير payload_hash أو effective_time،
--    تتحول القواعد المعتمدة المرتبطة بها تلقائياً إلى 'needs_re_review'.
-- 5. إنشاء دالة RPC آمنة (public.review_pediatric_dosage_rule) مخصصة للأطباء حصراً
--    مع سحب الصلاحيات من anon و PUBLIC.
-- 6. سلوك Fail-Closed تام: لا توجد أي UUIDs ثابتة مرتبطة ببيئة معينة، ولا يتم إنشاء أي قاعدة
--    في حال وجود تطابق غامض أو عدم وجود النشرة، وتنجح الهجرة بسلاسة على قاعدة بيانات نظيفة.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. جدول قواعد جرعات الأطفال المنظمة (public.pediatric_dosage_rules)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pediatric_dosage_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.drug_products(id) ON DELETE CASCADE,
    drug_label_id UUID NOT NULL REFERENCES public.drug_labels(id) ON DELETE CASCADE,
    active_ingredient TEXT NOT NULL,
    dosage_form TEXT NOT NULL,
    route TEXT NOT NULL DEFAULT 'oral',

    -- حدود العمر الصريحة (Explicit Age Bounds)
    min_age_value NUMERIC(6, 2) NOT NULL DEFAULT 3.0,
    min_age_unit VARCHAR(20) NOT NULL DEFAULT 'months',
    min_age_inclusive BOOLEAN NOT NULL DEFAULT FALSE, -- strictly age > 3 months
    max_age_value NUMERIC(6, 2), -- اختياري ولا يستخدم كبديل لحد الوزن
    max_age_unit VARCHAR(20) DEFAULT 'months',
    max_age_inclusive BOOLEAN DEFAULT TRUE,

    -- حدود الوزن الصريحة (Explicit Weight Bounds)
    min_weight_kg NUMERIC(6, 2), -- اختياري
    min_weight_inclusive BOOLEAN DEFAULT TRUE,
    max_weight_kg NUMERIC(6, 2) NOT NULL DEFAULT 40.0,
    max_weight_inclusive BOOLEAN NOT NULL DEFAULT FALSE, -- strictly weight < 40 kg

    -- نطاق الجرعة المعتمد والتكرار
    min_dose_mg_per_kg_day NUMERIC(8, 2) NOT NULL,
    max_dose_mg_per_kg_day NUMERIC(8, 2) NOT NULL,
    allowed_frequencies JSONB NOT NULL DEFAULT '["every 12 hours", "every 8 hours"]'::jsonb,

    -- المصدر والتدقيق السريري
    source_reference TEXT NOT NULL,
    source_excerpt TEXT NOT NULL,
    label_payload_hash TEXT NOT NULL,
    label_effective_time TEXT,
    review_status VARCHAR(30) NOT NULL DEFAULT 'pending_review',
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    approved_snapshot JSONB, -- تسجيل نسخة مطابقة لما اعتمده الطبيب
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- قيود التحقق الصارمة لسلامة الجرعات
    CONSTRAINT chk_pdr_review_status CHECK (review_status IN ('pending_review', 'approved', 'rejected', 'needs_re_review')),
    CONSTRAINT chk_pdr_dose_range CHECK (min_dose_mg_per_kg_day > 0 AND max_dose_mg_per_kg_day >= min_dose_mg_per_kg_day),
    CONSTRAINT chk_pdr_age_range CHECK (min_age_value >= 0 AND (max_age_value IS NULL OR max_age_value >= min_age_value)),
    CONSTRAINT chk_pdr_weight_range CHECK (
        (min_weight_kg IS NULL OR min_weight_kg > 0) AND
        (max_weight_kg > 0) AND
        (min_weight_kg IS NULL OR max_weight_kg >= min_weight_kg)
    ),
    CONSTRAINT chk_pdr_frequencies_nonempty CHECK (jsonb_typeof(allowed_frequencies) = 'array' AND jsonb_array_length(allowed_frequencies) > 0),
    CONSTRAINT uq_product_label_rule UNIQUE (product_id, drug_label_id)
);

ALTER TABLE public.pediatric_dosage_rules
    ADD COLUMN IF NOT EXISTS min_age_value NUMERIC(6, 2) NOT NULL DEFAULT 3.0,
    ADD COLUMN IF NOT EXISTS min_age_unit VARCHAR(20) NOT NULL DEFAULT 'months',
    ADD COLUMN IF NOT EXISTS min_age_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS max_age_value NUMERIC(6, 2),
    ADD COLUMN IF NOT EXISTS max_age_unit VARCHAR(20) DEFAULT 'months',
    ADD COLUMN IF NOT EXISTS max_age_inclusive BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS min_weight_kg NUMERIC(6, 2),
    ADD COLUMN IF NOT EXISTS min_weight_inclusive BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS max_weight_kg NUMERIC(6, 2) NOT NULL DEFAULT 40.0,
    ADD COLUMN IF NOT EXISTS max_weight_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS approved_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_pediatric_dosage_rules_product ON public.pediatric_dosage_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_pediatric_dosage_rules_label ON public.pediatric_dosage_rules(drug_label_id);
CREATE INDEX IF NOT EXISTS idx_pediatric_dosage_rules_status ON public.pediatric_dosage_rules(review_status);

-- ------------------------------------------------------------------------------
-- 2. محفّز الإبطال الآلي عند تحديث النشرة الرسمية (Auto-Invalidation Trigger)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_invalidate_pediatric_rules_on_label_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- إذا تغير الهاش أو تاريخ السريان أو إصدار النشرة، يتم تحويل القواعد المعتمدة فوراً إلى needs_re_review
    IF (OLD.payload_hash IS DISTINCT FROM NEW.payload_hash)
       OR (OLD.effective_time IS DISTINCT FROM NEW.effective_time)
       OR (OLD.label_version IS DISTINCT FROM NEW.label_version) THEN
        UPDATE public.pediatric_dosage_rules
        SET
            review_status = 'needs_re_review',
            review_notes = COALESCE(review_notes, '') || E'\n[تنبيه أمان]: تم تحديث النشرة الرسمية للمنتج وتغير الهاش أو تاريخ السريان أو الإصدار. توقفت الحاسبة وتتطلب القاعدة مراجعة الطبيب وتأكيد الاعتماد مجدداً.',
            updated_at = NOW()
        WHERE drug_label_id = NEW.id AND review_status = 'approved';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drug_labels_invalidate_rules ON public.drug_labels;
CREATE TRIGGER trg_drug_labels_invalidate_rules
    AFTER UPDATE ON public.drug_labels
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_invalidate_pediatric_rules_on_label_change();

-- ------------------------------------------------------------------------------
-- 3. دالة RPC لمراجعة واعتماد/رفض قواعد الجرعات (Doctor Only)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_pediatric_dosage_rule(
    p_rule_id UUID,
    p_action TEXT, -- 'approve' | 'reject'
    p_notes TEXT,
    p_custom_fields JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_doctor_id UUID;
    v_rule RECORD;
    v_label RECORD;
    v_prod RECORD;
    v_result JSONB;
    v_min_dose NUMERIC;
    v_max_dose NUMERIC;
    v_min_age_val NUMERIC;
    v_min_age_inc BOOLEAN;
    v_max_weight NUMERIC;
    v_max_weight_inc BOOLEAN;
    v_allowed_freq JSONB;
    v_snapshot JSONB;
BEGIN
    -- 1. التحقق الصارم من صلاحية الطبيب وهوية الجلسة (auth.uid() فقط)
    IF NOT public.is_doctor() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة للأطباء المصرح لهم فقط'
            USING ERRCODE = '42501';
    END IF;

    v_doctor_id := auth.uid();
    IF v_doctor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: جلسة الطبيب غير صالحة'
            USING ERRCODE = '42501';
    END IF;

    -- 2. التحقق من صحة الإجراء وملاحظات المراجعة
    IF p_action NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'إجراء غير صالح: يجب أن يكون approve أو reject'
            USING ERRCODE = '22023';
    END IF;

    IF p_notes IS NULL OR TRIM(p_notes) = '' THEN
        RAISE EXCEPTION 'ملاحظات المراجعة الطبية إلزامية لتوثيق وتدقيق القرار السريري'
            USING ERRCODE = '22023';
    END IF;

    -- 3. قفل سجل القاعدة وسجل النشرة الرسمية FOR UPDATE لمنع أي سباق عمليات (Race Conditions)
    SELECT * INTO v_rule
    FROM public.pediatric_dosage_rules
    WHERE id = p_rule_id
    FOR UPDATE;

    IF v_rule.id IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على قاعدة الجرعات المطلوبة'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_label
    FROM public.drug_labels
    WHERE id = v_rule.drug_label_id
    FOR UPDATE;

    IF v_label.id IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على النشرة الرسمية المرتبطة بهذه القاعدة'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_prod
    FROM public.drug_products
    WHERE id = v_rule.product_id
    FOR SHARE;

    IF v_prod.id IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على المنتج الدوائي المرتبط بهذه القاعدة'
            USING ERRCODE = 'P0002';
    END IF;

    -- 4. التحقق الأمني من تطابق النشرة الرسمية مع المنتج الدوائي
    IF v_label.product_id != v_prod.id THEN
        RAISE EXCEPTION 'عدم تطابق أمني: النشرة الرسمية لا تنتمي للمنتج المرتبط بهذه القاعدة'
            USING ERRCODE = '23503';
    END IF;

    -- 5. إعادة قراءة ومطابقة الهاش الفعلي للنشرة المنبع داخل المعاملة
    IF v_label.payload_hash IS NULL OR TRIM(v_label.payload_hash) = '' THEN
        RAISE EXCEPTION 'النشرة الرسمية تفتقد الهاش المعتمد (payload_hash)'
            USING ERRCODE = '22000';
    END IF;

    IF v_rule.label_payload_hash != v_label.payload_hash THEN
        RAISE EXCEPTION 'تعذر الاعتماد: تم تعديل أو تحديث النشرة الرسمية المنبع وتغير الهاش. يجب مراجعة النشرة الحديثة وإعادة التوليد.'
            USING ERRCODE = '40001';
    END IF;

    IF p_action = 'approve' THEN
        -- استخراج القيم المعتمدة مع التدقيق السريري الصارم
        v_min_dose := COALESCE((p_custom_fields->>'min_dose_mg_per_kg_day')::NUMERIC, v_rule.min_dose_mg_per_kg_day);
        v_max_dose := COALESCE((p_custom_fields->>'max_dose_mg_per_kg_day')::NUMERIC, v_rule.max_dose_mg_per_kg_day);
        v_min_age_val := COALESCE((p_custom_fields->>'min_age_value')::NUMERIC, v_rule.min_age_value);
        v_min_age_inc := COALESCE((p_custom_fields->>'min_age_inclusive')::BOOLEAN, v_rule.min_age_inclusive);
        v_max_weight := COALESCE((p_custom_fields->>'max_weight_kg')::NUMERIC, v_rule.max_weight_kg);
        v_max_weight_inc := COALESCE((p_custom_fields->>'max_weight_inclusive')::BOOLEAN, v_rule.max_weight_inclusive);
        v_allowed_freq := COALESCE(p_custom_fields->'allowed_frequencies', v_rule.allowed_frequencies);

        IF v_min_dose <= 0 OR v_max_dose < v_min_dose THEN
            RAISE EXCEPTION 'نطاق الجرعة المعتمد غير صالح: الحد الأدنى % والأقصى %', v_min_dose, v_max_dose
                USING ERRCODE = '22023';
        END IF;

        IF v_min_age_val < 0 THEN
            RAISE EXCEPTION 'الحد الأدنى للعمر يجب أن يكون صفراً أو أكبر'
                USING ERRCODE = '22023';
        END IF;

        IF v_max_weight <= 0 THEN
            RAISE EXCEPTION 'الحد الأقصى للوزن يجب أن يكون أكبر من الصفر'
                USING ERRCODE = '22023';
        END IF;

        IF jsonb_typeof(v_allowed_freq) != 'array' OR jsonb_array_length(v_allowed_freq) = 0 THEN
            RAISE EXCEPTION 'تكرارات الجرعة المسموحة يجب أن تكون مصفوفة غير فارغة'
                USING ERRCODE = '22023';
        END IF;

        -- 6. إنشاء approved_snapshot داخل الخادم حصرياً من القيم الموثوقة وليس من JSON العميل
        v_snapshot := jsonb_build_object(
            'approved_at', NOW(),
            'approved_by', v_doctor_id, -- يُملأ حصراً من auth.uid()
            'product_id', v_prod.id,
            'product_source_system', v_prod.source_system,
            'product_source_identifier', v_prod.source_identifier,
            'drug_label_id', v_label.id,
            'label_payload_hash', v_label.payload_hash,
            'label_effective_time', v_label.effective_time,
            'min_dose_mg_per_kg_day', v_min_dose,
            'max_dose_mg_per_kg_day', v_max_dose,
            'min_age_value', v_min_age_val,
            'min_age_unit', v_rule.min_age_unit,
            'min_age_inclusive', v_min_age_inc,
            'max_weight_kg', v_max_weight,
            'max_weight_inclusive', v_max_weight_inc,
            'allowed_frequencies', v_allowed_freq,
            'source_reference', v_rule.source_reference,
            'review_notes', TRIM(p_notes)
        );

        UPDATE public.pediatric_dosage_rules
        SET
            review_status = 'approved',
            reviewed_by = v_doctor_id,
            reviewed_at = NOW(),
            review_notes = TRIM(p_notes),
            min_dose_mg_per_kg_day = v_min_dose,
            max_dose_mg_per_kg_day = v_max_dose,
            min_age_value = v_min_age_val,
            min_age_inclusive = v_min_age_inc,
            max_weight_kg = v_max_weight,
            max_weight_inclusive = v_max_weight_inc,
            allowed_frequencies = v_allowed_freq,
            label_payload_hash = v_label.payload_hash,
            label_effective_time = v_label.effective_time,
            approved_snapshot = v_snapshot,
            updated_at = NOW()
        WHERE id = p_rule_id;
    ELSE
        UPDATE public.pediatric_dosage_rules
        SET
            review_status = 'rejected',
            reviewed_by = v_doctor_id,
            reviewed_at = NOW(),
            review_notes = TRIM(p_notes),
            approved_snapshot = NULL,
            updated_at = NOW()
        WHERE id = p_rule_id;
    END IF;

    SELECT to_jsonb(r.*) INTO v_result
    FROM public.pediatric_dosage_rules r
    WHERE r.id = p_rule_id;

    RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. إعداد قاعدة Amoxicillin بحالة pending_review بسلوك حتمي وآمن (Fail-Closed)
-- ------------------------------------------------------------------------------
-- لا يعتمد على UUID ثابت ولا يفشل على قاعدة بيانات نظيفة
DO $$
DECLARE
    v_prod RECORD;
    v_label RECORD;
    v_label_count INT;
    v_rule_exists BOOLEAN;
BEGIN
    -- 1. البحث الحتمي عن منتج Amoxicillin المعلق السائل عبر source_identifier = '50090-6351'
    SELECT * INTO v_prod
    FROM public.drug_products
    WHERE source_identifier = '50090-6351'
    LIMIT 1;

    -- إذا لم يكن المنتج موجوداً بعد (مثل تشغيل على قاعدة بيانات نظيفة قبل مزامنة المنتجات)، لا تفشل الهجرة
    IF v_prod.id IS NULL THEN
        RAISE NOTICE 'Notice: Product 50090-6351 not found in drug_products; schema created cleanly, skipping rule seed.';
        RETURN;
    END IF;

    -- 2. التحقق من النشرة الرسمية المرتبطة بالمنتج دون أي غموض
    SELECT COUNT(*) INTO v_label_count
    FROM public.drug_labels
    WHERE product_id = v_prod.id;

    -- سلوك Fail-Closed: إذا لم توجد نشرة أو وُجد أكثر من نشرة واحدة دون معيار فرز حاسم، نتوقف فوراً
    IF v_label_count <> 1 THEN
        RAISE NOTICE 'Notice: Expected exactly 1 drug_label for product %, found %. Skipping rule creation to avoid ambiguity.', v_prod.id, v_label_count;
        RETURN;
    END IF;

    SELECT * INTO v_label
    FROM public.drug_labels
    WHERE product_id = v_prod.id;

    IF v_label.payload_hash IS NULL OR TRIM(v_label.payload_hash) = '' THEN
        RAISE NOTICE 'Notice: Drug label for product % has no payload_hash. Skipping rule creation.', v_prod.id;
        RETURN;
    END IF;

    -- 3. التحقق من عدم وجود القاعدة مسبقاً
    SELECT EXISTS (
        SELECT 1 FROM public.pediatric_dosage_rules
        WHERE product_id = v_prod.id AND drug_label_id = v_label.id
    ) INTO v_rule_exists;

    IF NOT v_rule_exists THEN
        INSERT INTO public.pediatric_dosage_rules (
            product_id,
            drug_label_id,
            active_ingredient,
            dosage_form,
            route,
            min_age_value,
            min_age_unit,
            min_age_inclusive,
            max_age_value,
            max_age_unit,
            max_age_inclusive,
            min_weight_kg,
            min_weight_inclusive,
            max_weight_kg,
            max_weight_inclusive,
            min_dose_mg_per_kg_day,
            max_dose_mg_per_kg_day,
            allowed_frequencies,
            source_reference,
            source_excerpt,
            label_payload_hash,
            label_effective_time,
            review_status,
            reviewed_by,
            reviewed_at,
            review_notes,
            approved_snapshot
        ) VALUES (
            v_prod.id,
            v_label.id,
            'Amoxicillin',
            COALESCE(v_prod.dosage_form, 'suspension'),
            COALESCE(v_prod.route, 'oral'),
            3.0,
            'months',
            FALSE, -- strictly age > 3 months
            NULL, -- لا نضع حداً أقصى للعمر؛ حد الوزن (< 40 kg) هو الضابط السريري المعتمد
            'months',
            TRUE,
            NULL,
            TRUE,
            40.0,
            FALSE, -- strictly weight < 40 kg
            20.00,
            45.00,
            '["every 12 hours", "every 8 hours"]'::jsonb,
            'openFDA Drug Labeling (' || COALESCE(v_label.source_identifier, '50090-6351') || ') Section 2.2 Table 1',
            COALESCE(v_label.dosage_and_administration, 'Pediatric Patients Aged 3 Months and Older and Weight Less than 40 kg: 20 to 45 mg/kg/day in divided doses every 8 to 12 hours.'),
            v_label.payload_hash, -- مستخرج ديناميكياً من السجل الحقيقي للنشرة
            v_label.effective_time, -- مستخرج ديناميكياً من السجل الحقيقي للنشرة
            'pending_review',
            NULL,
            NULL,
            'قاعدة سريرية أولية للأطفال أكبر من 3 أشهر ووزن أقل من 40 كغم مستخرجة من النشرة الرسمية، بانتظار مراجعة واعتماد الطبيب.',
            NULL
        );
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. إدارة الصلاحيات والأمان (RLS & Grant/Revoke)
-- ------------------------------------------------------------------------------
ALTER TABLE public.pediatric_dosage_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view pediatric dosage rules" ON public.pediatric_dosage_rules;
CREATE POLICY "Authenticated users can view pediatric dosage rules"
    ON public.pediatric_dosage_rules
    FOR SELECT
    TO authenticated
    USING (true);

REVOKE ALL ON public.pediatric_dosage_rules FROM PUBLIC, anon;
GRANT SELECT ON public.pediatric_dosage_rules TO authenticated;

REVOKE ALL ON FUNCTION public.review_pediatric_dosage_rule(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_pediatric_dosage_rule(UUID, TEXT, TEXT, JSONB) TO authenticated;

COMMIT;

-- ==============================================================================
-- Migration: Pediatric Dosage Regimens (Indication & Severity Coupled Regimens)
-- Version: 00022_pediatric_dosage_regimens.sql
-- ==============================================================================
-- الضمانات والمعايير السريرية وطبقة الأمان الصارمة:
-- 1. إنشاء جدول أنظمة الجرعات المنظمة (public.pediatric_dosage_regimens) التابع لـ pediatric_dosage_rules
-- 2. دعم التوسع العام للأدوية المستقبلية مع قيود سلامة أساسية على مستوى الجدول
-- 3. تطبيق اقتران سريري صارم لدواء Amoxicillin عبر Trigger مستقل (fn_check_pediatric_regimen_clinical_rules)
--    يربط الشدة بالجرعة والتكرار بحسب جدول 1 في القسم 2.2 من نشرة FDA (NDC 50090-6351):
--    - mild_moderate يسمح حصراً بـ: 25 mg/kg/day q12h (2 doses/day) أو 20 mg/kg/day q8h (3 doses/day)
--    - severe يسمح حصراً بـ: 45 mg/kg/day q12h (2 doses/day) أو 40 mg/kg/day q8h (3 doses/day)
--    - mild_moderate_or_severe (lower_respiratory_tract) يسمح حصراً بـ: 45 mg/kg/day q12h أو 40 mg/kg/day q8h
--    - الرفض الصارم على مستوى محرك قاعدة البيانات لأي اقتران مخالف برمز 23514.
--    - مطابقة محصنة للمادة الفعالة: lower(btrim(v_active_ingredient)) = 'amoxicillin'
--    - تأمين بيئة استدعاء الدوال بإعداد search_path = '' صريح.
-- 4. منع التكرار المنطقي للنظام داخل نفس القاعدة والمجموعة والشدة والتكرار.
-- 5. تحديث دالة RPC (public.review_pediatric_dosage_rule) بسلوك Fail-Closed وصلاحيات مقيدة صراحة:
--    - REVOKE من PUBLIC و anon، وحصر EXECUTE بـ authenticated مع فحص داخلي لـ is_doctor().
--    - التحقق من مطابقة رمز المنتج 50090-6351 ومطابقة الهاش الرقمي للنشرة.
--    - التحقق من وجود الأنظمة الـ 14 النشطة بالضبط دون زيادة أو نقصان أو تكرار.
--    - توثيق لقطة سريرية كاملة (approved_snapshot) داخل سجل التدقيق.
-- 6. سياسة RLS مقيدة للأطباء حصراً: USING (public.is_doctor()).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. جدول أنظمة جرعات الأطفال المنظمة (public.pediatric_dosage_regimens)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pediatric_dosage_regimens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES public.pediatric_dosage_rules(id) ON DELETE CASCADE,
    indication_group VARCHAR(60) NOT NULL,
    severity VARCHAR(40) NOT NULL,
    dose_mg_per_kg_day NUMERIC(6, 2) NOT NULL,
    interval_hours INTEGER NOT NULL,
    doses_per_day INTEGER NOT NULL,
    source_section VARCHAR(50) NOT NULL DEFAULT '2.2',
    source_table VARCHAR(50) NOT NULL DEFAULT 'Table 1',
    source_text TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- قيود التحقق العامة لسلامة الأنظمة
    CONSTRAINT chk_reg_dose_positive CHECK (dose_mg_per_kg_day > 0),
    CONSTRAINT chk_reg_interval_positive CHECK (interval_hours > 0),
    CONSTRAINT chk_reg_doses_per_day_sync CHECK (
        doses_per_day > 0 AND (24 / interval_hours = doses_per_day)
    ),
    -- منع التكرار المنطقي لنفس النظام داخل نفس القاعدة والمجموعة والشدة والتكرار
    CONSTRAINT uq_pediatric_dosage_regimen UNIQUE (rule_id, indication_group, severity, interval_hours, dose_mg_per_kg_day)
);

CREATE INDEX IF NOT EXISTS idx_pediatric_dosage_regimens_rule
    ON public.pediatric_dosage_regimens(rule_id);

CREATE INDEX IF NOT EXISTS idx_pediatric_dosage_regimens_lookup
    ON public.pediatric_dosage_regimens(rule_id, indication_group, severity);

-- ------------------------------------------------------------------------------
-- 2. دالة وTrigger للتحقق السريري الصارم الخاص بالأموكسيسيلين مع قابلية التوسع
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_check_pediatric_regimen_clinical_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_active_ingredient TEXT;
BEGIN
    -- استعلام المادة الفعالة من القاعدة الأب للتحقق المخصص
    SELECT active_ingredient INTO v_active_ingredient
    FROM public.pediatric_dosage_rules
    WHERE id = NEW.rule_id;

    -- التحقق السريري الخاص بـ Amoxicillin وفقاً لنشرة FDA Table 1 (مطابقة محصنة ومجردة من المسافات والأحرف الكبيرة)
    IF lower(btrim(v_active_ingredient)) = 'amoxicillin' THEN
        -- 1. التحقق من مجموعات الاستطباب المعتمدة
        IF NEW.indication_group NOT IN ('ear_nose_throat', 'skin_skin_structure', 'genitourinary_tract', 'lower_respiratory_tract') THEN
            RAISE EXCEPTION 'Amoxicillin regimen error: invalid indication_group %', NEW.indication_group
                USING ERRCODE = '23514';
        END IF;

        -- 2. التحقق من درجات الشدة المعتمدة
        IF NEW.severity NOT IN ('mild_moderate', 'severe', 'mild_moderate_or_severe') THEN
            RAISE EXCEPTION 'Amoxicillin regimen error: invalid severity %', NEW.severity
                USING ERRCODE = '23514';
        END IF;

        -- 3. الربط الصارم بين مجموعة الاستطباب ودرجة الشدة
        IF NEW.indication_group = 'lower_respiratory_tract' AND NEW.severity != 'mild_moderate_or_severe' THEN
            RAISE EXCEPTION 'Amoxicillin regimen error: lower_respiratory_tract requires severity mild_moderate_or_severe'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.indication_group IN ('ear_nose_throat', 'skin_skin_structure', 'genitourinary_tract')
           AND NEW.severity NOT IN ('mild_moderate', 'severe') THEN
            RAISE EXCEPTION 'Amoxicillin regimen error: % requires mild_moderate or severe', NEW.indication_group
                USING ERRCODE = '23514';
        END IF;

        -- 4. الاقتران الصارم بين الشدة والجرعة والتكرار:
        -- mild_moderate: 25 mg/kg/day q12h (2 doses/day) OR 20 mg/kg/day q8h (3 doses/day)
        IF NEW.severity = 'mild_moderate' THEN
            IF NOT (
                (NEW.dose_mg_per_kg_day = 25.00 AND NEW.interval_hours = 12 AND NEW.doses_per_day = 2) OR
                (NEW.dose_mg_per_kg_day = 20.00 AND NEW.interval_hours = 8 AND NEW.doses_per_day = 3)
            ) THEN
                RAISE EXCEPTION 'Amoxicillin regimen error: mild_moderate accepts only (25 mg/kg/day q12h) or (20 mg/kg/day q8h). Provided dose=%, interval=%, doses_per_day=%',
                    NEW.dose_mg_per_kg_day, NEW.interval_hours, NEW.doses_per_day
                    USING ERRCODE = '23514';
            END IF;
        -- severe & mild_moderate_or_severe: 45 mg/kg/day q12h (2 doses/day) OR 40 mg/kg/day q8h (3 doses/day)
        ELSIF NEW.severity IN ('severe', 'mild_moderate_or_severe') THEN
            IF NOT (
                (NEW.dose_mg_per_kg_day = 45.00 AND NEW.interval_hours = 12 AND NEW.doses_per_day = 2) OR
                (NEW.dose_mg_per_kg_day = 40.00 AND NEW.interval_hours = 8 AND NEW.doses_per_day = 3)
            ) THEN
                RAISE EXCEPTION 'Amoxicillin regimen error: % accepts only (45 mg/kg/day q12h) or (40 mg/kg/day q8h). Provided dose=%, interval=%, doses_per_day=%',
                    NEW.severity, NEW.dose_mg_per_kg_day, NEW.interval_hours, NEW.doses_per_day
                    USING ERRCODE = '23514';
            END IF;
        END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_pediatric_regimen_clinical_rules ON public.pediatric_dosage_regimens;
CREATE TRIGGER trg_check_pediatric_regimen_clinical_rules
    BEFORE INSERT OR UPDATE ON public.pediatric_dosage_regimens
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_check_pediatric_regimen_clinical_rules();

-- منع استدعاء دالة الـ Trigger مباشرة لأي دور
REVOKE ALL ON FUNCTION public.fn_check_pediatric_regimen_clinical_rules() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_check_pediatric_regimen_clinical_rules() FROM anon;
REVOKE ALL ON FUNCTION public.fn_check_pediatric_regimen_clinical_rules() FROM authenticated;

-- ------------------------------------------------------------------------------
-- 3. تحديث دالة RPC لاعتماد أو رفض قاعدة الجرعات بسلوك Fail-Closed تام
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
    v_regimen_count INT;
    v_valid_distinct_count INT;
    v_invalid_source_count INT;
    v_regimens_snapshot JSONB;
    v_result JSONB;
BEGIN
    -- 1. التحقق الصارم من صلاحية الطبيب وهوية الجلسة قبل أي قراءة أو تعديل
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

    -- 3. قفل سجل القاعدة وسجل النشرة الرسمية FOR UPDATE
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

    -- 6. في حال الاعتماد (approve): شروط صارمة تمنع الاعتماد الجزئي أو غير الدقيق
    IF p_action = 'approve' THEN
        -- تحقق خاص بدواء Amoxicillin
        IF lower(btrim(v_rule.active_ingredient)) = 'amoxicillin' THEN
            -- أ. التحقق من مطابقة رمز المنتج 50090-6351
            IF v_prod.source_identifier != '50090-6351' THEN
                RAISE EXCEPTION 'عدم تطابق أمني: قاعدة أموكسيسيلين تتطلب منتج openFDA برمز NDC 50090-6351 حصراً'
                    USING ERRCODE = '23503';
            END IF;

            -- ب. التحقق من عدد الأنظمة النشطة بالضبط (يجب أن يكون 14 تماماً)
            SELECT COUNT(*) INTO v_regimen_count
            FROM public.pediatric_dosage_regimens
            WHERE rule_id = v_rule.id AND is_active = TRUE;

            IF v_regimen_count != 14 THEN
                RAISE EXCEPTION 'تعذر الاعتماد: قاعدة أموكسيسيلين تتطلب وجود الأنظمة الـ 14 المعتمدة بنشرة FDA بدقة دون زيادة أو نقصان (العدد الحالي: %)', v_regimen_count
                    USING ERRCODE = '22000';
            END IF;

            -- ج. التحقق الرياضي من احتواء القاعدة على التوليفة الدقيقة للـ 14 نظاماً المعتمدة في جدول FDA Table 1 دون أي شذوذ
            SELECT COUNT(DISTINCT (indication_group, severity, dose_mg_per_kg_day, interval_hours))
            INTO v_valid_distinct_count
            FROM public.pediatric_dosage_regimens
            WHERE rule_id = v_rule.id AND is_active = TRUE
              AND (
                (indication_group IN ('ear_nose_throat', 'skin_skin_structure', 'genitourinary_tract') AND (
                  (severity = 'mild_moderate' AND (
                    (dose_mg_per_kg_day = 25.00 AND interval_hours = 12 AND doses_per_day = 2) OR
                    (dose_mg_per_kg_day = 20.00 AND interval_hours = 8 AND doses_per_day = 3)
                  )) OR
                  (severity = 'severe' AND (
                    (dose_mg_per_kg_day = 45.00 AND interval_hours = 12 AND doses_per_day = 2) OR
                    (dose_mg_per_kg_day = 40.00 AND interval_hours = 8 AND doses_per_day = 3)
                  ))
                ))
                OR
                (indication_group = 'lower_respiratory_tract' AND severity = 'mild_moderate_or_severe' AND (
                  (dose_mg_per_kg_day = 45.00 AND interval_hours = 12 AND doses_per_day = 2) OR
                  (dose_mg_per_kg_day = 40.00 AND interval_hours = 8 AND doses_per_day = 3)
                ))
              );

            IF v_valid_distinct_count != 14 THEN
                RAISE EXCEPTION 'تعذر الاعتماد: أنظمة الجرعات غير مكتملة أو تحتوي على تكرار أو تركيبات غير مطابقة لجدول FDA Table 1 (المطابق: % من 14)', v_valid_distinct_count
                    USING ERRCODE = '22000';
            END IF;

            -- د. التحقق من الإحالة المصدرية الصحيحة لجميع الأنظمة
            SELECT COUNT(*) INTO v_invalid_source_count
            FROM public.pediatric_dosage_regimens
            WHERE rule_id = v_rule.id AND is_active = TRUE
              AND (source_table != 'Table 1' OR source_section != '2.2');

            IF v_invalid_source_count > 0 THEN
                RAISE EXCEPTION 'تعذر الاعتماد: توجد أنظمة لا تشير إلى مصدر النشرة المعتمد (Section 2.2, Table 1)'
                    USING ERRCODE = '22000';
            END IF;
        ELSE
            -- فحص عام لأي دواء مستقبلي: يجب توفر نظام واحد نشط على الأقل
            SELECT COUNT(*) INTO v_regimen_count
            FROM public.pediatric_dosage_regimens
            WHERE rule_id = v_rule.id AND is_active = TRUE;

            IF v_regimen_count = 0 THEN
                RAISE EXCEPTION 'تعذر الاعتماد: لا توجد أنظمة جرعات نشطة مسجلة لهذه القاعدة'
                    USING ERRCODE = '22000';
            END IF;
        END IF;

        -- تجميع لقطة موثقة للأنظمة المعتمدة من المصدر
        SELECT COALESCE(jsonb_agg(to_jsonb(r.*)), '[]'::jsonb)
        INTO v_regimens_snapshot
        FROM public.pediatric_dosage_regimens r
        WHERE r.rule_id = v_rule.id AND r.is_active = TRUE;

        UPDATE public.pediatric_dosage_rules
        SET
            review_status = 'approved',
            reviewed_by = v_doctor_id,
            reviewed_at = NOW(),
            review_notes = TRIM(p_notes),
            approved_snapshot = jsonb_build_object(
                'approved_at', NOW(),
                'doctor_id', v_doctor_id,
                'min_age_value', v_rule.min_age_value,
                'min_age_inclusive', v_rule.min_age_inclusive,
                'max_weight_kg', v_rule.max_weight_kg,
                'max_weight_inclusive', v_rule.max_weight_inclusive,
                'label_payload_hash', v_label.payload_hash,
                'label_effective_time', v_label.effective_time,
                'regimens_count', v_regimen_count,
                'regimens', v_regimens_snapshot
            ),
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

-- صلاحيات صريحة ومقيدة لدالة RPC: حجب PUBLIC و anon، وحصر EXECUTE بـ authenticated
REVOKE ALL ON FUNCTION public.review_pediatric_dosage_rule(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_pediatric_dosage_rule(UUID, TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_pediatric_dosage_rule(UUID, TEXT, TEXT, JSONB) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. تعبئة الأنظمة الرسمية الـ 14 لقاعدة Amoxicillin (NDC 50090-6351)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_prod RECORD;
    v_rule RECORD;
BEGIN
    SELECT * INTO v_prod
    FROM public.drug_products
    WHERE source_identifier = '50090-6351'
    LIMIT 1;

    IF v_prod.id IS NULL THEN
        RAISE NOTICE 'Notice: Product 50090-6351 not found in drug_products; schema created cleanly, skipping regimen seed.';
        RETURN;
    END IF;

    SELECT * INTO v_rule
    FROM public.pediatric_dosage_rules
    WHERE product_id = v_prod.id
    LIMIT 1;

    IF v_rule.id IS NULL THEN
        RAISE NOTICE 'Notice: Rule for product 50090-6351 not found; skipping regimen seed.';
        RETURN;
    END IF;

    -- 1. Ear/Nose/Throat (الأذن والأنف والحنجرة)
    -- Mild/Moderate: 25 mg/kg/day q12h OR 20 mg/kg/day q8h
    INSERT INTO public.pediatric_dosage_regimens (
        rule_id, indication_group, severity, dose_mg_per_kg_day, interval_hours, doses_per_day,
        source_section, source_table, source_text, is_active
    ) VALUES
        (v_rule.id, 'ear_nose_throat', 'mild_moderate', 25.00, 12, 2, '2.2', 'Table 1', 'Ear/Nose/Throat - Mild/Moderate: 25 mg/kg/day in divided doses every 12 hours', TRUE),
        (v_rule.id, 'ear_nose_throat', 'mild_moderate', 20.00, 8, 3, '2.2', 'Table 1', 'Ear/Nose/Throat - Mild/Moderate: 20 mg/kg/day in divided doses every 8 hours', TRUE),
        (v_rule.id, 'ear_nose_throat', 'severe', 45.00, 12, 2, '2.2', 'Table 1', 'Ear/Nose/Throat - Severe: 45 mg/kg/day in divided doses every 12 hours', TRUE),
        (v_rule.id, 'ear_nose_throat', 'severe', 40.00, 8, 3, '2.2', 'Table 1', 'Ear/Nose/Throat - Severe: 40 mg/kg/day in divided doses every 8 hours', TRUE)
    ON CONFLICT (rule_id, indication_group, severity, interval_hours, dose_mg_per_kg_day) DO NOTHING;

    -- 2. Skin/Skin Structure (الجلد وأنسجة الجلد)
    -- Mild/Moderate: 25 mg/kg/day q12h OR 20 mg/kg/day q8h
    INSERT INTO public.pediatric_dosage_regimens (
        rule_id, indication_group, severity, dose_mg_per_kg_day, interval_hours, doses_per_day,
        source_section, source_table, source_text, is_active
    ) VALUES
        (v_rule.id, 'skin_skin_structure', 'mild_moderate', 25.00, 12, 2, '2.2', 'Table 1', 'Skin/Skin Structure - Mild/Moderate: 25 mg/kg/day in divided doses every 12 hours', TRUE),
        (v_rule.id, 'skin_skin_structure', 'mild_moderate', 20.00, 8, 3, '2.2', 'Table 1', 'Skin/Skin Structure - Mild/Moderate: 20 mg/kg/day in divided doses every 8 hours', TRUE),
        (v_rule.id, 'skin_skin_structure', 'severe', 45.00, 12, 2, '2.2', 'Table 1', 'Skin/Skin Structure - Severe: 45 mg/kg/day in divided doses every 12 hours', TRUE),
        (v_rule.id, 'skin_skin_structure', 'severe', 40.00, 8, 3, '2.2', 'Table 1', 'Skin/Skin Structure - Severe: 40 mg/kg/day in divided doses every 8 hours', TRUE)
    ON CONFLICT (rule_id, indication_group, severity, interval_hours, dose_mg_per_kg_day) DO NOTHING;

    -- 3. Genitourinary Tract (الجهاز البولي والتناسلي)
    -- Mild/Moderate: 25 mg/kg/day q12h OR 20 mg/kg/day q8h
    INSERT INTO public.pediatric_dosage_regimens (
        rule_id, indication_group, severity, dose_mg_per_kg_day, interval_hours, doses_per_day,
        source_section, source_table, source_text, is_active
    ) VALUES
        (v_rule.id, 'genitourinary_tract', 'mild_moderate', 25.00, 12, 2, '2.2', 'Table 1', 'Genitourinary Tract - Mild/Moderate: 25 mg/kg/day in divided doses every 12 hours', TRUE),
        (v_rule.id, 'genitourinary_tract', 'mild_moderate', 20.00, 8, 3, '2.2', 'Table 1', 'Genitourinary Tract - Mild/Moderate: 20 mg/kg/day in divided doses every 8 hours', TRUE),
        (v_rule.id, 'genitourinary_tract', 'severe', 45.00, 12, 2, '2.2', 'Table 1', 'Genitourinary Tract - Severe: 45 mg/kg/day in divided doses every 12 hours', TRUE),
        (v_rule.id, 'genitourinary_tract', 'severe', 40.00, 8, 3, '2.2', 'Table 1', 'Genitourinary Tract - Severe: 40 mg/kg/day in divided doses every 8 hours', TRUE)
    ON CONFLICT (rule_id, indication_group, severity, interval_hours, dose_mg_per_kg_day) DO NOTHING;

    -- 4. Lower Respiratory Tract (الجهاز التنفسي السفلي)
    -- Mild/Moderate or Severe: 45 mg/kg/day q12h OR 40 mg/kg/day q8h
    INSERT INTO public.pediatric_dosage_regimens (
        rule_id, indication_group, severity, dose_mg_per_kg_day, interval_hours, doses_per_day,
        source_section, source_table, source_text, is_active
    ) VALUES
        (v_rule.id, 'lower_respiratory_tract', 'mild_moderate_or_severe', 45.00, 12, 2, '2.2', 'Table 1', 'Lower Respiratory Tract - Mild/Moderate or Severe: 45 mg/kg/day in divided doses every 12 hours', TRUE),
        (v_rule.id, 'lower_respiratory_tract', 'mild_moderate_or_severe', 40.00, 8, 3, '2.2', 'Table 1', 'Lower Respiratory Tract - Mild/Moderate or Severe: 40 mg/kg/day in divided doses every 8 hours', TRUE)
    ON CONFLICT (rule_id, indication_group, severity, interval_hours, dose_mg_per_kg_day) DO NOTHING;
END $$;

-- ------------------------------------------------------------------------------
-- 5. إدارة الصلاحيات وسياسات الأمان (RLS & Least Privilege Grants)
-- ------------------------------------------------------------------------------
ALTER TABLE public.pediatric_dosage_regimens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can view pediatric dosage regimens" ON public.pediatric_dosage_regimens;
DROP POLICY IF EXISTS "Authenticated users can view pediatric dosage regimens" ON public.pediatric_dosage_regimens;
CREATE POLICY "Doctors can view pediatric dosage regimens"
    ON public.pediatric_dosage_regimens
    FOR SELECT
    TO authenticated
    USING (public.is_doctor());

-- حجب كافة الصلاحيات المباشرة (INSERT, UPDATE, DELETE, TRUNCATE) عن الجميع وعن authenticated
REVOKE ALL ON public.pediatric_dosage_regimens FROM PUBLIC, anon, authenticated;

-- منح القراءة فقط للمصرح لهم (خاضع لسياسة RLS للأطباء) مع حظر قاطع ومباشر لـ INSERT/UPDATE/DELETE
GRANT SELECT ON public.pediatric_dosage_regimens TO authenticated;

COMMIT;

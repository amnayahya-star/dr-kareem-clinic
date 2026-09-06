-- ==============================================================================
-- Migration: Stabilize Visit Workflow and Clinical Examination Transactions
-- Version: 00005_stabilize_visit_workflow.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. التأكد من وجود أعمدة جدول التشخيص (diagnoses) والزيارات (visits)
-- ------------------------------------------------------------------------------

ALTER TABLE public.diagnoses ADD COLUMN IF NOT EXISTS symptoms TEXT;
ALTER TABLE public.diagnoses ADD COLUMN IF NOT EXISTS present_illness_history TEXT;
ALTER TABLE public.diagnoses ADD COLUMN IF NOT EXISTS clinical_examination TEXT;
ALTER TABLE public.diagnoses ADD COLUMN IF NOT EXISTS diagnosis_text TEXT;
ALTER TABLE public.diagnoses ADD COLUMN IF NOT EXISTS doctor_notes TEXT;
ALTER TABLE public.diagnoses ADD COLUMN IF NOT EXISTS recommendations TEXT;
ALTER TABLE public.diagnoses ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE public.diagnoses ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.diagnoses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS secretary_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------------------
-- 2. إضافة قيود فحص طبية مرنة للعلامات الحيوية في جدول measurements (NOT VALID لضمان سلامة البيانات السابقة)
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_measurements_weight_pediatric_range'
    ) THEN
        ALTER TABLE public.measurements 
        ADD CONSTRAINT chk_measurements_weight_pediatric_range 
        CHECK (weight_kg IS NULL OR (weight_kg > 0 AND weight_kg <= 250)) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_measurements_height_pediatric_range'
    ) THEN
        ALTER TABLE public.measurements 
        ADD CONSTRAINT chk_measurements_height_pediatric_range 
        CHECK (height_cm IS NULL OR (height_cm > 0 AND height_cm <= 250)) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_measurements_temp_plausible_range'
    ) THEN
        ALTER TABLE public.measurements 
        ADD CONSTRAINT chk_measurements_temp_plausible_range 
        CHECK (temperature_c IS NULL OR (temperature_c >= 30.0 AND temperature_c <= 45.0)) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_measurements_oxygen_percent_range'
    ) THEN
        ALTER TABLE public.measurements 
        ADD CONSTRAINT chk_measurements_oxygen_percent_range 
        CHECK (oxygen_saturation IS NULL OR (oxygen_saturation >= 0 AND oxygen_saturation <= 100)) NOT VALID;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. قيد الفهرس الفريد لمنع أكثر من زيارة نشطة للطفل نفسه (idx_single_active_visit_per_patient)
-- ------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_visit_per_patient
ON public.visits (patient_id)
WHERE status IN (
    'draft'::public.visit_status_type,
    'waiting'::public.visit_status_type,
    'in_progress'::public.visit_status_type
);

-- ------------------------------------------------------------------------------
-- 4. دالة المساعدة للتحقق من دور السكرتاريا (is_secretary)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_secretary() 
RETURNS BOOLEAN 
LANGUAGE sql 
SECURITY DEFINER 
STABLE 
SET search_path = ''
AS $$
  SELECT public.current_user_role() = 'secretary'::public.user_role;
$$;

REVOKE EXECUTE ON FUNCTION public.is_secretary() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_secretary() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_secretary() TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. دالة المعاملة الذرية لإنشاء الزيارة مع القياسات الحيوية (create_visit_with_measurements)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_visit_with_measurements(
    p_patient_id UUID,
    p_chief_complaint TEXT DEFAULT NULL,
    p_weight_kg NUMERIC DEFAULT NULL,
    p_height_cm NUMERIC DEFAULT NULL,
    p_temperature_c NUMERIC DEFAULT NULL,
    p_blood_pressure TEXT DEFAULT NULL,
    p_oxygen_saturation NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_visit_id UUID;
    v_patient_exists BOOLEAN;
    v_active_visit_exists BOOLEAN;
BEGIN
    -- 1. التحقق من وجود المستخدم المصادق عليه
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول لإنشاء زيارة';
    END IF;

    -- 2. التحقق من صلاحيات السكرتارية (Secretary Role فقط)
    IF NOT public.is_secretary() THEN
        RAISE EXCEPTION 'غير مصرح: إنشاء الزيارات والقياسات الأولية متاح للسكرتاريا فقط';
    END IF;

    -- 3. التحقق من وجود الطفل وعدم أرشفته
    SELECT EXISTS (
        SELECT 1 FROM public.patients 
        WHERE id = p_patient_id AND is_archived = false
    ) INTO v_patient_exists;

    IF NOT v_patient_exists THEN
        RAISE EXCEPTION 'سجل الطفل غير موجود أو مؤرشف';
    END IF;

    -- 4. التحقق من عدم وجود زيارة نشطة سابقة بانتظار الفحص
    SELECT EXISTS (
        SELECT 1 FROM public.visits 
        WHERE patient_id = p_patient_id 
          AND status IN ('draft'::public.visit_status_type, 'waiting'::public.visit_status_type, 'in_progress'::public.visit_status_type)
    ) INTO v_active_visit_exists;

    IF v_active_visit_exists THEN
        RAISE EXCEPTION 'توجد زيارة نشطة بالفعل لهذا الطفل بانتظار الفحص أو قيد الإجراء';
    END IF;

    -- 5. التحقق من منطقية القياسات الحيوية
    IF p_weight_kg IS NOT NULL AND (p_weight_kg <= 0 OR p_weight_kg > 250) THEN
        RAISE EXCEPTION 'قيمة الوزن غير منطقية طبياً (يجب أن تكون بين 0.3 و 250 كغم)';
    END IF;

    IF p_height_cm IS NOT NULL AND (p_height_cm <= 0 OR p_height_cm > 250) THEN
        RAISE EXCEPTION 'قيمة الطول غير منطقية طبياً (يجب أن تكون بين 20 و 250 سم)';
    END IF;

    IF p_temperature_c IS NOT NULL AND (p_temperature_c < 30.0 OR p_temperature_c > 45.0) THEN
        RAISE EXCEPTION 'درجة الحرارة غير منطقية طبياً (يجب أن تكون بين 30.0 و 45.0 درجة مئوية)';
    END IF;

    IF p_oxygen_saturation IS NOT NULL AND (p_oxygen_saturation < 0 OR p_oxygen_saturation > 100) THEN
        RAISE EXCEPTION 'نسبة الأكسجين يجب أن تكون بين 0 و 100%%';
    END IF;

    -- 6. إدراج الزيارة وإسناد secretary_id من auth.uid() حصراً مع معالجة سباق التكرار الفريد
    BEGIN
        INSERT INTO public.visits (
            patient_id,
            status,
            chief_complaint,
            secretary_id,
            visit_date
        ) VALUES (
            p_patient_id,
            'waiting'::public.visit_status_type,
            p_chief_complaint,
            v_user_id,
            NOW()
        )
        RETURNING id INTO v_visit_id;
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'توجد زيارة نشطة بالفعل لهذا الطفل بانتظار الفحص أو قيد الإجراء';
    END;

    -- 7. إدراج القياسات إذا توفر أحدها
    IF p_weight_kg IS NOT NULL 
       OR p_height_cm IS NOT NULL 
       OR p_temperature_c IS NOT NULL 
       OR p_blood_pressure IS NOT NULL 
       OR p_oxygen_saturation IS NOT NULL THEN
        INSERT INTO public.measurements (
            visit_id,
            patient_id,
            weight_kg,
            height_cm,
            temperature_c,
            blood_pressure,
            oxygen_saturation,
            recorded_by
        ) VALUES (
            v_visit_id,
            p_patient_id,
            p_weight_kg,
            p_height_cm,
            p_temperature_c,
            p_blood_pressure,
            p_oxygen_saturation,
            v_user_id
        );
    END IF;

    RETURN v_visit_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. دالة المعاملة الذرية لاعتماد التشخيص الطبي وإكمال الزيارة (finalize_doctor_diagnosis)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_doctor_diagnosis(
    p_visit_id UUID,
    p_patient_id UUID,
    p_symptoms TEXT DEFAULT NULL,
    p_present_illness_history TEXT DEFAULT NULL,
    p_clinical_examination TEXT DEFAULT NULL,
    p_diagnosis_text TEXT DEFAULT '',
    p_recommendations TEXT DEFAULT NULL,
    p_doctor_notes TEXT DEFAULT NULL,
    p_follow_up_date DATE DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_doctor_id UUID;
    v_current_status public.visit_status_type;
BEGIN
    -- 1. التحقق من وجود المستخدم المصادق عليه
    v_doctor_id := auth.uid();
    IF v_doctor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول لاعتماد التشخيص';
    END IF;

    -- 2. التحقق من دور الطبيب
    IF NOT public.is_doctor() THEN
        RAISE EXCEPTION 'غير مصرح: اعتماد التشخيص متاح للطبيب فقط';
    END IF;

    -- 3. التحقق من وجود نص التشخيص النهائي
    IF p_diagnosis_text IS NULL OR TRIM(p_diagnosis_text) = '' THEN
        RAISE EXCEPTION 'التشخيص النهائي مطلوب ولا يمكن تركه فارغاً';
    END IF;

    -- 4. التحقق من تاريخ المراجعة إن وجد
    IF p_follow_up_date IS NOT NULL AND p_follow_up_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'موعد المراجعة القادمة لا يمكن أن يكون في الماضي';
    END IF;

    -- 5. التحقق من وجود الزيارة وتطابق المريض وحالة الزيارة النشطة
    SELECT status INTO v_current_status
    FROM public.visits 
    WHERE id = p_visit_id AND patient_id = p_patient_id;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'سجل الزيارة غير موجود أو لا يتطابق مع المريض المحدد';
    END IF;

    -- حظر اعتماد الزيارات المكتملة أو الملغاة
    IF v_current_status NOT IN ('draft'::public.visit_status_type, 'waiting'::public.visit_status_type, 'in_progress'::public.visit_status_type) THEN
        RAISE EXCEPTION 'لا يمكن اعتماد الزيارة لأن حالتها الحالية لا تسمح بالتعديل (الحالة: %)', v_current_status;
    END IF;

    -- 6. حفظ أو تحديث التشخيص (Upsert) وإسناد doctor_id من auth.uid() حصراً
    INSERT INTO public.diagnoses (
        visit_id,
        patient_id,
        doctor_id,
        symptoms,
        present_illness_history,
        clinical_examination,
        diagnosis_text,
        doctor_notes,
        recommendations,
        follow_up_date,
        updated_at
    ) VALUES (
        p_visit_id,
        p_patient_id,
        v_doctor_id,
        p_symptoms,
        p_present_illness_history,
        p_clinical_examination,
        TRIM(p_diagnosis_text),
        p_doctor_notes,
        p_recommendations,
        p_follow_up_date,
        NOW()
    )
    ON CONFLICT (visit_id) DO UPDATE SET
        doctor_id = EXCLUDED.doctor_id,
        symptoms = EXCLUDED.symptoms,
        present_illness_history = EXCLUDED.present_illness_history,
        clinical_examination = EXCLUDED.clinical_examination,
        diagnosis_text = EXCLUDED.diagnosis_text,
        doctor_notes = EXCLUDED.doctor_notes,
        recommendations = EXCLUDED.recommendations,
        follow_up_date = EXCLUDED.follow_up_date,
        updated_at = NOW();

    -- 7. تحديث حالة الزيارة إلى مكتملة (completed) وإسناد معرف الطبيب
    UPDATE public.visits 
    SET 
        status = 'completed'::public.visit_status_type,
        completed_at = NOW(),
        approved_at = NOW(),
        doctor_id = v_doctor_id,
        updated_at = NOW()
    WHERE id = p_visit_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. ضبط الصلاحيات الأمنية للدوال
-- ------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_visit_with_measurements(UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_visit_with_measurements(UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_visit_with_measurements(UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC) TO authenticated;

REVOKE ALL ON FUNCTION public.finalize_doctor_diagnosis(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_doctor_diagnosis(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_doctor_diagnosis(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE) TO authenticated;

COMMIT;

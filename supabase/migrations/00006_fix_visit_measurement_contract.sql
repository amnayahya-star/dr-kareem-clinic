-- ==============================================================================
-- Migration: Fix Visit Measurement Contract and Reconcile recorded_by Column
-- Version: 00006_fix_visit_measurement_contract.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. إضافة عمود recorded_by إلى جدول measurements بشكل تكراري آمن (Idempotent)
-- ------------------------------------------------------------------------------

ALTER TABLE public.measurements 
ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------------------
-- 2. تحديث دالة المعاملة الذرية (create_visit_with_measurements) لضمان الصلاحيات والأمان
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

    -- 7. إدراج القياسات إذا توفر أحدها وإسناد recorded_by من auth.uid() حصراً
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
-- 3. ضبط الصلاحيات الأمنية للدالة
-- ------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_visit_with_measurements(UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_visit_with_measurements(UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_visit_with_measurements(UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC) TO authenticated;

COMMIT;

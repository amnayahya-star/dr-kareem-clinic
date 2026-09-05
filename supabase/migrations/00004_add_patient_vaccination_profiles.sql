-- ==============================================================================
-- Migration: Add Patient Vaccination Profiles (المرحلة الثانية: سجل التطعيمات البسيط)
-- Version: 00004_add_patient_vaccination_profiles.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. جدول سجل حالة التطعيم للطفل (One-to-One مع جدول patients)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.patient_vaccination_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL UNIQUE REFERENCES public.patients(id) ON DELETE CASCADE,
    vaccination_status TEXT NULL,
    last_vaccine_name TEXT NULL,
    last_vaccine_date DATE NULL,
    post_vaccination_reactions TEXT NULL,
    vaccination_notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. التعليقات التوضيحية للأعمدة
-- ------------------------------------------------------------------------------

COMMENT ON TABLE public.patient_vaccination_profiles IS 'سجل حالة التطعيمات للطفل (علاقة رأس برأس مع المرضى)';
COMMENT ON COLUMN public.patient_vaccination_profiles.vaccination_status IS 'حالة التطعيم: not_vaccinated, incomplete, complete';
COMMENT ON COLUMN public.patient_vaccination_profiles.last_vaccine_name IS 'اسم آخر لقاح تم أخذه';
COMMENT ON COLUMN public.patient_vaccination_profiles.last_vaccine_date IS 'تاريخ أخذ آخر لقاح';
COMMENT ON COLUMN public.patient_vaccination_profiles.post_vaccination_reactions IS 'أي تفاعلات أو أعراض جانبية بعد اللقاحات';
COMMENT ON COLUMN public.patient_vaccination_profiles.vaccination_notes IS 'ملاحظات وتوصيات إضافية حول التطعيمات';

-- ------------------------------------------------------------------------------
-- 3. قيود التحقق (CHECK Constraints)
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    -- قيد التحقق من قيم حالة التطعيم المسموحة
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_vaccination_status_valid'
    ) THEN
        ALTER TABLE public.patient_vaccination_profiles
        ADD CONSTRAINT chk_vaccination_status_valid
        CHECK (
            vaccination_status IS NULL OR 
            vaccination_status IN ('not_vaccinated', 'incomplete', 'complete')
        );
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. الفهارس (Indexes)
-- ------------------------------------------------------------------------------
-- ملاحظة: حقل patient_id معرّف كـ UNIQUE وبالتالي ينشئ PostgreSQL فهرساً فريداً تلقائياً.
-- لا حاجة لإنشاء فهرس إضافي مكرر idx_patient_vaccination_profiles_patient_id.

-- ------------------------------------------------------------------------------
-- 5. آلية تحديث updated_at تلقائياً (Trigger)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_vaccination_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_patient_vaccination_profiles_updated_at ON public.patient_vaccination_profiles;
CREATE TRIGGER trg_patient_vaccination_profiles_updated_at
    BEFORE UPDATE ON public.patient_vaccination_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_vaccination_profile_updated_at();

-- ------------------------------------------------------------------------------
-- 6. التحقق من دالة is_staff() وسياسات أمان مستوى الصفوف (RLS)
-- ------------------------------------------------------------------------------

-- التحقق من وجود دوال التحقق من أدوار طاقم العيادة لضمان سلامة التنفيذ
CREATE OR REPLACE FUNCTION public.current_user_role() 
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_staff() 
RETURNS BOOLEAN AS $$
  SELECT public.current_user_role() IN ('doctor', 'secretary');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

ALTER TABLE public.patient_vaccination_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'patient_vaccination_profiles' AND policyname = 'Staff can view vaccination profiles'
    ) THEN
        CREATE POLICY "Staff can view vaccination profiles" 
            ON public.patient_vaccination_profiles
            FOR SELECT TO authenticated 
            USING (is_staff());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'patient_vaccination_profiles' AND policyname = 'Staff can insert vaccination profiles'
    ) THEN
        CREATE POLICY "Staff can insert vaccination profiles" 
            ON public.patient_vaccination_profiles
            FOR INSERT TO authenticated 
            WITH CHECK (is_staff());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'patient_vaccination_profiles' AND policyname = 'Staff can update vaccination profiles'
    ) THEN
        CREATE POLICY "Staff can update vaccination profiles" 
            ON public.patient_vaccination_profiles
            FOR UPDATE TO authenticated 
            USING (is_staff())
            WITH CHECK (is_staff());
    END IF;
END $$;

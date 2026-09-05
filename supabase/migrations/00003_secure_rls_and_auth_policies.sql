-- ==============================================================================
-- Migration: Secure RLS and Auth Policies (تفعيل أمان مستوى الصفوف وتأمين التخزين والتوثيق)
-- Version: 00003_secure_rls_and_auth_policies.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. التأكد من وجود نوع الأدوار (user_role)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM ('doctor', 'secretary');
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. إنشاء جدول ملفات المستخدمين (profiles) المرتبط بـ auth.users
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role public.user_role NOT NULL DEFAULT 'secretary',
    phone TEXT,
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. الدوال الأمنية المقوّاة (Hardened SECURITY DEFINER Helper Functions)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role() 
RETURNS public.user_role 
LANGUAGE sql 
SECURITY DEFINER 
STABLE 
SET search_path = ''
AS $$
  SELECT role FROM public.profiles 
  WHERE id = auth.uid() AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.is_doctor() 
RETURNS BOOLEAN 
LANGUAGE sql 
SECURITY DEFINER 
STABLE 
SET search_path = ''
AS $$
  SELECT public.current_user_role() = 'doctor'::public.user_role;
$$;

CREATE OR REPLACE FUNCTION public.is_staff() 
RETURNS BOOLEAN 
LANGUAGE sql 
SECURITY DEFINER 
STABLE 
SET search_path = ''
AS $$
  SELECT public.current_user_role() IN ('doctor'::public.user_role, 'secretary'::public.user_role);
$$;

-- سحب صلاحيات التنفيذ من العموم ومنحها حصرياً للمستخدمين الموثقين
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_doctor() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_doctor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. تأمين Storage Bucket وحذف السياسات العامة القديمة
-- ------------------------------------------------------------------------------

-- التأكد من وجود Bucket الصور الطبية وتحويله إلى خاص (Private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical-photos', 'medical-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- حذف سياسات Storage العامة والقديمة
DROP POLICY IF EXISTS "Public Read Medical Photos" ON storage.objects;
DROP POLICY IF EXISTS "Public Update Medical Photos" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload Medical Photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can view medical photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload medical photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can update medical photos" ON storage.objects;
DROP POLICY IF EXISTS "Doctor can delete medical photos" ON storage.objects;

-- إنشاء سياسات Storage الجديدة المحمية لكادر العيادة فقط
CREATE POLICY "Staff can view medical photos" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'medical-photos' AND public.is_staff());

CREATE POLICY "Staff can upload medical photos" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'medical-photos' AND public.is_staff());

CREATE POLICY "Staff can update medical photos" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'medical-photos' AND public.is_staff())
    WITH CHECK (bucket_id = 'medical-photos' AND public.is_staff());

CREATE POLICY "Doctor can delete medical photos" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'medical-photos' AND public.is_doctor());

-- ------------------------------------------------------------------------------
-- 5. تفعيل RLS وإلغاء صلاحيات anon بالكامل وتحديد GRANTs الصريحة لـ authenticated
-- ------------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_attachments ENABLE ROW LEVEL SECURITY;

-- إلغاء كافة الصلاحيات عن الدور العام anon
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.patients FROM anon;
REVOKE ALL ON public.guardians FROM anon;
REVOKE ALL ON public.visits FROM anon;
REVOKE ALL ON public.measurements FROM anon;
REVOKE ALL ON public.diagnoses FROM anon;
REVOKE ALL ON public.medical_attachments FROM anon;

-- منح صلاحيات العمليات المحدودة للدور authenticated لتتحكم بها سياسات RLS
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardians TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.measurements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagnoses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medical_attachments TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. سياسات جدول Profiles
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Staff can view active profiles" ON public.profiles;
DROP POLICY IF EXISTS "Only doctor can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Only doctor can update profiles" ON public.profiles;

CREATE POLICY "Staff can view active profiles" ON public.profiles
    FOR SELECT TO authenticated 
    USING (public.is_staff());

CREATE POLICY "Only doctor can insert profiles" ON public.profiles
    FOR INSERT TO authenticated 
    WITH CHECK (public.is_doctor());

CREATE POLICY "Only doctor can update profiles" ON public.profiles
    FOR UPDATE TO authenticated 
    USING (public.is_doctor())
    WITH CHECK (public.is_doctor());

-- ------------------------------------------------------------------------------
-- 7. سياسات جداول المرضى وأولياء الأمور (Patients & Guardians)
-- ------------------------------------------------------------------------------

-- [Patients]
DROP POLICY IF EXISTS "Staff can view patients" ON public.patients;
DROP POLICY IF EXISTS "Staff can insert patients" ON public.patients;
DROP POLICY IF EXISTS "Staff can update patients" ON public.patients;
DROP POLICY IF EXISTS "Doctor can delete patients" ON public.patients;

CREATE POLICY "Staff can view patients" ON public.patients
    FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "Staff can insert patients" ON public.patients
    FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "Staff can update patients" ON public.patients
    FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "Doctor can delete patients" ON public.patients
    FOR DELETE TO authenticated USING (public.is_doctor());

-- [Guardians]
DROP POLICY IF EXISTS "Staff can view guardians" ON public.guardians;
DROP POLICY IF EXISTS "Staff can insert guardians" ON public.guardians;
DROP POLICY IF EXISTS "Staff can update guardians" ON public.guardians;
DROP POLICY IF EXISTS "Staff can delete guardians" ON public.guardians;

CREATE POLICY "Staff can view guardians" ON public.guardians
    FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "Staff can insert guardians" ON public.guardians
    FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "Staff can update guardians" ON public.guardians
    FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "Staff can delete guardians" ON public.guardians
    FOR DELETE TO authenticated USING (public.is_staff());

-- ------------------------------------------------------------------------------
-- 8. سياسات الزيارات والقياسات والتشخيصات (Visits, Measurements, Diagnoses)
-- ------------------------------------------------------------------------------

-- [Visits]
DROP POLICY IF EXISTS "Staff can view visits" ON public.visits;
DROP POLICY IF EXISTS "Staff can insert visits" ON public.visits;
DROP POLICY IF EXISTS "Staff can update visits" ON public.visits;
DROP POLICY IF EXISTS "Doctor can delete visits" ON public.visits;

CREATE POLICY "Staff can view visits" ON public.visits
    FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "Staff can insert visits" ON public.visits
    FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "Staff can update visits" ON public.visits
    FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "Doctor can delete visits" ON public.visits
    FOR DELETE TO authenticated USING (public.is_doctor());

-- [Measurements]
DROP POLICY IF EXISTS "Staff can view measurements" ON public.measurements;
DROP POLICY IF EXISTS "Staff can insert measurements" ON public.measurements;
DROP POLICY IF EXISTS "Staff can update measurements" ON public.measurements;
DROP POLICY IF EXISTS "Doctor can delete measurements" ON public.measurements;

CREATE POLICY "Staff can view measurements" ON public.measurements
    FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "Staff can insert measurements" ON public.measurements
    FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "Staff can update measurements" ON public.measurements
    FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "Doctor can delete measurements" ON public.measurements
    FOR DELETE TO authenticated USING (public.is_doctor());

-- [Diagnoses]
DROP POLICY IF EXISTS "Staff can view diagnoses" ON public.diagnoses;
DROP POLICY IF EXISTS "Doctor can insert diagnoses" ON public.diagnoses;
DROP POLICY IF EXISTS "Doctor can update diagnoses" ON public.diagnoses;
DROP POLICY IF EXISTS "Doctor can delete diagnoses" ON public.diagnoses;

CREATE POLICY "Staff can view diagnoses" ON public.diagnoses
    FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "Doctor can insert diagnoses" ON public.diagnoses
    FOR INSERT TO authenticated WITH CHECK (public.is_doctor());

CREATE POLICY "Doctor can update diagnoses" ON public.diagnoses
    FOR UPDATE TO authenticated USING (public.is_doctor()) WITH CHECK (public.is_doctor());

CREATE POLICY "Doctor can delete diagnoses" ON public.diagnoses
    FOR DELETE TO authenticated USING (public.is_doctor());

-- ------------------------------------------------------------------------------
-- 9. سياسات المرفقات الطبية (Medical Attachments)
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Staff can view attachments" ON public.medical_attachments;
DROP POLICY IF EXISTS "Staff can upload attachments" ON public.medical_attachments;
DROP POLICY IF EXISTS "Doctor can update attachments" ON public.medical_attachments;
DROP POLICY IF EXISTS "Staff can delete unapproved attachments" ON public.medical_attachments;
DROP POLICY IF EXISTS "Doctor can delete attachments" ON public.medical_attachments;

CREATE POLICY "Staff can view attachments" ON public.medical_attachments
    FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "Staff can upload attachments" ON public.medical_attachments
    FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "Doctor can update attachments" ON public.medical_attachments
    FOR UPDATE TO authenticated USING (public.is_doctor()) WITH CHECK (public.is_doctor());

CREATE POLICY "Doctor can delete attachments" ON public.medical_attachments
    FOR DELETE TO authenticated USING (public.is_doctor());

COMMIT;

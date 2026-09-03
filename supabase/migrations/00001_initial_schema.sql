-- ==============================================================================
-- Schema: عيادة الدكتور عبد الكريم عليوي (طب الأطفال وحديثي الولادة)
-- Version: 00001_initial_schema.sql
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. ENUMS & CUSTOM TYPES
-- ------------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('doctor', 'secretary');

CREATE TYPE gender_type AS ENUM ('male', 'female');

CREATE TYPE visit_status_type AS ENUM ('draft', 'waiting', 'in_progress', 'completed', 'cancelled');

CREATE TYPE dosage_form_type AS ENUM (
    'syrup',           -- شراب
    'tablets',         -- أقراص
    'capsules',        -- كبسولات
    'drops',           -- قطرات
    'injections',      -- حقن
    'ointment_cream',  -- مرهم / كريم
    'suppository',     -- تحاميل
    'inhaler_spray',   -- بخاخ / استنشاق
    'other'            -- غير ذلك
);

CREATE TYPE attachment_type_enum AS ENUM (
    'lab_test',                    -- تحليل مختبري
    'xray_imaging',                -- أشعة وسونار
    'medical_report',              -- تقرير طبي
    'previous_prescription',       -- وصفة سابقة
    'current_visit_prescription',  -- وصفة الزيارة الحالية
    'other_document'               -- مستند آخر
);

CREATE TYPE audit_action_type AS ENUM (
    'create_patient',
    'update_patient',
    'open_visit',
    'change_visit_status',
    'save_diagnosis',
    'create_prescription',
    'approve_prescription',
    'complete_visit',
    'add_attachment',
    'delete_attachment',
    'unauthorized_attempt',
    'other'
);

-- ------------------------------------------------------------------------------
-- 2. CORE TABLES
-- ------------------------------------------------------------------------------

-- جدول ملفات المستخدمين المرتبط بـ Supabase Auth
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'secretary',
    phone TEXT,
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- تسلسل أرقام الملفات الطبية لإنشاء رقم ملف فريد متسلسل
CREATE SEQUENCE IF NOT EXISTS patient_file_number_seq START 1001;

-- جدول الأطفال / المرضى
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_number TEXT NOT NULL UNIQUE DEFAULT ('P-' || nextval('patient_file_number_seq')::TEXT),
    full_name TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    gender gender_type NOT NULL,
    blood_type TEXT, -- e.g. A+, O-, etc.
    allergies TEXT, -- الحساسية وتحديداً حساسية الأدوية
    chronic_diseases TEXT, -- الأمراض المزمنة
    past_surgeries TEXT, -- العمليات السابقة
    medical_notes TEXT, -- ملاحظات طبية حرجة
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- جدول أولياء الأمور
CREATE TABLE IF NOT EXISTS guardians (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    relationship TEXT NOT NULL, -- الأب، الأم، الجد، الخ
    primary_phone TEXT NOT NULL,
    secondary_phone TEXT,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- جدول الزيارات
CREATE TABLE IF NOT EXISTS visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    visit_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status visit_status_type NOT NULL DEFAULT 'waiting',
    chief_complaint TEXT, -- سبب الزيارة
    secretary_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    doctor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- قيد يمنع وجود أكثر من زيارة نشطة للطفل نفسه في الوقت ذاته
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_visit_per_patient 
ON visits (patient_id) 
WHERE status IN ('draft', 'waiting', 'in_progress');

-- جدول القياسات والعلامات الحيوية
CREATE TABLE IF NOT EXISTS measurements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    weight_kg NUMERIC(5, 2), -- الوزن بالكيلوغرام
    height_cm NUMERIC(5, 2), -- الطول بالسنتيمتر
    temperature_c NUMERIC(4, 1), -- درجة الحرارة بالمئوية
    blood_pressure TEXT, -- ضغط الدم (اختياري)
    oxygen_saturation NUMERIC(4, 1), -- نسبة الأكسجين (اختياري)
    recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- جدول التشخيص والفحص الطبي
CREATE TABLE IF NOT EXISTS diagnoses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id UUID NOT NULL UNIQUE REFERENCES visits(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    symptoms TEXT, -- الأعراض
    present_illness_history TEXT, -- التاريخ المرضي الحالي
    clinical_examination TEXT, -- الفحص السريري
    diagnosis_text TEXT NOT NULL, -- التشخيص الطبي
    doctor_notes TEXT, -- ملاحظات الطبيب
    recommendations TEXT, -- التوصيات
    follow_up_date DATE, -- موعد المراجعة الاختياري
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- جدول الوصفات الطبية
CREATE TABLE IF NOT EXISTS prescriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    prescription_type TEXT NOT NULL DEFAULT 'digital', -- 'digital' | 'scanned' | 'both'
    scanned_image_url TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT false,
    approved_at TIMESTAMPTZ,
    general_instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- جدول بنود الوصفة الطبية (الأدوية)
CREATE TABLE IF NOT EXISTS prescription_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    medication_name TEXT NOT NULL,
    strength TEXT, -- التركيز
    dosage_form dosage_form_type NOT NULL DEFAULT 'syrup',
    dose TEXT NOT NULL, -- الجرعة
    frequency TEXT NOT NULL, -- التكرار (مثلاً: 3 مرات يومياً)
    duration TEXT NOT NULL, -- مدة العلاج (مثلاً: لمدة 5 أيام)
    route_or_instructions TEXT, -- طريقة الاستخدام (بعد الأكل، قبل النوم، إلخ)
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- جدول المرفقات الطبية
CREATE TABLE IF NOT EXISTS medical_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
    attachment_type attachment_type_enum NOT NULL DEFAULT 'other_document',
    title TEXT,
    notes TEXT,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    is_approved_by_doctor BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- جدول سجل العمليات والتدقيق (Audit Logs)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    user_role user_role,
    action audit_action_type NOT NULL,
    target_table TEXT NOT NULL,
    target_id TEXT,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. INDEXES FOR PERFORMANCE
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_patients_full_name ON patients USING gin (to_tsvector('arabic', full_name));
CREATE INDEX IF NOT EXISTS idx_patients_file_number ON patients(file_number);
CREATE INDEX IF NOT EXISTS idx_guardians_patient_id ON guardians(patient_id);
CREATE INDEX IF NOT EXISTS idx_guardians_primary_phone ON guardians(primary_phone);
CREATE INDEX IF NOT EXISTS idx_visits_patient_id ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_visit_date ON visits(visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_visit_id ON measurements(visit_id);
CREATE INDEX IF NOT EXISTS idx_measurements_patient_id ON measurements(patient_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_visit_id ON diagnoses(visit_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_patient_id ON diagnoses(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_visit_id ON prescriptions(visit_id);
CREATE INDEX IF NOT EXISTS idx_attachments_patient_id ON medical_attachments(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES FOUNDATION
-- ------------------------------------------------------------------------------

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- دوال مساعدة للتحقق من دور المستخدم في السياسات
CREATE OR REPLACE FUNCTION current_user_role() 
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_doctor() 
RETURNS BOOLEAN AS $$
  SELECT current_user_role() = 'doctor';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_staff() 
RETURNS BOOLEAN AS $$
  SELECT current_user_role() IN ('doctor', 'secretary');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- سياسات Profiles
CREATE POLICY "Staff can view active profiles" ON profiles
    FOR SELECT TO authenticated USING (is_staff());

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id);

-- سياسات Patients & Guardians
CREATE POLICY "Staff can view patients" ON patients
    FOR SELECT TO authenticated USING (is_staff());

CREATE POLICY "Staff can insert patients" ON patients
    FOR INSERT TO authenticated WITH CHECK (is_staff());

CREATE POLICY "Staff can update patients" ON patients
    FOR UPDATE TO authenticated USING (is_staff());

CREATE POLICY "Staff can view guardians" ON guardians
    FOR SELECT TO authenticated USING (is_staff());

CREATE POLICY "Staff can insert guardians" ON guardians
    FOR INSERT TO authenticated WITH CHECK (is_staff());

CREATE POLICY "Staff can update guardians" ON guardians
    FOR UPDATE TO authenticated USING (is_staff());

-- سياسات Visits
CREATE POLICY "Staff can view visits" ON visits
    FOR SELECT TO authenticated USING (is_staff());

CREATE POLICY "Staff can insert visits" ON visits
    FOR INSERT TO authenticated WITH CHECK (is_staff());

CREATE POLICY "Staff can update visits" ON visits
    FOR UPDATE TO authenticated USING (is_staff());

-- سياسات Measurements
CREATE POLICY "Staff can view measurements" ON measurements
    FOR SELECT TO authenticated USING (is_staff());

CREATE POLICY "Staff can insert measurements" ON measurements
    FOR INSERT TO authenticated WITH CHECK (is_staff());

-- سياسات Diagnoses (حصرية للطبيب)
CREATE POLICY "Staff can view diagnoses" ON diagnoses
    FOR SELECT TO authenticated USING (is_staff());

CREATE POLICY "Only doctor can insert diagnosis" ON diagnoses
    FOR INSERT TO authenticated WITH CHECK (is_doctor());

CREATE POLICY "Only doctor can update diagnosis" ON diagnoses
    FOR UPDATE TO authenticated USING (is_doctor());

-- سياسات Prescriptions
CREATE POLICY "Staff can view prescriptions" ON prescriptions
    FOR SELECT TO authenticated USING (is_staff());

CREATE POLICY "Doctor can manage prescriptions" ON prescriptions
    FOR ALL TO authenticated USING (is_doctor() OR (current_user_role() = 'secretary' AND NOT is_approved));

CREATE POLICY "Staff can view prescription items" ON prescription_items
    FOR SELECT TO authenticated USING (is_staff());

CREATE POLICY "Doctor can manage prescription items" ON prescription_items
    FOR ALL TO authenticated USING (is_doctor());

-- سياسات Attachments
CREATE POLICY "Staff can view attachments" ON medical_attachments
    FOR SELECT TO authenticated USING (is_staff());

CREATE POLICY "Staff can upload attachments" ON medical_attachments
    FOR INSERT TO authenticated WITH CHECK (is_staff());

CREATE POLICY "Doctor can approve attachments" ON medical_attachments
    FOR UPDATE TO authenticated USING (is_doctor());

-- سياسات Audit Logs
CREATE POLICY "Doctor can view audit logs" ON audit_logs
    FOR SELECT TO authenticated USING (is_doctor());

CREATE POLICY "Staff can insert audit logs" ON audit_logs
    FOR INSERT TO authenticated WITH CHECK (is_staff());

-- ==============================================================================
-- Migration: Enhance Patient and Guardian Schema (المرحلة الأولى: ملف الطفل وولي الأمر)
-- Version: 00002_enhance_patient_and_guardian_schema.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. إضافة حقول بيانات الولادة والتاريخ الطبي والحساسيات لجدول الأطفال (patients)
-- ------------------------------------------------------------------------------

-- مكان الولادة
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS birth_place TEXT;
COMMENT ON COLUMN patients.birth_place IS 'مكان الولادة (المستشفى / المدينة)';

-- الوزن عند الولادة بالكيلوغرام
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS birth_weight_kg NUMERIC(4, 2);
COMMENT ON COLUMN patients.birth_weight_kg IS 'الوزن عند الولادة بالكيلوغرام (اختياري)';

-- الطول عند الولادة بالسنتيمتر
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS birth_length_cm NUMERIC(4, 1);
COMMENT ON COLUMN patients.birth_length_cm IS 'الطول عند الولادة بالسنتيمتر (اختياري)';

-- التاريخ الطبي العام
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS medical_history TEXT;
COMMENT ON COLUMN patients.medical_history IS 'التاريخ الطبي العام للطفل';

-- حساسية الأدوية
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS drug_allergies TEXT;
COMMENT ON COLUMN patients.drug_allergies IS 'حساسية الأدوية المفصلة';

-- حساسية الطعام
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS food_allergies TEXT;
COMMENT ON COLUMN patients.food_allergies IS 'حساسية الطعام والمواد الغذائية';

-- حساسيات أخرى
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS other_allergies TEXT;
COMMENT ON COLUMN patients.other_allergies IS 'أي حساسيات بيئية أو أخرى';

-- ملاحظة: العمود السابق `allergies` يبقى موجوداً للحفاظ على التوافق الرجعي للسجلات السابقة.

-- قيود تحقق آمنة للأرقام الموجبة عند الولادة
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_patients_birth_weight_positive'
    ) THEN
        ALTER TABLE patients 
        ADD CONSTRAINT chk_patients_birth_weight_positive 
        CHECK (birth_weight_kg IS NULL OR birth_weight_kg > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_patients_birth_length_positive'
    ) THEN
        ALTER TABLE patients 
        ADD CONSTRAINT chk_patients_birth_length_positive 
        CHECK (birth_length_cm IS NULL OR birth_length_cm > 0);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. إضافة حقل البريد الإلكتروني لجدول أولياء الأمور (guardians)
-- ------------------------------------------------------------------------------

ALTER TABLE guardians 
ADD COLUMN IF NOT EXISTS email TEXT;
COMMENT ON COLUMN guardians.email IS 'البريد الإلكتروني الاختياري لولي الأمر';

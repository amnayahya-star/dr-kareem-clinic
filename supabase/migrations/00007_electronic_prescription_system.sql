-- ==============================================================================
-- Migration: Electronic Prescription System (المرحلة الأولى: نظام الوصفة الطبية الإلكترونية)
-- Version: 00007_electronic_prescription_system.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. التأكد من وجود الأنواع المخصصة (Enums)
-- ------------------------------------------------------------------------------

-- نوع حالة الوصفة الطبية (prescription_status_type)
DO $$
BEGIN
    IF to_regtype('public.prescription_status_type') IS NULL THEN
        CREATE TYPE public.prescription_status_type AS ENUM ('draft', 'issued', 'cancelled');
    END IF;
END $$;

-- نوع الشكل الدوائي (dosage_form_type)
DO $$
BEGIN
    IF to_regtype('public.dosage_form_type') IS NULL THEN
        CREATE TYPE public.dosage_form_type AS ENUM (
            'syrup',
            'suspension',
            'drops',
            'tablet',
            'capsule',
            'suppository',
            'injection',
            'ointment',
            'cream',
            'spray',
            'inhaler',
            'sachet',
            'other'
        );
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. إنشاء وتطوير جدول الوصفات الطبية (public.prescriptions) بالبنية النهائية الكاملة
-- ------------------------------------------------------------------------------

-- إنشاء الجدول بالهيكل النهائي الكامل إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS public.prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    prescribed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    diagnosis_id UUID REFERENCES public.diagnoses(id) ON DELETE SET NULL,
    status public.prescription_status_type NOT NULL DEFAULT 'draft',
    general_instructions TEXT,
    cancellation_reason TEXT,
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- في حال كان الجدول موجوداً مسبقاً في بيئة أخرى: ترقية الأعمدة المفقودة بأمان
ALTER TABLE public.prescriptions 
    ADD COLUMN IF NOT EXISTS status public.prescription_status_type NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS prescribed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS diagnosis_id UUID REFERENCES public.diagnoses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS general_instructions TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ترحيل البيانات القديمة المتوافقة (إن وجدت في بيئات ترقية)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'prescriptions' AND column_name = 'is_approved'
    ) THEN
        UPDATE public.prescriptions
        SET 
            prescribed_by = COALESCE(prescribed_by, doctor_id),
            doctor_id = COALESCE(doctor_id, prescribed_by),
            status = CASE 
                WHEN is_approved = true AND status = 'draft' THEN 'issued'::public.prescription_status_type 
                ELSE status 
            END,
            issued_at = COALESCE(issued_at, approved_at)
        WHERE is_approved IS NOT NULL;
    END IF;
END $$;

-- التحقق من عدم وجود تعارض سابق بين doctor_id و prescribed_by قبل المتابعة
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.prescriptions 
        WHERE doctor_id IS NOT NULL AND prescribed_by IS NOT NULL AND doctor_id != prescribed_by
    ) THEN
        RAISE EXCEPTION 'فشل تطبيق الـ migration: يوجد تعارض سابق بين doctor_id و prescribed_by في جدول prescriptions. يجب تسوية السجلات يدوياً.';
    END IF;
END $$;

-- التحقق من عدم وجود تكرار سابق لـ visit_id قبل إنشاء القيد الفريد لتجنب الفشل الصامت
DO $$
BEGIN
    IF EXISTS (
        SELECT visit_id 
        FROM public.prescriptions 
        WHERE visit_id IS NOT NULL 
        GROUP BY visit_id 
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'فشل تطبيق الـ migration: يوجد أكثر من وصفة طبية لنفس الزيارة (visit_id مكرر). يجب تسوية البيانات القديمة يدوياً قبل إنشاء القيد الفريد.';
    END IF;
END $$;

-- إنشاء قيد فريد يمنع إنشاء أكثر من وصفة إلكترونية واحدة للزيارة نفسها
CREATE UNIQUE INDEX IF NOT EXISTS idx_prescriptions_unique_visit 
ON public.prescriptions (visit_id) 
WHERE visit_id IS NOT NULL;

-- فهارس تحسين الاستعلامات
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON public.prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON public.prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_prescribed_by ON public.prescriptions(prescribed_by);
CREATE INDEX IF NOT EXISTS idx_prescriptions_diagnosis_id ON public.prescriptions(diagnosis_id);

-- ------------------------------------------------------------------------------
-- 3. إنشاء وتطوير جدول بنود الوصفة الطبية (public.prescription_items) بالبنية النهائية الكاملة
-- ------------------------------------------------------------------------------

-- إنشاء الجدول بالهيكل النهائي الكامل إذا لم يكن موجوداً
-- الحقول العلاجية (dosage_form, frequency, duration) تقبل NULL أثناء مرحلة المسودة (draft)
-- ويتم فرض اكتمالها عبر الدوال والقوادح عند التحول إلى الحالة الصادرة (issued)
CREATE TABLE IF NOT EXISTS public.prescription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
    medication_name TEXT NOT NULL,
    active_ingredient TEXT,
    strength TEXT,
    dosage_form public.dosage_form_type,
    dose TEXT,
    route TEXT,
    frequency TEXT,
    duration TEXT,
    quantity TEXT,
    instructions TEXT,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- في حال كان الجدول موجوداً مسبقاً في بيئة أخرى: ترقية الأعمدة المفقودة بأمان
ALTER TABLE public.prescription_items 
    ADD COLUMN IF NOT EXISTS active_ingredient TEXT,
    ADD COLUMN IF NOT EXISTS strength TEXT,
    ADD COLUMN IF NOT EXISTS dosage_form public.dosage_form_type,
    ADD COLUMN IF NOT EXISTS dose TEXT,
    ADD COLUMN IF NOT EXISTS route TEXT,
    ADD COLUMN IF NOT EXISTS frequency TEXT,
    ADD COLUMN IF NOT EXISTS duration TEXT,
    ADD COLUMN IF NOT EXISTS quantity TEXT,
    ADD COLUMN IF NOT EXISTS instructions TEXT,
    ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- معالجة مرونة القيود للأعمدة لدعم حفظ المسودات غير المكتملة
ALTER TABLE public.prescription_items ALTER COLUMN dose DROP NOT NULL;
ALTER TABLE public.prescription_items ALTER COLUMN dosage_form DROP NOT NULL;
ALTER TABLE public.prescription_items ALTER COLUMN frequency DROP NOT NULL;
ALTER TABLE public.prescription_items ALTER COLUMN duration DROP NOT NULL;

-- مزامنة الأعمدة الموروثة إذا كانت موجودة
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'prescription_items' AND column_name = 'sort_order'
    ) THEN
        UPDATE public.prescription_items SET display_order = sort_order WHERE display_order = 0 AND sort_order > 0;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'prescription_items' AND column_name = 'route_or_instructions'
    ) THEN
        UPDATE public.prescription_items SET route = route_or_instructions WHERE route IS NULL AND route_or_instructions IS NOT NULL;
    END IF;
END $$;

-- فهرس ترتيب البنود
CREATE INDEX IF NOT EXISTS idx_prescription_items_order ON public.prescription_items(prescription_id, display_order);

-- ------------------------------------------------------------------------------
-- 4. حماية قواعد البيانات لمنع تعديل بنود الوصفة بعد إصدارها أو إلغائها
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_modification_of_issued_prescription()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_status public.prescription_status_type;
    v_target_prescription_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'prescriptions' THEN
        -- عند تعديل الوصفة نفسها: منع تعديل الحقول السريرية إذا كانت صادرة أو ملغاة
        -- يُسمح فقط بتغيير الحالة من draft -> issued أو draft/issued -> cancelled
        IF OLD.status IN ('issued'::public.prescription_status_type, 'cancelled'::public.prescription_status_type) THEN
            -- إذا حاول تعديل أي حقل غير إلغاء الوصفة الصادرة
            IF NEW.status = OLD.status AND (
                NEW.general_instructions IS DISTINCT FROM OLD.general_instructions OR
                NEW.diagnosis_id IS DISTINCT FROM OLD.diagnosis_id OR
                NEW.visit_id IS DISTINCT FROM OLD.visit_id OR
                NEW.patient_id IS DISTINCT FROM OLD.patient_id
            ) THEN
                RAISE EXCEPTION 'لا يمكن تعديل الوصفة الطبية بعد إصدارها أو إلغائها';
            END IF;

            -- منع تغيير حالة الوصفة الملغاة
            IF OLD.status = 'cancelled'::public.prescription_status_type AND NEW.status != 'cancelled'::public.prescription_status_type THEN
                RAISE EXCEPTION 'لا يمكن إعادة تفعيل وصفة طبية ملغاة';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'prescription_items' THEN
        v_target_prescription_id := COALESCE(NEW.prescription_id, OLD.prescription_id);
        SELECT status INTO v_status FROM public.prescriptions WHERE id = v_target_prescription_id;

        IF v_status IS NOT NULL AND v_status IN ('issued'::public.prescription_status_type, 'cancelled'::public.prescription_status_type) THEN
            RAISE EXCEPTION 'لا يمكن إضافة أو تعديل أو حذف أدوية من وصفة طبية تم إصدارها أو إلغاؤها';
        END IF;

        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_issued_prescriptions ON public.prescriptions;
CREATE TRIGGER trg_protect_issued_prescriptions
    BEFORE UPDATE OR DELETE ON public.prescriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_modification_of_issued_prescription();

DROP TRIGGER IF EXISTS trg_protect_issued_prescription_items ON public.prescription_items;
CREATE TRIGGER trg_protect_issued_prescription_items
    BEFORE INSERT OR UPDATE OR DELETE ON public.prescription_items
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_modification_of_issued_prescription();

-- قادح لضمان تطابق doctor_id و prescribed_by دائماً عند الإدخال أو التعديل
CREATE OR REPLACE FUNCTION public.ensure_prescription_doctor_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.doctor_id IS DISTINCT FROM NEW.prescribed_by THEN
        RAISE EXCEPTION 'غير مسموح: يجب أن يتطابق doctor_id و prescribed_by دائماً';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_prescription_doctor_match ON public.prescriptions;
CREATE TRIGGER trg_ensure_prescription_doctor_match
    BEFORE INSERT OR UPDATE ON public.prescriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.ensure_prescription_doctor_match();

-- قادح للتحقق الصارم من اكتمال الوصفة الطبية وبنودها عند التحول إلى الحالة الصادرة (issued)
CREATE OR REPLACE FUNCTION public.validate_prescription_issuance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_item_count INT;
    v_invalid_item_count INT;
BEGIN
    IF NEW.status = 'issued'::public.prescription_status_type THEN
        -- 1. التأكد من وجود بند دواء واحد على الأقل
        SELECT COUNT(*) INTO v_item_count
        FROM public.prescription_items
        WHERE prescription_id = NEW.id;

        IF v_item_count = 0 THEN
            RAISE EXCEPTION 'لا يمكن إصدار وصفة طبية فارغة: يجب أن تحتوي على دواء واحد على الأقل';
        END IF;

        -- 2. التأكد من اكتمال جميع البنود (اسم الدواء، الشكل الدوائي، التكرار، المدة)
        SELECT COUNT(*) INTO v_invalid_item_count
        FROM public.prescription_items
        WHERE prescription_id = NEW.id
          AND (
              medication_name IS NULL OR TRIM(medication_name) = '' OR
              dosage_form IS NULL OR
              frequency IS NULL OR TRIM(frequency) = '' OR
              duration IS NULL OR TRIM(duration) = ''
          );

        IF v_invalid_item_count > 0 THEN
            RAISE EXCEPTION 'لا يمكن إصدار الوصفة الطبية: توجد بنود غير مكتملة (اسم الدواء، الشكل الدوائي، التكرار، والمدة مطلوبة لكل دواء)';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_prescription_issuance ON public.prescriptions;
CREATE TRIGGER trg_validate_prescription_issuance
    AFTER INSERT OR UPDATE OF status ON public.prescriptions
    FOR EACH ROW
    WHEN (NEW.status = 'issued'::public.prescription_status_type)
    EXECUTE FUNCTION public.validate_prescription_issuance();

-- ------------------------------------------------------------------------------
-- 5. تفعيل أمان مستوى الصفوف (RLS) وسياسات الأمان الدقيقة
-- ------------------------------------------------------------------------------

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;

-- حذف السياسات القديمة
DROP POLICY IF EXISTS "Staff can view prescriptions" ON public.prescriptions;
DROP POLICY IF EXISTS "Doctor can manage prescriptions" ON public.prescriptions;
DROP POLICY IF EXISTS "Doctor can insert prescriptions" ON public.prescriptions;
DROP POLICY IF EXISTS "Doctor can update prescriptions" ON public.prescriptions;
DROP POLICY IF EXISTS "Doctor can delete prescriptions" ON public.prescriptions;
DROP POLICY IF EXISTS "Secretary can view issued prescriptions" ON public.prescriptions;
DROP POLICY IF EXISTS "Staff view prescriptions policy" ON public.prescriptions;
DROP POLICY IF EXISTS "Doctor can delete draft prescriptions" ON public.prescriptions;

DROP POLICY IF EXISTS "Staff can view prescription items" ON public.prescription_items;
DROP POLICY IF EXISTS "Doctor can manage prescription items" ON public.prescription_items;
DROP POLICY IF EXISTS "Doctor can insert prescription items" ON public.prescription_items;
DROP POLICY IF EXISTS "Doctor can update prescription items" ON public.prescription_items;
DROP POLICY IF EXISTS "Doctor can delete prescription items" ON public.prescription_items;
DROP POLICY IF EXISTS "Secretary can view issued prescription items" ON public.prescription_items;
DROP POLICY IF EXISTS "Staff view prescription items policy" ON public.prescription_items;

-- منح الصلاحيات الصريحة لـ authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescription_items TO authenticated;
REVOKE ALL ON public.prescriptions FROM anon;
REVOKE ALL ON public.prescription_items FROM anon;

-- سياسات جدول prescriptions:
-- 1. الطبيب يستطيع قراءة جميع الوصفات، والسكرتارية تقرأ الوصفات الصادرة فقط
CREATE POLICY "Staff view prescriptions policy" ON public.prescriptions
    FOR SELECT TO authenticated
    USING (
        public.is_doctor() OR 
        (public.is_staff() AND status = 'issued'::public.prescription_status_type)
    );

-- 2. الطبيب وحده ينشئ الوصفات (ويجب أن يكون كلاهما مسنداً لنفس الطبيب الموثق دون السماح بـ NULL)
CREATE POLICY "Doctor can insert prescriptions" ON public.prescriptions
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_doctor() AND 
        prescribed_by = auth.uid() AND 
        doctor_id = auth.uid()
    );

-- 3. الطبيب وحده يعدل مسودات الوصفات الخاصة به (مع شرط draft في USING و WITH CHECK)
CREATE POLICY "Doctor can update prescriptions" ON public.prescriptions
    FOR UPDATE TO authenticated
    USING (
        public.is_doctor() AND 
        status = 'draft'::public.prescription_status_type AND
        prescribed_by = auth.uid() AND 
        doctor_id = auth.uid()
    )
    WITH CHECK (
        public.is_doctor() AND 
        status = 'draft'::public.prescription_status_type AND
        prescribed_by = auth.uid() AND 
        doctor_id = auth.uid()
    );

-- 4. الطبيب وحده يحذف مسودات الوصفات غير الصادرة الخاصة به
CREATE POLICY "Doctor can delete draft prescriptions" ON public.prescriptions
    FOR DELETE TO authenticated
    USING (
        public.is_doctor() AND 
        status = 'draft'::public.prescription_status_type AND
        prescribed_by = auth.uid() AND 
        doctor_id = auth.uid()
    );

-- سياسات جدول prescription_items:
-- 1. الطبيب يرى جميع البنود، والسكرتارية ترى بنود الوصفات الصادرة فقط
CREATE POLICY "Staff view prescription items policy" ON public.prescription_items
    FOR SELECT TO authenticated
    USING (
        public.is_doctor() OR 
        (
            public.is_staff() AND 
            EXISTS (
                SELECT 1 FROM public.prescriptions p 
                WHERE p.id = prescription_items.prescription_id 
                  AND p.status = 'issued'::public.prescription_status_type
            )
        )
    );

-- 2. الطبيب وحده يضيف بنوداً للمسودة الخاصة به
CREATE POLICY "Doctor can insert prescription items" ON public.prescription_items
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_doctor() AND 
        EXISTS (
            SELECT 1 FROM public.prescriptions p 
            WHERE p.id = prescription_items.prescription_id 
              AND p.status = 'draft'::public.prescription_status_type
              AND p.prescribed_by = auth.uid()
              AND p.doctor_id = auth.uid()
        )
    );

-- 3. الطبيب وحده يعدل بنود المسودة الخاصة به
CREATE POLICY "Doctor can update prescription items" ON public.prescription_items
    FOR UPDATE TO authenticated
    USING (
        public.is_doctor() AND 
        EXISTS (
            SELECT 1 FROM public.prescriptions p 
            WHERE p.id = prescription_items.prescription_id 
              AND p.status = 'draft'::public.prescription_status_type
              AND p.prescribed_by = auth.uid()
              AND p.doctor_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_doctor() AND 
        EXISTS (
            SELECT 1 FROM public.prescriptions p 
            WHERE p.id = prescription_items.prescription_id 
              AND p.status = 'draft'::public.prescription_status_type
              AND p.prescribed_by = auth.uid()
              AND p.doctor_id = auth.uid()
        )
    );

-- 4. الطبيب وحده يحذف بنود المسودة الخاصة به
CREATE POLICY "Doctor can delete prescription items" ON public.prescription_items
    FOR DELETE TO authenticated
    USING (
        public.is_doctor() AND 
        EXISTS (
            SELECT 1 FROM public.prescriptions p 
            WHERE p.id = prescription_items.prescription_id 
              AND p.status = 'draft'::public.prescription_status_type
              AND p.prescribed_by = auth.uid()
              AND p.doctor_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- 6. دوال المعاملات الذرية لحفظ وإصدار وإلغاء الوصفة الطبية (RPCs)
-- ------------------------------------------------------------------------------

-- دالة الحفظ الذري للوصفة مع بنود الأدوية (إما مسودة أو إصدار فوري)
CREATE OR REPLACE FUNCTION public.save_electronic_prescription(
    p_visit_id UUID,
    p_patient_id UUID,
    p_diagnosis_id UUID DEFAULT NULL,
    p_general_instructions TEXT DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::JSONB,
    p_action TEXT DEFAULT 'draft' -- 'draft' | 'issue'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_doctor_id UUID;
    v_prescription_id UUID;
    v_current_status public.prescription_status_type;
    v_existing_doctor_id UUID;
    v_existing_prescribed_by UUID;
    v_item JSONB;
    v_idx INT := 0;
    v_med_name TEXT;
    v_dosage_form TEXT;
    v_freq TEXT;
    v_dur TEXT;
    v_items_count INT;
BEGIN
    -- 1. التحقق من المستخدم ودور الطبيب
    v_doctor_id := auth.uid();
    IF v_doctor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول كطبيب لإنشاء أو تعديل الوصفة الطبية';
    END IF;

    IF NOT public.is_doctor() THEN
        RAISE EXCEPTION 'غير مصرح: إدارة الوصفات الطبية مقتصرة على الطبيب فقط';
    END IF;

    -- 2. التحقق من وجود الزيارة وتطابق المريض والتشخيص
    IF NOT EXISTS (
        SELECT 1 FROM public.visits WHERE id = p_visit_id AND patient_id = p_patient_id
    ) THEN
        RAISE EXCEPTION 'سجل الزيارة غير موجود أو لا يتطابق مع المريض المحدد';
    END IF;

    IF p_diagnosis_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.diagnoses WHERE id = p_diagnosis_id AND visit_id = p_visit_id
    ) THEN
        RAISE EXCEPTION 'التشخيص المحدد غير موجود أو لا ينتمي إلى هذه الزيارة';
    END IF;

    -- 3. فحص عدد البنود والتحقق من صحتها عند الرغبة بالإصدار
    v_items_count := jsonb_array_length(p_items);
    IF p_action = 'issue' AND v_items_count = 0 THEN
        RAISE EXCEPTION 'لا يمكن إصدار وصفة طبية فارغة. يرجى إضافة دواء واحد على الأقل';
    END IF;

    -- 4. فحص ما إذا كانت هناك وصفة مسجلة مسبقاً لهذه الزيارة
    SELECT id, status, doctor_id, prescribed_by 
    INTO v_prescription_id, v_current_status, v_existing_doctor_id, v_existing_prescribed_by
    FROM public.prescriptions
    WHERE visit_id = p_visit_id;

    IF v_current_status IS NOT NULL AND v_current_status IN ('issued'::public.prescription_status_type, 'cancelled'::public.prescription_status_type) THEN
        RAISE EXCEPTION 'الوصفة الطبية لهذه الزيارة معتمدة أو ملغاة مسبقاً ولا يمكن تعديلها مباشرة (الحالة: %)', v_current_status;
    END IF;

    -- منع تعديل السجلات عديمة المالك أو التي يملكها طبيب آخر أو بها تعارض
    IF v_prescription_id IS NOT NULL THEN
        IF v_existing_prescribed_by IS NULL OR v_existing_doctor_id IS NULL THEN
            RAISE EXCEPTION 'غير مصرح: الوصفة الطبية تفتقر لبيانات الطبيب المالك ومقفلة للمراجعة الإدارية';
        END IF;

        IF v_existing_prescribed_by != v_doctor_id OR v_existing_doctor_id != v_doctor_id THEN
            RAISE EXCEPTION 'غير مصرح: لا يمكن تعديل مسودة وصفة طبية تم إنشاؤها بواسطة طبيب آخر أو بها تعارض في الملكية';
        END IF;
    END IF;

    -- 5. إنشاء أو تحديث سجل الوصفة الرئيسية بحالة مسودة مبدئياً
    IF v_prescription_id IS NULL THEN
        INSERT INTO public.prescriptions (
            visit_id,
            patient_id,
            diagnosis_id,
            doctor_id,
            prescribed_by,
            general_instructions,
            status,
            issued_at,
            created_at,
            updated_at
        ) VALUES (
            p_visit_id,
            p_patient_id,
            p_diagnosis_id,
            v_doctor_id,
            v_doctor_id,
            p_general_instructions,
            'draft'::public.prescription_status_type,
            NULL,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_prescription_id;
    ELSE
        UPDATE public.prescriptions
        SET
            diagnosis_id = COALESCE(p_diagnosis_id, diagnosis_id),
            general_instructions = p_general_instructions,
            doctor_id = v_doctor_id,
            prescribed_by = v_doctor_id,
            status = 'draft'::public.prescription_status_type,
            updated_at = NOW()
        WHERE id = v_prescription_id;

        -- مسح البنود السابقة للمسودة لإعادة إدراج القائمة المحدثة
        DELETE FROM public.prescription_items WHERE prescription_id = v_prescription_id;
    END IF;

    -- 6. إدراج بنود الأدوية بالترتيب
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_idx := v_idx + 1;
        v_med_name := TRIM(COALESCE(v_item->>'medication_name', ''));
        v_dosage_form := NULLIF(TRIM(COALESCE(v_item->>'dosage_form', '')), '');
        v_freq := NULLIF(TRIM(COALESCE(v_item->>'frequency', '')), '');
        v_dur := NULLIF(TRIM(COALESCE(v_item->>'duration', '')), '');

        -- في حالة المسودة: تجاهل السطر الفارغ تماماً إذا لم يُكتب فيه أي شيء
        IF p_action = 'draft' AND v_med_name = '' AND v_dosage_form IS NULL AND v_freq IS NULL AND v_dur IS NULL AND NULLIF(TRIM(COALESCE(v_item->>'dose', '')), '') IS NULL THEN
            CONTINUE;
        END IF;

        IF v_med_name = '' THEN
            RAISE EXCEPTION 'اسم الدواء مطلوب لكل بند في الوصفة (البند رقم %)', v_idx;
        END IF;

        -- التحقق الصارم من اكتمال البيانات عند الإصدار فقط
        IF p_action = 'issue' THEN
            IF v_dosage_form IS NULL THEN
                RAISE EXCEPTION 'الشكل الدوائي مطلوب لاعتماد الدواء % (البند رقم %)', v_med_name, v_idx;
            END IF;

            IF v_freq IS NULL THEN
                RAISE EXCEPTION 'تكرار الجرعة مطلوب لاعتماد الدواء % (البند رقم %)', v_med_name, v_idx;
            END IF;

            IF v_dur IS NULL THEN
                RAISE EXCEPTION 'مدة العلاج مطلوبة لاعتماد الدواء % (البند رقم %)', v_med_name, v_idx;
            END IF;
        END IF;

        INSERT INTO public.prescription_items (
            prescription_id,
            medication_name,
            active_ingredient,
            strength,
            dosage_form,
            dose,
            route,
            frequency,
            duration,
            quantity,
            instructions,
            display_order,
            created_at,
            updated_at
        ) VALUES (
            v_prescription_id,
            v_med_name,
            NULLIF(TRIM(v_item->>'active_ingredient'), ''),
            NULLIF(TRIM(v_item->>'strength'), ''),
            v_dosage_form::public.dosage_form_type,
            NULLIF(TRIM(v_item->>'dose'), ''),
            NULLIF(TRIM(v_item->>'route'), ''),
            v_freq,
            v_dur,
            NULLIF(TRIM(v_item->>'quantity'), ''),
            NULLIF(TRIM(v_item->>'instructions'), ''),
            COALESCE((v_item->>'display_order')::INT, v_idx),
            NOW(),
            NOW()
        );
    END LOOP;

    -- 7. إذا كان الإجراء هو الإصدار، تحديث حالة الوصفة إلى issued بعد التأكد من إدراج كافة البنود
    IF p_action = 'issue' THEN
        UPDATE public.prescriptions
        SET 
            status = 'issued'::public.prescription_status_type,
            issued_at = NOW(),
            updated_at = NOW()
        WHERE id = v_prescription_id;
    END IF;

    RETURN v_prescription_id;
END;
$$;

-- دالة إلغاء الوصفة الطبية
CREATE OR REPLACE FUNCTION public.cancel_electronic_prescription(
    p_prescription_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_doctor_id UUID;
BEGIN
    v_doctor_id := auth.uid();
    IF v_doctor_id IS NULL OR NOT public.is_doctor() THEN
        RAISE EXCEPTION 'غير مصرح: إلغاء الوصفة الطبية متاح للطبيب فقط';
    END IF;

    UPDATE public.prescriptions
    SET
        status = 'cancelled'::public.prescription_status_type,
        cancellation_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_prescription_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'لم يتم العثور على الوصفة الطبية المطلوبة';
    END IF;
END;
$$;

-- منح الصلاحيات للدوال
REVOKE ALL ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_electronic_prescription(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_electronic_prescription(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_electronic_prescription(UUID, TEXT) TO authenticated;

COMMIT;

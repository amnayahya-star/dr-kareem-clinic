-- ==============================================================================
-- Migration 00016: دورة مراجعة وتعديل الوصفات الطبية الصادرة (Prescription Revision Workflow)
-- ==============================================================================
-- الأهداف:
-- 1. منع تعديل الوصفة الصادرة (issued) نهائياً والحفاظ على سلامة المستند الطبي والقانوني.
-- 2. توفير مسار مراجعة آمن (Audit Trail) عبر إنشاء مسودة مراجعة مرتبطة (Linked Revision).
-- 3. اعتماد المراجعة واستبدال النسخة الصادرة السابقة ذرياً (Atomic Superseding).
-- 4. ربط المراجعات بالسلف (replaces_prescription_id) وبالجذر (original_prescription_id).
-- 5. ضمان نزاهة البيانات والروابط ومنع الإشارات الذاتية والتعارضات بين الزيارات المختلفة.
-- 6. إسقاط توقيع دالة save_electronic_prescription القديم لمنع مشاكل Overload / PostgREST.
-- ------------------------------------------------------------------------------

-- 1. إضافة أعمدة تتبع المراجعات في جدول public.prescriptions
-- ------------------------------------------------------------------------------
ALTER TABLE public.prescriptions
    ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS original_prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS replaces_prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS revision_reason TEXT;

-- ترقية بيانات الوصفات الحالية لضمان صحة رقم النسخة
UPDATE public.prescriptions
SET revision_number = 1
WHERE revision_number IS NULL OR revision_number < 1;

-- إضافة قيود التحقق لنزاهة أرقام المراجعات ومنع الإشارة الذاتية المباشرة
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_prescriptions_revision_positive'
    ) THEN
        ALTER TABLE public.prescriptions
            ADD CONSTRAINT chk_prescriptions_revision_positive 
            CHECK (revision_number >= 1);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_prescriptions_no_self_replace'
    ) THEN
        ALTER TABLE public.prescriptions
            ADD CONSTRAINT chk_prescriptions_no_self_replace 
            CHECK (replaces_prescription_id IS NULL OR replaces_prescription_id != id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_prescriptions_no_self_supersede'
    ) THEN
        ALTER TABLE public.prescriptions
            ADD CONSTRAINT chk_prescriptions_no_self_supersede 
            CHECK (superseded_by IS NULL OR superseded_by != id);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. إزالة القيد/الفهرس القديم الذي كان يحصر الزيارة في وصفة واحدة فقط
-- والتحقق من نوعه (سواء كان Table Constraint أو Standalone Index)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    -- إذا كان مسجلاً كقيد جدول (Constraint)
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'idx_prescriptions_unique_visit' 
          AND conrelid = 'public.prescriptions'::regclass
    ) THEN
        ALTER TABLE public.prescriptions DROP CONSTRAINT idx_prescriptions_unique_visit;
    END IF;

    -- إذا كان مسجلاً كفهرس مستقل (Index)
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'idx_prescriptions_unique_visit'
          AND n.nspname = 'public'
    ) THEN
        DROP INDEX public.idx_prescriptions_unique_visit;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. إنشاء الفهارس الجزئية الجديدة لحماية النزاهة الإكلينيكية
-- ------------------------------------------------------------------------------

-- أ. منع وجود أكثر من مسودة نشطة واحدة لنفس الزيارة في أي لحظة
CREATE UNIQUE INDEX IF NOT EXISTS idx_prescriptions_single_active_draft
ON public.prescriptions (visit_id)
WHERE status = 'draft'::public.prescription_status_type;

-- ب. ضمان وجود وصفة واحدة فقط معتمدة وصادرة لنفس الزيارة في أي لحظة
CREATE UNIQUE INDEX IF NOT EXISTS idx_prescriptions_single_issued
ON public.prescriptions (visit_id)
WHERE status = 'issued'::public.prescription_status_type;

-- ج. ضمان فرادة رقم المراجعة داخل نفس الزيارة (تمنع تكرار رقم النسخة)
CREATE UNIQUE INDEX IF NOT EXISTS idx_prescriptions_visit_revision
ON public.prescriptions (visit_id, revision_number);

-- د. فهارس تسريع تتبع سلسلة المراجعات والاستعلامات التاريخية
CREATE INDEX IF NOT EXISTS idx_prescriptions_original_id ON public.prescriptions (original_prescription_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_replaces_id ON public.prescriptions (replaces_prescription_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_superseded_by ON public.prescriptions (superseded_by);

-- ------------------------------------------------------------------------------
-- 4. تحديث دالة وزناد حماية الوصفات الصادرة والمستبدلة
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_prescription_integrity_and_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- أ. حماية حذف الوصفات: منع حذف الوصفات الصادرة أو الملغاة أو المستبدلة نهائياً
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN (
            'issued'::public.prescription_status_type, 
            'cancelled'::public.prescription_status_type,
            'superseded'::public.prescription_status_type
        ) THEN
            RAISE EXCEPTION 'لا يمكن حذف وصفة طبية صادرة أو مستبدلة أو ملغاة من قاعدة البيانات لأسباب تدقيق نظامية';
        END IF;
        RETURN OLD;
    END IF;

    -- ب. التحقق من النزاهة الهيكلية للروابط وتطابق الزيارات (عمليات INSERT و UPDATE)
    IF NEW.replaces_prescription_id IS NOT NULL THEN
        IF NEW.replaces_prescription_id = NEW.id THEN
            RAISE EXCEPTION 'خطأ في نزاهة البيانات: لا يمكن للوصفة أن تستبدل نفسها';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.prescriptions p
            WHERE p.id = NEW.replaces_prescription_id AND p.visit_id = NEW.visit_id
        ) THEN
            RAISE EXCEPTION 'خطأ في نزاهة البيانات: الوصفة السابقة المستبدلة لا تنتمي لنفس الزيارة';
        END IF;
    END IF;

    IF NEW.original_prescription_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.prescriptions p
            WHERE p.id = NEW.original_prescription_id AND p.visit_id = NEW.visit_id
        ) THEN
            RAISE EXCEPTION 'خطأ في نزاهة البيانات: الوصفة الجذر لا تنتمي لنفس الزيارة';
        END IF;
    END IF;

    IF NEW.superseded_by IS NOT NULL THEN
        IF NEW.superseded_by = NEW.id THEN
            RAISE EXCEPTION 'خطأ في نزاهة البيانات: لا يمكن للوصفة أن تستبدل بنفسها';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.prescriptions p
            WHERE p.id = NEW.superseded_by AND p.visit_id = NEW.visit_id
        ) THEN
            RAISE EXCEPTION 'خطأ في نزاهة البيانات: الوصفة الجديدة المستبدِلة لا تنتمي لنفس الزيارة';
        END IF;
    END IF;

    -- ج. منع التعديل على الوصفات في الحالات النهائية المقفلة
    IF TG_OP = 'UPDATE' THEN
        -- الوصفات الملغاة أو المستبدلة مقفلة قفلاً نهائياً ومطلقاً
        IF OLD.status = 'cancelled'::public.prescription_status_type THEN
            RAISE EXCEPTION 'لا يمكن تعديل وصفة طبية ملغاة؛ السجل مقفل نهائياً';
        END IF;

        IF OLD.status = 'superseded'::public.prescription_status_type THEN
            RAISE EXCEPTION 'لا يمكن تعديل وصفة طبية مستبدلة؛ سجل المراجعة التاريخي مقفل نهائياً';
        END IF;

        -- الوصفة الصادرة (issued): لا يُسمح بتعديل بياناتها الطبية إطلاقاً
        -- الاستثناء الوحيد المصرح به هو الاستبدال الذري (issued -> superseded)
        -- عند اعتماد مراجعة جديدة عبر save_electronic_prescription
        IF OLD.status = 'issued'::public.prescription_status_type THEN
            IF NEW.status = 'superseded'::public.prescription_status_type THEN
                IF NEW.superseded_by IS NULL OR NEW.superseded_at IS NULL THEN
                    RAISE EXCEPTION 'لا يمكن تحويل الوصفة الصادرة إلى مستبدلة دون تحديد النسخة البديلة وتوقيت الاستبدال';
                END IF;

                -- التأكد من عدم تغيير أي من البيانات الطبية أو الإكلينيكية أثناء الاستبدال
                IF NEW.patient_id != OLD.patient_id OR
                   NEW.visit_id != OLD.visit_id OR
                   NEW.doctor_id != OLD.doctor_id OR
                   NEW.prescribed_by != OLD.prescribed_by OR
                   NEW.revision_number != OLD.revision_number OR
                   (NEW.diagnosis_id IS DISTINCT FROM OLD.diagnosis_id) OR
                   (NEW.general_instructions IS DISTINCT FROM OLD.general_instructions) OR
                   NEW.issued_at != OLD.issued_at OR
                   NEW.created_at != OLD.created_at THEN
                    RAISE EXCEPTION 'غير مصرح بتعديل البيانات الإكلينيكية للوصفة الصادرة أثناء الاستبدال؛ البيانات مقفلة';
                END IF;

                RETURN NEW;
            ELSIF NEW.status = 'cancelled'::public.prescription_status_type THEN
                -- إلغاء الوصفة مسموح فقط مع تسجيل سبب الإلغاء
                IF NEW.cancellation_reason IS NULL OR length(trim(NEW.cancellation_reason)) < 5 THEN
                    RAISE EXCEPTION 'يجب تقديم سبب واضح لإلغاء الوصفة الطبية (5 أحرف على الأقل)';
                END IF;
                RETURN NEW;
            ELSE
                RAISE EXCEPTION 'لا يمكن تعديل وصفة طبية بعد إصدارها؛ يرجى إنشاء مراجعة جديدة عبر مسار التعديل المعتمد';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- إسقاط الزناد القديم من Migration 00007 والزناد المحدث
DROP TRIGGER IF EXISTS trg_protect_issued_prescriptions ON public.prescriptions;
DROP TRIGGER IF EXISTS trigger_prevent_modification_of_issued_prescription ON public.prescriptions;
DROP TRIGGER IF EXISTS trigger_check_prescription_integrity ON public.prescriptions;

CREATE TRIGGER trigger_check_prescription_integrity
    BEFORE INSERT OR UPDATE OR DELETE ON public.prescriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.check_prescription_integrity_and_immutability();

-- تحديث دالة حماية بنود الوصفة لحماية بنود الوصفات المستبدلة أيضاً
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
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'prescription_items' THEN
        v_target_prescription_id := COALESCE(NEW.prescription_id, OLD.prescription_id);
        SELECT status INTO v_status FROM public.prescriptions WHERE id = v_target_prescription_id;

        IF v_status IS NOT NULL AND v_status IN (
            'issued'::public.prescription_status_type, 
            'cancelled'::public.prescription_status_type,
            'superseded'::public.prescription_status_type
        ) THEN
            RAISE EXCEPTION 'لا يمكن إضافة أو تعديل أو حذف أدوية من وصفة طبية تم إصدارها أو إلغاؤها أو استبدالها';
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

-- ------------------------------------------------------------------------------
-- 5. تحديث سياسات الوصول (RLS Policies) لدعم قراءة السجل التاريخي والمستبدل
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff view issued prescriptions policy" ON public.prescriptions;
DROP POLICY IF EXISTS "Staff view issued and superseded prescriptions policy" ON public.prescriptions;

CREATE POLICY "Staff view issued and superseded prescriptions policy" ON public.prescriptions
    FOR SELECT TO authenticated
    USING (
        public.is_doctor() OR 
        (public.is_staff() AND status IN ('issued'::public.prescription_status_type, 'superseded'::public.prescription_status_type))
    );

DROP POLICY IF EXISTS "Staff view prescription items policy" ON public.prescription_items;
DROP POLICY IF EXISTS "Staff view issued and superseded prescription items policy" ON public.prescription_items;

CREATE POLICY "Staff view issued and superseded prescription items policy" ON public.prescription_items
    FOR SELECT TO authenticated
    USING (
        public.is_doctor() OR 
        (
            public.is_staff() AND 
            EXISTS (
                SELECT 1 FROM public.prescriptions p 
                WHERE p.id = prescription_items.prescription_id 
                  AND p.status IN ('issued'::public.prescription_status_type, 'superseded'::public.prescription_status_type)
            )
        )
    );

-- ------------------------------------------------------------------------------
-- 6. إنشاء إجراء مخزن آمن لبدء مراجعة وصفة صادرة (public.create_prescription_revision)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_prescription_revision(
    p_prescription_id UUID,
    p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_doctor_id UUID;
    v_target RECORD;
    v_existing_draft_id UUID;
    v_new_prescription_id UUID;
    v_next_revision INT;
    v_original_id UUID;
BEGIN
    -- 1. التحقق من صلاحية الطبيب المسجل
    IF NOT public.is_doctor() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة للأطباء المصرح لهم فقط';
    END IF;

    v_doctor_id := auth.uid();
    IF v_doctor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: تعذر التحقق من هوية الطبيب الحالية';
    END IF;

    -- 2. التحقق من سبب التعديل
    IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
        RAISE EXCEPTION 'سبب التعديل إلزامي ويجب ألا يقل عن 3 أحرف';
    END IF;

    -- 3. قفل وجلب بيانات الوصفة المستهدفة بالاسم
    SELECT * INTO v_target
    FROM public.prescriptions
    WHERE id = p_prescription_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'لم يتم العثور على الوصفة الطبية المحددة';
    END IF;

    -- التحقق من أن الوصفة المراد تعديلها في حالة صادرة (issued)
    IF v_target.status != 'issued'::public.prescription_status_type THEN
        RAISE EXCEPTION 'يمكن طلب تعديل الوصفات الصادرة فقط (الحالة الحالية: %)', v_target.status;
    END IF;

    -- 4. التحقق من عدم وجود مسودة مراجعة مفتوحة بالفعل لنفس الزيارة
    SELECT id INTO v_existing_draft_id
    FROM public.prescriptions
    WHERE visit_id = v_target.visit_id 
      AND status = 'draft'::public.prescription_status_type;

    IF v_existing_draft_id IS NOT NULL THEN
        RAISE EXCEPTION 'توجد بالفعل مسودة مراجعة مفتوحة لهذه الزيارة (المعرف: %)، يرجى استكمالها أو حذفها أولاً', v_existing_draft_id;
    END IF;

    -- 5. تحديد رقم المراجعة التالي والوصفة الجذر
    v_next_revision := COALESCE(v_target.revision_number, 1) + 1;
    v_original_id := COALESCE(v_target.original_prescription_id, v_target.id);

    -- 6. إنشاء مسودة الوصفة الجديدة المرتبطة
    INSERT INTO public.prescriptions (
        visit_id,
        patient_id,
        doctor_id,
        prescribed_by,
        diagnosis_id,
        status,
        general_instructions,
        revision_number,
        original_prescription_id,
        replaces_prescription_id,
        revision_reason,
        created_at,
        updated_at
    ) VALUES (
        v_target.visit_id,
        v_target.patient_id,
        v_doctor_id,
        v_doctor_id,
        v_target.diagnosis_id,
        'draft'::public.prescription_status_type,
        v_target.general_instructions,
        v_next_revision,
        v_original_id,
        v_target.id,
        trim(p_reason),
        NOW(),
        NOW()
    )
    RETURNING id INTO v_new_prescription_id;

    -- 7. نسخ بنود الأدوية من الوصفة الأصلية إلى المسودة الجديدة
    INSERT INTO public.prescription_items (
        prescription_id,
        catalog_product_id,
        is_custom_medication,
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
    )
    SELECT 
        v_new_prescription_id,
        catalog_product_id,
        is_custom_medication,
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
        NOW(),
        NOW()
    FROM public.prescription_items
    WHERE prescription_id = v_target.id
    ORDER BY display_order ASC;

    RETURN v_new_prescription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_prescription_revision(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_prescription_revision(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_prescription_revision(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. إسقاط توقيع دالة save_electronic_prescription القديم (6 معاملات)
-- لمنع حدوث Overload وتفادي خطأ الغموض في Supabase / PostgREST
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT);

-- ------------------------------------------------------------------------------
-- 8. إنشاء دالة حفظ وإصدار الوصفة الإلكترونية بالتوقيع الجديد الموحد (7 معاملات)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_electronic_prescription(
    p_visit_id UUID,
    p_patient_id UUID,
    p_diagnosis_id UUID DEFAULT NULL,
    p_general_instructions TEXT DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::JSONB,
    p_action TEXT DEFAULT 'draft', -- 'draft' | 'issue'
    p_prescription_id UUID DEFAULT NULL
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
    v_replaces_prescription_id UUID;
    v_predecessor_status public.prescription_status_type;
    v_item JSONB;
    v_idx INT := 0;
    v_med_name TEXT;
    v_dosage_form TEXT;
    v_dosage_form_norm TEXT;
    v_freq TEXT;
    v_dur TEXT;
    v_items_count INT;
    v_raw_catalog_id TEXT;
    v_catalog_product_id UUID;
    v_raw_is_custom TEXT;
    v_is_custom BOOLEAN;
BEGIN
    -- 1. التحقق من صحة الإجراء (p_action)
    IF p_action IS NULL OR p_action NOT IN ('draft', 'issue') THEN
        RAISE EXCEPTION 'إجراء غير صالح: يجب أن يكون الإجراء إما مسودة (draft) أو إصدار (issue)';
    END IF;

    -- 2. التحقق من بنية بنود الأدوية (p_items)
    IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' THEN
        RAISE EXCEPTION 'قائمة الأدوية غير صالحة: يجب توفير مصفوفة JSON صالحة للأدوية';
    END IF;

    -- 3. التحقق من صلاحية الطبيب الحالي
    IF NOT public.is_doctor() THEN
        RAISE EXCEPTION 'غير مصرح: فقط الطبيب المصرح له يمكنه إنشاء أو تعديل أو إصدار الوصفات الطبية';
    END IF;

    v_doctor_id := auth.uid();
    IF v_doctor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: تعذر التحقق من هوية الطبيب الحالية';
    END IF;

    -- 4. التحقق من وجود الزيارة وتطابق ملف المريض
    IF NOT EXISTS (
        SELECT 1 FROM public.visits 
        WHERE id = p_visit_id AND patient_id = p_patient_id
    ) THEN
        RAISE EXCEPTION 'الزيارة المحددة غير موجودة أو لا تتطابق مع ملف المريض';
    END IF;

    -- 5. التحقق من وجود تشخيص صالح في حال تم تمريره
    IF p_diagnosis_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.diagnoses 
            WHERE id = p_diagnosis_id AND visit_id = p_visit_id
        ) THEN
            RAISE EXCEPTION 'التشخيص المحدد غير صالح أو غير مرتبط بهذه الزيارة';
        END IF;
    END IF;

    -- 6. فحص الوصفة المستهدفة وقفلها لمنع التزاحم
    IF p_prescription_id IS NOT NULL THEN
        SELECT id, status, doctor_id, prescribed_by, replaces_prescription_id
        INTO v_prescription_id, v_current_status, v_existing_doctor_id, v_existing_prescribed_by, v_replaces_prescription_id
        FROM public.prescriptions
        WHERE id = p_prescription_id AND visit_id = p_visit_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'الوصفة الطبية المحددة غير موجودة في هذه الزيارة';
        END IF;
    ELSE
        -- البحث عن مسودة نشطة مفتوحة للزيارة
        SELECT id, status, doctor_id, prescribed_by, replaces_prescription_id
        INTO v_prescription_id, v_current_status, v_existing_doctor_id, v_existing_prescribed_by, v_replaces_prescription_id
        FROM public.prescriptions
        WHERE visit_id = p_visit_id AND status = 'draft'::public.prescription_status_type
        FOR UPDATE;
    END IF;

    -- التحقق من عدم محاولة التعديل المباشر على وصفة صادرة أو مستبدلة أو ملغاة
    IF v_current_status IS NOT NULL AND v_current_status IN (
        'issued'::public.prescription_status_type, 
        'cancelled'::public.prescription_status_type,
        'superseded'::public.prescription_status_type
    ) THEN
        RAISE EXCEPTION 'لا يمكن حفظ أو تعديل وصفة طبية في حالتها الحالية (الحالة: %)', v_current_status;
    END IF;

    -- 7. التحقق من عدد البنود والشروط الإلزامية عند الإصدار (issue)
    v_items_count := jsonb_array_length(p_items);
    IF p_action = 'issue' AND v_items_count = 0 THEN
        RAISE EXCEPTION 'لا يمكن إصدار وصفة طبية خالية من الأدوية؛ يجب إضافة دواء واحد على الأقل قبل الإصدار';
    END IF;

    -- إذا كان إصداراً أولياً (ليس استبدالاً)، نتأكد من عدم وجود وصفة أخرى صادرة حالياً لنفس الزيارة
    IF p_action = 'issue' AND v_replaces_prescription_id IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.prescriptions
            WHERE visit_id = p_visit_id AND status = 'issued'::public.prescription_status_type
        ) THEN
            RAISE EXCEPTION 'توجد بالفعل وصفة طبية معتمدة وصادرة لهذه الزيارة؛ يرجى استخدام مسار تعديل الوصفة لإنشاء مراجعة جديدة';
        END IF;
    END IF;

    -- 8. التحقق التفصيلي من بنود الأدوية والتطبيع
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_idx := v_idx + 1;
        v_med_name := trim(COALESCE(v_item->>'medication_name', ''));
        IF v_med_name = '' THEN
            RAISE EXCEPTION 'البند رقم %: اسم الدواء إلزامي ولا يمكن تركه فارغاً', v_idx;
        END IF;

        v_dosage_form := trim(COALESCE(v_item->>'dosage_form', ''));
        IF v_dosage_form != '' THEN
            v_dosage_form_norm := lower(v_dosage_form);
            IF v_dosage_form_norm NOT IN (
                'syrup', 'suspension', 'drops', 'tablet', 'tablets', 'capsule', 'capsules',
                'suppository', 'injection', 'injections', 'ointment', 'cream', 'ointment_cream',
                'spray', 'inhaler', 'inhaler_spray', 'sachet', 'other'
            ) THEN
                RAISE EXCEPTION 'البند رقم %: الشكل الدوائي غير صالح (%)', v_idx, v_dosage_form;
            END IF;
        END IF;

        IF p_action = 'issue' THEN
            v_freq := trim(COALESCE(v_item->>'frequency', ''));
            v_dur  := trim(COALESCE(v_item->>'duration', ''));
            IF v_freq = '' THEN
                RAISE EXCEPTION 'البند رقم % (%): تكرار الجرعة إلزامي لإصدار الوصفة', v_idx, v_med_name;
            END IF;
            IF v_dur = '' THEN
                RAISE EXCEPTION 'البند رقم % (%): مدة العلاج إلزامية لإصدار الوصفة', v_idx, v_med_name;
            END IF;
        END IF;
    END LOOP;

    -- 9. إنشاء أو تحديث سجل الرأس في جدول public.prescriptions
    IF v_prescription_id IS NULL THEN
        INSERT INTO public.prescriptions (
            visit_id,
            patient_id,
            doctor_id,
            prescribed_by,
            diagnosis_id,
            status,
            general_instructions,
            revision_number,
            created_at,
            updated_at
        ) VALUES (
            p_visit_id,
            p_patient_id,
            v_doctor_id,
            v_doctor_id,
            p_diagnosis_id,
            'draft'::public.prescription_status_type,
            p_general_instructions,
            1,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_prescription_id;
    ELSE
        UPDATE public.prescriptions
        SET
            diagnosis_id = p_diagnosis_id,
            general_instructions = p_general_instructions,
            doctor_id = v_doctor_id,
            prescribed_by = v_doctor_id,
            status = 'draft'::public.prescription_status_type,
            updated_at = NOW()
        WHERE id = v_prescription_id;
    END IF;

    -- 10. إحلال بنود الأدوية (Replace Items)
    DELETE FROM public.prescription_items
    WHERE prescription_id = v_prescription_id;

    v_idx := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_idx := v_idx + 1;
        v_raw_catalog_id := trim(COALESCE(v_item->>'catalog_product_id', ''));
        IF v_raw_catalog_id = '' OR v_raw_catalog_id = 'null' THEN
            v_catalog_product_id := NULL;
        ELSE
            BEGIN
                v_catalog_product_id := v_raw_catalog_id::UUID;
            EXCEPTION WHEN OTHERS THEN
                v_catalog_product_id := NULL;
            END;
        END IF;

        IF v_catalog_product_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.drug_products WHERE id = v_catalog_product_id
            ) THEN
                v_catalog_product_id := NULL;
            END IF;
        END IF;

        v_raw_is_custom := lower(trim(COALESCE(v_item->>'is_custom_medication', '')));
        IF v_raw_is_custom IN ('true', 't', '1') THEN
            v_is_custom := TRUE;
        ELSIF v_raw_is_custom IN ('false', 'f', '0') THEN
            v_is_custom := FALSE;
        ELSE
            v_is_custom := (v_catalog_product_id IS NULL);
        END IF;

        v_dosage_form := trim(COALESCE(v_item->>'dosage_form', ''));
        v_dosage_form_norm := CASE 
            WHEN lower(v_dosage_form) IN ('tablets', 'tablet') THEN 'tablets'
            WHEN lower(v_dosage_form) IN ('capsules', 'capsule') THEN 'capsules'
            WHEN lower(v_dosage_form) IN ('injections', 'injection') THEN 'injections'
            WHEN lower(v_dosage_form) IN ('ointment_cream', 'cream', 'ointment', 'gel', 'lotion') THEN 'ointment_cream'
            WHEN lower(v_dosage_form) IN ('drops') THEN 'drops'
            WHEN lower(v_dosage_form) IN ('syrup', 'suspension', 'solution', 'elixir') THEN 'syrup'
            WHEN lower(v_dosage_form) IN ('suppository') THEN 'suppository'
            WHEN lower(v_dosage_form) IN ('inhaler_spray', 'inhaler', 'spray', 'aerosol') THEN 'inhaler_spray'
            WHEN v_dosage_form = '' OR v_dosage_form IS NULL THEN NULL
            ELSE 'other'
        END;

        INSERT INTO public.prescription_items (
            prescription_id,
            catalog_product_id,
            is_custom_medication,
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
            v_catalog_product_id,
            v_is_custom,
            trim(v_item->>'medication_name'),
            NULLIF(trim(COALESCE(v_item->>'active_ingredient', '')), ''),
            NULLIF(trim(COALESCE(v_item->>'strength', '')), ''),
            v_dosage_form_norm::public.dosage_form_type,
            NULLIF(trim(COALESCE(v_item->>'dose', '')), ''),
            NULLIF(trim(COALESCE(v_item->>'route', '')), ''),
            NULLIF(trim(COALESCE(v_item->>'frequency', '')), ''),
            NULLIF(trim(COALESCE(v_item->>'duration', '')), ''),
            NULLIF(trim(COALESCE(v_item->>'quantity', '')), ''),
            NULLIF(trim(COALESCE(v_item->>'instructions', '')), ''),
            COALESCE((v_item->>'display_order')::INT, v_idx),
            NOW(),
            NOW()
        );
    END LOOP;

    -- 11. في حالة طلب الإصدار النهائي (issue):
    -- ترتيب التحديثات بدقة لمنع أي تعارض مؤقت مع الفهرس الفريد:
    -- الخطوة أ: تحويل النسخة الصادرة السابقة أولاً إلى superseded
    -- الخطوة ب: تحويل المسودة الحالية إلى issued
    IF p_action = 'issue' THEN
        IF v_replaces_prescription_id IS NOT NULL THEN
            SELECT status INTO v_predecessor_status
            FROM public.prescriptions
            WHERE id = v_replaces_prescription_id
            FOR UPDATE;

            IF v_predecessor_status != 'issued'::public.prescription_status_type THEN
                RAISE EXCEPTION 'لا يمكن استبدال الوصفة السابقة لأنها لم تعد في حالة صادرة (الحالة: %)', v_predecessor_status;
            END IF;

            -- الخطوة أ: تحويل السلف إلى مستبدلة أولاً
            UPDATE public.prescriptions
            SET 
                status = 'superseded'::public.prescription_status_type,
                superseded_at = NOW(),
                superseded_by = v_prescription_id,
                updated_at = NOW()
            WHERE id = v_replaces_prescription_id;
        END IF;

        -- الخطوة ب: تحويل المسودة الجديدة إلى صادرة
        UPDATE public.prescriptions
        SET 
            status = 'issued'::public.prescription_status_type,
            issued_at = NOW(),
            updated_at = NOW()
        WHERE id = v_prescription_id;

        -- 12. تحديث عداد الاستخدام في clinic_drug_catalog:
        -- في حالة المراجعة: احتساب الأدوية الجديدة فقط التي لم تكن موجودة في السلف (Delta)
        -- مع استخدام DISTINCT لضمان عدم احتساب الدواء المكرر في بنود الوصفة الواحدة أكثر من مرة
        IF v_replaces_prescription_id IS NOT NULL THEN
            INSERT INTO public.clinic_drug_catalog (
                product_id,
                lifecycle_status,
                usage_count,
                is_starred,
                is_enabled,
                last_prescribed_by,
                last_prescribed_at,
                created_at,
                updated_at
            )
            SELECT 
                DISTINCT pi_new.catalog_product_id,
                'frequently_used'::public.drug_catalog_lifecycle_status_type,
                1,
                FALSE,
                TRUE,
                v_doctor_id,
                NOW(),
                NOW(),
                NOW()
            FROM public.prescription_items pi_new
            WHERE pi_new.prescription_id = v_prescription_id
              AND pi_new.catalog_product_id IS NOT NULL
              AND pi_new.catalog_product_id NOT IN (
                  SELECT pi_old.catalog_product_id
                  FROM public.prescription_items pi_old
                  WHERE pi_old.prescription_id = v_replaces_prescription_id
                    AND pi_old.catalog_product_id IS NOT NULL
              )
            ON CONFLICT (product_id) DO UPDATE
            SET
                usage_count = public.clinic_drug_catalog.usage_count + 1,
                last_prescribed_by = v_doctor_id,
                last_prescribed_at = NOW(),
                updated_at = NOW();
        ELSE
            INSERT INTO public.clinic_drug_catalog (
                product_id,
                lifecycle_status,
                usage_count,
                is_starred,
                is_enabled,
                last_prescribed_by,
                last_prescribed_at,
                created_at,
                updated_at
            )
            SELECT 
                DISTINCT pi.catalog_product_id,
                'frequently_used'::public.drug_catalog_lifecycle_status_type,
                1,
                FALSE,
                TRUE,
                v_doctor_id,
                NOW(),
                NOW(),
                NOW()
            FROM public.prescription_items pi
            WHERE pi.prescription_id = v_prescription_id
              AND pi.catalog_product_id IS NOT NULL
            ON CONFLICT (product_id) DO UPDATE
            SET
                usage_count = public.clinic_drug_catalog.usage_count + 1,
                last_prescribed_by = v_doctor_id,
                last_prescribed_at = NOW(),
                updated_at = NOW();
        END IF;
    END IF;

    RETURN v_prescription_id;
END;
$$;

-- ضبط الصلاحيات الصارمة على التوقيع النهائي الموحد فقط
REVOKE ALL ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT, UUID) TO authenticated;

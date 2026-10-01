-- ==============================================================================
-- Migration: Fix Prescription Revision Number Allocation Across Cancelled Revisions
-- Version: 00020_fix_prescription_revision_number_allocation.sql
-- ==============================================================================
-- الأهداف والضمانات الصارمة:
-- 1. حل خطأ duplicate key value violates unique constraint "idx_prescriptions_visit_revision".
-- 2. حساب رقم المراجعة الجديد اعتماداً على MAX(revision_number) + 1 لجميع وصفات الزيارة
--    بجميع حالاتها (draft, issued, superseded, cancelled).
-- 3. عدم حساب الرقم من النسخة المصدر وحدها لتفادي تكرار الأرقام بعد إلغاء مراجعات سابقة.
-- 4. استخدام قفل تزامني صريح ومعاملي (Advisory Lock + FOR UPDATE على صف الزيارة) لمنع حالات التسابق (Race Conditions).
-- 5. الحفاظ على سرية وسلامة السجل التاريخي: عدم المساس بالنسخ الملغاة أو تعديلها أو حذفها.
-- 6. بقاء النسخة الصادرة المصدر كما هي دون أي تغيير على حالتها أو بنودها أثناء إنشاء المسودة.
-- 7. عدم لمس جدول كتالوج الأدوية clinic_drug_catalog أو usage_count.
-- 8. حصر التنفيذ بالأطباء المصرح لهم ومنع anon و PUBLIC.
-- ==============================================================================

BEGIN;

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
    -- 1. التحقق من صلاحية الطبيب المصادق عليه
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

    -- 3. قفل وجلب بيانات الوصفة المستهدفة FOR UPDATE لمنع التعديل المتزامن
    IF p_prescription_id IS NULL THEN
        RAISE EXCEPTION 'معرف الوصفة الطبية إلزامي';
    END IF;

    SELECT * INTO v_target
    FROM public.prescriptions
    WHERE id = p_prescription_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'لم يتم العثور على الوصفة الطبية المحددة';
    END IF;

    -- 4. التحقق من الصلاحيات: رفض وصفة تخص زيارة أو طبيباً آخر غير مصرح له
    IF (v_target.doctor_id IS NOT NULL AND v_target.doctor_id != v_doctor_id) 
       AND (v_target.prescribed_by IS NOT NULL AND v_target.prescribed_by != v_doctor_id) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.visits 
            WHERE id = v_target.visit_id AND doctor_id = v_doctor_id
        ) THEN
            RAISE EXCEPTION 'غير مصرح: لا يمكن إنشاء مراجعة لوصفة تخص زيارة أو طبيباً آخر';
        END IF;
    END IF;

    -- 5. التحقق الصارم من حالة الوصفة المصدر: يجب أن تكون صادرة ومعتمدة حصراً
    IF v_target.status != 'issued'::public.prescription_status_type THEN
        IF v_target.status = 'cancelled'::public.prescription_status_type THEN
            RAISE EXCEPTION 'لا يمكن إنشاء مراجعة لوصفة ملغاة';
        ELSIF v_target.status = 'superseded'::public.prescription_status_type THEN
            RAISE EXCEPTION 'لا يمكن إنشاء مراجعة لوصفة مستبدلة؛ سجل المراجعات التاريخي مقفل';
        ELSIF v_target.status = 'draft'::public.prescription_status_type THEN
            RAISE EXCEPTION 'الوصفة في حالة مسودة بالفعل ولا يمكن إنشاء مراجعة منها';
        ELSE
            RAISE EXCEPTION 'يمكن طلب تعديل الوصفات الصادرة فقط (الحالة الحالية: %)', v_target.status;
        END IF;
    END IF;

    -- 6. منع حالات التسابق (Concurrency & Race Conditions)
    -- تطبيق قفلين متكاملين: قفل استشاري ثابت لكل visit_id + قفل صفي للزيارة نفسها
    PERFORM pg_advisory_xact_lock(hashtextextended('prescription_revision:' || v_target.visit_id::TEXT, 0));
    PERFORM 1 FROM public.visits WHERE id = v_target.visit_id FOR UPDATE;

    -- 7. التحقق من عدم وجود مسودة مراجعة نشطة بالفعل لنفس الزيارة
    SELECT id INTO v_existing_draft_id
    FROM public.prescriptions
    WHERE visit_id = v_target.visit_id 
      AND status = 'draft'::public.prescription_status_type;

    IF v_existing_draft_id IS NOT NULL THEN
        RAISE EXCEPTION 'توجد بالفعل مسودة مراجعة مفتوحة لهذه الزيارة (المعرف: %)، يرجى استكمالها أو إلغاؤها أولاً', v_existing_draft_id;
    END IF;

    -- 8. التخصيص الحتمي لرقم المراجعة التالي:
    -- حساب MAX(revision_number) لجميع وصفات الزيارة بجميع الحالات (draft, issued, superseded, cancelled)
    -- هذا يضمن عدم تكرار الرقم أبداً حتى لو أُلغيت مسودات سابقة (مثل إلغاء نسخة 2 ثم إنشاء نسخة 3)
    SELECT COALESCE(MAX(revision_number), 0) + 1
    INTO v_next_revision
    FROM public.prescriptions
    WHERE visit_id = v_target.visit_id;

    -- تحديد الوصفة الجذر
    v_original_id := COALESCE(v_target.original_prescription_id, v_target.id);

    -- 9. إنشاء مسودة الوصفة الجديدة برقم المراجعة المحسوب بأمان
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

    -- 10. نسخ بنود الأدوية من الوصفة الأصلية المعتمدة إلى المسودة الجديدة
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

    -- 11. إرجاع معرّف المسودة الجديدة (تبقى النسخة الأصلية issued دون تعديل في حالتها)
    RETURN v_new_prescription_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- حصر الصلاحيات: منع الوصول المجهول anon و PUBLIC وإتاحة التنفيذ للمصادقين authenticated
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_prescription_revision(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_prescription_revision(UUID, TEXT) TO authenticated;

COMMIT;

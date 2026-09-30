-- ==============================================================================
-- Migration 00018: إلغاء مسودة مراجعة الوصفة الإلكترونية بأمان وحفظ التدقيق
-- ==============================================================================
-- الأهداف والضوابط الصارمة:
-- 1. تمكين الطبيب المصرح له من إلغاء مسودة مراجعة تجريبية (revision_number > 1) بأمان.
-- 2. عدم حذف السجل الطبي أو بنود الأدوية نهائياً (الحفاظ على التدقيق الطبي والقانوني الكامل).
-- 3. حماية النسخة الأصلية المعتمدة (نسخة 1 الصادرة) وضمان بقائها كما هي دون أي مساس بحالتها.
-- 4. منع إلغاء النسخة الأصلية، أو الوصفات الصادرة (issued)، أو المستبدلة (superseded)، أو الملغاة بالفعل.
-- 5. عدم المساس بنوع ENUM (حيث ثبت وجود 'cancelled' مسبقاً).
-- 6. عدم تغيير عداد استخدام الأدوية (usage_count) أو كتالوج الأدوية الشائعة (clinic_drug_catalog).
-- 7. قفل السجل باستخدام FOR UPDATE لمنع حالات التسابق والتعديل المتزامن (Race Conditions).
-- 8. إعادة معرف الوصفة المعتمدة الحالية (fallback_prescription_id) للعودة السلسة إليها في الواجهة.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_prescription_revision(
    p_prescription_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_doctor_id UUID;
    v_target RECORD;
    v_fallback_id UUID;
BEGIN
    -- 1. التحقق من صلاحية الطبيب المصادق عليه
    IF NOT public.is_doctor() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة للأطباء المصرح لهم فقط';
    END IF;

    v_doctor_id := auth.uid();
    IF v_doctor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: تعذر التحقق من هوية الطبيب الحالية';
    END IF;

    -- 2. التحقق من وجود المعرف وقفل السجل لمنع التعارض وحالات السباق المتزامنة
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

    -- 3. التحقق من الصلاحيات: رفض وصفة تخص زيارة أو طبيباً آخر غير مسموح له
    IF (v_target.doctor_id IS NOT NULL AND v_target.doctor_id != v_doctor_id) 
       AND (v_target.prescribed_by IS NOT NULL AND v_target.prescribed_by != v_doctor_id) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.visits 
            WHERE id = v_target.visit_id AND doctor_id = v_doctor_id
        ) THEN
            RAISE EXCEPTION 'غير مصرح: لا يمكن إلغاء مسودة مراجعة تخص زيارة أو طبيباً آخر';
        END IF;
    END IF;

    -- 4. التحقق الصارم من حالة الوصفة وشروط مسودة المراجعة
    -- أ. رفض إلغاء إذا لم تكن في حالة مسودة (draft)
    IF v_target.status != 'draft'::public.prescription_status_type THEN
        IF v_target.status = 'cancelled'::public.prescription_status_type THEN
            RAISE EXCEPTION 'الوصفة الطبية ملغاة بالفعل ولا يمكن إلغاؤها مرة أخرى';
        ELSIF v_target.status = 'issued'::public.prescription_status_type THEN
            RAISE EXCEPTION 'لا يمكن إلغاء وصفة طبية معتمدة وصادرة عبر هذا الإجراء؛ هذا الإجراء مخصص لإلغاء مسودات المراجعة فقط';
        ELSIF v_target.status = 'superseded'::public.prescription_status_type THEN
            RAISE EXCEPTION 'لا يمكن إلغاء وصفة طبية مستبدلة؛ سجل المراجعات التاريخي مقفل نهائياً';
        ELSE
            RAISE EXCEPTION 'لا يمكن إلغاء الوصفة الطبية في حالتها الحالية (الحالة: %)', v_target.status;
        END IF;
    END IF;

    -- ب. رفض إلغاء النسخة الأصلية (revision_number <= 1)
    IF COALESCE(v_target.revision_number, 1) <= 1 THEN
        RAISE EXCEPTION 'لا يمكن إلغاء النسخة الأصلية للوصفة الطبية؛ هذا الإجراء مخصص لمسودات المراجعة فقط';
    END IF;

    -- ج. التحقق من ارتباط مسودة المراجعة بسلسلة الوصفات
    IF v_target.replaces_prescription_id IS NULL AND v_target.original_prescription_id IS NULL THEN
        RAISE EXCEPTION 'لا يمكن إلغاء مسودة غير مرتبطة بوصفة سابقة معتمدة';
    END IF;

    -- 5. تحديد الوصفة المعتمدة البديلة (fallback_prescription_id)
    -- البحث أولاً عن الوصفة السلف المباشرة إن كانت صادرة ومعتمدة
    IF v_target.replaces_prescription_id IS NOT NULL THEN
        SELECT id INTO v_fallback_id
        FROM public.prescriptions
        WHERE id = v_target.replaces_prescription_id
          AND status = 'issued'::public.prescription_status_type;
    END IF;

    -- إذا لم تكن السلف صادرة، نبحث عن الوصفة الصادرة الحالية لنفس الزيارة
    IF v_fallback_id IS NULL THEN
        SELECT id INTO v_fallback_id
        FROM public.prescriptions
        WHERE visit_id = v_target.visit_id
          AND status = 'issued'::public.prescription_status_type
        LIMIT 1;
    END IF;

    -- إن لم توجد وصفة صادرة حالياً، الرجوع إلى معرف السلف أو الجذر
    IF v_fallback_id IS NULL THEN
        v_fallback_id := COALESCE(v_target.replaces_prescription_id, v_target.original_prescription_id);
    END IF;

    -- 6. تغيير حالة مسودة المراجعة إلى cancelled مع تسجيل وقت التحديث والسبب وتجنب حذف أي بنود
    UPDATE public.prescriptions
    SET 
        status = 'cancelled'::public.prescription_status_type,
        cancellation_reason = COALESCE(v_target.cancellation_reason, 'إلغاء مسودة المراجعة من قبل الطبيب'),
        updated_at = NOW()
    WHERE id = v_target.id;

    -- 7. إعادة نتيجة العملية بتنسيق JSONB
    RETURN jsonb_build_object(
        'cancelled_prescription_id', v_target.id,
        'fallback_prescription_id', v_fallback_id,
        'visit_id', v_target.visit_id,
        'status', 'cancelled'
    );
END;
$$;

-- ضبط أذونات الاستدعاء الصارمة
REVOKE ALL ON FUNCTION public.cancel_prescription_revision(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_prescription_revision(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_prescription_revision(UUID) TO authenticated;

COMMIT;

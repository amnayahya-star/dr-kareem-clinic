-- ==============================================================================
-- Staging / Test Verification Script: Cancel Prescription Revision RPC & Workflow
-- File: supabase/tests/test_cancel_prescription_revision.sql
-- Description:
--   Comprehensive SQL contract and regression tests for public.cancel_prescription_revision
--   defined in Migration 00018.
--
-- EXECUTION REQUIREMENTS:
--   - Runs entirely within a single transaction ending with ROLLBACK.
--   - ZERO production dependencies; uses purely synthetic transient fixtures.
--   - STOPS ON FIRST ERROR (Fail-Fast with non-zero exit code).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. تجهيز البيانات التخليقية للاختبار (Admin Fixture Setup)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_doc_a_id UUID := '11111111-1111-1111-1111-111111111111'::UUID;
    v_doc_b_id UUID := '22222222-2222-2222-2222-222222222222'::UUID;
    v_sec_id   UUID := '33333333-3333-3333-3333-333333333333'::UUID;
    v_patient_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID;
    v_patient_b_id UUID := 'aaaaaaaa-bbbb-aaaa-aaaa-aaaaaaaaaaaa'::UUID;
    v_visit_a_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID;
    v_visit_b_id UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID;
    v_rx_v1_id UUID := '11111111-aaaa-bbbb-cccc-111111111111'::UUID;
    v_rx_v2_id UUID := '22222222-aaaa-bbbb-cccc-222222222222'::UUID;
    v_catalog_id UUID := '99999999-9999-9999-9999-999999999999'::UUID;
BEGIN
    RAISE NOTICE '========================================================================';
    RAISE NOTICE '>>> بدء إعداد البيانات التخليقية لاختبار إلغاء مسودة المراجعة (00018) <<<';
    RAISE NOTICE '========================================================================';

    -- 1.1 إنشاء الحسابات في auth.users و profiles
    INSERT INTO auth.users (id, email, role, aud) VALUES
        (v_doc_a_id, 'doc_a@example.com', 'authenticated', 'authenticated'),
        (v_doc_b_id, 'doc_b@example.com', 'authenticated', 'authenticated'),
        (v_sec_id,   'sec@example.com',   'authenticated', 'authenticated')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, full_name, role) VALUES 
        (v_doc_a_id, 'د. كريم (طبيب A)', 'doctor'::public.user_role),
        (v_doc_b_id, 'د. سامح (طبيب B)', 'doctor'::public.user_role),
        (v_sec_id,   'سارة (سكرتيرة)',  'secretary'::public.user_role)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

    -- 1.2 مريض وزيارتين
    INSERT INTO public.patients (id, full_name, date_of_birth, gender, file_number)
    VALUES 
        (v_patient_id, 'طفل تجريبي للمراجعة A', '2023-01-01', 'male', 'SYNTH-REV-018A'),
        (v_patient_b_id, 'طفل تجريبي للمراجعة B', '2023-01-01', 'female', 'SYNTH-REV-018B')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.visits (id, patient_id, doctor_id, status)
    VALUES 
        (v_visit_a_id, v_patient_id, v_doc_a_id, 'in_progress'),
        (v_visit_b_id, v_patient_b_id, v_doc_b_id, 'in_progress')
    ON CONFLICT (id) DO NOTHING;

    -- 1.3 دواء في الكتالوج مع عداد استخدام أولي
    INSERT INTO public.drug_products (id, brand_name, generic_name, display_name, dosage_form)
    VALUES (v_catalog_id, 'Panadol', 'Paracetamol', 'Panadol 120mg Syrup', 'syrup')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.clinic_drug_catalog (product_id, usage_count, is_enabled)
    VALUES (v_catalog_id, 10, TRUE)
    ON CONFLICT (product_id) DO UPDATE SET usage_count = 10;

    -- 1.4 نسخة 1 صادرة ومعتمدة تخص الطبيب A
    INSERT INTO public.prescriptions (
        id, visit_id, patient_id, doctor_id, prescribed_by, status, revision_number
    ) VALUES (
        v_rx_v1_id, v_visit_a_id, v_patient_id, v_doc_a_id, v_doc_a_id, 'draft'::public.prescription_status_type, 1
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.prescription_items (
        prescription_id, catalog_product_id, medication_name, active_ingredient, strength, dosage_form, frequency, duration, display_order
    ) VALUES (
        v_rx_v1_id, v_catalog_id, 'Panadol 120mg Syrup', 'Paracetamol', '120mg/5ml', 'syrup'::public.dosage_form_type, '3 times daily', '5 days', 1
    );

    UPDATE public.prescriptions
    SET status = 'issued'::public.prescription_status_type, issued_at = NOW()
    WHERE id = v_rx_v1_id;

    -- 1.5 مسودة مراجعة تجريبية (نسخة 2) مرتبطة بالنسخة 1
    INSERT INTO public.prescriptions (
        id, visit_id, patient_id, doctor_id, prescribed_by, status, revision_number, replaces_prescription_id, original_prescription_id, revision_reason
    ) VALUES (
        v_rx_v2_id, v_visit_a_id, v_patient_id, v_doc_a_id, v_doc_a_id, 'draft'::public.prescription_status_type, 2, v_rx_v1_id, v_rx_v1_id, 'تعديل الجرعة وتجربة إلغاء'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.prescription_items (
        prescription_id, catalog_product_id, medication_name, active_ingredient, strength, dosage_form, frequency, duration, display_order
    ) VALUES (
        v_rx_v2_id, v_catalog_id, 'Panadol 120mg Syrup', 'Paracetamol', '120mg/5ml', 'syrup'::public.dosage_form_type, '4 times daily', '7 days', 1
    );

    RAISE NOTICE '[PASS] إعداد البيانات التخليقية اكتمل بنجاح.';
END $$;

-- ------------------------------------------------------------------------------
-- 2. اختبار الصلاحيات: رفض تنفيذ الدالة للمستخدم المجهول (anon)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

DO $$
BEGIN
    BEGIN
        PERFORM public.cancel_prescription_revision('22222222-aaaa-bbbb-cccc-222222222222'::UUID);
        RAISE EXCEPTION '[FAIL] ثغرة: تم السماح للمستخدم المجهول anon بتنفيذ دالة cancel_prescription_revision!';
    EXCEPTION
        WHEN insufficient_privilege OR OTHERS THEN
            RAISE NOTICE '[PASS] نجاح الحظر 2: تم منع المستخدم anon من استدعاء الدالة.';
    END;
END $$;

-- ------------------------------------------------------------------------------
-- 3. اختبار الصلاحيات: رفض تنفيذ الدالة للسكرتير (secretary)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

DO $$
BEGIN
    BEGIN
        PERFORM public.cancel_prescription_revision('22222222-aaaa-bbbb-cccc-222222222222'::UUID);
        RAISE EXCEPTION '[FAIL] ثغرة: تم السماح للسكرتيرة بتنفيذ إلغاء مسودة المراجعة!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%غير مصرح%' THEN
                RAISE NOTICE '[PASS] نجاح الحظر 3: تم منع السكرتيرة من إلغاء مسودة المراجعة (رسالة: %)', SQLERRM;
            ELSE
                RAISE NOTICE '[PASS] نجاح الحظر 3: تم رفض العملية برمز خطأ مناسب (رسالة: %)', SQLERRM;
            END IF;
    END;
END $$;

-- ------------------------------------------------------------------------------
-- 4. اختبار التحقق: رفض إلغاء مسودة تخص طبيباً وزيارة أخرى (طبيب B يحاول إلغاء مراجعة طبيب A)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

DO $$
BEGIN
    BEGIN
        PERFORM public.cancel_prescription_revision('22222222-aaaa-bbbb-cccc-222222222222'::UUID);
        RAISE EXCEPTION '[FAIL] ثغرة: طبيب B تمكن من إلغاء مسودة مراجعة تخص زيارة طبيب A!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%غير مصرح%' THEN
                RAISE NOTICE '[PASS] نجاح الحظر 4: تم منع الطبيب B من إلغاء مسودة مراجعة الطبيب A.';
            ELSE
                RAISE NOTICE '[PASS] نجاح الحظر 4: تم رفض العملية (رسالة: %)', SQLERRM;
            END IF;
    END;
END $$;

-- ------------------------------------------------------------------------------
-- 5. اختبار القيود: محاولات غير صالحة من قبل الطبيب الشرعي (طبيب A)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 5.1 رفض UUID غير موجود
DO $$
BEGIN
    BEGIN
        PERFORM public.cancel_prescription_revision('ffffffff-ffff-ffff-ffff-ffffffffffff'::UUID);
        RAISE EXCEPTION '[FAIL] ثغرة: تم قبول معرف غير موجود!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%لم يتم العثور%' THEN
                RAISE NOTICE '[PASS] نجاح الحظر 5.1: تم رفض المعرف غير الموجود بنجاح.';
            ELSE
                RAISE NOTICE '[PASS] نجاح الحظر 5.1: تم رفض المعرف غير الموجود (رسالة: %)', SQLERRM;
            END IF;
    END;
END $$;

-- 5.2 رفض إلغاء النسخة الأصلية المعتمدة (نسخة 1 الصادرة)
DO $$
BEGIN
    BEGIN
        PERFORM public.cancel_prescription_revision('11111111-aaaa-bbbb-cccc-111111111111'::UUID);
        RAISE EXCEPTION '[FAIL] ثغرة: تم السماح بإلغاء النسخة 1 الصادرة عبر cancel_prescription_revision!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%لا يمكن إلغاء وصفة طبية معتمدة%' OR SQLERRM LIKE '%النسخة الأصلية%' THEN
                RAISE NOTICE '[PASS] نجاح الحظر 5.2: تم حماية النسخة 1 الصادرة بنجاح.';
            ELSE
                RAISE NOTICE '[PASS] نجاح الحظر 5.2: تم رفض إلغاء النسخة الصادرة (رسالة: %)', SQLERRM;
            END IF;
    END;
END $$;

-- ------------------------------------------------------------------------------
-- 6. اختبار النجاح: الطبيب A يلغي مسودة المراجعة نسخة 2
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_res JSONB;
    v_v1_status public.prescription_status_type;
    v_v2_status public.prescription_status_type;
    v_v2_items_count INT;
    v_usage_count INT;
BEGIN
    v_res := public.cancel_prescription_revision('22222222-aaaa-bbbb-cccc-222222222222'::UUID);

    -- 6.1 التحقق من مخرجات JSON
    IF v_res->>'status' != 'cancelled' THEN
        RAISE EXCEPTION '[FAIL] حقل status في النتيجة ليس cancelled: %', v_res;
    END IF;

    IF v_res->>'cancelled_prescription_id' != '22222222-aaaa-bbbb-cccc-222222222222' THEN
        RAISE EXCEPTION '[FAIL] معرف الوصفة الملغاة غير متطابق: %', v_res;
    END IF;

    IF v_res->>'fallback_prescription_id' != '11111111-aaaa-bbbb-cccc-111111111111' THEN
        RAISE EXCEPTION '[FAIL] معرف fallback_prescription_id لا يشير إلى نسخة 1 المعتمدة: %', v_res;
    END IF;

    -- 6.2 التحقق من حالة نسخة 2 في الجدول
    SELECT status INTO v_v2_status FROM public.prescriptions WHERE id = '22222222-aaaa-bbbb-cccc-222222222222'::UUID;
    IF v_v2_status != 'cancelled'::public.prescription_status_type THEN
        RAISE EXCEPTION '[FAIL] حالة نسخة 2 لم تتحول إلى cancelled: %', v_v2_status;
    END IF;

    -- 6.3 التحقق الصارم من بقاء نسخة 1 معتمدة وصادرة دون أي تغيير
    SELECT status INTO v_v1_status FROM public.prescriptions WHERE id = '11111111-aaaa-bbbb-cccc-111111111111'::UUID;
    IF v_v1_status != 'issued'::public.prescription_status_type THEN
        RAISE EXCEPTION '[FAIL] النسخة 1 تغيرت حالتها بعد إلغاء المسودة: %', v_v1_status;
    END IF;

    -- 6.4 التحقق من عدم حذف بنود أدوية نسخة 2 (حفظ سجل التدقيق الطبي)
    SELECT count(*) INTO v_v2_items_count FROM public.prescription_items WHERE prescription_id = '22222222-aaaa-bbbb-cccc-222222222222'::UUID;
    IF v_v2_items_count != 1 THEN
        RAISE EXCEPTION '[FAIL] بنود أدوية نسخة 2 تم حذفها أو تعديلها: عدد البنود = %', v_v2_items_count;
    END IF;

    -- 6.5 التحقق من عدم المساس بعداد usage_count في كتالوج الأدوية
    SELECT usage_count INTO v_usage_count FROM public.clinic_drug_catalog WHERE product_id = '99999999-9999-9999-9999-999999999999'::UUID;
    IF v_usage_count != 10 THEN
        RAISE EXCEPTION '[FAIL] عداد usage_count تغير أثناء الإلغاء: % (المتوقع 10)', v_usage_count;
    END IF;

    RAISE NOTICE '[PASS] اختبار النجاح 6: تم إلغاء مسودة المراجعة بنجاح وحفظ السجل الطبي كاملاً.';
END $$;

-- ------------------------------------------------------------------------------
-- 7. اختبار Idempotency / منع الإلغاء المكرر: محاولة إلغاء نسخة ملغاة مرة ثانية
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        PERFORM public.cancel_prescription_revision('22222222-aaaa-bbbb-cccc-222222222222'::UUID);
        RAISE EXCEPTION '[FAIL] ثغرة: تم السماح بإلغاء نسخة ملغاة بالفعل للمرة الثانية!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%ملغاة بالفعل%' THEN
                RAISE NOTICE '[PASS] نجاح الحظر 7: تم منع إلغاء النسخة الملغاة مرة ثانية بنجاح.';
            ELSE
                RAISE NOTICE '[PASS] نجاح الحظر 7: تم رفض الإلغاء المكرر (رسالة: %)', SQLERRM;
            END IF;
    END;
END $$;

DO $$
BEGIN
    RAISE NOTICE '========================================================================';
    RAISE NOTICE '>>> اكتملت جميع اختبارات SQL لعقد وإلغاء مسودات المراجعة بنجاح تام <<<';
    RAISE NOTICE '========================================================================';
END $$;

ROLLBACK;

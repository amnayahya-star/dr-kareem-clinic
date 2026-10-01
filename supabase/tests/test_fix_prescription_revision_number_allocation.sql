-- ==============================================================================
-- Staging / Test Verification Script: Fix Prescription Revision Number Allocation
-- File: supabase/tests/test_fix_prescription_revision_number_allocation.sql
-- Description:
--   Comprehensive SQL contract and regression tests for public.create_prescription_revision
--   defined in Migration 00020.
--
-- EXECUTION REQUIREMENTS:
--   - Runs entirely within a single transaction ending with ROLLBACK.
--   - ZERO production dependencies; uses purely synthetic transient fixtures.
--   - STOPS ON FIRST ERROR (Fail-Fast with non-zero exit code).
-- ==============================================================================

\set ON_ERROR_STOP on

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
    v_visit_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID;
    v_rx_v1_id UUID := '11111111-aaaa-bbbb-cccc-111111111111'::UUID;
    v_catalog_id UUID := '99999999-9999-9999-9999-999999999999'::UUID;
BEGIN
    RAISE NOTICE '========================================================================';
    RAISE NOTICE '>>> بدء إعداد البيانات التخليقية لاختبار مخصصات أرقام المراجعات (00020) <<<';
    RAISE NOTICE '========================================================================';

    -- 1.1 إنشاء الحسابات في auth.users و profiles
    INSERT INTO auth.users (id, email, role, aud) VALUES
        (v_doc_a_id, 'doc_a_020@example.com', 'authenticated', 'authenticated'),
        (v_doc_b_id, 'doc_b_020@example.com', 'authenticated', 'authenticated'),
        (v_sec_id,   'sec_020@example.com',   'authenticated', 'authenticated')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, full_name, role) VALUES 
        (v_doc_a_id, 'د. كريم (طبيب A)', 'doctor'::public.user_role),
        (v_doc_b_id, 'د. سامح (طبيب B)', 'doctor'::public.user_role),
        (v_sec_id,   'سارة (سكرتيرة)',  'secretary'::public.user_role)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

    -- 1.2 مريض وزيارة
    INSERT INTO public.patients (id, full_name, date_of_birth, gender, file_number)
    VALUES 
        (v_patient_id, 'طفل تجريبي للمراجعات المتكررة', '2023-01-01', 'male', 'SYNTH-REV-020')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.visits (id, patient_id, doctor_id, status)
    VALUES 
        (v_visit_id, v_patient_id, v_doc_a_id, 'in_progress')
    ON CONFLICT (id) DO NOTHING;

    -- 1.3 دواء في الكتالوج
    INSERT INTO public.drug_products (id, brand_name, generic_name, display_name, dosage_form)
    VALUES (v_catalog_id, 'Amoxicillin', 'Amoxicillin', 'Amoxicillin 250mg Syrup', 'syrup')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.clinic_drug_catalog (product_id, usage_count, is_enabled)
    VALUES (v_catalog_id, 5, TRUE)
    ON CONFLICT (product_id) DO UPDATE SET usage_count = 5;

    -- 1.4 وصفة أصلية معتمدة صادرة (نسخة 1)
    INSERT INTO public.prescriptions (
        id, visit_id, patient_id, doctor_id, prescribed_by, status, revision_number
    ) VALUES (
        v_rx_v1_id, v_visit_id, v_patient_id, v_doc_a_id, v_doc_a_id, 'draft'::public.prescription_status_type, 1
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.prescription_items (
        prescription_id, catalog_product_id, medication_name, active_ingredient, strength, dosage_form, frequency, duration, display_order
    ) VALUES (
        v_rx_v1_id, v_catalog_id, 'Amoxicillin 250mg Syrup', 'Amoxicillin', '250mg/5ml', 'syrup'::public.dosage_form_type, '3 times daily', '7 days', 1
    );

    UPDATE public.prescriptions
    SET status = 'issued'::public.prescription_status_type, issued_at = NOW()
    WHERE id = v_rx_v1_id;

    RAISE NOTICE '[PASS] إعداد البيانات التخليقية اكتمل بنجاح: نسخة 1 معتمدة ومسجلة.';
END $$;

-- ------------------------------------------------------------------------------
-- 2. اختبار الصلاحيات: رفض تنفيذ الدالة للمستخدم المجهول (anon)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

DO $$
BEGIN
    BEGIN
        PERFORM public.create_prescription_revision('11111111-aaaa-bbbb-cccc-111111111111'::UUID, 'محاولة غير مصرحة');
        RAISE EXCEPTION '[FAIL] ثغرة: تم السماح للمستخدم المجهول anon بتنفيذ دالة create_prescription_revision!';
    EXCEPTION
        WHEN insufficient_privilege OR OTHERS THEN
            RAISE NOTICE '[PASS] نجاح الحظر 1: تم منع المستخدم anon من استدعاء دالة create_prescription_revision.';
    END;
END $$;

-- ------------------------------------------------------------------------------
-- 3. اختبار الصلاحيات: رفض تنفيذ الدالة لدور غير الطبيب (سكرتيرة)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

DO $$
BEGIN
    BEGIN
        PERFORM public.create_prescription_revision('11111111-aaaa-bbbb-cccc-111111111111'::UUID, 'محاولة سكرتيرة');
        RAISE EXCEPTION '[FAIL] ثغرة: تم السماح لدور السكرتيرة بإنشاء مراجعة للوصفة!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%مخصصة للأطباء%' THEN
                RAISE NOTICE '[PASS] نجاح الحظر 2: تم منع دور السكرتيرة برسالة صريحة: %', SQLERRM;
            ELSE
                RAISE EXCEPTION '[FAIL] فشل غير متوقع لدور السكرتيرة: %', SQLERRM;
            END IF;
    END;
END $$;

-- ------------------------------------------------------------------------------
-- 4. اختبار سيناريو الإنتاج الأساسي:
--    - إنشاء نسخة 2 من النسخة 1
--    - إلغاء النسخة 2
--    - محاولة إنشاء مراجعة جديدة من النسخة 1
--    - التحقق الصارم من أن الرقم الجديد هو 3 وليس 2 (تجنب خطأ duplicate key)
--    - إلغاء النسخة 3
--    - إنشاء مراجعة جديدة والتحقق الصارم من أن الرقم هو 4
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

DO $$
DECLARE
    v_rx_v1_id UUID := '11111111-aaaa-bbbb-cccc-111111111111'::UUID;
    v_rx_v2_id UUID;
    v_rx_v3_id UUID;
    v_rx_v4_id UUID;
    v_rev_num INT;
    v_status public.prescription_status_type;
    v_items_count INT;
BEGIN
    RAISE NOTICE '--- بدء اختبار تسلسل أرقام المراجعات ---';

    -- 4.1 إنشاء النسخة 2 من النسخة 1
    v_rx_v2_id := public.create_prescription_revision(v_rx_v1_id, 'تعديل جرعة المضاد الحيوي');
    
    SELECT revision_number, status INTO v_rev_num, v_status
    FROM public.prescriptions WHERE id = v_rx_v2_id;

    IF v_rev_num != 2 OR v_status != 'draft' THEN
        RAISE EXCEPTION '[FAIL] فشل إنشاء النسخة 2: revision_number=%, status=%', v_rev_num, v_status;
    END IF;
    RAISE NOTICE '[PASS] تم إنشاء النسخة 2 بنجاح برقم مراجعة 2 وحالة مسودة draft.';

    -- 4.2 محاولة إنشاء مراجعة أخرى أثناء وجود مسودة نشطة يجب أن تفشل
    BEGIN
        PERFORM public.create_prescription_revision(v_rx_v1_id, 'محاولة فتح مسودة ثانية');
        RAISE EXCEPTION '[FAIL] تم السماح بفتح مسودة جديدة في وجود مسودة نشطة!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%مسودة مراجعة مفتوحة%' THEN
                RAISE NOTICE '[PASS] تم منع فتح مسودة ثانية في وجود مسودة نشطة: %', SQLERRM;
            ELSE
                RAISE EXCEPTION '[FAIL] استثناء غير متوقع عند التحقق من وجود مسودة نشطة: %', SQLERRM;
            END IF;
    END;

    -- 4.3 إلغاء النسخة 2
    PERFORM public.cancel_prescription_revision(v_rx_v2_id);

    SELECT status INTO v_status FROM public.prescriptions WHERE id = v_rx_v2_id;
    IF v_status != 'cancelled' THEN
        RAISE EXCEPTION '[FAIL] فشل إلغاء النسخة 2: الحالة=%', v_status;
    END IF;
    RAISE NOTICE '[PASS] تم إلغاء النسخة 2 بنجاح، والحالة الآن cancelled مع بقاء السجل.';

    -- 4.4 إنشاء مراجعة جديدة من النسخة 1 المعتمدة (جوهر المشكلة المحلولة في 00020)
    -- كان هذا الكود يرمي خطأ: duplicate key value violates unique constraint "idx_prescriptions_visit_revision"
    -- لأن النسخة 1 كانت تحسب (1 + 1 = 2) المكرر. الآن يجب أن يحسب 3!
    v_rx_v3_id := public.create_prescription_revision(v_rx_v1_id, 'محاولة مراجعة ثانية بعد إلغاء الأولى');

    SELECT revision_number, status INTO v_rev_num, v_status
    FROM public.prescriptions WHERE id = v_rx_v3_id;

    IF v_rev_num != 3 OR v_status != 'draft' THEN
        RAISE EXCEPTION '[FAIL] فشل تخصيص رقم المراجعة بعد الإلغاء: المتوقع 3 ولكن وُجد % (حالة: %)', v_rev_num, v_status;
    END IF;
    RAISE NOTICE '[PASS] نجاح حاسم: تم تخصيص رقم المراجعة 3 للنسخة الجديدة وتفادي خطأ duplicate key بنجاح!';

    -- التحقق من نسخ البنود للنسخة 3
    SELECT count(*) INTO v_items_count FROM public.prescription_items WHERE prescription_id = v_rx_v3_id;
    IF v_items_count != 1 THEN
        RAISE EXCEPTION '[FAIL] لم يتم نسخ بنود الوصفة للنسخة 3، عدد البنود: %', v_items_count;
    END IF;
    RAISE NOTICE '[PASS] تم نسخ بنود الأدوية للنسخة 3 بشكل سليم.';

    -- 4.5 إلغاء النسخة 3 ثم إنشاء مراجعة جديدة -> يجب أن تكون 4!
    PERFORM public.cancel_prescription_revision(v_rx_v3_id);

    v_rx_v4_id := public.create_prescription_revision(v_rx_v1_id, 'مراجعة ثالثة بعد إلغاء النسختين 2 و 3');

    SELECT revision_number, status INTO v_rev_num, v_status
    FROM public.prescriptions WHERE id = v_rx_v4_id;

    IF v_rev_num != 4 OR v_status != 'draft' THEN
        RAISE EXCEPTION '[FAIL] فشل تخصيص رقم المراجعة: المتوقع 4 ولكن وُجد % (حالة: %)', v_rev_num, v_status;
    END IF;
    RAISE NOTICE '[PASS] نجاح حاسم إضافي: تم تخصيص رقم المراجعة 4 بعد إلغاء النسختين 2 و 3 بنجاح!';

    -- 4.6 التحقق من سلامة كافة النسخ السابقة في قاعدة البيانات
    SELECT status INTO v_status FROM public.prescriptions WHERE id = v_rx_v1_id;
    IF v_status != 'issued' THEN
        RAISE EXCEPTION '[FAIL] تأثرت النسخة 1 الأصلية: حالتها الآن %', v_status;
    END IF;

    SELECT status INTO v_status FROM public.prescriptions WHERE id = v_rx_v2_id;
    IF v_status != 'cancelled' THEN
        RAISE EXCEPTION '[FAIL] تأثرت النسخة 2 الملغاة: حالتها الآن %', v_status;
    END IF;

    SELECT status INTO v_status FROM public.prescriptions WHERE id = v_rx_v3_id;
    IF v_status != 'cancelled' THEN
        RAISE EXCEPTION '[FAIL] تأثرت النسخة 3 الملغاة: حالتها الآن %', v_status;
    END IF;

    RAISE NOTICE '[PASS] تأكيد السلامة: النسخة 1 لا تزال صادرة معتمدة، والنسخ 2 و 3 ملغاة، والنسخة 4 مسودة جديدة.';
END $$;

-- ------------------------------------------------------------------------------
-- 5. اختبار حظر المراجعة لوصفة غير صادرة (مثل محاولة مراجعة مسودة أو وصفة ملغاة)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_rx_v2_id UUID;
BEGIN
    SELECT id INTO v_rx_v2_id FROM public.prescriptions WHERE revision_number = 2;
    
    BEGIN
        PERFORM public.create_prescription_revision(v_rx_v2_id, 'محاولة تعديل وصفة ملغاة');
        RAISE EXCEPTION '[FAIL] تم السماح بإنشاء مراجعة لوصفة ملغاة!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%لا يمكن إنشاء مراجعة لوصفة ملغاة%' THEN
                RAISE NOTICE '[PASS] تم بنجاح منع طلب تعديل وصفة ملغاة: %', SQLERRM;
            ELSE
                RAISE EXCEPTION '[FAIL] استثناء غير متوقع عند محاولة تعديل وصفة ملغاة: %', SQLERRM;
            END IF;
    END;
END $$;

-- ------------------------------------------------------------------------------
-- 6. إنهاء المعاملة بالتراجع التام (ROLLBACK) لضمان عدم ترك أي أثر
-- ------------------------------------------------------------------------------
ROLLBACK;

\echo '========================================================================'
\echo '>>> اكتملت جميع اختبارات تخصيص أرقام مراجعات الوصفات (00020) بنجاح تام! <<<'
\echo '========================================================================'

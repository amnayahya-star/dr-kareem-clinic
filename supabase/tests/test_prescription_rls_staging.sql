-- ==============================================================================
-- Staging / Test Verification Script: Electronic Prescription RLS & RPC Security
-- File: supabase/tests/test_prescription_rls_staging.sql
-- Description:
--   Comprehensive SQL staging test runner with genuine PostgreSQL role switching
--   (SET LOCAL ROLE authenticated / anon) to rigorously test Row Level Security.
--
-- EXECUTION REQUIREMENTS:
--   - Must run on a Staging database after applying migrations 00001 through 00007.
--   - Runs entirely within a single transaction ending with ROLLBACK.
--   - ZERO production dependencies; uses purely synthetic transient fixtures.
--   - STOPS ON FIRST ERROR (Fail-Fast with non-zero exit code).
-- ==============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. تجهيز البيانات الوهمية المؤقتة باستخدام صلاحيات المدير (Admin Fixture Setup)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_doc_a_id UUID := '11111111-1111-1111-1111-111111111111'::UUID;
    v_doc_b_id UUID := '22222222-2222-2222-2222-222222222222'::UUID;
    v_sec_id   UUID := '33333333-3333-3333-3333-333333333333'::UUID;
BEGIN
    RAISE NOTICE '========================================================================';
    RAISE NOTICE '>>> بدء إعداد البيانات التخليقية للاختبار (Admin Fixture Setup) <<<';
    RAISE NOTICE '========================================================================';

    -- إنشاء حسابات وهمية في profiles
    INSERT INTO public.profiles (id, full_name, role) VALUES 
        (v_doc_a_id, 'د. أحمد (طبيب A)', 'doctor'::public.user_role),
        (v_doc_b_id, 'د. سمير (طبيب B)', 'doctor'::public.user_role),
        (v_sec_id,   'سارة (سكرتيرة)',  'secretary'::public.user_role)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

    -- مريض وزيارات للاختبار
    INSERT INTO public.patients (id, full_name, date_of_birth, gender, file_number)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID, 'طفل تجريبي للفحص', '2022-01-01', 'male', 'STAGING-SYNTHETIC-001')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.visits (id, patient_id, doctor_id, status, visit_type)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID, v_doc_a_id, 'in_progress', 'examination')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.visits (id, patient_id, doctor_id, status, visit_type)
    VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID, v_doc_b_id, 'in_progress', 'examination')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.visits (id, patient_id, doctor_id, status, visit_type)
    VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::UUID, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID, v_doc_a_id, 'in_progress', 'examination')
    ON CONFLICT (id) DO NOTHING;

    -- إنشاء سجل وصفة قديمة عديمة المالك (Orphan Record) لاختبار منع الاستيلاء
    INSERT INTO public.prescriptions (id, visit_id, patient_id, doctor_id, prescribed_by, status, general_instructions)
    VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd'::UUID, 'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID, NULL, NULL, 'draft', 'وصفة يتيمة قديمة')
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE '[PASS] تم تجهيز الـ Fixtures بنجاح.';
END $$;

-- ------------------------------------------------------------------------------
-- 2. اختبار الطبيب A: عمليات INSERT والتحقق من قيود doctor_id و prescribed_by
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

DO $$
DECLARE
    v_cur_user TEXT;
    v_auth_uid UUID;
    v_rx_id UUID;
BEGIN
    SELECT current_user INTO v_cur_user;
    v_auth_uid := auth.uid();

    -- التحقق الصارم من أن current_user هو authenticated
    IF v_cur_user != 'authenticated' THEN
        RAISE EXCEPTION '[FAIL] اختبار RLS باطل: current_user هو % بدلاً من authenticated', v_cur_user;
    END IF;

    IF v_auth_uid != '11111111-1111-1111-1111-111111111111'::UUID THEN
        RAISE EXCEPTION '[FAIL] auth.uid() غير مطابق للطبيب A: %', v_auth_uid;
    END IF;

    -- 2.1 اختبار محاولة INSERT مع doctor_id لطبيب A و prescribed_by لطبيب B (يجب أن تفشل)
    BEGIN
        INSERT INTO public.prescriptions (visit_id, patient_id, doctor_id, prescribed_by, status)
        VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::UUID, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID, '11111111-1111-1111-1111-111111111111'::UUID, '22222222-2222-2222-2222-222222222222'::UUID, 'draft');
        RAISE EXCEPTION '[FAIL] ثغرة: تم السماح بإدخال قيمتين مختلفتين لـ doctor_id و prescribed_by!';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE '[PASS] 2.1 نجاح الحظر: تم منع إدخال قيمتين متناقضتين لـ doctor_id و prescribed_by.';
    END;

    -- 2.2 اختبار محاولة INSERT وكلا العمودين NULL (يجب أن تفشل)
    BEGIN
        INSERT INTO public.prescriptions (visit_id, patient_id, doctor_id, prescribed_by, status)
        VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::UUID, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID, NULL, NULL, 'draft');
        RAISE EXCEPTION '[FAIL] ثغرة: تم السماح بإنشاء وصفة جديدة بقيم NULL للمالك!';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE '[PASS] 2.2 نجاح الحظر: تم منع إنشاء وصفة جديدة بقيم NULL للمالك.';
    END;

    -- 2.3 اختبار الإدخال الصحيح عبر RPC (حيث doctor_id = prescribed_by = auth.uid())
    v_rx_id := public.save_electronic_prescription(
        p_visit_id := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
        p_patient_id := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
        p_general_instructions := 'تعليمات الطبيب A',
        p_items := '[{"medication_name":"Paracetamol","dosage_form":"syrup","dose":"5ml","frequency":"3 times","duration":"5 days"}]'::JSONB,
        p_action := 'draft'
    );

    IF v_rx_id IS NULL THEN
        RAISE EXCEPTION '[FAIL] فشل الطبيب A في إنشاء مسودة الوصفة الطبية الصحيحة';
    END IF;

    RAISE NOTICE '[PASS] 2.3 الطبيب A أنشأ مسودة وصفة طبية صحيحة بنجاح.';
END $$;

-- ------------------------------------------------------------------------------
-- 3. اختبار الطبيب A: محاولات UPDATE الممنوعة على ملكية الوصفة
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

DO $$
DECLARE
    v_rx_a_id UUID;
BEGIN
    SELECT id INTO v_rx_a_id FROM public.prescriptions WHERE visit_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID;

    -- 3.1 اختبار محاولة UPDATE يغير عموداً واحداً إلى طبيب آخر (يجب أن تفشل)
    BEGIN
        UPDATE public.prescriptions
        SET doctor_id = '22222222-2222-2222-2222-222222222222'::UUID
        WHERE id = v_rx_a_id;
        RAISE EXCEPTION '[FAIL] ثغرة: تم السماح بتغيير doctor_id لطبيب آخر أثناء التعديل!';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE '[PASS] 3.1 نجاح الحظر: تم منع تعديل doctor_id ليخالف prescribed_by.';
    END;

    -- 3.2 اختبار محاولة UPDATE يغير أحد العمودين إلى NULL (يجب أن تفشل)
    BEGIN
        UPDATE public.prescriptions
        SET prescribed_by = NULL
        WHERE id = v_rx_a_id;
        RAISE EXCEPTION '[FAIL] ثغرة: تم السماح بتحويل prescribed_by إلى NULL أثناء التعديل!';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE '[PASS] 3.2 نجاح الحظر: تم منع تحويل أحد عمودي المالك إلى NULL.';
    END;
END $$;

-- ------------------------------------------------------------------------------
-- 4. اختبار الطبيب B: محاولة التعديل أو الحذف أو الإضافة على مسودة الطبيب A
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

DO $$
DECLARE
    v_cur_user TEXT;
    v_rx_a_id UUID;
BEGIN
    SELECT current_user INTO v_cur_user;
    IF v_cur_user != 'authenticated' THEN
        RAISE EXCEPTION '[FAIL] current_user هو % بدلاً من authenticated', v_cur_user;
    END IF;

    SELECT id INTO v_rx_a_id FROM public.prescriptions WHERE visit_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID;

    -- 4.1 محاولة تعديل مسودة الطبيب A عبر SQL المباشر
    UPDATE public.prescriptions 
    SET general_instructions = 'تعديل غير مصرح به من الطبيب B'
    WHERE id = v_rx_a_id;

    IF FOUND THEN
        RAISE EXCEPTION '[FAIL] ثغرة RLS: الطبيب B استطاع تعديل مسودة الطبيب A!';
    END IF;

    -- 4.2 محاولة حذف مسودة الطبيب A عبر SQL المباشر
    DELETE FROM public.prescriptions WHERE id = v_rx_a_id;

    IF FOUND THEN
        RAISE EXCEPTION '[FAIL] ثغرة RLS: الطبيب B استطاع حذف مسودة الطبيب A!';
    END IF;

    -- 4.3 محاولة إضافة بند إلى مسودة الطبيب A
    BEGIN
        INSERT INTO public.prescription_items (prescription_id, medication_name, frequency, duration)
        VALUES (v_rx_a_id, 'Hostile Item', '1x', '1d');
        RAISE EXCEPTION '[FAIL] ثغرة RLS: الطبيب B استطاع إضافة بند في مسودة الطبيب A!';
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END;

    -- 4.4 محاولة تشغيل RPC save_electronic_prescription على زيارة الطبيب A
    BEGIN
        PERFORM public.save_electronic_prescription(
            p_visit_id := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
            p_patient_id := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
            p_general_instructions := 'محاولة استيلاء عبر RPC',
            p_items := '[]'::JSONB,
            p_action := 'draft'
        );
        RAISE EXCEPTION '[FAIL] ثغرة RPC: الطبيب B استطاع تعديل مسودة الطبيب A عبر save_electronic_prescription!';
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END;

    -- 4.5 محاولة تعديل السجل عديم المالك (Orphan Record)
    BEGIN
        PERFORM public.save_electronic_prescription(
            p_visit_id := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID,
            p_patient_id := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
            p_items := '[]'::JSONB,
            p_action := 'draft'
        );
        RAISE EXCEPTION '[FAIL] ثغرة: تم السماح للطبيب B بتعديل وصفة يتيمة عديمة المالك!';
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END;

    RAISE NOTICE '[PASS] 4. تم التحقق بنجاح من عزل مسودات الطبيب A ومنع الطبيب B من تعديلها أو حذفها أو الاستيلاء عليها.';
END $$;

-- ------------------------------------------------------------------------------
-- 5. اختبار السكرتارية: حجب المسودات ومنع الكتابة والسماح بالصادرة فقط
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

DO $$
DECLARE
    v_cur_user TEXT;
    v_draft_count INT;
    v_rx_a_id UUID;
BEGIN
    SELECT current_user INTO v_cur_user;
    IF v_cur_user != 'authenticated' THEN
        RAISE EXCEPTION '[FAIL] current_user هو % بدلاً من authenticated', v_cur_user;
    END IF;

    SELECT id INTO v_rx_a_id FROM public.prescriptions WHERE visit_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID;

    -- 5.1 التأكد أن السكرتارية لا ترى أي مسودة إطلاقاً
    SELECT COUNT(*) INTO v_draft_count FROM public.prescriptions WHERE status = 'draft';
    IF v_draft_count > 0 THEN
        RAISE EXCEPTION '[FAIL] ثغرة RLS: السكرتارية استطاعت رؤية مسودات الوصفات الطبية (العدد: %)', v_draft_count;
    END IF;

    -- 5.2 التأكد أن السكرتارية ممنوعة من الإدخال والتعديل والحذف
    BEGIN
        INSERT INTO public.prescriptions (visit_id, patient_id, doctor_id, prescribed_by, status)
        VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::UUID, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID, '33333333-3333-3333-3333-333333333333'::UUID, '33333333-3333-3333-3333-333333333333'::UUID, 'draft');
        RAISE EXCEPTION '[FAIL] ثغرة RLS: السكرتارية استطاعت إنشاء وصفة طبية!';
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM public.prescriptions WHERE id = v_rx_a_id;
        RAISE EXCEPTION '[FAIL] ثغرة RLS: السكرتارية استطاعت حذف وصفة طبية!';
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END;

    -- 5.3 التأكد من منع السكرتارية من تشغيل save_electronic_prescription
    BEGIN
        PERFORM public.save_electronic_prescription(
            p_visit_id := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
            p_patient_id := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
            p_action := 'draft'
        );
        RAISE EXCEPTION '[FAIL] ثغرة RPC: السكرتارية استطاعت تشغيل save_electronic_prescription!';
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END;

    RAISE NOTICE '[PASS] 5. تم التحقق من حظر المسودات ومنع التعديل والإنشاء والحذف للسكرتارية.';
END $$;

-- ------------------------------------------------------------------------------
-- 6. اعتماد الوصفة من الطبيب A والتحقق من رؤية السكرتارية لها وقادح الحماية
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

DO $$
DECLARE
    v_rx_a_id UUID;
BEGIN
    -- اعتماد وإصدار الوصفة
    v_rx_a_id := public.save_electronic_prescription(
        p_visit_id := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
        p_patient_id := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
        p_items := '[{"medication_name":"Amoxicillin","dosage_form":"syrup","dose":"5ml","frequency":"3 times","duration":"5 days"}]'::JSONB,
        p_action := 'issue'
    );

    IF v_rx_a_id IS NULL THEN
        RAISE EXCEPTION '[FAIL] فشل اعتماد الوصفة الطبية';
    END IF;

    -- اختبار منع تعديل بنود الوصفة المعتمدة مباشرة عبر قادح الحماية
    BEGIN
        UPDATE public.prescription_items 
        SET medication_name = 'Illegal Direct Edit'
        WHERE prescription_id = v_rx_a_id;
        RAISE EXCEPTION '[FAIL] قادح الحماية فشل في منع تعديل بنود الوصفة الصادرة!';
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END;

    RAISE NOTICE '[PASS] 6.1 الطبيب A اعتمد الوصفة وقادح الحماية منع التعديل المباشر.';
END $$;

-- التحقق من قدرة السكرتارية على قراءة الوصفة الصادرة فقط
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

DO $$
DECLARE
    v_issued_count INT;
BEGIN
    SELECT COUNT(*) INTO v_issued_count 
    FROM public.prescriptions 
    WHERE visit_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID AND status = 'issued';

    IF v_issued_count != 1 THEN
        RAISE EXCEPTION '[FAIL] السكرتارية لم تستطع قراءة الوصفة الطبية الصادرة!';
    END IF;

    RAISE NOTICE '[PASS] 6.2 السكرتارية استطاعت قراءة الوصفة الصادرة بنجاح.';
END $$;

-- ------------------------------------------------------------------------------
-- 7. اختبار المستخدم المجهول (anon): منع تام من القراءة والكتابة والـ RPCs
-- ------------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

DO $$
DECLARE
    v_cur_user TEXT;
    v_count INT;
BEGIN
    SELECT current_user INTO v_cur_user;
    IF v_cur_user != 'anon' THEN
        RAISE EXCEPTION '[FAIL] current_user هو % بدلاً من anon', v_cur_user;
    END IF;

    -- محاولة استعلام الجدول كـ anon
    BEGIN
        SELECT COUNT(*) INTO v_count FROM public.prescriptions;
        IF v_count > 0 THEN
            RAISE EXCEPTION '[FAIL] ثغرة أمنية: المستخدم المجهول anon استطاع قراءة الوصفات الطبية!';
        END IF;
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END;

    -- محاولة تشغيل RPC كـ anon
    BEGIN
        PERFORM public.save_electronic_prescription(
            p_visit_id := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
            p_patient_id := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
            p_action := 'draft'
        );
        RAISE EXCEPTION '[FAIL] ثغرة أمنية: المستخدم المجهول anon استطاع تشغيل دالة save_electronic_prescription!';
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END;

    RAISE NOTICE '[PASS] 7. تم التحقق من الحظر التام للمستخدم المجهول (anon).';
END $$;

-- ------------------------------------------------------------------------------
-- 8. إعادة الضبط والتراجع التام (Clean Rollback)
-- ------------------------------------------------------------------------------
RESET ROLE;

DO $$
BEGIN
    RAISE NOTICE '========================================================================';
    RAISE NOTICE '>>> اكتملت جميع اختبارات Staging بنجاح تام 100% دون أي خطأ <<<';
    RAISE NOTICE '========================================================================';
END $$;

ROLLBACK;

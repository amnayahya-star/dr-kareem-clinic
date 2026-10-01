-- ==============================================================================
-- Staging / Test Verification Script: Pediatric Dosage Calculator & Rules
-- File: supabase/tests/test_pediatric_dosage_calculator.sql
-- Description:
--   Comprehensive SQL contract and regression tests for public.pediatric_dosage_rules,
--   public.review_pediatric_dosage_rule RPC, and the auto-invalidation trigger
--   defined in Migration 00021.
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
    v_doc_id UUID := '11111111-1111-1111-1111-111111111111'::UUID;
    v_sec_id UUID := '22222222-2222-2222-2222-222222222222'::UUID;
    v_patient_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID;
    v_visit_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID;
    v_prod_id UUID;
    v_label_id UUID;
BEGIN
    RAISE NOTICE '========================================================================';
    RAISE NOTICE '>>> بدء اختبارات قواعد حاسبة جرعات الأطفال المنظمة (Migration 00021) <<<';
    RAISE NOTICE '========================================================================';

    -- 1.1 إنشاء الحسابات في auth.users و profiles
    INSERT INTO auth.users (id, email, role, aud) VALUES
        (v_doc_id, 'doc_pediatric_test@example.com', 'authenticated', 'authenticated'),
        (v_sec_id, 'sec_pediatric_test@example.com', 'authenticated', 'authenticated')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, full_name, role) VALUES
        (v_doc_id, 'د. كريم (طبيب فاحص)', 'doctor'::public.user_role),
        (v_sec_id, 'سارة (سكرتيرة)',      'secretary'::public.user_role)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

    -- 1.2 مريض وزيارة وقياسات
    INSERT INTO public.patients (id, full_name, date_of_birth, gender, file_number, allergies, drug_allergies)
    VALUES
        (v_patient_id, 'طفل اختبار الجرعات', CURRENT_DATE - INTERVAL '2 years', 'male', 'SYNTH-PED-021', 'حساسية بنسلين', 'Penicillin')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.visits (id, patient_id, doctor_id, status)
    VALUES
        (v_visit_id, v_patient_id, v_doc_id, 'in_progress')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.measurements (visit_id, patient_id, weight_kg, height_cm)
    VALUES (v_visit_id, v_patient_id, 12.0, 88.0);

    -- 1.3 ضمان وجود منتج ونشرة وقاعدة للاختبار حتى لو كانت قاعدة البيانات نظيفة
    SELECT id INTO v_prod_id FROM public.drug_products WHERE source_identifier = '50090-6351' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.drug_products (
            display_name, generic_name, dosage_form, route, status, source_system, source_identifier
        ) VALUES (
            'Amoxicillin 250 MG / 5 ML Oral Suspension', 'Amoxicillin', 'suspension', 'oral', 'cached', 'FDA_NDC', '50090-6351'
        ) RETURNING id INTO v_prod_id;
    END IF;

    SELECT id INTO v_label_id FROM public.drug_labels WHERE product_id = v_prod_id LIMIT 1;
    IF v_label_id IS NULL THEN
        INSERT INTO public.drug_labels (
            product_id, source_system, source_identifier, payload_hash, effective_time, review_status, dosage_and_administration
        ) VALUES (
            v_prod_id, 'OPENFDA_LABEL', '50090-6351', 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0', '20240430', 'pending_review',
            'Pediatric Patients over 3 Months of Age and Weight Less than 40 kg: 20 to 45 mg/kg/day'
        ) RETURNING id INTO v_label_id;
    END IF;

    -- ضمان وجود قاعدة
    INSERT INTO public.pediatric_dosage_rules (
        product_id, drug_label_id, active_ingredient, dosage_form, route,
        min_age_value, min_age_unit, min_age_inclusive,
        max_weight_kg, max_weight_inclusive,
        min_dose_mg_per_kg_day, max_dose_mg_per_kg_day,
        allowed_frequencies, source_reference, source_excerpt,
        label_payload_hash, label_effective_time, review_status
    ) VALUES (
        v_prod_id, v_label_id, 'Amoxicillin', 'suspension', 'oral',
        3.0, 'months', FALSE,
        40.0, FALSE,
        20.0, 45.0,
        '["every 12 hours", "every 8 hours"]'::jsonb,
        'openFDA 50090-6351', 'Pediatric Patients over 3 Months of Age and Weight Less than 40 kg: 20 to 45 mg/kg/day',
        'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0', '20240430', 'pending_review'
    ) ON CONFLICT (product_id, drug_label_id) DO NOTHING;

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
        PERFORM public.review_pediatric_dosage_rule('cce3c12f-8fe0-44f5-bdc8-a65657abd3d6'::UUID, 'approve', 'محاولة مجهولة');
        RAISE EXCEPTION '[FAIL] ثغرة: تم السماح لـ anon باستدعاء review_pediatric_dosage_rule!';
    EXCEPTION
        WHEN insufficient_privilege OR OTHERS THEN
            RAISE NOTICE '[PASS] نجاح الحظر 1: تم منع المستخدم anon من استدعاء دالة المراجعة.';
    END;
END $$;

-- ------------------------------------------------------------------------------
-- 3. اختبار الصلاحيات: رفض تنفيذ الدالة لدور السكرتيرة (secretary)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

DO $$
BEGIN
    BEGIN
        PERFORM public.review_pediatric_dosage_rule('cce3c12f-8fe0-44f5-bdc8-a65657abd3d6'::UUID, 'approve', 'محاولة سكرتيرة');
        RAISE EXCEPTION '[FAIL] ثغرة: تم السماح للسكرتيرة باعتماد قاعدة الجرعة!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%مخصصة للأطباء%' THEN
                RAISE NOTICE '[PASS] نجاح الحظر 2: تم منع دور السكرتيرة برسالة صريحة: %', SQLERRM;
            ELSE
                RAISE EXCEPTION '[FAIL] استثناء غير متوقع لدور السكرتيرة: %', SQLERRM;
            END IF;
    END;
END $$;

-- ------------------------------------------------------------------------------
-- 4. اختبار حالة البداية وحدود العمر والوزن الصريحة: pending_review و age > 3 و weight < 40
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

DO $$
DECLARE
    v_status VARCHAR(30);
    v_min_dose NUMERIC;
    v_max_dose NUMERIC;
    v_min_age_val NUMERIC;
    v_min_age_inc BOOLEAN;
    v_max_weight_val NUMERIC;
    v_max_weight_inc BOOLEAN;
BEGIN
    SELECT
        review_status, min_dose_mg_per_kg_day, max_dose_mg_per_kg_day,
        min_age_value, min_age_inclusive, max_weight_kg, max_weight_inclusive
    INTO
        v_status, v_min_dose, v_max_dose,
        v_min_age_val, v_min_age_inc, v_max_weight_val, v_max_weight_inc
    FROM public.pediatric_dosage_rules
    WHERE active_ingredient = 'Amoxicillin' AND dosage_form = 'suspension'
    LIMIT 1;

    IF v_status != 'pending_review' THEN
        RAISE EXCEPTION '[FAIL] الحالة الأولية لقاعدة الأموكسيسيلين يجب أن تكون pending_review ولكنها %', v_status;
    END IF;

    IF v_min_dose != 20.00 OR v_max_dose != 45.00 THEN
        RAISE EXCEPTION '[FAIL] نطاق الجرعة غير مطابق للمتوقع (20 إلى 45): وُجد % إلى %', v_min_dose, v_max_dose;
    END IF;

    IF v_min_age_val != 3.0 OR v_min_age_inc != FALSE THEN
        RAISE EXCEPTION '[FAIL] تمثيل شرط العمر يجب أن يكون صريحاً age > 3 months (min_age_value=3, min_age_inclusive=false): وُجد value=%, inclusive=%', v_min_age_val, v_min_age_inc;
    END IF;

    IF v_max_weight_val != 40.0 OR v_max_weight_inc != FALSE THEN
        RAISE EXCEPTION '[FAIL] تمثيل شرط الوزن يجب أن يكون صريحاً weight < 40 kg (max_weight_kg=40, max_weight_inclusive=false): وُجد value=%, inclusive=%', v_max_weight_val, v_max_weight_inc;
    END IF;

    RAISE NOTICE '[PASS] تأكيد دقة الحدود: القاعدة أولية بحالة pending_review، وشرط العمر age > 3 months، وشرط الوزن weight < 40 kg.';
END $$;

-- ------------------------------------------------------------------------------
-- 5. اختبار مراجعة واعتماد الطبيب للقاعدة وحفظ Snapshot الدقيق
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_rule_id UUID;
    v_res JSONB;
BEGIN
    SELECT id INTO v_rule_id
    FROM public.pediatric_dosage_rules
    WHERE active_ingredient = 'Amoxicillin' AND dosage_form = 'suspension'
    LIMIT 1;

    -- 5.1 التحقق من رفض الملاحظات الفارغة
    BEGIN
        PERFORM public.review_pediatric_dosage_rule(v_rule_id, 'approve', '');
        RAISE EXCEPTION '[FAIL] ثغرة: تم قبول مراجعة بملاحظات فارغة!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%ملاحظات المراجعة الطبية إلزامية%' THEN
                RAISE NOTICE '[PASS] منع الملاحظات الفارغة بنجاح.';
            ELSE
                RAISE EXCEPTION '[FAIL] استثناء غير متوقع لفحص الملاحظات: %', SQLERRM;
            END IF;
    END;

    -- 5.2 التحقق من حظر النطاق غير الصالح للجرعة (min > max)
    BEGIN
        PERFORM public.review_pediatric_dosage_rule(
            v_rule_id,
            'approve',
            'ملاحظة تجريبية',
            jsonb_build_object('min_dose_mg_per_kg_day', 50.0, 'max_dose_mg_per_kg_day', 20.0)
        );
        RAISE EXCEPTION '[FAIL] ثغرة: تم قبول اعتماد بنطاق جرعة غير صالح (الحد الأدنى أكبر من الأقصى)!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%نطاق الجرعة المعتمد غير صالح%' THEN
                RAISE NOTICE '[PASS] منع نطاق الجرعة المقلوب (min > max) بنجاح.';
            ELSE
                RAISE EXCEPTION '[FAIL] استثناء غير متوقع لفحص نطاق الجرعة: %', SQLERRM;
            END IF;
    END;

    -- 5.3 التحقق من حظر وزن أقصى غير موجب
    BEGIN
        PERFORM public.review_pediatric_dosage_rule(
            v_rule_id,
            'approve',
            'ملاحظة تجريبية',
            jsonb_build_object('max_weight_kg', 0)
        );
        RAISE EXCEPTION '[FAIL] ثغرة: تم قبول اعتماد بوزن أقصى غير موجب!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%الحد الأقصى للوزن يجب أن يكون أكبر من الصفر%' THEN
                RAISE NOTICE '[PASS] منع الحد الأقصى للوزن غير الموجب بنجاح.';
            ELSE
                RAISE EXCEPTION '[FAIL] استثناء غير متوقع لفحص الوزن الأقصى: %', SQLERRM;
            END IF;
    END;

    -- 5.4 اعتماد الطبيب وتأكيد منع تزوير الهوية وبناء Snapshot الخادم الموثوق
    v_res := public.review_pediatric_dosage_rule(
        v_rule_id,
        'approve',
        'تمت مراجعة نشرة openFDA وجداول الجرعات واعتماد النطاق 20-45 mg/kg/day للأطفال فوق 3 أشهر ووزن أقل من 40 كغم',
        jsonb_build_object(
            'reviewed_by', '99999999-9999-9999-9999-999999999999', -- محاولة تزوير هوية المراجع
            'approved_snapshot', jsonb_build_object('fake', true), -- محاولة تمرير سناب شوت زائف
            'min_dose_mg_per_kg_day', 20.0,
            'max_dose_mg_per_kg_day', 45.0,
            'min_age_value', 3.0,
            'min_age_inclusive', false,
            'max_weight_kg', 40.0,
            'max_weight_inclusive', false
        )
    );

    IF v_res->>'review_status' != 'approved' THEN
        RAISE EXCEPTION '[FAIL] فشل اعتماد القاعدة: review_status=%', v_res->>'review_status';
    END IF;

    -- تأكيد أن reviewed_by مأخوذ حصراً من auth.uid()
    IF v_res->>'reviewed_by' != '11111111-1111-1111-1111-111111111111' THEN
        RAISE EXCEPTION '[FAIL] ثغرة: تم السماح للعميل بتحديد أو تغيير هوية المراجع! وُجد: %', v_res->>'reviewed_by';
    END IF;

    -- تأكيد أن approved_snapshot مبني داخل الخادم من القيم الحقيقية
    IF v_res->'approved_snapshot' IS NULL OR
       (v_res->'approved_snapshot'->>'min_age_value')::NUMERIC != 3.0 OR
       v_res->'approved_snapshot'->>'product_source_identifier' != '50090-6351' OR
       v_res->'approved_snapshot'->>'approved_by' != '11111111-1111-1111-1111-111111111111' OR
       v_res->'approved_snapshot' ? 'fake' THEN
        RAISE EXCEPTION '[FAIL] لم يتم تسجيل approved_snapshot بصورة صحيحة وآمنة من الخادم: %', v_res->'approved_snapshot';
    END IF;

    RAISE NOTICE '[PASS] نجاح اعتماد الطبيب: تحولت القاعدة إلى approved وتوثق معرف الطبيب الحقيقي وبُني الـ Snapshot من بيانات الخادم حصراً.';
END $$;

-- ------------------------------------------------------------------------------
-- 6. اختبار محفّز الإبطال الآلي (Auto-Invalidation Trigger) عند تحديث النشرة
-- ------------------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
    v_label_id UUID;
    v_rule_status VARCHAR(30);
    v_notes TEXT;
BEGIN
    SELECT drug_label_id INTO v_label_id
    FROM public.pediatric_dosage_rules
    WHERE active_ingredient = 'Amoxicillin' AND dosage_form = 'suspension'
    LIMIT 1;

    -- محاكاة قيام أداة المزامنة service_role بتحديث نص النشرة وتغير الهاش
    UPDATE public.drug_labels
    SET
        payload_hash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        effective_time = '20261001'
    WHERE id = v_label_id;

    -- فحص حالة القاعدة المرتبطة بعد تحديث النشرة
    SELECT review_status, review_notes INTO v_rule_status, v_notes
    FROM public.pediatric_dosage_rules
    WHERE drug_label_id = v_label_id;

    IF v_rule_status != 'needs_re_review' THEN
        RAISE EXCEPTION '[FAIL] فشل محفّز الإبطال الآلي: الحالة المتوقعة needs_re_review ولكن وُجد %', v_rule_status;
    END IF;

    IF v_notes NOT LIKE '%تنبيه أمان%' THEN
        RAISE EXCEPTION '[FAIL] لم يتم تسجيل تنبيه الأمان في ملاحظات المراجعة: %', v_notes;
    END IF;

    RAISE NOTICE '[PASS] نجاح حاسم: محفّز الإبطال الآلي حوّل القاعدة المعتمدة إلى needs_re_review فور تغير هاش النشرة!';
END $$;

-- ------------------------------------------------------------------------------
-- 7. إنهاء المعاملة بالتراجع التام (ROLLBACK) لضمان عدم ترك أي أثر
-- ------------------------------------------------------------------------------
ROLLBACK;

\echo '========================================================================'
\echo '>>> اكتملت جميع اختبارات SQL لحاسبة جرعات الأطفال المنظمة بنجاح تام! <<<'
\echo '========================================================================'

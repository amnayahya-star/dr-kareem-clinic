-- ==============================================================================
-- Test: OpenFDA Drug Label Synchronization Contract & Security Verification
-- File: supabase/tests/test_openfda_drug_label_sync.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. إعداد بيانات تخليقية معزولة للاختبار
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_doctor_id UUID := '11111111-1111-1111-1111-111111111111';
    v_patient_id UUID := '44444444-4444-4444-4444-444444444444';
    v_prod_a_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_prod_b_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
BEGIN
    -- مستخدم الطبيب
    INSERT INTO auth.users (id, email)
    VALUES (v_doctor_id, 'doc.label.test@dr-kareem.clinic')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, full_name, role, is_active)
    VALUES (v_doctor_id, 'د. أحمد لاختبار النشرات', 'doctor', TRUE)
    ON CONFLICT (id) DO NOTHING;

    -- مريض لاختبار عدم المساس
    INSERT INTO public.patients (id, file_number, full_name, date_of_birth, gender, is_archived)
    VALUES (v_patient_id, 'P-LABEL-TEST', 'طفل اختبار النشرات', '2022-01-01', 'male', FALSE)
    ON CONFLICT (id) DO NOTHING;

    -- منتجات دوائية تخليقية
    INSERT INTO public.drug_products (
        id,
        source_system,
        source_identifier,
        generic_name,
        display_name,
        dosage_form,
        route,
        application_number,
        marketing_category
    ) VALUES (
        v_prod_a_id,
        'FDA_NDC',
        '0002-1433',
        'Amoxicillin',
        'Amoxicillin 250mg/5mL Oral Suspension',
        'Oral Suspension',
        'Oral',
        'NDA050542',
        'NDA'
    ), (
        v_prod_b_id,
        'FDA_NDC',
        '0069-4200',
        'Azithromycin',
        'Azithromycin 200mg/5mL Oral Suspension',
        'Oral Suspension',
        'Oral',
        'ANDA065063',
        'ANDA'
    )
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE '[PASS] إعداد البيانات التخليقية اكتمل بنجاح.';
END $$;

-- ------------------------------------------------------------------------------
-- 2. اختبار الأمان: منع anon من استدعاء upsert_openfda_drug_label
-- ------------------------------------------------------------------------------
SET ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

DO $$
DECLARE
    v_failed BOOLEAN := FALSE;
    v_prod_a_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_label JSONB;
BEGIN
    v_label := jsonb_build_object(
        'product_id', v_prod_a_id,
        'spl_set_id', 'set-001',
        'dosage_and_administration', 'Take 5mL orally'
    );

    BEGIN
        PERFORM public.upsert_openfda_drug_label(v_label);
    EXCEPTION WHEN insufficient_privilege THEN
        v_failed := TRUE;
    END;

    IF NOT v_failed THEN
        RAISE EXCEPTION 'فشل أمني: استطاع anon استدعاء upsert_openfda_drug_label!';
    END IF;

    RAISE NOTICE '[PASS] منع anon من تنفيذ upsert_openfda_drug_label بنجاح.';
END $$;

-- ------------------------------------------------------------------------------
-- 3. اختبار الأمان: منع authenticated (الطبيب) من استدعاء upsert_openfda_drug_label مباشرة
-- ------------------------------------------------------------------------------
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

DO $$
DECLARE
    v_failed BOOLEAN := FALSE;
    v_prod_a_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_label JSONB;
BEGIN
    v_label := jsonb_build_object(
        'product_id', v_prod_a_id,
        'spl_set_id', 'set-001',
        'dosage_and_administration', 'Take 5mL orally'
    );

    BEGIN
        PERFORM public.upsert_openfda_drug_label(v_label);
    EXCEPTION WHEN insufficient_privilege THEN
        v_failed := TRUE;
    END;

    IF NOT v_failed THEN
        RAISE EXCEPTION 'فشل أمني: استطاع authenticated استدعاء upsert_openfda_drug_label!';
    END IF;

    RAISE NOTICE '[PASS] منع authenticated من تنفيذ upsert_openfda_drug_label بنجاح.';
END $$;

-- ------------------------------------------------------------------------------
-- 4. اختبار العمليات عبر service_role: التحقق والإنشاء والحفظ
-- ------------------------------------------------------------------------------
RESET ROLE;
SET ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- أ) رفض product_id غير موجود
DO $$
DECLARE
    v_failed BOOLEAN := FALSE;
    v_fake_id UUID := '99999999-9999-9999-9999-999999999999';
BEGIN
    BEGIN
        PERFORM public.upsert_openfda_drug_label(jsonb_build_object(
            'product_id', v_fake_id,
            'spl_set_id', 'set-fake'
        ));
    EXCEPTION WHEN OTHERS THEN
        v_failed := TRUE;
    END;

    IF NOT v_failed THEN
        RAISE EXCEPTION 'فشل: تم قبول product_id غير موجود!';
    END IF;

    RAISE NOTICE '[PASS] رفض product_id غير موجود بنجاح.';
END $$;

-- ب) إنشاء سجل النشرة لأول مرة (created) والتحقق من الحقول
DO $$
DECLARE
    v_prod_a_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_label JSONB;
    v_res JSONB;
    v_row RECORD;
    v_hash TEXT := '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
BEGIN
    v_label := jsonb_build_object(
        'product_id', v_prod_a_id,
        'source_system', 'OPENFDA_LABEL',
        'source_identifier', '0002-1433',
        'spl_set_id', 'set-amox-001',
        'spl_id', 'spl-amox-001',
        'label_version', '3',
        'effective_time', '20231102',
        'application_number', 'NDA050542',
        'marketing_category', 'NDA',
        'dosage_and_administration', 'Section 1: Pediatric dosage is 20 to 40 mg/kg/day.',
        'pediatric_use', 'Section 8.4: Safety and efficacy demonstrated for children.',
        'indications_and_usage', 'Treatment of ear, nose, throat infections.',
        'contraindications', 'History of allergic reactions to penicillin.',
        'warnings_and_cautions', 'Serious anaphylactic reactions reported.',
        'payload_hash', v_hash,
        'source_payload', jsonb_build_object('id', 'raw-openfda-123')
    );

    v_res := public.upsert_openfda_drug_label(v_label);

    IF (v_res->>'outcome') != 'created' THEN
        RAISE EXCEPTION 'فشل: النتيجة المتوقعة created ولكن النتيجة الفعلية: %', v_res->>'outcome';
    END IF;

    SELECT * INTO v_row FROM public.drug_labels WHERE product_id = v_prod_a_id;
    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'فشل: لم يتم حفظ السجل في drug_labels!';
    END IF;

    IF v_row.review_status != 'pending_review' THEN
        RAISE EXCEPTION 'فشل: حالة المراجعة الأولية يجب أن تكون pending_review!';
    END IF;

    IF v_row.reviewed_by IS NOT NULL OR v_row.reviewed_at IS NOT NULL THEN
        RAISE EXCEPTION 'فشل: حقول reviewed_by / reviewed_at يجب أن تظل NULL عند المزامنة!';
    END IF;

    IF v_row.pediatric_use != 'Section 8.4: Safety and efficacy demonstrated for children.' THEN
        RAISE EXCEPTION 'فشل: لم يتم حفظ نص pediatric_use الأصلي بشكل صحيح!';
    END IF;

    RAISE NOTICE '[PASS] إنشاء سجل النشرة لأول مرة (created) وتحقق الحقول الأولية بنجاح.';
END $$;

-- ج) مطابقة الهاش (unchanged) بدون تحديثات غير ضرورية
DO $$
DECLARE
    v_prod_a_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_label JSONB;
    v_res JSONB;
    v_hash TEXT := '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
BEGIN
    v_label := jsonb_build_object(
        'product_id', v_prod_a_id,
        'source_system', 'OPENFDA_LABEL',
        'spl_set_id', 'set-amox-001',
        'payload_hash', v_hash,
        'dosage_and_administration', 'Different text'
    );

    v_res := public.upsert_openfda_drug_label(v_label);

    IF (v_res->>'outcome') != 'unchanged' THEN
        RAISE EXCEPTION 'فشل: النتيجة المتوقعة unchanged ولكن النتيجة الفعلية: %', v_res->>'outcome';
    END IF;

    RAISE NOTICE '[PASS] مطابقة الهاش وإرجاع unchanged بنجاح.';
END $$;

-- د) تغير المحتوى لنشرة معتمدة: التحول إلى needs_re_review وأرشفة بيانات المراجعة السابقة
DO $$
DECLARE
    v_prod_a_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_doc_id UUID := '11111111-1111-1111-1111-111111111111';
    v_label JSONB;
    v_res JSONB;
    v_row RECORD;
    v_new_hash TEXT := 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
BEGIN
    -- محاكاة اعتماد النشرة سريرياً من قبل الطبيب
    UPDATE public.drug_labels
    SET
        review_status = 'approved',
        reviewed_by = v_doc_id,
        reviewed_at = NOW() - INTERVAL '10 days'
    WHERE product_id = v_prod_a_id;

    -- مزامنة جديدة بحمولة معدلة وهاش مختلف
    v_label := jsonb_build_object(
        'product_id', v_prod_a_id,
        'source_system', 'OPENFDA_LABEL',
        'spl_set_id', 'set-amox-001',
        'payload_hash', v_new_hash,
        'dosage_and_administration', 'Updated Section 1: 45 mg/kg/day for severe otitis media.',
        'pediatric_use', NULL -- ناقص في الاستجابة الجديدة، يجب عدم مسح القديم
    );

    v_res := public.upsert_openfda_drug_label(v_label);

    IF (v_res->>'outcome') != 'updated' THEN
        RAISE EXCEPTION 'فشل: النتيجة المتوقعة updated ولكن النتيجة: %', v_res->>'outcome';
    END IF;

    SELECT * INTO v_row FROM public.drug_labels WHERE product_id = v_prod_a_id;

    -- التحقق من عدم وضع approved تلقائياً، والتحول إلى needs_re_review
    IF v_row.review_status != 'needs_re_review' THEN
        RAISE EXCEPTION 'فشل: عند تغير نشرة معتمدة يجب أن تصبح needs_re_review! الحالة الحالية: %', v_row.review_status;
    END IF;

    IF v_row.previous_review_status != 'approved' OR v_row.previous_reviewed_by != v_doc_id THEN
        RAISE EXCEPTION 'فشل: لم يتم أرشفة بيانات الاعتماد السابقة!';
    END IF;

    -- التحقق من الدمج غير الإتلافي للنصوص (pediatric_use لم يمسح رغم أنه NULL في التحديث)
    IF v_row.pediatric_use IS NULL OR v_row.pediatric_use != 'Section 8.4: Safety and efficacy demonstrated for children.' THEN
        RAISE EXCEPTION 'فشل: تم مسح نص pediatric_use السابق بقيمة فارغة!';
    END IF;

    RAISE NOTICE '[PASS] تحول النشرة المعتمدة إلى needs_re_review وأرشفة المراجعة السابقة والدمج غير الإتلافي بنجاح.';
END $$;

-- ------------------------------------------------------------------------------
-- 5. التحقق من سلامة الجداول الأخرى (عدم المساس بـ clinic_drug_catalog و patients)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_catalog_count INT;
    v_patient_count INT;
BEGIN
    SELECT COUNT(*) INTO v_catalog_count FROM public.clinic_drug_catalog;
    IF v_catalog_count > 0 THEN
        RAISE EXCEPTION 'فشل: تم مساس جدول clinic_drug_catalog أثناء مزامنة النشرات!';
    END IF;

    SELECT COUNT(*) INTO v_patient_count FROM public.patients WHERE file_number = 'P-LABEL-TEST';
    IF v_patient_count != 1 THEN
        RAISE EXCEPTION 'فشل: تم مساس بيانات المرضى!';
    END IF;

    RAISE NOTICE '[PASS] تأكيد عدم المساس بكتالوج العيادة أو بيانات المرضى.';
END $$;

DO $$
BEGIN
    RAISE NOTICE '========================================================================';
    RAISE NOTICE '>>> اكتملت جميع اختبارات SQL لمزامنة نشرات openFDA بنجاح تام <<<';
    RAISE NOTICE '========================================================================';
END $$;

ROLLBACK;

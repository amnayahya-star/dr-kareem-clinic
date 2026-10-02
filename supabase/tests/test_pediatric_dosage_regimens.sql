-- ==============================================================================
-- Staging / Test Verification Script: Pediatric Dosage Regimens (pgTAP Test Suite)
-- File: supabase/tests/test_pediatric_dosage_regimens.sql
-- Description:
--   Comprehensive pgTAP tests for public.pediatric_dosage_regimens,
--   trigger-enforced indication/severity coupling, 6 explicit rejection scenarios,
--   schema constraints, security layer hardening, and doctor approval RPC.
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

-- Total number of planned TAP tests (34 baseline clinical/schema + 11 security tests)
SELECT plan(45);

-- ------------------------------------------------------------------------------
-- 1. فحص بنية الجدول والأعمدة والـ Trigger (Schema & Column Checks)
-- ------------------------------------------------------------------------------
SELECT has_table('public', 'pediatric_dosage_regimens', 'Table public.pediatric_dosage_regimens should exist');

SELECT has_column('public', 'pediatric_dosage_regimens', 'id', 'Column id should exist');
SELECT has_column('public', 'pediatric_dosage_regimens', 'rule_id', 'Column rule_id should exist');
SELECT has_column('public', 'pediatric_dosage_regimens', 'indication_group', 'Column indication_group should exist');
SELECT has_column('public', 'pediatric_dosage_regimens', 'severity', 'Column severity should exist');
SELECT has_column('public', 'pediatric_dosage_regimens', 'dose_mg_per_kg_day', 'Column dose_mg_per_kg_day should exist');
SELECT has_column('public', 'pediatric_dosage_regimens', 'interval_hours', 'Column interval_hours should exist');
SELECT has_column('public', 'pediatric_dosage_regimens', 'doses_per_day', 'Column doses_per_day should exist');
SELECT has_column('public', 'pediatric_dosage_regimens', 'source_section', 'Column source_section should exist');
SELECT has_column('public', 'pediatric_dosage_regimens', 'source_table', 'Column source_table should exist');
SELECT has_column('public', 'pediatric_dosage_regimens', 'source_text', 'Column source_text should exist');
SELECT has_column('public', 'pediatric_dosage_regimens', 'is_active', 'Column is_active should exist');
SELECT has_column('public', 'pediatric_dosage_regimens', 'created_at', 'Column created_at should exist');
SELECT has_column('public', 'pediatric_dosage_regimens', 'updated_at', 'Column updated_at should exist');

SELECT has_trigger(
    'public',
    'pediatric_dosage_regimens',
    'trg_check_pediatric_regimen_clinical_rules',
    'Trigger trg_check_pediatric_regimen_clinical_rules should exist'
);

-- ------------------------------------------------------------------------------
-- 2. إعداد البيانات التخليقية للاختبار (Setup Test Fixtures)
-- ------------------------------------------------------------------------------
SELECT lives_ok(
    $$
    DO $setup$
    DECLARE
        v_doc_id UUID := '11111111-1111-1111-1111-111111111111'::UUID;
        v_sec_id UUID := '22222222-2222-2222-2222-222222222222'::UUID;
        v_prod_id UUID;
        v_label_id UUID;
        v_rule_id UUID;
        v_valid_hash TEXT := 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    BEGIN
        -- 2.1 حسابات الطبيب والسكرتيرة
        INSERT INTO auth.users (id, email, role, aud) VALUES
            (v_doc_id, 'doc_pgtap_regimen@example.com', 'authenticated', 'authenticated'),
            (v_sec_id, 'sec_pgtap_regimen@example.com', 'authenticated', 'authenticated')
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.profiles (id, full_name, role) VALUES
            (v_doc_id, 'د. كريم (طبيب فاحص pgTAP)', 'doctor'::public.user_role),
            (v_sec_id, 'سارة (سكرتيرة pgTAP)',      'secretary'::public.user_role)
        ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

        -- 2.2 منتج Amoxicillin 50090-6351
        SELECT id INTO v_prod_id FROM public.drug_products WHERE source_identifier = '50090-6351' LIMIT 1;
        IF v_prod_id IS NULL THEN
            INSERT INTO public.drug_products (
                display_name, generic_name, dosage_form, route, status, source_system, source_identifier
            ) VALUES (
                'Amoxicillin 250 MG / 5 ML Oral Suspension', 'Amoxicillin', 'suspension', 'oral', 'cached', 'FDA_NDC', '50090-6351'
            ) RETURNING id INTO v_prod_id;
        END IF;

        -- 2.3 نشرة رسمية بهامش 64 خانة سداسية عشرية مطابق لقيد chk_dl_payload_hash_format
        SELECT id INTO v_label_id FROM public.drug_labels WHERE product_id = v_prod_id LIMIT 1;
        IF v_label_id IS NULL THEN
            INSERT INTO public.drug_labels (
                product_id, source_system, source_identifier, payload_hash, effective_time, review_status, dosage_and_administration
            ) VALUES (
                v_prod_id, 'OPENFDA_LABEL', '50090-6351', v_valid_hash, '20240430', 'pending_review',
                'Section 2.2 Table 1: Dosage Regimens for Pediatric Patients'
            ) RETURNING id INTO v_label_id;
        ELSE
            UPDATE public.drug_labels
            SET payload_hash = v_valid_hash, effective_time = '20240430', review_status = 'pending_review'
            WHERE id = v_label_id;
        END IF;

        -- 2.4 قاعدة جرعات الأطفال
        SELECT id INTO v_rule_id FROM public.pediatric_dosage_rules WHERE product_id = v_prod_id LIMIT 1;
        IF v_rule_id IS NULL THEN
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
                'openFDA Section 2.2 Table 1', 'Table 1 dosage guidelines',
                v_valid_hash, '20240430', 'pending_review'
            ) RETURNING id INTO v_rule_id;
        ELSE
            UPDATE public.pediatric_dosage_rules
            SET drug_label_id = v_label_id, label_payload_hash = v_valid_hash, review_status = 'pending_review'
            WHERE id = v_rule_id;
        END IF;

        -- 2.5 حذف أي أنظمة قديمة وإعادة إدراج الـ 14 نظاماً المعتمدة بدقة
        DELETE FROM public.pediatric_dosage_regimens WHERE rule_id = v_rule_id;

        INSERT INTO public.pediatric_dosage_regimens (
            rule_id, indication_group, severity, dose_mg_per_kg_day, interval_hours, doses_per_day, source_section, source_table, source_text, is_active
        ) VALUES
            -- ENT (4)
            (v_rule_id, 'ear_nose_throat', 'mild_moderate', 25.00, 12, 2, '2.2', 'Table 1', 'ENT mild/mod 25 q12', TRUE),
            (v_rule_id, 'ear_nose_throat', 'mild_moderate', 20.00, 8, 3, '2.2', 'Table 1', 'ENT mild/mod 20 q8', TRUE),
            (v_rule_id, 'ear_nose_throat', 'severe', 45.00, 12, 2, '2.2', 'Table 1', 'ENT severe 45 q12', TRUE),
            (v_rule_id, 'ear_nose_throat', 'severe', 40.00, 8, 3, '2.2', 'Table 1', 'ENT severe 40 q8', TRUE),
            -- Skin (4)
            (v_rule_id, 'skin_skin_structure', 'mild_moderate', 25.00, 12, 2, '2.2', 'Table 1', 'Skin mild/mod 25 q12', TRUE),
            (v_rule_id, 'skin_skin_structure', 'mild_moderate', 20.00, 8, 3, '2.2', 'Table 1', 'Skin mild/mod 20 q8', TRUE),
            (v_rule_id, 'skin_skin_structure', 'severe', 45.00, 12, 2, '2.2', 'Table 1', 'Skin severe 45 q12', TRUE),
            (v_rule_id, 'skin_skin_structure', 'severe', 40.00, 8, 3, '2.2', 'Table 1', 'Skin severe 40 q8', TRUE),
            -- Genitourinary (4)
            (v_rule_id, 'genitourinary_tract', 'mild_moderate', 25.00, 12, 2, '2.2', 'Table 1', 'GU mild/mod 25 q12', TRUE),
            (v_rule_id, 'genitourinary_tract', 'mild_moderate', 20.00, 8, 3, '2.2', 'Table 1', 'GU mild/mod 20 q8', TRUE),
            (v_rule_id, 'genitourinary_tract', 'severe', 45.00, 12, 2, '2.2', 'Table 1', 'GU severe 45 q12', TRUE),
            (v_rule_id, 'genitourinary_tract', 'severe', 40.00, 8, 3, '2.2', 'Table 1', 'GU severe 40 q8', TRUE),
            -- Lower Respiratory Tract (2)
            (v_rule_id, 'lower_respiratory_tract', 'mild_moderate_or_severe', 45.00, 12, 2, '2.2', 'Table 1', 'LRT 45 q12', TRUE),
            (v_rule_id, 'lower_respiratory_tract', 'mild_moderate_or_severe', 40.00, 8, 3, '2.2', 'Table 1', 'LRT 40 q8', TRUE);
    END $setup$;
    $$,
    'Setup test fixtures for Amoxicillin 50090-6351 should succeed'
);

-- ------------------------------------------------------------------------------
-- 3. التحقق من اكتمال الأنظمة الـ 14 وتوزيعها ومصادرها وحالتها
-- ------------------------------------------------------------------------------
SELECT is(
    (SELECT COUNT(*)::int
     FROM public.pediatric_dosage_regimens r
     JOIN public.pediatric_dosage_rules pr ON r.rule_id = pr.id
     WHERE pr.label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' AND r.is_active = TRUE),
    14,
    'Total active regimens count should equal exactly 14'
);

SELECT is(
    (SELECT COUNT(*)::int
     FROM public.pediatric_dosage_regimens r
     JOIN public.pediatric_dosage_rules pr ON r.rule_id = pr.id
     WHERE pr.label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' AND r.indication_group = 'ear_nose_throat'),
    4,
    'Ear/Nose/Throat should have exactly 4 regimens'
);

SELECT is(
    (SELECT COUNT(*)::int
     FROM public.pediatric_dosage_regimens r
     JOIN public.pediatric_dosage_rules pr ON r.rule_id = pr.id
     WHERE pr.label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' AND r.indication_group = 'skin_skin_structure'),
    4,
    'Skin/Skin Structure should have exactly 4 regimens'
);

SELECT is(
    (SELECT COUNT(*)::int
     FROM public.pediatric_dosage_regimens r
     JOIN public.pediatric_dosage_rules pr ON r.rule_id = pr.id
     WHERE pr.label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' AND r.indication_group = 'genitourinary_tract'),
    4,
    'Genitourinary Tract should have exactly 4 regimens'
);

SELECT is(
    (SELECT COUNT(*)::int
     FROM public.pediatric_dosage_regimens r
     JOIN public.pediatric_dosage_rules pr ON r.rule_id = pr.id
     WHERE pr.label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' AND r.indication_group = 'lower_respiratory_tract'),
    2,
    'Lower Respiratory Tract should have exactly 2 regimens'
);

SELECT is(
    (SELECT COUNT(*)::int
     FROM public.pediatric_dosage_regimens r
     JOIN public.pediatric_dosage_rules pr ON r.rule_id = pr.id
     WHERE pr.label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' AND r.source_section = '2.2'),
    14,
    'All 14 regimens should reference source_section 2.2'
);

SELECT is(
    (SELECT COUNT(*)::int
     FROM public.pediatric_dosage_regimens r
     JOIN public.pediatric_dosage_rules pr ON r.rule_id = pr.id
     WHERE pr.label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' AND r.source_table = 'Table 1'),
    14,
    'All 14 regimens should reference source_table Table 1'
);

SELECT is(
    (SELECT review_status
     FROM public.pediatric_dosage_rules
     WHERE label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' LIMIT 1),
    'pending_review',
    'Rule review_status should remain pending_review before doctor approval'
);

-- ------------------------------------------------------------------------------
-- 4. الاختبارات الستة الإلزامية للرفض الصارم (The 6 Mandatory Rejection Tests)
-- ------------------------------------------------------------------------------

-- 4.1 رفض mild_moderate + 45 q12 بالرمز 23514
SELECT throws_ok(
    $$ INSERT INTO public.pediatric_dosage_regimens (rule_id, indication_group, severity, dose_mg_per_kg_day, interval_hours, doses_per_day, source_text)
       SELECT id, 'ear_nose_throat', 'mild_moderate', 45.00, 12, 2, 'Invalid mild_mod 45 q12'
       FROM public.pediatric_dosage_rules WHERE label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' LIMIT 1 $$,
    '23514',
    NULL,
    'Should reject mild_moderate + 45 q12 with SQLSTATE 23514'
);

-- 4.2 رفض mild_moderate + 40 q8 بالرمز 23514
SELECT throws_ok(
    $$ INSERT INTO public.pediatric_dosage_regimens (rule_id, indication_group, severity, dose_mg_per_kg_day, interval_hours, doses_per_day, source_text)
       SELECT id, 'ear_nose_throat', 'mild_moderate', 40.00, 8, 3, 'Invalid mild_mod 40 q8'
       FROM public.pediatric_dosage_rules WHERE label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' LIMIT 1 $$,
    '23514',
    NULL,
    'Should reject mild_moderate + 40 q8 with SQLSTATE 23514'
);

-- 4.3 رفض severe + 25 q12 بالرمز 23514
SELECT throws_ok(
    $$ INSERT INTO public.pediatric_dosage_regimens (rule_id, indication_group, severity, dose_mg_per_kg_day, interval_hours, doses_per_day, source_text)
       SELECT id, 'ear_nose_throat', 'severe', 25.00, 12, 2, 'Invalid severe 25 q12'
       FROM public.pediatric_dosage_rules WHERE label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' LIMIT 1 $$,
    '23514',
    NULL,
    'Should reject severe + 25 q12 with SQLSTATE 23514'
);

-- 4.4 رفض severe + 20 q8 بالرمز 23514
SELECT throws_ok(
    $$ INSERT INTO public.pediatric_dosage_regimens (rule_id, indication_group, severity, dose_mg_per_kg_day, interval_hours, doses_per_day, source_text)
       SELECT id, 'ear_nose_throat', 'severe', 20.00, 8, 3, 'Invalid severe 20 q8'
       FROM public.pediatric_dosage_rules WHERE label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' LIMIT 1 $$,
    '23514',
    NULL,
    'Should reject severe + 20 q8 with SQLSTATE 23514'
);

-- 4.5 رفض lower_respiratory_tract + 25 q12 بالرمز 23514
SELECT throws_ok(
    $$ INSERT INTO public.pediatric_dosage_regimens (rule_id, indication_group, severity, dose_mg_per_kg_day, interval_hours, doses_per_day, source_text)
       SELECT id, 'lower_respiratory_tract', 'mild_moderate_or_severe', 25.00, 12, 2, 'Invalid LRT 25 q12'
       FROM public.pediatric_dosage_rules WHERE label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' LIMIT 1 $$,
    '23514',
    NULL,
    'Should reject lower_respiratory_tract + 25 q12 with SQLSTATE 23514'
);

-- 4.6 رفض lower_respiratory_tract + 20 q8 بالرمز 23514
SELECT throws_ok(
    $$ INSERT INTO public.pediatric_dosage_regimens (rule_id, indication_group, severity, dose_mg_per_kg_day, interval_hours, doses_per_day, source_text)
       SELECT id, 'lower_respiratory_tract', 'mild_moderate_or_severe', 20.00, 8, 3, 'Invalid LRT 20 q8'
       FROM public.pediatric_dosage_rules WHERE label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' LIMIT 1 $$,
    '23514',
    NULL,
    'Should reject lower_respiratory_tract + 20 q8 with SQLSTATE 23514'
);

-- ------------------------------------------------------------------------------
-- 5. اختبارات إضافية للجرعات الحرة ومنع التكرار (Arbitrary Dose & Uniqueness)
-- ------------------------------------------------------------------------------

-- 5.1 رفض الجرعات الحرة غير المنصوص عليها مثل 30 mg/kg/day
SELECT throws_ok(
    $$ INSERT INTO public.pediatric_dosage_regimens (rule_id, indication_group, severity, dose_mg_per_kg_day, interval_hours, doses_per_day, source_text)
       SELECT id, 'ear_nose_throat', 'mild_moderate', 30.00, 12, 2, 'Arbitrary 30 mg/kg/day'
       FROM public.pediatric_dosage_rules WHERE label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' LIMIT 1 $$,
    '23514',
    NULL,
    'Should reject arbitrary free dose 30 mg/kg/day with SQLSTATE 23514'
);

-- 5.2 رفض التكرار لنفس النظام داخل نفس القاعدة
SELECT throws_ok(
    $$ INSERT INTO public.pediatric_dosage_regimens (rule_id, indication_group, severity, dose_mg_per_kg_day, interval_hours, doses_per_day, source_text)
       SELECT id, 'ear_nose_throat', 'mild_moderate', 25.00, 12, 2, 'Duplicate ENT 25 q12'
       FROM public.pediatric_dosage_rules WHERE label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' LIMIT 1 $$,
    '23505',
    NULL,
    'Should reject duplicate regimen with SQLSTATE 23505 (unique_violation)'
);

-- ------------------------------------------------------------------------------
-- 6. اختبار اعتماد الطبيب عبر دالة RPC (Doctor Approval with 14 Regimens)
-- ------------------------------------------------------------------------------
SELECT lives_ok(
    $$
    DO $doc_approve$
    DECLARE
        v_rule_id UUID;
        v_doc_id UUID := '11111111-1111-1111-1111-111111111111'::UUID;
        v_res JSONB;
    BEGIN
        SELECT id INTO v_rule_id FROM public.pediatric_dosage_rules
        WHERE label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' LIMIT 1;

        EXECUTE format('SET LOCAL "request.jwt.claim.sub" = %L', v_doc_id::text);
        EXECUTE format('SET LOCAL "request.jwt.claim.role" = %L', 'authenticated');

        v_res := public.review_pediatric_dosage_rule(
            v_rule_id,
            'approve',
            'تم تدقيق النشرة الرسمية لمنتج أموكسيسيلين (NDC 50090-6351) واعتماد جميع الأنظمة الـ 14 لـ Table 1 سريرياً.'
        );

        IF v_res->>'review_status' != 'approved' THEN
            RAISE EXCEPTION 'Review status should be approved';
        END IF;

        IF (v_res->'approved_snapshot'->>'regimens_count')::int != 14 THEN
            RAISE EXCEPTION 'Snapshot regimens_count should equal 14';
        END IF;
    END $doc_approve$;
    $$,
    'Doctor can successfully approve rule with all 14 validated regimens'
);

SELECT is(
    (SELECT review_status
     FROM public.pediatric_dosage_rules
     WHERE label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' LIMIT 1),
    'approved',
    'Rule review_status should be updated to approved after doctor review'
);

-- ------------------------------------------------------------------------------
-- 7. اختبارات طبقة الأمان والصلاحيات (Security Layer & Least Privilege Tests)
-- ------------------------------------------------------------------------------

-- 7.1 anon لا يستطيع SELECT من الجدول (Permission Denied)
SELECT throws_ok(
    $$
    DO $anon_sel$
    BEGIN
        EXECUTE 'SET LOCAL ROLE anon';
        PERFORM * FROM public.pediatric_dosage_regimens;
    END $anon_sel$;
    $$,
    '42501',
    NULL,
    'anon cannot SELECT from public.pediatric_dosage_regimens'
);

-- 7.2 authenticated غير الطبيب (سكرتيرة) لا يستطيع قراءة صفوف الجدول بسبب RLS is_doctor()
SELECT lives_ok(
    $$
    DO $sec_rls$
    DECLARE
        v_sec_id UUID := '22222222-2222-2222-2222-222222222222'::UUID;
        v_cnt INT;
    BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        EXECUTE format('SET LOCAL "request.jwt.claim.sub" = %L', v_sec_id::text);
        EXECUTE format('SET LOCAL "request.jwt.claim.role" = %L', 'authenticated');

        SELECT COUNT(*) INTO v_cnt FROM public.pediatric_dosage_regimens;
        IF v_cnt != 0 THEN
            RAISE EXCEPTION 'Non-doctor was able to see % rows in pediatric_dosage_regimens', v_cnt;
        END IF;
    END $sec_rls$;
    $$,
    'Authenticated non-doctor (secretary) sees 0 rows in pediatric_dosage_regimens due to RLS'
);

-- 7.3 الطبيب المصرح له يستطيع قراءة جميع صفوف الجدول (14 نظاماً)
SELECT lives_ok(
    $$
    DO $doc_rls$
    DECLARE
        v_doc_id UUID := '11111111-1111-1111-1111-111111111111'::UUID;
        v_cnt INT;
    BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        EXECUTE format('SET LOCAL "request.jwt.claim.sub" = %L', v_doc_id::text);
        EXECUTE format('SET LOCAL "request.jwt.claim.role" = %L', 'authenticated');

        SELECT COUNT(*) INTO v_cnt FROM public.pediatric_dosage_regimens;
        IF v_cnt != 14 THEN
            RAISE EXCEPTION 'Doctor could not see 14 rows in pediatric_dosage_regimens (saw %)', v_cnt;
        END IF;
    END $doc_rls$;
    $$,
    'Doctor can see all 14 rows in pediatric_dosage_regimens under RLS'
);

-- 7.4 anon لا يستطيع تنفيذ RPC review_pediatric_dosage_rule
SELECT throws_ok(
    $$
    DO $anon_rpc$
    BEGIN
        EXECUTE 'SET LOCAL ROLE anon';
        PERFORM public.review_pediatric_dosage_rule('00000000-0000-0000-0000-000000000000'::uuid, 'approve', 'test');
    END $anon_rpc$;
    $$,
    '42501',
    NULL,
    'anon cannot execute review_pediatric_dosage_rule'
);

-- 7.5 authenticated غير الطبيب يفشل عند تنفيذ RPC بسبب is_doctor()
SELECT throws_ok(
    $$
    DO $sec_rpc$
    DECLARE
        v_rule_id UUID;
        v_sec_id UUID := '22222222-2222-2222-2222-222222222222'::UUID;
    BEGIN
        SELECT id INTO v_rule_id FROM public.pediatric_dosage_rules
        WHERE label_payload_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' LIMIT 1;

        EXECUTE 'SET LOCAL ROLE authenticated';
        EXECUTE format('SET LOCAL "request.jwt.claim.sub" = %L', v_sec_id::text);
        EXECUTE format('SET LOCAL "request.jwt.claim.role" = %L', 'authenticated');

        PERFORM public.review_pediatric_dosage_rule(v_rule_id, 'approve', 'محاولة سكرتيرة');
    END $sec_rpc$;
    $$,
    '42501',
    NULL,
    'Authenticated non-doctor (secretary) fails when executing review_pediatric_dosage_rule due to is_doctor()'
);

-- 7.6 authenticated لا يملك صلاحية INSERT المباشرة على الجدول
SELECT throws_ok(
    $$
    DO $auth_ins$
    BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        INSERT INTO public.pediatric_dosage_regimens (rule_id, indication_group, severity, dose_mg_per_kg_day, interval_hours, doses_per_day, source_text)
        VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'ear_nose_throat', 'mild_moderate', 25.00, 12, 2, 'unauthorized');
    END $auth_ins$;
    $$,
    '42501',
    NULL,
    'authenticated cannot directly INSERT into pediatric_dosage_regimens'
);

-- 7.7 authenticated لا يملك صلاحية UPDATE المباشرة على الجدول
SELECT throws_ok(
    $$
    DO $auth_upd$
    BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        UPDATE public.pediatric_dosage_regimens SET dose_mg_per_kg_day = 50 WHERE FALSE;
    END $auth_upd$;
    $$,
    '42501',
    NULL,
    'authenticated cannot directly UPDATE pediatric_dosage_regimens'
);

-- 7.8 authenticated لا يملك صلاحية DELETE المباشرة على الجدول
SELECT throws_ok(
    $$
    DO $auth_del$
    BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        DELETE FROM public.pediatric_dosage_regimens WHERE FALSE;
    END $auth_del$;
    $$,
    '42501',
    NULL,
    'authenticated cannot directly DELETE from pediatric_dosage_regimens'
);

-- 7.9 حظر الاستدعاء المباشر لدالة الـ Trigger fn_check_pediatric_regimen_clinical_rules
SELECT throws_ok(
    $$
    DO $trg_func$
    BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        PERFORM public.fn_check_pediatric_regimen_clinical_rules();
    END $trg_func$;
    $$,
    '42501',
    NULL,
    'authenticated cannot directly invoke trigger function fn_check_pediatric_regimen_clinical_rules'
);

-- 7.10 دالة الـ Trigger تحتوي على إعداد search_path آمن (= '')
SELECT is(
    (SELECT proconfig FROM pg_proc WHERE proname = 'fn_check_pediatric_regimen_clinical_rules' AND pronamespace = 'public'::regnamespace),
    ARRAY['search_path=""']::text[],
    'fn_check_pediatric_regimen_clinical_rules has search_path set to empty string'
);

-- 7.11 دالة مراجعة القاعدة RPC تحتوي على إعداد search_path آمن (= '')
SELECT is(
    (SELECT proconfig FROM pg_proc WHERE proname = 'review_pediatric_dosage_rule' AND pronamespace = 'public'::regnamespace),
    ARRAY['search_path=""']::text[],
    'review_pediatric_dosage_rule has search_path set to empty string'
);

-- ------------------------------------------------------------------------------
-- 8. إنهاء الاختبارات والتراجع الكامل لضمان عدم ترك أي بيانات (ROLLBACK)
-- ------------------------------------------------------------------------------
SELECT * FROM finish();

ROLLBACK;

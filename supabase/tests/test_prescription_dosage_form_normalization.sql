-- ==============================================================================
-- Staging / Test Verification Script: Dosage Form Normalization Contract
-- File: supabase/tests/test_prescription_dosage_form_normalization.sql
-- Description:
--   SQL Contract & Regression test for public.save_electronic_prescription
--   re-defined in Migration 00017.
--
-- EXECUTION REQUIREMENTS:
--   - Runs entirely within a single transaction ending with ROLLBACK.
--   - ZERO production dependencies; uses purely synthetic transient fixtures.
--   - STOPS ON FIRST ERROR (Fail-Fast with non-zero exit code).
-- ==============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    v_doctor_id UUID := '11111111-1111-1111-1111-111111111111'::UUID;
    v_patient_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID;
    v_visit_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID;
    v_rx_id UUID;
    v_def TEXT;
BEGIN
    RAISE NOTICE '========================================================================';
    RAISE NOTICE '>>> بدء اختبارات عقد SQL لتطبيع الأشكال الدوائية (Migration 00017) <<<';
    RAISE NOTICE '========================================================================';

    -- 1. التأكد من وجود الدالة بالتوقيع الصحيح المكون من 7 معاملات
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
      AND p.proname = 'save_electronic_prescription'
      AND pronargs = 7;

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'دالة public.save_electronic_prescription بالتوقيع السباعي غير معرفة';
    END IF;

    -- 2. التأكد من عدم وجود أي cast أو تحويل إلى ointment_cream داخل كود الدالة
    IF v_def LIKE '%THEN ''ointment_cream''%' THEN
        RAISE EXCEPTION 'كود الدالة لا يزال يحتوي على تحويل إلى ointment_cream';
    END IF;

    IF v_def LIKE '%THEN ''tablets''%' THEN
        RAISE EXCEPTION 'كود الدالة لا يزال يحتوي على تحويل إلى tablets (صيغة الجمع)';
    END IF;

    IF v_def LIKE '%THEN ''capsules''%' THEN
        RAISE EXCEPTION 'كود الدالة لا يزال يحتوي على تحويل إلى capsules (صيغة الجمع)';
    END IF;

    IF v_def LIKE '%THEN ''injections''%' THEN
        RAISE EXCEPTION 'كود الدالة لا يزال يحتوي على تحويل إلى injections (صيغة الجمع)';
    END IF;

    IF v_def LIKE '%THEN ''inhaler_spray''%' THEN
        RAISE EXCEPTION 'كود الدالة لا يزال يحتوي على تحويل إلى inhaler_spray المركبة';
    END IF;

    -- 3. التأكد من وجود التحويلات الصحيحة
    IF NOT (v_def LIKE '%THEN ''cream''%' AND v_def LIKE '%THEN ''ointment''%') THEN
        RAISE EXCEPTION 'كود الدالة يفتقر للتحويل إلى cream أو ointment';
    END IF;

    -- 4. التأكد من بقاء منطق المراجعات وتحديث الكتالوج دون مساس
    IF NOT (v_def LIKE '%v_replaces_prescription_id IS NOT NULL%' AND v_def LIKE '%DISTINCT pi_new.catalog_product_id%') THEN
        RAISE EXCEPTION 'منطق مراجعات الوصفات وحساب دلتا كتالوج الأدوية غير مكتمل';
    END IF;

    RAISE NOTICE '>>> اجتازت الدالة جميع فحوصات العقد البنيوي والتطبيع بنجاح تام <<<';
END $$;

ROLLBACK;

-- ==============================================================================
-- Migration 00017: إصلاح تطبيع الشكل الدوائي (dosage_form) في دالة save_electronic_prescription
-- ==============================================================================
-- المشكلة المعالجة:
-- في الترحيل 00016، كان منطق تطبيع الشكل الدوائي يعيد تحويل الأشكال الدوائية الحديثة
-- (مثل 'cream' و 'ointment' و 'gel' و 'lotion') إلى القيمة المركبة القديمة 'ointment_cream'.
-- وبالمثل كان يعيد تحويل 'tablet' إلى 'tablets' و 'capsule' إلى 'capsules' و 'injection' إلى 'injections'.
-- وحيث إن نوع التعداد (public.dosage_form_type) في قاعدة البيانات يعتمد القيم القياسية المفردة
-- ('cream', 'ointment', 'tablet', 'capsule', 'injection', 'inhaler', 'spray', ...)
-- ولا يحتوي على 'ointment_cream'، كان حفظ أي دواء ذي شكل CREAM يفشل بخطأ:
-- invalid input value for enum public.dosage_form_type: "ointment_cream"
--
-- الحل المعتمد في هذا الترحيل:
-- 1. إعادة تعريف دالة public.save_electronic_prescription بنفس التوقيع الموحد (7 معلمات) والصلاحيات الصارمة.
-- 2. تطبيع dosage_form كنص بدقة قبل محاولة تحويله إلى public.dosage_form_type:
--    - cream و ointment_cream و gel و lotion -> cream
--    - ointment -> ointment
--    - tablet و tablets -> tablet
--    - capsule و capsules -> capsule
--    - injection و injections -> injection
--    - inhaler_spray -> inhaler
--    - spray -> spray
--    - drops و drop -> drops
--    - syrup و solution و elixir -> syrup
--    - suspension -> suspension
--    - suppository -> suppository
--    - sachet -> sachet
--    - other -> other
--    - أي قيمة نصية أخرى غير معروفة -> other
--    - القيم الفارغة أو NULL -> NULL
-- 3. الحفاظ الكامل بنسبة 100% على منطق دورة المراجعات (Revisions) وحماية الوصفات الصادرة
--    وتحديث سجل كتالوج الأدوية الشائعة (Delta & Distinct).
-- 4. عدم المساس بنوع ENUM (عدم التوسيع وعدم الحذف).
-- ==============================================================================

BEGIN;

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

    -- 8. التحقق التفصيلي من بنود الأدوية والتطبيع النصي المسبق
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_idx := v_idx + 1;
        v_med_name := trim(COALESCE(v_item->>'medication_name', ''));
        IF v_med_name = '' THEN
            RAISE EXCEPTION 'البند رقم %: اسم الدواء إلزامي ولا يمكن تركه فارغاً', v_idx;
        END IF;

        -- تطبيع الشكل الدوائي كنص آمن
        v_dosage_form := trim(COALESCE(v_item->>'dosage_form', ''));
        IF v_dosage_form != '' THEN
            v_dosage_form_norm := CASE 
                WHEN lower(v_dosage_form) IN ('cream', 'ointment_cream', 'gel', 'lotion') THEN 'cream'
                WHEN lower(v_dosage_form) IN ('ointment') THEN 'ointment'
                WHEN lower(v_dosage_form) IN ('tablet', 'tablets') THEN 'tablet'
                WHEN lower(v_dosage_form) IN ('capsule', 'capsules') THEN 'capsule'
                WHEN lower(v_dosage_form) IN ('injection', 'injections') THEN 'injection'
                WHEN lower(v_dosage_form) IN ('inhaler_spray', 'inhaler', 'aerosol') THEN 'inhaler'
                WHEN lower(v_dosage_form) IN ('spray') THEN 'spray'
                WHEN lower(v_dosage_form) IN ('drops', 'drop') THEN 'drops'
                WHEN lower(v_dosage_form) IN ('syrup', 'solution', 'elixir') THEN 'syrup'
                WHEN lower(v_dosage_form) IN ('suspension') THEN 'suspension'
                WHEN lower(v_dosage_form) IN ('suppository') THEN 'suppository'
                WHEN lower(v_dosage_form) IN ('sachet') THEN 'sachet'
                WHEN lower(v_dosage_form) IN ('other') THEN 'other'
                ELSE 'other'
            END;
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

    -- 10. إحلال بنود الأدوية (Replace Items) مع التطبيع الدقيق للأشكال الدوائية
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

        -- تطبيع الشكل الدوائي إلى القيم المعتمدة حصراً في public.dosage_form_type
        -- يمنع تماماً محاولة cast لقيم ملغاة أو مركبة مثل 'ointment_cream' أو صيغ الجمع
        v_dosage_form := trim(COALESCE(v_item->>'dosage_form', ''));
        v_dosage_form_norm := CASE 
            WHEN lower(v_dosage_form) IN ('cream', 'ointment_cream', 'gel', 'lotion') THEN 'cream'
            WHEN lower(v_dosage_form) IN ('ointment') THEN 'ointment'
            WHEN lower(v_dosage_form) IN ('tablet', 'tablets') THEN 'tablet'
            WHEN lower(v_dosage_form) IN ('capsule', 'capsules') THEN 'capsule'
            WHEN lower(v_dosage_form) IN ('injection', 'injections') THEN 'injection'
            WHEN lower(v_dosage_form) IN ('inhaler_spray', 'inhaler', 'aerosol') THEN 'inhaler'
            WHEN lower(v_dosage_form) IN ('spray') THEN 'spray'
            WHEN lower(v_dosage_form) IN ('drops', 'drop') THEN 'drops'
            WHEN lower(v_dosage_form) IN ('syrup', 'solution', 'elixir') THEN 'syrup'
            WHEN lower(v_dosage_form) IN ('suspension') THEN 'suspension'
            WHEN lower(v_dosage_form) IN ('suppository') THEN 'suppository'
            WHEN lower(v_dosage_form) IN ('sachet') THEN 'sachet'
            WHEN lower(v_dosage_form) IN ('other') THEN 'other'
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

-- ضبط الصلاحيات الصارمة على دالة حفظ الوصفات المحدثة
REVOKE ALL ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT, UUID) TO authenticated;

COMMIT;

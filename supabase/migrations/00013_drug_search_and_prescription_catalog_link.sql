-- ==============================================================================
-- Migration: Drug Search & Electronic Prescription Catalog Link
-- Version: 00013_drug_search_and_prescription_catalog_link.sql
-- Description:
--   1. دالة البحث الآمنة في قاعدة بيانات الأدوية (public.search_drug_products)
--      للأطباء فقط مع الترتيب حسب تطابق الاسم والبدائل، والهروب الصريح لرموز
--      %, _, \ كأحرف عادية، وضمان تطابق مواضع المواد الفعالة مع تراكيزها (N/A).
--   2. دالة حفظ وإصدار الوصفة الإلكترونية (public.save_electronic_prescription)
--      مع قفل صفي FOR UPDATE لمنع التعديل المتزامن وزيادة usage_count مرتين،
--      والتحقق الصارم من صحة p_action ونوع مصفوفة p_items.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. دالة البحث الآمنة في قاعدة بيانات الأدوية (public.search_drug_products)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_drug_products(
    p_query TEXT,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    product_id UUID,
    source_identifier VARCHAR,
    display_name TEXT,
    generic_name TEXT,
    brand_name TEXT,
    dosage_form TEXT,
    route TEXT,
    active_ingredient TEXT,
    strength TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_query TEXT;
    v_escaped_query TEXT;
    v_safe_limit INT;
    v_exact_term TEXT;
    v_prefix_term TEXT;
    v_partial_term TEXT;
BEGIN
    -- أ) التحقق الصريح من أن المستدعي طبيب مسجل ومصادق
    IF auth.uid() IS NULL OR NOT public.is_doctor() THEN
        RAISE EXCEPTION 'غير مصرح: البحث في قاعدة بيانات الأدوية متاح للأطباء المصادقين فقط';
    END IF;

    -- ب) تنظيف نص البحث ورفض الاستعلامات الأقل من حرفين
    v_clean_query := TRIM(COALESCE(p_query, ''));
    IF length(v_clean_query) < 2 THEN
        RETURN;
    END IF;

    -- ج) تهيئة نسخة escaped من نص البحث لمعاملة رموز %, _, \ كأحرف عادية وليست Wildcards
    -- الترتيب مهم: نهرب الشرطة المائلة أولاً لتفادي تكرار الهروب
    v_escaped_query := replace(replace(replace(v_clean_query, '\', '\\'), '%', '\%'), '_', '\_');

    -- د) ضبط عدد النتائج بحد أقصى 20 وافتراضي 10 وحد أدنى 1
    v_safe_limit := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 20);

    v_exact_term := LOWER(v_clean_query);
    v_prefix_term := v_escaped_query || '%';
    v_partial_term := '%' || v_escaped_query || '%';

    -- هـ) استرجاع النتائج وترتيبها حسب دقة التطابق دون تعديل كتالوج العيادة إطلاقاً
    RETURN QUERY
    WITH product_ingredients_agg AS (
        -- تجميع المواد الفعالة وتراكيزها بترتيب display_order لكل منتج
        -- الحفاظ الصارم على تطابق موضع كل مادة مع تركيزها: استخدام 'N/A' للمادة عديمة التركيز
        -- لمنع نسبة تركيز مادة لمادة أخرى عند تعدد المواد
        SELECT 
            dpi.product_id,
            string_agg(
                di.preferred_name,
                ' + ' 
                ORDER BY dpi.display_order ASC
            ) AS agg_active_ingredient,
            CASE 
                WHEN COUNT(dpi.strength_numerator_value) > 0 THEN
                    string_agg(
                        CASE 
                            WHEN dpi.strength_numerator_value IS NOT NULL AND dpi.strength_numerator_unit IS NOT NULL THEN
                                CASE 
                                    WHEN dpi.strength_denominator_value IS NOT NULL AND dpi.strength_denominator_unit IS NOT NULL THEN
                                        CASE 
                                            WHEN dpi.strength_denominator_value = 1 AND dpi.strength_denominator_unit NOT IN ('1', 'dose') THEN
                                                dpi.strength_numerator_value::text || ' ' || dpi.strength_numerator_unit || ' / ' || dpi.strength_denominator_unit
                                            WHEN dpi.strength_denominator_value != 1 THEN
                                                dpi.strength_numerator_value::text || ' ' || dpi.strength_numerator_unit || ' / ' || dpi.strength_denominator_value::text || ' ' || dpi.strength_denominator_unit
                                            ELSE
                                                dpi.strength_numerator_value::text || ' ' || dpi.strength_numerator_unit
                                        END
                                    ELSE
                                        dpi.strength_numerator_value::text || ' ' || dpi.strength_numerator_unit
                                END
                            ELSE 'N/A'
                        END,
                        ' + ' 
                        ORDER BY dpi.display_order ASC
                    )
                ELSE NULL
            END AS agg_strength
        FROM public.drug_product_ingredients dpi
        JOIN public.drug_ingredients di ON di.id = dpi.ingredient_id
        GROUP BY dpi.product_id
    ),
    matched_products AS (
        SELECT 
            dp.id AS p_id,
            dp.source_identifier AS p_source_identifier,
            dp.display_name AS p_display_name,
            dp.generic_name AS p_generic_name,
            dp.brand_name AS p_brand_name,
            dp.dosage_form AS p_dosage_form,
            dp.route AS p_route,
            COALESCE(pia.agg_active_ingredient, dp.generic_name) AS p_active_ingredient,
            pia.agg_strength AS p_strength,
            CASE 
                -- الأولوية 1: مطابقة تامة
                WHEN LOWER(dp.display_name) = v_exact_term
                  OR LOWER(dp.generic_name) = v_exact_term
                  OR LOWER(COALESCE(dp.brand_name, '')) = v_exact_term
                  OR EXISTS (
                      SELECT 1 FROM public.drug_aliases da 
                      WHERE (da.product_id = dp.id OR da.ingredient_id IN (
                          SELECT dpi2.ingredient_id FROM public.drug_product_ingredients dpi2 WHERE dpi2.product_id = dp.id
                      ))
                        AND da.is_active = TRUE 
                        AND LOWER(da.alias_name) = v_exact_term
                  )
                THEN 1

                -- الأولوية 2: مطابقة تبدأ بالنص (Prefix) مع ESCAPE صريح
                WHEN dp.display_name ILIKE v_prefix_term ESCAPE '\'
                  OR dp.generic_name ILIKE v_prefix_term ESCAPE '\'
                  OR COALESCE(dp.brand_name, '') ILIKE v_prefix_term ESCAPE '\'
                  OR EXISTS (
                      SELECT 1 FROM public.drug_aliases da 
                      WHERE (da.product_id = dp.id OR da.ingredient_id IN (
                          SELECT dpi2.ingredient_id FROM public.drug_product_ingredients dpi2 WHERE dpi2.product_id = dp.id
                      ))
                        AND da.is_active = TRUE 
                        AND da.alias_name ILIKE v_prefix_term ESCAPE '\'
                  )
                THEN 2

                -- الأولوية 3: مطابقة جزئية داخل النص مع ESCAPE صريح
                ELSE 3
            END AS match_priority
        FROM public.drug_products dp
        LEFT JOIN product_ingredients_agg pia ON pia.product_id = dp.id
        WHERE dp.status IN ('cached', 'locally_added')
          AND (
              dp.display_name ILIKE v_partial_term ESCAPE '\'
              OR dp.generic_name ILIKE v_partial_term ESCAPE '\'
              OR COALESCE(dp.brand_name, '') ILIKE v_partial_term ESCAPE '\'
              OR EXISTS (
                  SELECT 1 FROM public.drug_aliases da 
                  WHERE (da.product_id = dp.id OR da.ingredient_id IN (
                      SELECT dpi2.ingredient_id FROM public.drug_product_ingredients dpi2 WHERE dpi2.product_id = dp.id
                  ))
                    AND da.is_active = TRUE 
                    AND da.alias_name ILIKE v_partial_term ESCAPE '\'
              )
          )
    )
    SELECT 
        mp.p_id,
        mp.p_source_identifier,
        mp.p_display_name,
        mp.p_generic_name,
        mp.p_brand_name,
        mp.p_dosage_form,
        mp.p_route,
        mp.p_active_ingredient,
        mp.p_strength
    FROM matched_products mp
    ORDER BY 
        mp.match_priority ASC,
        LENGTH(mp.p_display_name) ASC,
        mp.p_display_name ASC
    LIMIT v_safe_limit;
END;
$$;

-- حجب الصلاحيات عن العامة والمجهولين، ومنحها حصرياً للمستخدمين المصادقين
REVOKE ALL ON FUNCTION public.search_drug_products(TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_drug_products(TEXT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_drug_products(TEXT, INT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. تحديث دالة حفظ وإصدار الوصفة الإلكترونية (public.save_electronic_prescription)
-- مع التحقق الصارم وقفل الصف ضد التعارض المتزامن
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_electronic_prescription(
    p_visit_id UUID,
    p_patient_id UUID,
    p_diagnosis_id UUID DEFAULT NULL,
    p_general_instructions TEXT DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::JSONB,
    p_action TEXT DEFAULT 'draft' -- 'draft' | 'issue'
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

    -- 2. التحقق من بنية بنود الأدوية (p_items) وأنها مصفوفة JSON صالحة قبل استدعاء دوال المصفوفات
    IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' THEN
        RAISE EXCEPTION 'قائمة بنود الأدوية غير صالحة: يجب تمرير مصفوفة JSON صالحة للأدوية';
    END IF;

    -- 3. التحقق من المستخدم ودور الطبيب
    v_doctor_id := auth.uid();
    IF v_doctor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول كطبيب لإنشاء أو تعديل الوصفة الطبية';
    END IF;

    IF NOT public.is_doctor() THEN
        RAISE EXCEPTION 'غير مصرح: إدارة الوصفات الطبية مقتصرة على الطبيب فقط';
    END IF;

    -- 4. التحقق من وجود الزيارة وتطابق المريض والتشخيص
    IF NOT EXISTS (
        SELECT 1 FROM public.visits WHERE id = p_visit_id AND patient_id = p_patient_id
    ) THEN
        RAISE EXCEPTION 'سجل الزيارة غير موجود أو لا يتطابق مع المريض المحدد';
    END IF;

    IF p_diagnosis_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.diagnoses WHERE id = p_diagnosis_id AND visit_id = p_visit_id
    ) THEN
        RAISE EXCEPTION 'التشخيص المحدد غير موجود أو لا ينتمي إلى هذه الزيارة';
    END IF;

    -- 5. فحص عدد البنود والتحقق من صحتها عند الرغبة بالإصدار
    v_items_count := jsonb_array_length(p_items);
    IF p_action = 'issue' AND v_items_count = 0 THEN
        RAISE EXCEPTION 'لا يمكن إصدار وصفة طبية فارغة. يرجى إضافة دواء واحد على الأقل';
    END IF;

    -- 6. فحص ما إذا كانت هناك وصفة مسجلة مسبقاً لهذه الزيارة مع قفل الصف FOR UPDATE لمنع السباق المتزامن
    SELECT id, status, doctor_id, prescribed_by 
    INTO v_prescription_id, v_current_status, v_existing_doctor_id, v_existing_prescribed_by
    FROM public.prescriptions
    WHERE visit_id = p_visit_id
    FOR UPDATE;

    IF v_current_status IS NOT NULL AND v_current_status IN ('issued'::public.prescription_status_type, 'cancelled'::public.prescription_status_type) THEN
        RAISE EXCEPTION 'الوصفة الطبية لهذه الزيارة معتمدة أو ملغاة مسبقاً ولا يمكن تعديلها مباشرة (الحالة: %)', v_current_status;
    END IF;

    -- منع تعديل السجلات عديمة المالك أو التي يملكها طبيب آخر أو بها تعارض
    IF v_prescription_id IS NOT NULL THEN
        IF v_existing_prescribed_by IS NULL OR v_existing_doctor_id IS NULL THEN
            RAISE EXCEPTION 'غير مصرح: الوصفة الطبية تفتقر لبيانات الطبيب المالك ومقفلة للمراجعة الإدارية';
        END IF;

        IF v_existing_prescribed_by != v_doctor_id OR v_existing_doctor_id != v_doctor_id THEN
            RAISE EXCEPTION 'غير مصرح: لا يمكن تعديل مسودة وصفة طبية تم إنشاؤها بواسطة طبيب آخر أو بها تعارض في الملكية';
        END IF;
    END IF;

    -- 7. إنشاء أو تحديث سجل الوصفة الرئيسية بحالة مسودة مبدئياً
    IF v_prescription_id IS NULL THEN
        INSERT INTO public.prescriptions (
            visit_id,
            patient_id,
            diagnosis_id,
            doctor_id,
            prescribed_by,
            general_instructions,
            status,
            issued_at,
            created_at,
            updated_at
        ) VALUES (
            p_visit_id,
            p_patient_id,
            p_diagnosis_id,
            v_doctor_id,
            v_doctor_id,
            p_general_instructions,
            'draft'::public.prescription_status_type,
            NULL,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_prescription_id;
    ELSE
        UPDATE public.prescriptions
        SET
            diagnosis_id = COALESCE(p_diagnosis_id, diagnosis_id),
            general_instructions = p_general_instructions,
            doctor_id = v_doctor_id,
            prescribed_by = v_doctor_id,
            status = 'draft'::public.prescription_status_type,
            updated_at = NOW()
        WHERE id = v_prescription_id;

        -- مسح البنود السابقة للمسودة لإعادة إدراج القائمة المحدثة
        DELETE FROM public.prescription_items WHERE prescription_id = v_prescription_id;
    END IF;

    -- 8. إدراج بنود الأدوية بالترتيب مع معالجة catalog_product_id و is_custom_medication
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_idx := v_idx + 1;
        v_med_name := TRIM(COALESCE(v_item->>'medication_name', ''));
        v_dosage_form := NULLIF(TRIM(COALESCE(v_item->>'dosage_form', '')), '');
        v_freq := NULLIF(TRIM(COALESCE(v_item->>'frequency', '')), '');
        v_dur := NULLIF(TRIM(COALESCE(v_item->>'duration', '')), '');

        -- في حالة المسودة: تجاهل السطر الفارغ تماماً إذا لم يُكتب فيه أي شيء
        IF p_action = 'draft' AND v_med_name = '' AND v_dosage_form IS NULL AND v_freq IS NULL AND v_dur IS NULL AND NULLIF(TRIM(COALESCE(v_item->>'dose', '')), '') IS NULL THEN
            CONTINUE;
        END IF;

        IF v_med_name = '' THEN
            RAISE EXCEPTION 'اسم الدواء مطلوب لكل بند في الوصفة (البند رقم %)', v_idx;
        END IF;

        -- التحقق الصارم من اكتمال البيانات عند الإصدار فقط
        IF p_action = 'issue' THEN
            IF v_dosage_form IS NULL THEN
                RAISE EXCEPTION 'الشكل الدوائي مطلوب لاعتماد الدواء % (البند رقم %)', v_med_name, v_idx;
            END IF;

            IF v_freq IS NULL THEN
                RAISE EXCEPTION 'تكرار الجرعة مطلوب لاعتماد الدواء % (البند رقم %)', v_med_name, v_idx;
            END IF;

            IF v_dur IS NULL THEN
                RAISE EXCEPTION 'مدة العلاج مطلوبة لاعتماد الدواء % (البند رقم %)', v_med_name, v_idx;
            END IF;
        END IF;

        -- معالجة والتحقق من معرف الكتالوج وعلامة الدواء المخصص
        v_raw_catalog_id := NULLIF(TRIM(COALESCE(v_item->>'catalog_product_id', '')), '');
        v_catalog_product_id := NULL;
        IF v_raw_catalog_id IS NOT NULL THEN
            BEGIN
                v_catalog_product_id := v_raw_catalog_id::UUID;
            EXCEPTION WHEN OTHERS THEN
                RAISE EXCEPTION 'معرف منتج الكتالوج غير صالح (البند رقم %)', v_idx;
            END;
        END IF;

        v_raw_is_custom := v_item->>'is_custom_medication';

        IF v_catalog_product_id IS NOT NULL THEN
            -- حظر التعارض: لا يمكن الجمع بين دواء مخصص ووجود معرف كتالوج
            IF v_raw_is_custom IS NOT NULL AND v_raw_is_custom::BOOLEAN = TRUE THEN
                RAISE EXCEPTION 'تعارض في البيانات: لا يمكن تعيين دواء مخصص مع وجود معرف كتالوج (البند رقم %)', v_idx;
            END IF;

            -- التحقق من وجود المنتج فعلياً في جدول الأدوية المعتمدة
            IF NOT EXISTS (
                SELECT 1 FROM public.drug_products WHERE id = v_catalog_product_id
            ) THEN
                RAISE EXCEPTION 'منتج الدواء المحدد في الكتالوج غير موجود (البند رقم %)', v_idx;
            END IF;

            v_is_custom := FALSE;
        ELSE
            -- إذا لم يُحدَّد معرف كتالوج، يعتبر الدواء مدخلاً مخصصاً/يدوياً
            v_is_custom := TRUE;
            v_catalog_product_id := NULL;
        END IF;

        -- توحيد ومواءمة الشكل الدوائي مع نوع dosage_form_type
        v_dosage_form_norm := CASE 
            WHEN v_dosage_form IN ('tablets', 'tablet') THEN 'tablets'
            WHEN v_dosage_form IN ('capsules', 'capsule') THEN 'capsules'
            WHEN v_dosage_form IN ('injections', 'injection') THEN 'injections'
            WHEN v_dosage_form IN ('ointment_cream', 'cream', 'ointment', 'gel', 'lotion') THEN 'ointment_cream'
            WHEN v_dosage_form IN ('inhaler_spray', 'spray', 'inhaler', 'aerosol') THEN 'inhaler_spray'
            WHEN v_dosage_form IN ('syrup', 'suspension', 'solution') THEN 'syrup'
            WHEN v_dosage_form IN ('drops', 'drop') THEN 'drops'
            WHEN v_dosage_form IN ('suppository') THEN 'suppository'
            WHEN v_dosage_form IN ('other') THEN 'other'
            ELSE v_dosage_form
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
            v_med_name,
            NULLIF(TRIM(v_item->>'active_ingredient'), ''),
            NULLIF(TRIM(v_item->>'strength'), ''),
            v_dosage_form_norm::public.dosage_form_type,
            NULLIF(TRIM(v_item->>'dose'), ''),
            NULLIF(TRIM(v_item->>'route'), ''),
            v_freq,
            v_dur,
            NULLIF(TRIM(v_item->>'quantity'), ''),
            NULLIF(TRIM(v_item->>'instructions'), ''),
            COALESCE((v_item->>'display_order')::INT, v_idx),
            NOW(),
            NOW()
        );
    END LOOP;

    -- 9. عند الإصدار النهائي فقط: اعتماد الوصفة وتحديث كتالوج العيادة وعداد الاستخدام ذرياً
    IF p_action = 'issue' THEN
        UPDATE public.prescriptions
        SET 
            status = 'issued'::public.prescription_status_type,
            issued_at = NOW(),
            updated_at = NOW()
        WHERE id = v_prescription_id;

        -- إضافة المنتجات المختارة من الكتالوج إلى clinic_drug_catalog عند الطلب
        -- وتحديث عداد الاستخدام (usage_count) ذرّياً دون احتساب المنتج أكثر من مرة في الإصدار الواحد
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

    RETURN v_prescription_id;
END;
$$;

-- منح الصلاحيات لدالة الحفظ والإصدار
REVOKE ALL ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT) TO authenticated;

COMMIT;

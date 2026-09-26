-- ==============================================================================
-- Migration: Optimize Drug Product Search (00014_optimize_drug_product_search.sql)
-- Description:
--   إصلاح جذري لمشكلة timeout (PostgREST error 57014) في دالة البحث:
--   1. إضافة فهارس ثلاثية المقاطع (GIN Trigram) مفقودة على brand_name و alias_name.
--   2. إعادة هيكلة دالة public.search_drug_products لتعتمد على استراتيجية
--      (Candidate-First & Aggregation-After-Limit) مع دمج UNION ALL مفهرس:
--      - تجميع معرّفات المنتجات المرشحة أولاً وتحديد أفضل أولوية مطابقة.
--      - تطبيق الترتيب والحد (LIMIT) على المنتجات المرشحة فقط.
--      - تجميع المواد الفعالة والتراكيز فقط للمنتجات الفائزة (بحد أقصى 20 صف).
--      - التخلص النهائي من الاستعلامات التابعة (Correlated Subqueries)
--        والمسح الكامل لقاعدة البيانات عند كل حرف بحث.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. التأكد من توفر ملحق pg_trgm وفهارس البحث السريع
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- فهرس GIN ثلاثي المقاطع على brand_name في جدول المنتجات لتسريع البحث بالاسم التجاري
CREATE INDEX IF NOT EXISTS idx_drug_products_brand_trgm 
    ON public.drug_products USING gin (brand_name gin_trgm_ops);

-- فهرس GIN ثلاثي المقاطع على alias_name في جدول المرادفات لتسريع البحث بالأسماء والبدائل المحلية
CREATE INDEX IF NOT EXISTS idx_drug_aliases_name_trgm 
    ON public.drug_aliases USING gin (alias_name gin_trgm_ops);

-- ------------------------------------------------------------------------------
-- 2. إعادة تعريف دالة البحث الآمنة المحسنة للأداء (public.search_drug_products)
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

    -- ج) تهيئة نسخة escaped لمعاملة %, _, \ كأحرف عادية وليست Wildcards
    v_escaped_query := replace(replace(replace(v_clean_query, '\', '\\'), '%', '\%'), '_', '\_');

    -- د) ضبط عدد النتائج بحد أقصى 20 وافتراضي 10 وحد أدنى 1
    v_safe_limit := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 20);

    v_exact_term := LOWER(v_clean_query);
    v_prefix_term := v_escaped_query || '%';
    v_partial_term := '%' || v_escaped_query || '%';

    -- هـ) استرجاع النتائج عبر استراتيجية المرشحين أولاً والتجميع بعد تحديد النخبة
    -- بدون كتابة أو تعديل على أي جدول إطلاقاً وبأداء فائق
    RETURN QUERY
    WITH candidates AS (
        -- 1. المطابقة المباشرة في جدول المنتجات الدوائية (display_name, generic_name, brand_name)
        SELECT 
            dp.id AS product_id,
            CASE 
                WHEN LOWER(dp.display_name) = v_exact_term
                  OR LOWER(dp.generic_name) = v_exact_term
                  OR LOWER(COALESCE(dp.brand_name, '')) = v_exact_term
                THEN 1
                WHEN dp.display_name ILIKE v_prefix_term ESCAPE '\'
                  OR dp.generic_name ILIKE v_prefix_term ESCAPE '\'
                  OR dp.brand_name ILIKE v_prefix_term ESCAPE '\'
                THEN 2
                ELSE 3
            END AS match_priority
        FROM public.drug_products dp
        WHERE dp.status IN ('cached', 'locally_added')
          AND (
              dp.display_name ILIKE v_partial_term ESCAPE '\'
              OR dp.generic_name ILIKE v_partial_term ESCAPE '\'
              OR dp.brand_name ILIKE v_partial_term ESCAPE '\'
          )

        UNION ALL

        -- 2. المطابقة عبر مرادفات المنتجات المباشرة (product_id في drug_aliases)
        SELECT 
            da.product_id,
            CASE 
                WHEN LOWER(da.alias_name) = v_exact_term THEN 1
                WHEN da.alias_name ILIKE v_prefix_term ESCAPE '\' THEN 2
                ELSE 3
            END AS match_priority
        FROM public.drug_aliases da
        JOIN public.drug_products dp ON dp.id = da.product_id
        WHERE da.product_id IS NOT NULL
          AND da.is_active = TRUE
          AND dp.status IN ('cached', 'locally_added')
          AND da.alias_name ILIKE v_partial_term ESCAPE '\'

        UNION ALL

        -- 3. المطابقة عبر مرادفات المواد الفعالة المرتبطة بالمنتج (ingredient_id في drug_aliases)
        SELECT 
            dpi.product_id,
            CASE 
                WHEN LOWER(da.alias_name) = v_exact_term THEN 1
                WHEN da.alias_name ILIKE v_prefix_term ESCAPE '\' THEN 2
                ELSE 3
            END AS match_priority
        FROM public.drug_aliases da
        JOIN public.drug_product_ingredients dpi ON dpi.ingredient_id = da.ingredient_id
        JOIN public.drug_products dp ON dp.id = dpi.product_id
        WHERE da.ingredient_id IS NOT NULL
          AND da.is_active = TRUE
          AND dp.status IN ('cached', 'locally_added')
          AND da.alias_name ILIKE v_partial_term ESCAPE '\'
    ),
    ranked_candidates AS (
        -- دمج المرشحين واختيار أعلى درجة مطابقة لكل منتج
        SELECT 
            c.product_id,
            MIN(c.match_priority) AS best_priority
        FROM candidates c
        GROUP BY c.product_id
    ),
    top_products AS (
        -- ترتيب وتحديد المنتجات الفائزة فقط بحد أقصى v_safe_limit قبل إجراء أي تجميع
        SELECT 
            dp.id AS product_id,
            dp.source_identifier,
            dp.display_name,
            dp.generic_name,
            dp.brand_name,
            dp.dosage_form,
            dp.route,
            rc.best_priority
        FROM ranked_candidates rc
        JOIN public.drug_products dp ON dp.id = rc.product_id
        ORDER BY 
            rc.best_priority ASC,
            LENGTH(dp.display_name) ASC,
            dp.display_name ASC
        LIMIT v_safe_limit
    ),
    top_ingredients_agg AS (
        -- تجميع المواد الفعالة والتراكيز للمنتجات الفائزة فقط (أقصاها 20 منتجاً)
        -- مع الحفاظ التام على ترتيب display_order والاقتران الموضعي الدقيق (N/A)
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
        FROM top_products tp
        JOIN public.drug_product_ingredients dpi ON dpi.product_id = tp.product_id
        JOIN public.drug_ingredients di ON di.id = dpi.ingredient_id
        GROUP BY dpi.product_id
    )
    SELECT 
        tp.product_id,
        tp.source_identifier,
        tp.display_name,
        tp.generic_name,
        tp.brand_name,
        tp.dosage_form,
        tp.route,
        COALESCE(tia.agg_active_ingredient, tp.generic_name) AS active_ingredient,
        tia.agg_strength AS strength
    FROM top_products tp
    LEFT JOIN top_ingredients_agg tia ON tia.product_id = tp.product_id
    ORDER BY 
        tp.best_priority ASC,
        LENGTH(tp.display_name) ASC,
        tp.display_name ASC;
END;
$$;

-- حجب الصلاحيات عن العامة والمجهولين، ومنحها حصرياً للمستخدمين المصادقين
REVOKE ALL ON FUNCTION public.search_drug_products(TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_drug_products(TEXT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_drug_products(TEXT, INT) TO authenticated;

COMMIT;

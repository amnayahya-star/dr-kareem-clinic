-- ==============================================================================
-- Migration: Medication Knowledge Base & On-Demand Catalog (منظومة الأدوية وقاعدة المعرفة المرجعية)
-- Version: 00008_medication_knowledge_base.sql
-- ==============================================================================
-- ⚠️  لم يُطبَّق على Production — مراجعة محلية فقط
-- ==============================================================================
-- ملاحظة: usage_count يبقى 0 في هذه المرحلة.
-- زيادة العداد ستُنفَّذ لاحقاً داخل مسار إصدار الوصفة نفسه (save_electronic_prescription)
-- بعد نجاح حفظ جميع البنود وبطريقة idempotent، لا عبر trigger على prescriptions.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. تمكين الامتدادات المساعدة بأمان
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. الأنواع المخصصة وحالات دورة الحياة (Enums)
-- ------------------------------------------------------------------------------

-- حالة المادة الفعالة
DO $$
BEGIN
    IF to_regtype('public.drug_ingredient_status_type') IS NULL THEN
        CREATE TYPE public.drug_ingredient_status_type AS ENUM ('active', 'obsolete', 'remap');
    END IF;
END $$;

-- حالة المنتج الدوائي
DO $$
BEGIN
    IF to_regtype('public.drug_product_status_type') IS NULL THEN
        CREATE TYPE public.drug_product_status_type AS ENUM ('cached', 'locally_added', 'inactive', 'obsolete');
    END IF;
END $$;

-- حالة الدواء في كتالوج العيادة
DO $$
BEGIN
    IF to_regtype('public.drug_catalog_lifecycle_status_type') IS NULL THEN
        CREATE TYPE public.drug_catalog_lifecycle_status_type AS ENUM ('cached', 'frequently_used', 'locally_added', 'inactive');
    END IF;
END $$;

-- نوع المرادف أو الاسم التجاري/المحلي
DO $$
BEGIN
    IF to_regtype('public.drug_alias_type') IS NULL THEN
        CREATE TYPE public.drug_alias_type AS ENUM ('local_brand', 'arabic_name', 'clinic_nickname', 'synonym');
    END IF;
END $$;

-- حالة عملية المزامنة
DO $$
BEGIN
    IF to_regtype('public.drug_sync_status_type') IS NULL THEN
        CREATE TYPE public.drug_sync_status_type AS ENUM ('running', 'success', 'failed', 'partial');
    END IF;
END $$;

-- نوع عملية المزامنة
DO $$
BEGIN
    IF to_regtype('public.drug_sync_run_type') IS NULL THEN
        CREATE TYPE public.drug_sync_run_type AS ENUM ('jit_resolve', 'monthly_refresh', 'manual_sync');
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. دالة تحديث حقل updated_at تلقائياً
-- لا تحتاج SECURITY DEFINER — هي مجرد دالة قادح بسيطة تعمل بصلاحيات المستدعي
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- لا تُنفَّذ من العميل المباشر — تحجب من الجمهور والأدوار الخارجية
REVOKE EXECUTE ON FUNCTION public.set_updated_at_timestamp() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. جدول المواد الفعالة القياسية (public.drug_ingredients)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drug_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rx_cui VARCHAR(20) UNIQUE, -- المعرف القياسي للمادة من RxNorm
    preferred_name TEXT NOT NULL, -- الاسم القياسي المعتمد (مثال: Acetaminophen, Amoxicillin)
    normalized_name TEXT NOT NULL, -- اسم موحد بالصيغة الصغيرة لتسريع الفهرسة والبحث
    status public.drug_ingredient_status_type NOT NULL DEFAULT 'active',
    source_system VARCHAR(50) NOT NULL DEFAULT 'RxNorm',
    source_identifier VARCHAR(100),
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload_hash TEXT,
    source_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- قيود حجب السلاسل الفارغة أو الفراغات فقط
    CONSTRAINT chk_di_preferred_name_nonempty CHECK (TRIM(preferred_name) != ''),
    CONSTRAINT chk_di_normalized_name_nonempty CHECK (TRIM(normalized_name) != '')
);

CREATE INDEX IF NOT EXISTS idx_drug_ingredients_rxcui ON public.drug_ingredients(rx_cui);
CREATE INDEX IF NOT EXISTS idx_drug_ingredients_norm ON public.drug_ingredients(normalized_name);
CREATE INDEX IF NOT EXISTS idx_drug_ingredients_trgm ON public.drug_ingredients USING gin (normalized_name gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_drug_ingredients_updated_at ON public.drug_ingredients;
CREATE TRIGGER trg_drug_ingredients_updated_at
    BEFORE UPDATE ON public.drug_ingredients
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ------------------------------------------------------------------------------
-- 4. جدول المنتجات والأشكال الصيدلانية (public.drug_products)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drug_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rx_cui VARCHAR(20) UNIQUE, -- RxCUI للمنتج السريري (SCD / SBD)
    brand_name TEXT, -- الاسم التجاري الأمريكي إن وجد (مثل: Tylenol, Augmentin)
    generic_name TEXT NOT NULL, -- الاسم العلمي الكامل للمنتج
    display_name TEXT NOT NULL, -- الاسم المنسق للعرض السريري للطبيب
    dosage_form TEXT NOT NULL, -- الشكل الصيدلاني (Oral Suspension, Syrup, Drops, etc.)
    route TEXT, -- طريق الاستخدام (Oral, Topical, Inhalation, etc.)
    country VARCHAR(10) NOT NULL DEFAULT 'US',
    is_local_product BOOLEAN NOT NULL DEFAULT FALSE,
    status public.drug_product_status_type NOT NULL DEFAULT 'cached',
    source_system VARCHAR(50) NOT NULL DEFAULT 'RxTerms',
    source_identifier VARCHAR(100),
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- قيود حجب السلاسل الفارغة
    CONSTRAINT chk_dp_generic_name_nonempty CHECK (TRIM(generic_name) != ''),
    CONSTRAINT chk_dp_display_name_nonempty CHECK (TRIM(display_name) != ''),
    CONSTRAINT chk_dp_dosage_form_nonempty CHECK (TRIM(dosage_form) != '')
);

CREATE INDEX IF NOT EXISTS idx_drug_products_rxcui ON public.drug_products(rx_cui);
CREATE INDEX IF NOT EXISTS idx_drug_products_status ON public.drug_products(status);
CREATE INDEX IF NOT EXISTS idx_drug_products_display_trgm ON public.drug_products USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_drug_products_generic_trgm ON public.drug_products USING gin (generic_name gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_drug_products_updated_at ON public.drug_products;
CREATE TRIGGER trg_drug_products_updated_at
    BEFORE UPDATE ON public.drug_products
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ------------------------------------------------------------------------------
-- 5. جدول الربط متعدد المواد والتركيز البنيوي (public.drug_product_ingredients)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drug_product_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.drug_products(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES public.drug_ingredients(id) ON DELETE RESTRICT,
    strength_numerator_value NUMERIC(12, 4), -- قيمة البسط (مثال: 250 أو 160)
    strength_numerator_unit VARCHAR(20), -- وحدة البسط (mg, mcg, IU, mL)
    strength_denominator_value NUMERIC(12, 4), -- قيمة المقام (مثال: 5 لـ 5ml، أو 1 لقرص واحد)
    strength_denominator_unit VARCHAR(20), -- وحدة المقام (mL, tablet, actuation, puff)
    display_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_product_ingredient UNIQUE(product_id, ingredient_id),
    CONSTRAINT chk_dpi_display_order CHECK (display_order > 0),
    -- تبقى NULL إذا لم يوفّر المصدر بيانات بنيوية — لا استنباط من display_name
    CONSTRAINT chk_dpi_numerator CHECK (
        (strength_numerator_value IS NULL AND strength_numerator_unit IS NULL)
        OR
        (strength_numerator_value > 0 AND strength_numerator_unit IS NOT NULL AND TRIM(strength_numerator_unit) != '')
    ),
    CONSTRAINT chk_dpi_denominator CHECK (
        (strength_denominator_value IS NULL AND strength_denominator_unit IS NULL)
        OR
        (strength_denominator_value > 0 AND strength_denominator_unit IS NOT NULL AND TRIM(strength_denominator_unit) != '')
    ),
    CONSTRAINT chk_dpi_denom_nonzero CHECK (
        strength_denominator_value IS NULL OR strength_denominator_value > 0
    )
);

CREATE INDEX IF NOT EXISTS idx_dpi_product ON public.drug_product_ingredients(product_id);
CREATE INDEX IF NOT EXISTS idx_dpi_ingredient ON public.drug_product_ingredients(ingredient_id);

-- ------------------------------------------------------------------------------
-- 6. جدول المرادفات والأسماء المحلية والعربية (public.drug_aliases)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drug_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.drug_products(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES public.drug_ingredients(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    alias_type public.drug_alias_type NOT NULL DEFAULT 'local_brand',
    language VARCHAR(10) NOT NULL DEFAULT 'ar',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- قيد صارم: يجب أن يرتبط إما بمنتج فقط أو بمادة فقط، وليس الاثنين معاً
    CONSTRAINT chk_alias_target_exclusivity CHECK (
        (product_id IS NOT NULL AND ingredient_id IS NULL)
        OR
        (product_id IS NULL AND ingredient_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_drug_aliases_norm ON public.drug_aliases(normalized_alias);
CREATE INDEX IF NOT EXISTS idx_drug_aliases_trgm ON public.drug_aliases USING gin (normalized_alias gin_trgm_ops);
-- فهرس مستقل على ingredient_id للبحث بدون product_id
CREATE INDEX IF NOT EXISTS idx_drug_aliases_ingredient ON public.drug_aliases(ingredient_id);
-- uq_alias_product_name يغطي product_id ضمنيًا — لا نضيف فهرسًا عاديًا عليه

-- قيود فريدة مشروطة لمنع تكرار الاسم لنفس الكيان واللغة والنوع
CREATE UNIQUE INDEX IF NOT EXISTS uq_alias_product_name
    ON public.drug_aliases(product_id, normalized_alias, alias_type, language)
    WHERE product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_alias_ingredient_name
    ON public.drug_aliases(ingredient_id, normalized_alias, alias_type, language)
    WHERE ingredient_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 7. جدول النشرات الرسمية (public.drug_labels)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drug_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.drug_products(id) ON DELETE CASCADE,
    dailymed_set_id VARCHAR(50) NOT NULL,
    label_version VARCHAR(20),
    label_url TEXT,
    source_system VARCHAR(50) NOT NULL DEFAULT 'DailyMed',
    source_identifier VARCHAR(100),
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload_hash TEXT,
    published_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_product_dailymed_set_id UNIQUE(product_id, dailymed_set_id)
);

-- فهرس مستقل على dailymed_set_id (للبحث بالـ setID بمعزل عن product_id)
CREATE INDEX IF NOT EXISTS idx_drug_labels_setid ON public.drug_labels(dailymed_set_id);
-- لا نضيف فهرسًا عاديًا على product_id: القيد الفريد uq_product_dailymed_set_id يغطيه

-- ------------------------------------------------------------------------------
-- 8. جدول كتالوج العيادة ودورة الحياة (public.clinic_drug_catalog)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinic_drug_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- product_id UNIQUE ينشئ فهرسًا ضمنيًا — لا نضيف CREATE INDEX مكررًا عليه
    product_id UUID NOT NULL REFERENCES public.drug_products(id) ON DELETE CASCADE UNIQUE,
    lifecycle_status public.drug_catalog_lifecycle_status_type NOT NULL DEFAULT 'cached',
    -- usage_count يبقى 0 في هذه المرحلة — يُحدَّث لاحقاً من داخل save_electronic_prescription
    usage_count INT NOT NULL DEFAULT 0,
    is_starred BOOLEAN NOT NULL DEFAULT FALSE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    clinical_notes TEXT,
    last_prescribed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    last_prescribed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_cdc_usage_count CHECK (usage_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_cdc_status_enabled ON public.clinic_drug_catalog(lifecycle_status, is_enabled);
CREATE INDEX IF NOT EXISTS idx_cdc_usage_desc ON public.clinic_drug_catalog(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_cdc_starred ON public.clinic_drug_catalog(is_starred) WHERE is_starred = TRUE;

DROP TRIGGER IF EXISTS trg_clinic_drug_catalog_updated_at ON public.clinic_drug_catalog;
CREATE TRIGGER trg_clinic_drug_catalog_updated_at
    BEFORE UPDATE ON public.clinic_drug_catalog
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ------------------------------------------------------------------------------
-- 9. جدول سجل عمليات التوثيق والمزامنة (public.drug_sync_runs)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drug_sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_type public.drug_sync_run_type NOT NULL,
    source_system VARCHAR(50) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status public.drug_sync_status_type NOT NULL DEFAULT 'running',
    processed_count INT NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
    cached_count INT NOT NULL DEFAULT 0 CHECK (cached_count >= 0),
    updated_count INT NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
    errors_count INT NOT NULL DEFAULT 0 CHECK (errors_count >= 0),
    error_log TEXT,
    -- لا يمكن أن تنتهي العملية قبل أن تبدأ
    CONSTRAINT chk_sync_run_completed_after_started CHECK (
        completed_at IS NULL OR completed_at >= started_at
    )
);

CREATE INDEX IF NOT EXISTS idx_drug_sync_runs_status ON public.drug_sync_runs(status);
CREATE INDEX IF NOT EXISTS idx_drug_sync_runs_started ON public.drug_sync_runs(started_at DESC);

-- ------------------------------------------------------------------------------
-- 10. ترقية جدول بنود الوصفة الطبية (public.prescription_items) بأمان رجعي
-- ------------------------------------------------------------------------------
ALTER TABLE public.prescription_items
    ADD COLUMN IF NOT EXISTS catalog_product_id UUID REFERENCES public.drug_products(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_custom_medication BOOLEAN NOT NULL DEFAULT FALSE;

-- إضافة القيد التوافقي: إذا كان الدواء مخصصاً يدويّاً فلا يرتبط بالكتالوج
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_prescription_items_custom_catalog'
    ) THEN
        ALTER TABLE public.prescription_items
            ADD CONSTRAINT chk_prescription_items_custom_catalog CHECK (
                (is_custom_medication = TRUE AND catalog_product_id IS NULL)
                OR
                (is_custom_medication = FALSE)
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_prescription_items_catalog_prod ON public.prescription_items(catalog_product_id);

-- ------------------------------------------------------------------------------
-- 11. RPC محدودة الصلاحيات لتعديل حقول الطبيب في كتالوج العيادة
--
-- يحصر التعديل في 3 حقول فقط:
--     - is_starred    (تمييز الدواء)
--     - is_enabled    (تفعيل/تعطيل الدواء في الكتالوج)
--     - clinical_notes (ملاحظات الطبيب السريرية)
--
-- الحقول المحظور تعديلها من العميل مباشرة:
--     product_id, usage_count, lifecycle_status, last_prescribed_by,
--     last_prescribed_at, created_at, updated_at
--
-- ملاحظة هامة حول clinical_notes:
--   يستخدم بارامتر p_clear_notes صريح لتمييز حالتين:
--     - p_clear_notes = FALSE (افتراضي): يُحدَّث clinical_notes بـ COALESCE (لا تغيير إذا NULL)
--     - p_clear_notes = TRUE: يُمسح clinical_notes إلى NULL صراحةً بغض النظر عن p_clinical_notes
--   هذا يتجاوز قيد COALESCE الذي يمنع مسح الملاحظة إلى NULL عبر قيمة NULL عادية
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_clinic_drug_catalog_preferences(
    p_catalog_id     UUID,
    p_is_starred     BOOLEAN DEFAULT NULL,
    p_is_enabled     BOOLEAN DEFAULT NULL,
    p_clinical_notes TEXT    DEFAULT NULL,
    p_clear_notes    BOOLEAN DEFAULT FALSE  -- TRUE لمسح الملاحظة صراحةً إلى NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- يجب أن يكون المستدعي طبيبًا (يُتحقق منه داخل الدالة لا عبر RLS فقط)
    IF NOT public.is_doctor() THEN
        RAISE EXCEPTION 'غير مصرح: هذه الدالة متاحة للأطباء فقط';
    END IF;

    UPDATE public.clinic_drug_catalog
    SET
        is_starred     = COALESCE(p_is_starred,  is_starred),
        is_enabled     = COALESCE(p_is_enabled,  is_enabled),
        -- إذا p_clear_notes = TRUE: يُمسح إلى NULL
        -- إذا p_clear_notes = FALSE: يستخدم COALESCE (لا يتغير إذا كان p_clinical_notes = NULL)
        clinical_notes = CASE
            WHEN p_clear_notes = TRUE THEN NULL
            ELSE COALESCE(p_clinical_notes, clinical_notes)
        END,
        updated_at     = NOW()
    WHERE id = p_catalog_id;
END;
$$;

-- لا يمكن استدعاؤها من المتصفح مباشرة إلا عبر Supabase RPC (authenticated)
-- anon وPUBLIC محجوبان صراحةً
REVOKE EXECUTE ON FUNCTION public.update_clinic_drug_catalog_preferences(UUID, BOOLEAN, BOOLEAN, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_clinic_drug_catalog_preferences(UUID, BOOLEAN, BOOLEAN, TEXT, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------------------------
-- 12. تفعيل أمان مستوى الصفوف (Row Level Security - RLS)
-- ------------------------------------------------------------------------------

ALTER TABLE public.drug_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drug_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drug_product_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drug_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drug_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_drug_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drug_sync_runs ENABLE ROW LEVEL SECURITY;

-- تنظيف السياسات القديمة إن وجدت
DROP POLICY IF EXISTS "Doctor view drug ingredients" ON public.drug_ingredients;
DROP POLICY IF EXISTS "Doctor view drug products" ON public.drug_products;
DROP POLICY IF EXISTS "Doctor view drug product ingredients" ON public.drug_product_ingredients;
DROP POLICY IF EXISTS "Doctor view drug aliases" ON public.drug_aliases;
DROP POLICY IF EXISTS "Doctor view drug labels" ON public.drug_labels;
DROP POLICY IF EXISTS "Doctor view clinic drug catalog" ON public.clinic_drug_catalog;
DROP POLICY IF EXISTS "Doctor update clinic drug catalog" ON public.clinic_drug_catalog;
DROP POLICY IF EXISTS "Doctor view drug sync runs" ON public.drug_sync_runs;

-- منح أذونات القراءة الصريحة للمصادقين (تُطبق RLS بعدها للتصفية)
GRANT SELECT ON public.drug_ingredients TO authenticated;
GRANT SELECT ON public.drug_products TO authenticated;
GRANT SELECT ON public.drug_product_ingredients TO authenticated;
GRANT SELECT ON public.drug_aliases TO authenticated;
GRANT SELECT ON public.drug_labels TO authenticated;
GRANT SELECT ON public.clinic_drug_catalog TO authenticated;
GRANT SELECT ON public.drug_sync_runs TO authenticated;

-- حجب كامل عن anon
REVOKE ALL ON public.drug_ingredients FROM anon;
REVOKE ALL ON public.drug_products FROM anon;
REVOKE ALL ON public.drug_product_ingredients FROM anon;
REVOKE ALL ON public.drug_aliases FROM anon;
REVOKE ALL ON public.drug_labels FROM anon;
REVOKE ALL ON public.clinic_drug_catalog FROM anon;
REVOKE ALL ON public.drug_sync_runs FROM anon;

-- حجب UPDATE المباشر على clinic_drug_catalog من أي دور خارجي
-- التعديل يمر حصرًا عبر update_clinic_drug_catalog_preferences()
REVOKE UPDATE ON public.clinic_drug_catalog FROM authenticated, anon;

-- سياسات RLS:
-- 1. جداول المعرفة المرجعية متاحة للقراءة للطبيب أثناء كتابة الوصفة
CREATE POLICY "Doctor view drug ingredients" ON public.drug_ingredients
    FOR SELECT TO authenticated
    USING (public.is_doctor());

CREATE POLICY "Doctor view drug products" ON public.drug_products
    FOR SELECT TO authenticated
    USING (public.is_doctor());

CREATE POLICY "Doctor view drug product ingredients" ON public.drug_product_ingredients
    FOR SELECT TO authenticated
    USING (public.is_doctor());

CREATE POLICY "Doctor view drug aliases" ON public.drug_aliases
    FOR SELECT TO authenticated
    USING (public.is_doctor());

CREATE POLICY "Doctor view drug labels" ON public.drug_labels
    FOR SELECT TO authenticated
    USING (public.is_doctor());

-- 2. كتالوج العيادة: الطبيب يقرأ جميع السجلات بما فيها المعطلة (ليتمكن من إعادة تفعيلها)
-- تصحيح: أُزيل شرط is_enabled = TRUE الذي كان يمنع الطبيب من رؤية الأدوية المعطلة
CREATE POLICY "Doctor view clinic drug catalog" ON public.clinic_drug_catalog
    FOR SELECT TO authenticated
    USING (public.is_doctor());

-- 3. سياسة UPDATE على كتالوج العيادة (محجوبة من العميل عبر REVOKE أعلاه)
--    تُعرَّف لإكمال دورة RLS — التعديل الفعلي يمر عبر RPC SECURITY DEFINER فقط
CREATE POLICY "Doctor update clinic drug catalog" ON public.clinic_drug_catalog
    FOR UPDATE TO authenticated
    USING (public.is_doctor())
    WITH CHECK (public.is_doctor());

-- 4. سجل المزامنة: يراه الطبيب فقط للمتابعة الفنية
CREATE POLICY "Doctor view drug sync runs" ON public.drug_sync_runs
    FOR SELECT TO authenticated
    USING (public.is_doctor());

COMMIT;

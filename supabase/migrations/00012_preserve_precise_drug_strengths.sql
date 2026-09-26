BEGIN;

-- تحتفظ openFDA أحياناً بتراكيز صغيرة جداً تتجاوز أربع منازل عشرية.
-- NUMERIC غير المقيّد يحفظ القيمة الأصلية دون تقريبها إلى صفر.
ALTER TABLE public.drug_product_ingredients
    ALTER COLUMN strength_numerator_value TYPE NUMERIC
        USING strength_numerator_value::NUMERIC,
    ALTER COLUMN strength_denominator_value TYPE NUMERIC
        USING strength_denominator_value::NUMERIC;

COMMENT ON COLUMN public.drug_product_ingredients.strength_numerator_value IS
    'Exact openFDA strength numerator without fixed decimal-scale rounding.';

COMMENT ON COLUMN public.drug_product_ingredients.strength_denominator_value IS
    'Exact openFDA strength denominator without fixed decimal-scale rounding.';

COMMIT;

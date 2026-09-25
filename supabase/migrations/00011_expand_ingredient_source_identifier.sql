BEGIN;

-- بعض أسماء المواد الفعالة المركبة في openFDA تتجاوز 100 حرف.
-- يحتفظ العمود بالنص الكامل دون اقتطاع حتى تبقى هوية المادة دقيقة.
ALTER TABLE public.drug_ingredients
    ALTER COLUMN source_identifier TYPE TEXT;

COMMENT ON COLUMN public.drug_ingredients.source_identifier IS
    'Source-specific ingredient identifier; TEXT supports long normalized openFDA ingredient names.';

COMMIT;

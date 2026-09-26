import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Migration 00014: Optimize Drug Product Search Contract & Regression Tests', () => {
  const migration0014Path = path.resolve(
    __dirname,
    '../supabase/migrations/00014_optimize_drug_product_search.sql'
  );
  const sql = fs.readFileSync(migration0014Path, 'utf8');

  // ----------------------------------------------------------------------------
  // 1. Transactionality & Extension
  // ----------------------------------------------------------------------------
  describe('1. Transactionality & Trigram Extension', () => {
    it('wraps the entire migration within a safe transaction block', () => {
      expect(sql).toContain('BEGIN;');
      expect(sql.trim().endsWith('COMMIT;')).toBe(true);
    });

    it('ensures pg_trgm extension is created safely', () => {
      expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS "pg_trgm";');
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Performance Indexes (Missing Trigram Indexes)
  // ----------------------------------------------------------------------------
  describe('2. Missing Trigram Indexes for Fast Full-Text / Substring Search', () => {
    it('creates GIN trigram index on drug_products.brand_name without duplicates', () => {
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_drug_products_brand_trgm');
      expect(sql).toContain('ON public.drug_products USING gin (brand_name gin_trgm_ops);');
    });

    it('creates GIN trigram index on drug_aliases.alias_name without duplicates', () => {
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_drug_aliases_name_trgm');
      expect(sql).toContain('ON public.drug_aliases USING gin (alias_name gin_trgm_ops);');
    });
  });

  // ----------------------------------------------------------------------------
  // 3. Security, Authentication & Role Isolation
  // ----------------------------------------------------------------------------
  describe('3. Security & Access Control', () => {
    it('defines search_drug_products as SECURITY DEFINER with search_path = ""', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.search_drug_products(');
      expect(sql).toContain('SECURITY DEFINER');
      expect(sql).toContain("SET search_path = ''");
    });

    it('strictly restricts execution to authenticated doctors using public.is_doctor()', () => {
      expect(sql).toContain('IF auth.uid() IS NULL OR NOT public.is_doctor() THEN');
      expect(sql).toContain(
        "RAISE EXCEPTION 'غير مصرح: البحث في قاعدة بيانات الأدوية متاح للأطباء المصادقين فقط';"
      );
    });

    it('revokes permissions from PUBLIC and anon, and grants only to authenticated', () => {
      expect(sql).toContain('REVOKE ALL ON FUNCTION public.search_drug_products(TEXT, INT) FROM PUBLIC;');
      expect(sql).toContain('REVOKE ALL ON FUNCTION public.search_drug_products(TEXT, INT) FROM anon;');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.search_drug_products(TEXT, INT) TO authenticated;');
    });
  });

  // ----------------------------------------------------------------------------
  // 4. Input Sanitization & Escaping
  // ----------------------------------------------------------------------------
  describe('4. Input Sanitization, Escaping & Bounds', () => {
    it('enforces a minimum length of 2 characters and returns early if shorter', () => {
      expect(sql).toContain("v_clean_query := TRIM(COALESCE(p_query, ''));");
      expect(sql).toContain('IF length(v_clean_query) < 2 THEN');
      expect(sql).toContain('RETURN;');
    });

    it('clamps limit between 1 and 20 with a default of 10', () => {
      expect(sql).toContain('v_safe_limit := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 20);');
    });

    it('escapes %, _, and \\ in search query to treat them as literal characters', () => {
      expect(sql).toContain("replace(replace(replace(v_clean_query, '\\', '\\\\'), '%', '\\%'), '_', '\\_')");
    });

    it('enforces explicit ESCAPE clause on all ILIKE statements', () => {
      expect(sql).toContain("dp.display_name ILIKE v_prefix_term ESCAPE '\\'");
      expect(sql).toContain("dp.generic_name ILIKE v_prefix_term ESCAPE '\\'");
      expect(sql).toContain("dp.brand_name ILIKE v_prefix_term ESCAPE '\\'");
      expect(sql).toContain("da.alias_name ILIKE v_prefix_term ESCAPE '\\'");

      expect(sql).toContain("dp.display_name ILIKE v_partial_term ESCAPE '\\'");
      expect(sql).toContain("dp.generic_name ILIKE v_partial_term ESCAPE '\\'");
      expect(sql).toContain("dp.brand_name ILIKE v_partial_term ESCAPE '\\'");
      expect(sql).toContain("da.alias_name ILIKE v_partial_term ESCAPE '\\'");
    });
  });

  // ----------------------------------------------------------------------------
  // 5. Query Architecture: Candidate-First & Aggregation-After-Limit
  // ----------------------------------------------------------------------------
  describe('5. Structural Performance: Candidate-First & Aggregation-After-Limit', () => {
    it('gathers candidate products first via UNION ALL without pre-aggregating the whole DB', () => {
      expect(sql).toContain('WITH candidates AS (');
      expect(sql).toContain('UNION ALL');
      expect(sql).toContain('ranked_candidates AS (');
      expect(sql).toContain('MIN(c.match_priority) AS best_priority');
      expect(sql).toContain('GROUP BY c.product_id');
    });

    it('limits top matching products BEFORE performing ingredient and strength aggregations', () => {
      const topProductsIdx = sql.indexOf('top_products AS (');
      const limitIdx = sql.indexOf('LIMIT v_safe_limit', topProductsIdx);
      const aggIdx = sql.indexOf('top_ingredients_agg AS (');

      expect(topProductsIdx).toBeGreaterThan(0);
      expect(limitIdx).toBeGreaterThan(topProductsIdx);
      expect(aggIdx).toBeGreaterThan(limitIdx);
    });

    it('aggregates ingredients strictly for the winning top_products (at most 20 rows)', () => {
      expect(sql).toContain('FROM top_products tp');
      expect(sql).toContain('JOIN public.drug_product_ingredients dpi ON dpi.product_id = tp.product_id');
      expect(sql).toContain('JOIN public.drug_ingredients di ON di.id = dpi.ingredient_id');
      expect(sql).toContain('GROUP BY dpi.product_id');
    });

    it('eliminates old O(N*M) correlated subqueries scanning drug_aliases and ingredients per row', () => {
      // The old query had:
      // "EXISTS ( SELECT 1 FROM public.drug_aliases da WHERE (da.product_id = dp.id OR da.ingredient_id IN ( SELECT dpi2.ingredient_id ..."
      expect(sql).not.toContain('da.ingredient_id IN (');
      expect(sql).not.toContain('SELECT dpi2.ingredient_id');
      expect(sql).not.toContain('product_ingredients_agg AS (');
    });
  });

  // ----------------------------------------------------------------------------
  // 6. Ranking Hierarchy & Field Search Coverage
  // ----------------------------------------------------------------------------
  describe('6. Match Ranking Hierarchy & Multi-Source Search', () => {
    it('ranks exact matches (1), prefix matches (2), and partial matches (3)', () => {
      expect(sql).toContain('WHEN LOWER(dp.display_name) = v_exact_term');
      expect(sql).toContain('THEN 1');
      expect(sql).toContain("WHEN dp.display_name ILIKE v_prefix_term ESCAPE '\\'");
      expect(sql).toContain('THEN 2');
      expect(sql).toContain('ELSE 3');
    });

    it('searches display_name, generic_name, brand_name, and alias_name', () => {
      expect(sql).toContain('dp.display_name');
      expect(sql).toContain('dp.generic_name');
      expect(sql).toContain('dp.brand_name');
      expect(sql).toContain('da.alias_name');
    });

    it('supports aliases linked directly to products and aliases linked to ingredients', () => {
      // Branch 2: direct product aliases
      expect(sql).toContain('da.product_id IS NOT NULL');
      // Branch 3: ingredient aliases mapped through drug_product_ingredients
      expect(sql).toContain('da.ingredient_id IS NOT NULL');
      expect(sql).toContain('JOIN public.drug_product_ingredients dpi ON dpi.ingredient_id = da.ingredient_id');
    });

    it('orders final output by best_priority ASC, then name length ASC, then display_name ASC', () => {
      expect(sql).toContain('ORDER BY \n        tp.best_priority ASC,\n        LENGTH(tp.display_name) ASC,\n        tp.display_name ASC;');
    });
  });

  // ----------------------------------------------------------------------------
  // 7. Pure Read-Only Guarantee (No writes or clinic catalog pollution)
  // ----------------------------------------------------------------------------
  describe('7. Pure Read-Only Guarantee', () => {
    it('does not insert into, update, or delete from any table', () => {
      expect(sql).not.toMatch(/INSERT\s+INTO/i);
      expect(sql).not.toMatch(/UPDATE\s+/i);
      expect(sql).not.toMatch(/DELETE\s+FROM/i);
    });

    it('never writes to clinic_drug_catalog', () => {
      expect(sql).not.toContain('clinic_drug_catalog');
    });
  });

  // ----------------------------------------------------------------------------
  // 8. Positional Alignment & N/A Preservation
  // ----------------------------------------------------------------------------
  describe('8. Positional Alignment of Ingredients and Strengths with N/A', () => {
    it('maintains strict display_order for both ingredients and strengths', () => {
      expect(sql).toContain("string_agg(\n                di.preferred_name,\n                ' + ' \n                ORDER BY dpi.display_order ASC\n            )");
      expect(sql).toContain("ORDER BY dpi.display_order ASC\n                    )\n                ELSE NULL\n            END AS agg_strength");
    });

    it('emits N/A when an ingredient in a multi-ingredient product has no strength', () => {
      expect(sql).toContain("ELSE 'N/A'");
    });

    it('falls back to generic_name when product has no aggregated ingredients', () => {
      expect(sql).toContain('COALESCE(tia.agg_active_ingredient, tp.generic_name) AS active_ingredient');
    });
  });
});

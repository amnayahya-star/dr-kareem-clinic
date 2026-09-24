import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  DrugIngredient,
  DrugProduct,
  DrugProductIngredient,
  DrugAlias,
  DrugLabel,
  ClinicDrugCatalog,
  DrugSyncRun,
  DrugSearchResultItem,
} from '../src/types/medications';

describe('Medication Knowledge Base Schema & RLS Contract (Migration 00008)', () => {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/00008_medication_knowledge_base.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  describe('Transaction Safety & Extensions', () => {
    it('wraps entire migration inside a transactional block', () => {
      expect(sql).toContain('BEGIN;');
      expect(sql).toContain('COMMIT;');
    });

    it('enables required PostgreSQL extensions safely', () => {
      expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS "pg_trgm"');
      expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    });
  });

  describe('Custom Enums & Status Domain Constraints', () => {
    it('defines drug_ingredient_status_type with active, obsolete, remap', () => {
      expect(sql).toContain("to_regtype('public.drug_ingredient_status_type')");
      expect(sql).toContain("'active', 'obsolete', 'remap'");
    });

    it('defines drug_product_status_type with cached, locally_added, inactive, obsolete', () => {
      expect(sql).toContain("to_regtype('public.drug_product_status_type')");
      expect(sql).toContain("'cached', 'locally_added', 'inactive', 'obsolete'");
    });

    it('defines drug_catalog_lifecycle_status_type with cached, frequently_used, locally_added, inactive', () => {
      expect(sql).toContain("to_regtype('public.drug_catalog_lifecycle_status_type')");
      expect(sql).toContain("'cached', 'frequently_used', 'locally_added', 'inactive'");
    });

    it('defines drug_alias_type with local_brand, arabic_name, clinic_nickname, synonym', () => {
      expect(sql).toContain("to_regtype('public.drug_alias_type')");
      expect(sql).toContain("'local_brand', 'arabic_name', 'clinic_nickname', 'synonym'");
    });

    it('defines drug_sync_status_type with running, success, failed, partial', () => {
      expect(sql).toContain("to_regtype('public.drug_sync_status_type')");
      expect(sql).toContain("'running', 'success', 'failed', 'partial'");
    });

    it('defines drug_sync_run_type with jit_resolve, monthly_refresh, manual_sync', () => {
      expect(sql).toContain("to_regtype('public.drug_sync_run_type')");
      expect(sql).toContain("'jit_resolve', 'monthly_refresh', 'manual_sync'");
    });
  });

  describe('Core Tables & Strict Constraints', () => {
    it('creates drug_ingredients with provenance fields and RxCUI index', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.drug_ingredients');
      expect(sql).toContain('preferred_name TEXT NOT NULL');
      expect(sql).toContain('normalized_name TEXT NOT NULL');
      expect(sql).toContain('source_system VARCHAR(50)');
      expect(sql).toContain('source_identifier VARCHAR(100)');
      expect(sql).toContain('retrieved_at TIMESTAMPTZ NOT NULL');
      expect(sql).toContain('payload_hash TEXT');
      expect(sql).toContain('idx_drug_ingredients_rxcui');
      expect(sql).toContain('idx_drug_ingredients_norm');
    });

    it('creates drug_products without primary_ingredient_id and with generic/display names', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.drug_products');
      expect(sql).not.toContain('primary_ingredient_id');
      expect(sql).toContain('generic_name TEXT NOT NULL');
      expect(sql).toContain('display_name TEXT NOT NULL');
      expect(sql).toContain('dosage_form TEXT NOT NULL');
      expect(sql).toContain('source_system VARCHAR(50)');
      expect(sql).toContain('source_identifier VARCHAR(100)');
      expect(sql).toContain('retrieved_at TIMESTAMPTZ NOT NULL');
      expect(sql).toContain('payload_hash TEXT');
    });

    it('creates drug_product_ingredients with structural numerator/denominator checks', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.drug_product_ingredients');
      expect(sql).toContain('strength_numerator_value NUMERIC');
      expect(sql).toContain('strength_numerator_unit VARCHAR');
      expect(sql).toContain('strength_denominator_value NUMERIC');
      expect(sql).toContain('strength_denominator_unit VARCHAR');
      expect(sql).toContain('uq_product_ingredient UNIQUE(product_id, ingredient_id)');
      expect(sql).toContain('chk_dpi_display_order CHECK (display_order > 0)');
      expect(sql).toContain('chk_dpi_numerator CHECK');
      expect(sql).toContain('chk_dpi_denominator CHECK');
      expect(sql).toContain('chk_dpi_denom_nonzero CHECK');
    });

    it('creates drug_aliases with strict target exclusivity CHECK (product_id XOR ingredient_id)', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.drug_aliases');
      expect(sql).toContain('chk_alias_target_exclusivity CHECK');
      expect(sql).toContain('(product_id IS NOT NULL AND ingredient_id IS NULL)');
      expect(sql).toContain('(product_id IS NULL AND ingredient_id IS NOT NULL)');
      expect(sql).toContain('uq_alias_product_name');
      expect(sql).toContain('uq_alias_ingredient_name');
    });

    it('creates drug_labels with DailyMed set ID and provenance fields', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.drug_labels');
      expect(sql).toContain('dailymed_set_id VARCHAR(50) NOT NULL');
      expect(sql).toContain('label_version VARCHAR(20)');
      expect(sql).toContain('label_url TEXT');
      expect(sql).toContain('source_system VARCHAR(50)');
      expect(sql).toContain('source_identifier VARCHAR(100)');
      expect(sql).toContain('retrieved_at TIMESTAMPTZ NOT NULL');
      expect(sql).toContain('payload_hash TEXT');
      expect(sql).toContain('uq_product_dailymed_set_id UNIQUE(product_id, dailymed_set_id)');
    });

    it('creates clinic_drug_catalog starting with usage_count = 0 and positive count check', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.clinic_drug_catalog');
      expect(sql).toContain('product_id UUID NOT NULL REFERENCES public.drug_products(id) ON DELETE CASCADE UNIQUE');
      expect(sql).toContain('usage_count INT NOT NULL DEFAULT 0');
      expect(sql).toContain('chk_cdc_usage_count CHECK (usage_count >= 0)');
    });

    it('creates drug_sync_runs with non-negative counter checks', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.drug_sync_runs');
      expect(sql).toContain('processed_count INT NOT NULL DEFAULT 0 CHECK (processed_count >= 0)');
      expect(sql).toContain('cached_count INT NOT NULL DEFAULT 0 CHECK (cached_count >= 0)');
      expect(sql).toContain('updated_count INT NOT NULL DEFAULT 0 CHECK (updated_count >= 0)');
      expect(sql).toContain('errors_count INT NOT NULL DEFAULT 0 CHECK (errors_count >= 0)');
    });
  });

  describe('Prescription Items Backward Compatibility', () => {
    it('extends prescription_items safely with catalog_product_id and is_custom_medication', () => {
      expect(sql).toContain('ALTER TABLE public.prescription_items');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS catalog_product_id UUID REFERENCES public.drug_products(id) ON DELETE SET NULL');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS is_custom_medication BOOLEAN NOT NULL DEFAULT FALSE');
      expect(sql).toContain('chk_prescription_items_custom_catalog');
      expect(sql).toContain('(is_custom_medication = TRUE AND catalog_product_id IS NULL)');
      expect(sql).toContain('(is_custom_medication = FALSE)');
    });

    it('does NOT contain a trigger on prescriptions for usage counting (deferred to Phase B)', () => {
      // عداد الاستخدام مؤجل — لا trigger في هذه المرحلة
      expect(sql).not.toContain('increment_catalog_usage_on_prescription_issue');
      expect(sql).not.toContain('trg_increment_catalog_usage');
      expect(sql).not.toContain('AFTER INSERT OR UPDATE OF status ON public.prescriptions');
    });

    it('usage_count defaults to 0 and has no auto-increment mechanism in this migration', () => {
      expect(sql).toContain('usage_count INT NOT NULL DEFAULT 0');
      // لا دالة تزيد العداد تلقائياً في هذه المرحلة
      expect(sql).not.toContain('usage_count + 1');
    });
  });

  describe('Row Level Security (RLS) & Role Access Policies', () => {
    it('enables RLS on all newly created tables', () => {
      expect(sql).toContain('ALTER TABLE public.drug_ingredients ENABLE ROW LEVEL SECURITY;');
      expect(sql).toContain('ALTER TABLE public.drug_products ENABLE ROW LEVEL SECURITY;');
      expect(sql).toContain('ALTER TABLE public.drug_product_ingredients ENABLE ROW LEVEL SECURITY;');
      expect(sql).toContain('ALTER TABLE public.drug_aliases ENABLE ROW LEVEL SECURITY;');
      expect(sql).toContain('ALTER TABLE public.drug_labels ENABLE ROW LEVEL SECURITY;');
      expect(sql).toContain('ALTER TABLE public.clinic_drug_catalog ENABLE ROW LEVEL SECURITY;');
      expect(sql).toContain('ALTER TABLE public.drug_sync_runs ENABLE ROW LEVEL SECURITY;');
    });

    it('revokes public/anon access and restricts knowledge base access to doctors', () => {
      expect(sql).toContain('REVOKE ALL ON public.drug_ingredients FROM anon;');
      expect(sql).toContain('REVOKE ALL ON public.drug_products FROM anon;');
      expect(sql).toContain('REVOKE ALL ON public.clinic_drug_catalog FROM anon;');
      expect(sql).toContain('"Doctor view drug ingredients"');
      expect(sql).toContain('"Doctor view drug products"');
      expect(sql).toContain('"Doctor view clinic drug catalog"');
      expect(sql).toContain('"Doctor update clinic drug catalog"');
    });

    it('doctor SELECT policy on clinic_drug_catalog does NOT filter is_enabled (doctor must see disabled drugs)', () => {
      const doctorViewPolicy = sql.match(
        /CREATE POLICY "Doctor view clinic drug catalog"[\s\S]*?USING \(([^)]+)\)/
      );
      expect(doctorViewPolicy).not.toBeNull();
      expect(doctorViewPolicy![1]).not.toContain('is_enabled');
    });

    it('blocks direct UPDATE on clinic_drug_catalog from authenticated and anon roles', () => {
      expect(sql).toContain('REVOKE UPDATE ON public.clinic_drug_catalog FROM authenticated, anon;');
    });

    it('provides SECURITY DEFINER RPC for column-limited catalog preference updates', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.update_clinic_drug_catalog_preferences(');
      expect(sql).toContain('p_is_starred');
      expect(sql).toContain('p_is_enabled');
      expect(sql).toContain('p_clinical_notes');
      // يجب التحقق من دور الطبيب داخل الدالة
      expect(sql).toContain('IF NOT public.is_doctor() THEN');
    });

    it('RPC has p_clear_notes parameter to explicitly clear clinical_notes to NULL (bypasses COALESCE limitation)', () => {
      // p_clear_notes يتجاوز قيد COALESCE ويسمح بمسح الملاحظة صراحةً إلى NULL
      expect(sql).toContain('p_clear_notes    BOOLEAN DEFAULT FALSE');
      expect(sql).toContain('WHEN p_clear_notes = TRUE THEN NULL');
    });

    it('revokes EXECUTE on internal set_updated_at_timestamp from PUBLIC, anon, authenticated', () => {
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.set_updated_at_timestamp() FROM PUBLIC, anon, authenticated;'
      );
    });
  });

  describe('Constraints & Data Integrity', () => {
    it('adds TRIM CHECK constraints on drug_ingredients text fields', () => {
      expect(sql).toContain("chk_di_preferred_name_nonempty CHECK (TRIM(preferred_name) != '')");
      expect(sql).toContain("chk_di_normalized_name_nonempty CHECK (TRIM(normalized_name) != '')");
    });

    it('adds TRIM CHECK constraints on drug_products text fields', () => {
      expect(sql).toContain("chk_dp_generic_name_nonempty CHECK (TRIM(generic_name) != '')");
      expect(sql).toContain("chk_dp_display_name_nonempty CHECK (TRIM(display_name) != '')");
      expect(sql).toContain("chk_dp_dosage_form_nonempty CHECK (TRIM(dosage_form) != '')");
    });

    it('adds completed_at >= started_at constraint on drug_sync_runs', () => {
      expect(sql).toContain('chk_sync_run_completed_after_started CHECK');
      expect(sql).toContain('completed_at IS NULL OR completed_at >= started_at');
    });

    it('does not add redundant plain index on product_id for clinic_drug_catalog (UNIQUE already creates one)', () => {
      expect(sql).not.toMatch(/CREATE INDEX IF NOT EXISTS idx_cdc_product_id/);
      expect(sql).toContain('product_id UUID NOT NULL REFERENCES public.drug_products(id) ON DELETE CASCADE UNIQUE');
    });

    it('set_updated_at_timestamp is NOT SECURITY DEFINER (plain trigger utility)', () => {
      const funcBlock = sql.match(
        /CREATE OR REPLACE FUNCTION public\.set_updated_at_timestamp\(\)[\s\S]*?END;\n\$\$/
      );
      expect(funcBlock).not.toBeNull();
      expect(funcBlock![0]).not.toContain('SECURITY DEFINER');
    });
  });
});

describe('TypeScript Medication Types & Contracts', () => {
  it('satisfies DrugIngredient model with provenance tracking', () => {
    const ingredient: DrugIngredient = {
      id: 'ing-1',
      rx_cui: '7052',
      preferred_name: 'Acetaminophen',
      normalized_name: 'acetaminophen',
      status: 'active',
      source_system: 'RxNorm',
      source_identifier: '7052',
      retrieved_at: '2026-09-23T20:00:00Z',
      payload_hash: 'hash-123',
      source_updated_at: '2026-09-01T00:00:00Z',
      created_at: '2026-09-23T20:00:00Z',
      updated_at: '2026-09-23T20:00:00Z',
    };

    expect(ingredient.preferred_name).toBe('Acetaminophen');
    expect(ingredient.status).toBe('active');
  });

  it('satisfies DrugProduct and DrugProductIngredient multi-component representations', () => {
    const product: DrugProduct = {
      id: 'prod-1',
      rx_cui: '218258',
      brand_name: 'Tylenol Infants',
      generic_name: 'Acetaminophen 160 MG in 5 ML Oral Suspension',
      display_name: 'Acetaminophen 160 MG / 5 ML Oral Suspension (Tylenol Infants)',
      dosage_form: 'Oral Suspension',
      route: 'Oral',
      country: 'US',
      is_local_product: false,
      status: 'cached',
      source_system: 'RxTerms',
      source_identifier: '218258',
      retrieved_at: '2026-09-23T20:00:00Z',
      payload_hash: 'hash-abc',
      created_at: '2026-09-23T20:00:00Z',
      updated_at: '2026-09-23T20:00:00Z',
    };

    const productIngredient: DrugProductIngredient = {
      id: 'dpi-1',
      product_id: 'prod-1',
      ingredient_id: 'ing-1',
      strength_numerator_value: 160,
      strength_numerator_unit: 'mg',
      strength_denominator_value: 5,
      strength_denominator_unit: 'mL',
      display_order: 1,
      created_at: '2026-09-23T20:00:00Z',
    };

    expect(product.generic_name).toContain('Acetaminophen');
    expect(productIngredient.strength_numerator_value).toBe(160);
    expect(productIngredient.strength_denominator_value).toBe(5);
  });

  it('satisfies DrugAlias and ClinicDrugCatalog models', () => {
    const alias: DrugAlias = {
      id: 'alias-1',
      product_id: 'prod-1',
      ingredient_id: null,
      alias_name: 'بنادول رضع',
      normalized_alias: 'بنادول رضع',
      alias_type: 'local_brand',
      language: 'ar',
      is_active: true,
      created_at: '2026-09-23T20:00:00Z',
    };

    const catalog: ClinicDrugCatalog = {
      id: 'cdc-1',
      product_id: 'prod-1',
      lifecycle_status: 'cached',
      usage_count: 0,
      is_starred: false,
      is_enabled: true,
      clinical_notes: 'آمن للرضع بعد عمر شهرين',
      created_at: '2026-09-23T20:00:00Z',
      updated_at: '2026-09-23T20:00:00Z',
    };

    expect(alias.language).toBe('ar');
    expect(catalog.usage_count).toBe(0);
  });

  it('satisfies DrugSearchResultItem for doctor interface', () => {
    const searchResult: DrugSearchResultItem = {
      source: 'rxterms_external',
      rx_cui: '218258',
      brand_name: 'Tylenol',
      generic_name: 'Acetaminophen 160 MG / 5 ML Oral Suspension',
      display_name: 'Acetaminophen 160 MG / 5 ML Oral Suspension [Tylenol]',
      dosage_form: 'Oral Suspension',
      route: 'Oral',
      active_ingredients: [
        {
          name: 'Acetaminophen',
          rx_cui: '7052',
          strength_numerator_value: 160,
          strength_numerator_unit: 'mg',
          strength_denominator_value: 5,
          strength_denominator_unit: 'mL',
        },
      ],
      is_local_product: false,
      is_cached: false,
      dailymed_set_id: 'a9b2c3d4-e5f6-7890-1234-56789abcdef0',
    };

    expect(searchResult.source).toBe('rxterms_external');
    expect(searchResult.active_ingredients[0].strength_numerator_value).toBe(160);
  });
});

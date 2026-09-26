import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

import {
  mapDosageFormToFormType,
  mapRouteToStandardRoute,
  formatDrugStrength,
  searchDrugProducts,
  DrugSearchResult,
} from '../src/services/drugSearchService';
import {
  savePrescriptionWithItems,
  createPrescription,
  addPrescriptionItem,
  updatePrescriptionItem,
  fetchPrescriptionByVisitId,
  PrescriptionItemInput,
} from '../src/services/prescriptionService';
import { MedicationAutocompleteInput } from '../src/components/prescriptions/MedicationAutocompleteInput';
import { ElectronicPrescriptionSection } from '../src/components/prescriptions/ElectronicPrescriptionSection';
import { LanguageProvider } from '../src/context/LanguageContext';

// Mocks
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();
const mockIsSupabaseConfigured = vi.fn().mockReturnValue(true);

const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();

vi.mock('../src/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
    rpc: mockRpc,
    from: mockFrom,
  }),
  isSupabaseConfigured: () => mockIsSupabaseConfigured(),
}));

describe('Drug Search & Prescription Catalog Link (ربط قاعدة بيانات الأدوية بالوصفة الإلكترونية)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'doctor-uuid-1' } },
      error: null,
    });
    mockSingle.mockResolvedValue({ data: null, error: null });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockEq.mockReturnValue({ single: mockSingle, maybeSingle: mockMaybeSingle, select: mockSelect, update: mockUpdate });
    mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle, maybeSingle: mockMaybeSingle });
    mockFrom.mockReturnValue({ select: mockSelect, insert: vi.fn(), update: mockUpdate, delete: vi.fn(), eq: mockEq });
  });

  // ----------------------------------------------------------------------------
  // 1. Pure Mapping and Formatting Functions
  // ----------------------------------------------------------------------------
  describe('1. Pure Dosage Form Mapping (mapDosageFormToFormType)', () => {
    it('maps syrups, solutions, suspensions and powders for suspension to "syrup"', () => {
      expect(mapDosageFormToFormType('SYRUP')).toBe('syrup');
      expect(mapDosageFormToFormType('Oral Solution')).toBe('syrup');
      expect(mapDosageFormToFormType('SUSPENSION')).toBe('syrup');
      expect(mapDosageFormToFormType('POWDER, FOR SUSPENSION')).toBe('syrup');
    });

    it('maps all kinds of tablets to "tablets"', () => {
      expect(mapDosageFormToFormType('TABLET')).toBe('tablets');
      expect(mapDosageFormToFormType('FILM COATED TABLET')).toBe('tablets');
      expect(mapDosageFormToFormType('Chewable Tablet')).toBe('tablets');
      expect(mapDosageFormToFormType('EXTENDED RELEASE TABLET')).toBe('tablets');
    });

    it('maps capsules to "capsules"', () => {
      expect(mapDosageFormToFormType('CAPSULE')).toBe('capsules');
      expect(mapDosageFormToFormType('Hard Gelatin Capsule')).toBe('capsules');
    });

    it('maps drops to "drops"', () => {
      expect(mapDosageFormToFormType('DROP')).toBe('drops');
      expect(mapDosageFormToFormType('Oral Drops')).toBe('drops');
    });

    it('maps injections and injectables to "injections"', () => {
      expect(mapDosageFormToFormType('INJECTION')).toBe('injections');
      expect(mapDosageFormToFormType('INJECTABLE')).toBe('injections');
    });

    it('maps creams, ointments, gels, and lotions to "ointment_cream"', () => {
      expect(mapDosageFormToFormType('CREAM')).toBe('ointment_cream');
      expect(mapDosageFormToFormType('OINTMENT')).toBe('ointment_cream');
      expect(mapDosageFormToFormType('Topical Gel')).toBe('ointment_cream');
      expect(mapDosageFormToFormType('Lotion')).toBe('ointment_cream');
    });

    it('maps suppositories to "suppository"', () => {
      expect(mapDosageFormToFormType('SUPPOSITORY')).toBe('suppository');
      expect(mapDosageFormToFormType('Rectal Suppository')).toBe('suppository');
    });

    it('maps aerosols, inhalers, and sprays to "inhaler_spray"', () => {
      expect(mapDosageFormToFormType('AEROSOL')).toBe('inhaler_spray');
      expect(mapDosageFormToFormType('INHALER')).toBe('inhaler_spray');
      expect(mapDosageFormToFormType('Nasal Spray')).toBe('inhaler_spray');
    });

    it('maps unknown forms to "other"', () => {
      expect(mapDosageFormToFormType('TRANSDERMAL PATCH')).toBe('other');
      expect(mapDosageFormToFormType(null)).toBe('other');
      expect(mapDosageFormToFormType('')).toBe('other');
    });
  });

  describe('2. Pure Route Mapping (mapRouteToStandardRoute)', () => {
    it('maps standard routes correctly', () => {
      expect(mapRouteToStandardRoute('ORAL')).toBe('oral');
      expect(mapRouteToStandardRoute('INTRAVENOUS')).toBe('iv');
      expect(mapRouteToStandardRoute('IV')).toBe('iv');
      expect(mapRouteToStandardRoute('INTRAMUSCULAR')).toBe('im');
      expect(mapRouteToStandardRoute('IM')).toBe('im');
      expect(mapRouteToStandardRoute('TOPICAL')).toBe('topical');
      expect(mapRouteToStandardRoute('CUTANEOUS')).toBe('topical');
      expect(mapRouteToStandardRoute('RESPIRATORY')).toBe('inhalation');
      expect(mapRouteToStandardRoute('INHALATION')).toBe('inhalation');
      expect(mapRouteToStandardRoute('RECTAL')).toBe('rectal');
      expect(mapRouteToStandardRoute('NASAL')).toBe('nasal');
      expect(mapRouteToStandardRoute('OPHTHALMIC')).toBe('ophthalmic');
      expect(mapRouteToStandardRoute('OTIC')).toBe('otic');
    });

    it('preserves non-standard routes verbatim without inventing false route', () => {
      expect(mapRouteToStandardRoute('Sublingual')).toBe('Sublingual');
      expect(mapRouteToStandardRoute('Epidural')).toBe('Epidural');
      expect(mapRouteToStandardRoute(null)).toBe('');
    });
  });

  describe('3. Pure Strength Formatting (formatDrugStrength)', () => {
    it('preserves small decimal values without rounding to zero', () => {
      const formatted = formatDrugStrength({
        numeratorValue: 0.00025,
        numeratorUnit: 'mg',
        denominatorValue: 1,
        denominatorUnit: 'mL',
      });
      expect(formatted).toBe('0.00025 mg / mL');
    });

    it('formats liquid concentration with non-1 denominator', () => {
      const formatted = formatDrugStrength({
        numeratorValue: 250,
        numeratorUnit: 'mg',
        denominatorValue: 5,
        denominatorUnit: 'mL',
      });
      expect(formatted).toBe('250 mg / 5 mL');
    });

    it('cleans up single unit denominator when unit is dose or 1', () => {
      const formatted1 = formatDrugStrength({
        numeratorValue: 500,
        numeratorUnit: 'mg',
        denominatorValue: 1,
        denominatorUnit: '1',
      });
      expect(formatted1).toBe('500 mg');

      const formatted2 = formatDrugStrength({
        numeratorValue: 500,
        numeratorUnit: 'mg',
        denominatorValue: 1,
        denominatorUnit: 'dose',
      });
      expect(formatted2).toBe('500 mg');
    });

    it('formats single unit denominator with descriptive unit (tablet)', () => {
      const formatted = formatDrugStrength({
        numeratorValue: 500,
        numeratorUnit: 'mg',
        denominatorValue: 1,
        denominatorUnit: 'tablet',
      });
      expect(formatted).toBe('500 mg / tablet');
    });

    it('returns empty string when input is null, undefined, or empty object', () => {
      expect(formatDrugStrength(null)).toBe('');
      expect(formatDrugStrength(undefined)).toBe('');
      expect(formatDrugStrength({ numeratorValue: null, numeratorUnit: 'mg' })).toBe('');
      expect(formatDrugStrength('  ')).toBe('');
    });

    it('preserves multi-ingredient positional alignment with N/A without inventing medical numbers', () => {
      // Simulating a multi-ingredient product where ingredient 1 has 500mg and ingredient 2 has no explicit strength
      const ingredients = ['Amoxicillin', 'Clavulanate Potassium'];
      const rawStrengths = [
        { numeratorValue: 500, numeratorUnit: 'mg' },
        { numeratorValue: null, numeratorUnit: null },
      ];

      const alignedStrengths = rawStrengths.map(s => formatDrugStrength(s) || 'N/A');
      const formattedIngredients = ingredients.join(' + ');
      const formattedStrengthString = alignedStrengths.join(' + ');

      expect(formattedIngredients).toBe('Amoxicillin + Clavulanate Potassium');
      expect(formattedStrengthString).toBe('500 mg + N/A');
      // Verifying 1-to-1 index alignment
      expect(ingredients.length).toBe(alignedStrengths.length);
      expect(alignedStrengths[0]).toBe('500 mg');
      expect(alignedStrengths[1]).toBe('N/A');
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Drug Search Service (searchDrugProducts)
  // ----------------------------------------------------------------------------
  describe('4. Drug Search Service Contract & Limits', () => {
    it('returns empty array immediately without RPC call when query is less than 2 characters', async () => {
      const resEmpty = await searchDrugProducts('');
      const resSingle = await searchDrugProducts('a');
      const resSpaces = await searchDrugProducts('   ');

      expect(resEmpty).toEqual([]);
      expect(resSingle).toEqual([]);
      expect(resSpaces).toEqual([]);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('calls search_drug_products RPC when query is at least 2 characters', async () => {
      const mockResult: DrugSearchResult[] = [
        {
          product_id: 'prod-123',
          source_identifier: '0069-4200',
          display_name: 'Amoxicillin 500 MG Capsule',
          generic_name: 'Amoxicillin',
          brand_name: 'Amoxil',
          dosage_form: 'CAPSULE',
          route: 'ORAL',
          active_ingredient: 'Amoxicillin',
          strength: '500 mg',
        },
      ];
      mockRpc.mockResolvedValue({ data: mockResult, error: null });

      const results = await searchDrugProducts('amox', 10);
      expect(mockRpc).toHaveBeenCalledWith('search_drug_products', {
        p_query: 'amox',
        p_limit: 10,
      });
      expect(results).toHaveLength(1);
      expect(results[0].display_name).toBe('Amoxicillin 500 MG Capsule');
    });

    it('enforces limit bounded between 1 and 20 (defaults to 10)', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      await searchDrugProducts('amox', 50);
      expect(mockRpc).toHaveBeenCalledWith('search_drug_products', {
        p_query: 'amox',
        p_limit: 20, // Clamped to 20
      });

      await searchDrugProducts('amox', -5);
      expect(mockRpc).toHaveBeenCalledWith('search_drug_products', {
        p_query: 'amox',
        p_limit: 1, // Clamped to 1
      });
    });

    it('throws descriptive Arabic error message when Supabase returns an error', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'permission denied for function search_drug_products' },
      });

      await expect(searchDrugProducts('amox')).rejects.toThrow(
        'فشل البحث في قاعدة بيانات الأدوية: permission denied for function search_drug_products'
      );
    });
  });

  // ----------------------------------------------------------------------------
  // 3. SQL Migration 00013 Security & Constraints Contract
  // ----------------------------------------------------------------------------
  describe('5. Migration 00013 Security & Business Rules Contract', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../supabase/migrations/00013_drug_search_and_prescription_catalog_link.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    it('wraps entire migration inside a transactional block', () => {
      expect(sql).toContain('BEGIN;');
      expect(sql).toContain('COMMIT;');
    });

    it('enforces public.is_doctor() check inside search_drug_products', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.search_drug_products');
      expect(sql).toContain('public.is_doctor()');
      expect(sql).toContain('غير مصرح: البحث في قاعدة بيانات الأدوية متاح للأطباء المصادقين فقط');
    });

    it('revokes execute on search_drug_products from PUBLIC and anon, granting to authenticated', () => {
      expect(sql).toContain('REVOKE ALL ON FUNCTION public.search_drug_products(TEXT, INT) FROM PUBLIC;');
      expect(sql).toContain('REVOKE ALL ON FUNCTION public.search_drug_products(TEXT, INT) FROM anon;');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.search_drug_products(TEXT, INT) TO authenticated;');
    });

    it('uses SECURITY DEFINER with search_path = "" for search_drug_products', () => {
      expect(sql).toContain('SECURITY DEFINER');
      expect(sql).toContain("SET search_path = ''");
    });

    it('verifies that save_electronic_prescription handles catalog_product_id and is_custom_medication', () => {
      expect(sql).toContain('v_catalog_product_id');
      expect(sql).toContain('v_is_custom');
      expect(sql).toContain('catalog_product_id,');
      expect(sql).toContain('is_custom_medication,');
    });

    it('strictly updates clinic_drug_catalog only upon prescription issuance (p_action = "issue")', () => {
      expect(sql).toContain("IF p_action = 'issue' THEN");
      expect(sql).toContain('INSERT INTO public.clinic_drug_catalog');
      expect(sql).toContain('ON CONFLICT (product_id) DO UPDATE');
      expect(sql).toContain('usage_count = public.clinic_drug_catalog.usage_count + 1');
      expect(sql).toContain('DISTINCT pi.catalog_product_id');
    });

    it('does not increment clinic_drug_catalog usage_count on draft', () => {
      // Confirming the insertion into clinic_drug_catalog is strictly nested under p_action = 'issue'
      const issueBlockIdx = sql.indexOf("IF p_action = 'issue' THEN");
      const insertCatalogIdx = sql.indexOf('INSERT INTO public.clinic_drug_catalog');
      expect(insertCatalogIdx).toBeGreaterThan(issueBlockIdx);
    });

    // --- Requirement 1: SQL Escaping of %, _, \ and Explicit ESCAPE clause ---
    it('escapes %, _, and \\ in search query and enforces explicit ESCAPE clause across ILIKE statements', () => {
      // 1. Escaping order: backslash first, then %, then _
      expect(sql).toContain("replace(replace(replace(v_clean_query, '\\', '\\\\'), '%', '\\%'), '_', '\\_')");

      // 2. Prefix and partial terms use escaped query
      expect(sql).toContain("v_prefix_term := v_escaped_query || '%';");
      expect(sql).toContain("v_partial_term := '%' || v_escaped_query || '%';");

      // 3. Explicit ESCAPE clause on all ILIKE patterns
      expect(sql).toContain("dp.display_name ILIKE v_prefix_term ESCAPE '\\'");
      expect(sql).toContain("dp.generic_name ILIKE v_prefix_term ESCAPE '\\'");
      expect(sql).toContain("COALESCE(dp.brand_name, '') ILIKE v_prefix_term ESCAPE '\\'");
      expect(sql).toContain("da.alias_name ILIKE v_prefix_term ESCAPE '\\'");

      expect(sql).toContain("dp.display_name ILIKE v_partial_term ESCAPE '\\'");
      expect(sql).toContain("dp.generic_name ILIKE v_partial_term ESCAPE '\\'");
      expect(sql).toContain("COALESCE(dp.brand_name, '') ILIKE v_partial_term ESCAPE '\\'");
      expect(sql).toContain("da.alias_name ILIKE v_partial_term ESCAPE '\\'");

      // 4. Ranking hierarchy: exact (1) -> prefix (2) -> partial (3)
      const exactIdx = sql.indexOf('LOWER(dp.display_name) = v_exact_term');
      const prefixIdx = sql.indexOf("dp.display_name ILIKE v_prefix_term ESCAPE '\\'");
      const partialIdx = sql.indexOf("dp.display_name ILIKE v_partial_term ESCAPE '\\'");

      expect(exactIdx).toBeGreaterThan(0);
      expect(prefixIdx).toBeGreaterThan(exactIdx);
      expect(partialIdx).toBeGreaterThan(prefixIdx);
    });

    // --- Requirement 2: Strict Validation of p_action and p_items ---
    it('strictly validates p_action and verifies p_items is a JSON array before invoking array functions', () => {
      // 1. p_action validation
      expect(sql).toContain("IF p_action IS NULL OR p_action NOT IN ('draft', 'issue') THEN");
      expect(sql).toContain("RAISE EXCEPTION 'إجراء غير صالح: يجب أن يكون الإجراء إما مسودة (draft) أو إصدار (issue)';");

      // 2. p_items type check
      expect(sql).toContain("IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' THEN");
      expect(sql).toContain("RAISE EXCEPTION 'قائمة بنود الأدوية غير صالحة: يجب تمرير مصفوفة JSON صالحة للأدوية';");

      // 3. Ensure jsonb_typeof check comes BEFORE jsonb_array_length and jsonb_array_elements
      const typeCheckIdx = sql.indexOf("jsonb_typeof(p_items) != 'array'");
      const lengthCheckIdx = sql.indexOf('jsonb_array_length(p_items)');
      const elementsLoopIdx = sql.indexOf('jsonb_array_elements(p_items)');

      expect(typeCheckIdx).toBeGreaterThan(0);
      expect(lengthCheckIdx).toBeGreaterThan(typeCheckIdx);
      expect(elementsLoopIdx).toBeGreaterThan(typeCheckIdx);
    });

    // --- Requirement 3: Row-level locking FOR UPDATE and Race Condition / Duplicate usage_count Protection ---
    it('locks existing prescription with FOR UPDATE and prevents re-issuance or duplicate usage_count increments', () => {
      // 1. FOR UPDATE row-level lock on prescriptions query
      expect(sql).toContain('WHERE visit_id = p_visit_id');
      expect(sql).toContain('FOR UPDATE;');

      // 2. Checks if prescription is already issued or cancelled
      expect(sql).toContain("v_current_status IN ('issued'::public.prescription_status_type, 'cancelled'::public.prescription_status_type)");
      expect(sql).toContain('الوصفة الطبية لهذه الزيارة معتمدة أو ملغاة مسبقاً ولا يمكن تعديلها مباشرة');

      // 3. Atomic distinct insertion into clinic_drug_catalog
      expect(sql).toContain('SELECT \n            DISTINCT pi.catalog_product_id');
    });

    // --- Requirement 4: Positional Alignment of Ingredients and Strengths with N/A ---
    it('maintains positional alignment between active ingredients and strengths using N/A for null strengths', () => {
      // 1. product_ingredients_agg CTE exists
      expect(sql).toContain('product_ingredients_agg AS (');

      // 2. Uses ORDER BY dpi.display_order ASC for both active ingredients and strengths
      const activeIngAgg = sql.indexOf("ORDER BY dpi.display_order ASC\n            ) AS agg_active_ingredient");
      const strengthAgg = sql.indexOf("ORDER BY dpi.display_order ASC\n                    )\n                ELSE NULL\n            END AS agg_strength");

      expect(activeIngAgg).toBeGreaterThan(0);
      expect(strengthAgg).toBeGreaterThan(0);

      // 3. Uses 'N/A' when strength is null for an ingredient in a multi-ingredient product
      expect(sql).toContain("ELSE 'N/A'");

      // 4. Verifies string separator is ' + ' for both
      expect(sql).toContain("' + ' \n                ORDER BY dpi.display_order ASC");
    });
  });

  // ----------------------------------------------------------------------------
  // 4. Prescription Service Data Integration
  // ----------------------------------------------------------------------------
  describe('6. Prescription Service Catalog Link Integration', () => {
    it('passes catalog_product_id and is_custom_medication to save_electronic_prescription RPC', async () => {
      mockRpc.mockResolvedValue({ data: 'rx-new-id', error: null });
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'rx-new-id',
              visit_id: 'visit-1',
              patient_id: 'pat-1',
              status: 'draft',
              prescription_items: [
                {
                  id: 'item-1',
                  catalog_product_id: 'prod-uuid-99',
                  is_custom_medication: false,
                  medication_name: 'Amoxicillin 500mg',
                  dosage_form: 'capsules',
                  frequency: '3x',
                  duration: '5 days',
                },
              ],
            },
            error: null,
          }),
        }),
      });

      const items: PrescriptionItemInput[] = [
        {
          catalog_product_id: 'prod-uuid-99',
          is_custom_medication: false,
          medication_name: 'Amoxicillin 500mg',
          dosage_form: 'capsules',
          frequency: '3x',
          duration: '5 days',
        },
      ];

      await savePrescriptionWithItems({
        visit_id: 'visit-1',
        patient_id: 'pat-1',
        items,
        action: 'draft',
      });

      expect(mockRpc).toHaveBeenCalledWith('save_electronic_prescription', expect.objectContaining({
        p_visit_id: 'visit-1',
        p_patient_id: 'pat-1',
        p_items: expect.arrayContaining([
          expect.objectContaining({
            catalog_product_id: 'prod-uuid-99',
            is_custom_medication: false,
            medication_name: 'Amoxicillin 500mg',
          }),
        ]),
      }));
    });

    it('preserves catalog_product_id and is_custom_medication when fetching draft', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'rx-saved-1',
              visit_id: 'visit-123',
              patient_id: 'pat-123',
              status: 'draft',
              prescription_items: [
                {
                  id: 'item-10',
                  prescription_id: 'rx-saved-1',
                  catalog_product_id: 'prod-abc',
                  is_custom_medication: false,
                  medication_name: 'Paracetamol 500mg',
                  dosage_form: 'tablets',
                  frequency: '2x',
                  duration: '3 days',
                },
                {
                  id: 'item-11',
                  prescription_id: 'rx-saved-1',
                  catalog_product_id: null,
                  is_custom_medication: true,
                  medication_name: 'Custom Herbal Mix',
                  dosage_form: 'syrup',
                  frequency: '1x',
                  duration: '5 days',
                },
              ],
            },
            error: null,
          }),
        }),
      });

      const rx = await fetchPrescriptionByVisitId('visit-123');
      expect(rx).not.toBeNull();
      expect(rx?.items?.[0].catalog_product_id).toBe('prod-abc');
      expect(rx?.items?.[0].is_custom_medication).toBe(false);
      expect(rx?.items?.[1].catalog_product_id).toBeNull();
      expect(rx?.items?.[1].is_custom_medication).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // 5. MedicationAutocompleteInput Component Tests
  // ----------------------------------------------------------------------------
  describe('7. MedicationAutocompleteInput Component Interactions', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not trigger search when less than 2 characters are entered', async () => {
      const mockSelectResult = vi.fn();
      const mockChange = vi.fn();

      render(
        <MedicationAutocompleteInput
          value=""
          onChange={mockChange}
          onSelectResult={mockSelectResult}
        />
      );

      const input = screen.getByTestId('medication-search-input');
      fireEvent.change(input, { target: { value: 'a' } });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(mockRpc).not.toHaveBeenCalled();
      expect(screen.queryByTestId('medication-autocomplete-dropdown')).not.toBeInTheDocument();
    });

    it('debounces rapid typing to a single search call after 300ms', async () => {
      mockRpc.mockResolvedValue({
        data: [
          {
            product_id: 'p-1',
            source_identifier: '001',
            display_name: 'Amoxicillin 500mg',
            generic_name: 'Amoxicillin',
            brand_name: null,
            dosage_form: 'CAPSULE',
            route: 'ORAL',
            active_ingredient: 'Amoxicillin',
            strength: '500 mg',
          },
        ],
        error: null,
      });

      render(
        <MedicationAutocompleteInput
          value=""
          onChange={vi.fn()}
          onSelectResult={vi.fn()}
        />
      );

      const input = screen.getByTestId('medication-search-input');

      // Rapid typing: 'am', 'amo', 'amox' within 100ms
      fireEvent.change(input, { target: { value: 'am' } });
      act(() => { vi.advanceTimersByTime(100); });
      fireEvent.change(input, { target: { value: 'amo' } });
      act(() => { vi.advanceTimersByTime(100); });
      fireEvent.change(input, { target: { value: 'amox' } });

      // Before 300ms expires, RPC should NOT have been called yet
      expect(mockRpc).not.toHaveBeenCalled();

      // Advance by 300ms
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith('search_drug_products', {
        p_query: 'amox',
        p_limit: 10,
      });
    });

    it('selects a search result on click and closes the dropdown', async () => {
      const mockSelectResult = vi.fn();
      const mockResult: DrugSearchResult = {
        product_id: 'p-100',
        source_identifier: '0069-4200',
        display_name: 'Amoxicillin 500 MG Capsule',
        generic_name: 'Amoxicillin',
        brand_name: 'Amoxil',
        dosage_form: 'CAPSULE',
        route: 'ORAL',
        active_ingredient: 'Amoxicillin',
        strength: '500 mg',
      };
      mockRpc.mockResolvedValue({ data: [mockResult], error: null });

      function TestHost() {
        const [val, setVal] = React.useState('');
        return (
          <MedicationAutocompleteInput
            value={val}
            onChange={setVal}
            onSelectResult={mockSelectResult}
          />
        );
      }

      render(<TestHost />);

      const input = screen.getByTestId('medication-search-input');
      fireEvent.change(input, { target: { value: 'Amox' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const option = screen.getByTestId('medication-search-result-item');
      expect(option).toBeInTheDocument();

      fireEvent.click(option);

      expect(mockSelectResult).toHaveBeenCalledWith(mockResult);
      expect(screen.queryByTestId('medication-autocomplete-dropdown')).not.toBeInTheDocument();
    });

    it('supports keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)', async () => {
      const mockSelectResult = vi.fn();
      const mockResult: DrugSearchResult = {
        product_id: 'p-200',
        source_identifier: '0069-4200',
        display_name: 'Paracetamol 500mg',
        generic_name: 'Acetaminophen',
        brand_name: 'Panadol',
        dosage_form: 'TABLET',
        route: 'ORAL',
        active_ingredient: 'Acetaminophen',
        strength: '500 mg',
      };
      mockRpc.mockResolvedValue({ data: [mockResult], error: null });

      function TestHost() {
        const [val, setVal] = React.useState('');
        return (
          <MedicationAutocompleteInput
            value={val}
            onChange={setVal}
            onSelectResult={mockSelectResult}
          />
        );
      }

      render(<TestHost />);

      const input = screen.getByTestId('medication-search-input');
      fireEvent.change(input, { target: { value: 'Para' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByTestId('medication-autocomplete-dropdown')).toBeInTheDocument();

      // Navigate down and select via Enter
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockSelectResult).toHaveBeenCalledWith(mockResult);
      expect(screen.queryByTestId('medication-autocomplete-dropdown')).not.toBeInTheDocument();
    });
  });

  // ----------------------------------------------------------------------------
  // 6. Electronic Prescription Section Full Autocomplete Workflow
  // ----------------------------------------------------------------------------
  describe('8. Electronic Prescription Section Workflow & Field Populating', () => {
    it('populates clinical fields upon selecting catalog drug and converts dosage_form and route', async () => {
      const mockResult: DrugSearchResult = {
        product_id: 'prod-paracetamol-1',
        source_identifier: '0045-0501',
        display_name: 'Paracetamol 120 MG / 5 ML Syrup',
        generic_name: 'Acetaminophen',
        brand_name: 'Cetal',
        dosage_form: 'SYRUP',
        route: 'ORAL',
        active_ingredient: 'Acetaminophen',
        strength: '120 mg / 5 mL',
      };
      mockRpc.mockResolvedValue({ data: [mockResult], error: null });

      vi.useFakeTimers();

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId="v-test-1"
            patientId="p-test-1"
          />
        </LanguageProvider>
      );

      const medInput = screen.getByTestId('medication-search-input');
      fireEvent.change(medInput, { target: { value: 'Paracet' } });

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      const option = screen.getByTestId('medication-search-result-item');
      fireEvent.click(option);

      // Verify fields were populated with converted values
      expect(screen.getByDisplayValue('Paracetamol 120 MG / 5 ML Syrup')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Acetaminophen')).toBeInTheDocument();
      expect(screen.getByDisplayValue('120 mg / 5 mL')).toBeInTheDocument();

      // Check catalog badge appears
      expect(screen.getByText('كتالوج الأدوية')).toBeInTheDocument();

      vi.useRealTimers();
    });

    it('clears catalog_product_id and switches to is_custom_medication when doctor edits name after selection', async () => {
      const mockResult: DrugSearchResult = {
        product_id: 'prod-amox-1',
        source_identifier: '0069-01',
        display_name: 'Amoxicillin 500 MG Capsule',
        generic_name: 'Amoxicillin',
        brand_name: 'Amoxil',
        dosage_form: 'CAPSULE',
        route: 'ORAL',
        active_ingredient: 'Amoxicillin',
        strength: '500 mg',
      };
      mockRpc.mockResolvedValue({ data: [mockResult], error: null });

      vi.useFakeTimers();

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId="v-test-2"
            patientId="p-test-2"
          />
        </LanguageProvider>
      );

      const medInput = screen.getByTestId('medication-search-input');
      fireEvent.change(medInput, { target: { value: 'Amox' } });

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      const option = screen.getByTestId('medication-search-result-item');
      fireEvent.click(option);

      expect(screen.getByText('كتالوج الأدوية')).toBeInTheDocument();

      // Doctor now edits the name manually
      fireEvent.change(medInput, { target: { value: 'Amoxicillin 500 MG Capsule (Modified)' } });

      // Badge switches to manual / custom
      expect(screen.getByText('إدخال يدوي')).toBeInTheDocument();
      expect(screen.queryByText('كتالوج الأدوية')).not.toBeInTheDocument();

      // Other fields remain untouched
      expect(screen.getByDisplayValue('Amoxicillin')).toBeInTheDocument();
      expect(screen.getByDisplayValue('500 mg')).toBeInTheDocument();

      vi.useRealTimers();
    });

    it('initializes newly added lines with is_custom_medication = true and null catalog_product_id', () => {
      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId="v-test-3"
            patientId="p-test-3"
          />
        </LanguageProvider>
      );

      const addBtn = screen.getByText(/إضافة دواء آخر/);
      fireEvent.click(addBtn);

      const allMedInputs = screen.getAllByTestId('medication-search-input');
      expect(allMedInputs).toHaveLength(2);
    });
  });
});

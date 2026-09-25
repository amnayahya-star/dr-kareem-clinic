import { describe, it, expect, vi } from 'vitest';
import {
  isHumanDrug,
  parseStrength,
  normalizeNdcRecord,
  fetchOpenFdaNdcPage,
  syncOpenFdaDrugs,
  canonicalJsonStringify,
  validateAndFormatDate,
  readOpenFdaBulkFile,
  OPENFDA_API_PAGINATION_LIMIT,
} from '../src/services/openFdaDrugSyncService';
import { OpenFdaNdcRecord, OpenFdaNdcResponse } from '../src/types/openfda';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

describe('OpenFDA Drug NDC Synchronization Engine (Hardened v2.0)', () => {
  describe('1. Canonical JSON & SHA-256 Stability', () => {
    it('generates identical canonical JSON and SHA-256 hash regardless of key order', () => {
      const objA = {
        z_end: '20251231',
        brand_name: 'Amoxil',
        generic_name: 'Amoxicillin',
        nested: { b: 2, a: 1 },
      };

      const objB = {
        generic_name: 'Amoxicillin',
        nested: { a: 1, b: 2 },
        brand_name: 'Amoxil',
        z_end: '20251231',
      };

      const strA = canonicalJsonStringify(objA);
      const strB = canonicalJsonStringify(objB);

      expect(strA).toBe(strB);

      const hashA = createHash('sha256').update(strA).digest('hex');
      const hashB = createHash('sha256').update(strB).digest('hex');

      expect(hashA).toBe(hashB);
      expect(hashA).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('2. Strict Date Validation (No Rollover)', () => {
    it('parses strictly valid compact YYYYMMDD and ISO YYYY-MM-DD', () => {
      expect(validateAndFormatDate('20200515')).toBe('2020-05-15');
      expect(validateAndFormatDate('2021-12-31')).toBe('2021-12-31');
      expect(validateAndFormatDate('2024-02-29')).toBe('2024-02-29'); // Valid leap year
    });

    it('strictly converts impossible dates like Feb 30th to null without rolling over', () => {
      expect(validateAndFormatDate('20260230')).toBeNull(); // Feb 30th -> null
      expect(validateAndFormatDate('2026-02-30')).toBeNull(); // Feb 30th -> null
      expect(validateAndFormatDate('2023-02-29')).toBeNull(); // 2023 not a leap year -> null
      expect(validateAndFormatDate('20200431')).toBeNull(); // April has 30 days -> null
      expect(validateAndFormatDate('20201301')).toBeNull(); // Month 13 -> null
      expect(validateAndFormatDate('invalid-date')).toBeNull();
      expect(validateAndFormatDate(null)).toBeNull();
      expect(validateAndFormatDate('')).toBeNull();
    });
  });

  describe('3. Human vs Non-Human Drug Filtering (isHumanDrug)', () => {
    it('accepts HUMAN PRESCRIPTION DRUG', () => {
      const record: OpenFdaNdcRecord = {
        product_ndc: '0002-1433',
        product_type: 'HUMAN PRESCRIPTION DRUG',
      };
      expect(isHumanDrug(record)).toBe(true);
    });

    it('accepts HUMAN OTC DRUG', () => {
      const record: OpenFdaNdcRecord = {
        product_ndc: '0069-4200',
        product_type: 'HUMAN OTC DRUG',
      };
      expect(isHumanDrug(record)).toBe(true);
    });

    it('rejects VETERINARY DRUG', () => {
      const record: OpenFdaNdcRecord = {
        product_ndc: '54321-001',
        product_type: 'VETERINARY DRUG',
      };
      expect(isHumanDrug(record)).toBe(false);
    });
  });

  describe('4. Active Ingredient Strength Parsing & CHECK Compliance (parseStrength)', () => {
    it('parses standard numerator/denominator strings ("500 mg/1")', () => {
      const parsed = parseStrength('500 mg/1');
      expect(parsed.numeratorValue).toBe(500);
      expect(parsed.numeratorUnit).toBe('mg');
      expect(parsed.denominatorValue).toBe(1);
      expect(parsed.denominatorUnit).toBe('dose');
    });

    it('parses decimal strengths cleanly (".7 mL/mL" and ".1 g/100mL")', () => {
      const parsed1 = parseStrength('.7 mL/mL');
      expect(parsed1.numeratorValue).toBe(0.7);
      expect(parsed1.numeratorUnit).toBe('mL');
      expect(parsed1.denominatorValue).toBe(1);
      expect(parsed1.denominatorUnit).toBe('mL');

      const parsed2 = parseStrength('.1 g/100mL');
      expect(parsed2.numeratorValue).toBe(0.1);
      expect(parsed2.numeratorUnit).toBe('g');
      expect(parsed2.denominatorValue).toBe(100);
      expect(parsed2.denominatorUnit).toBe('mL');
    });

    it('enforces positive numbers: rejects non-positive or 0 values', () => {
      expect(parseStrength('0 mg/1').numeratorValue).toBeNull();
      expect(parseStrength('-50 mg/1').numeratorValue).toBeNull();
    });
  });

  describe('5. Record Normalization & Invariant Rejections', () => {
    it('rejects records missing dosage_form and never substitutes artificial "Unspecified"', () => {
      const raw: OpenFdaNdcRecord = {
        product_ndc: '0069-4200',
        generic_name: 'Amoxicillin',
        dosage_form: '   ', // Empty
        product_type: 'HUMAN PRESCRIPTION DRUG',
        active_ingredients: [{ name: 'Amoxicillin', strength: '500 mg/1' }],
      };

      const normalized = normalizeNdcRecord(raw);
      expect(normalized.isValid).toBe(false);
      expect(normalized.rejectionReason).toContain('dosage_form');
      expect(normalized.dosageForm).not.toBe('Unspecified');
    });

    it('rejects records without active_ingredients', () => {
      const raw: OpenFdaNdcRecord = {
        product_ndc: '0069-4200',
        generic_name: 'Amoxicillin',
        dosage_form: 'CAPSULE',
        product_type: 'HUMAN PRESCRIPTION DRUG',
        active_ingredients: [],
      };

      const normalized = normalizeNdcRecord(raw);
      expect(normalized.isValid).toBe(false);
      expect(normalized.rejectionReason).toContain('active_ingredients');
    });

    it('strictly avoids asserting "FDA approved" anywhere in displayName or metadata', () => {
      const raw: OpenFdaNdcRecord = {
        product_ndc: '0069-4200',
        generic_name: 'Amoxicillin',
        brand_name: 'Amoxil',
        dosage_form: 'CAPSULE',
        product_type: 'HUMAN PRESCRIPTION DRUG',
        marketing_category: 'UNAPPROVED DRUG OTHER',
        active_ingredients: [{ name: 'Amoxicillin', strength: '500 mg/1' }],
      };

      const normalized = normalizeNdcRecord(raw);
      expect(normalized.displayName).not.toMatch(/fda[\s_-]*approved/i);
    });
  });

  describe('6. Bounded Retries & Pagination Limits (fetchOpenFdaNdcPage)', () => {
    it('strictly rejects skip >= 25,000 to prevent API pagination failure', async () => {
      await expect(
        fetchOpenFdaNdcPage({
          skip: OPENFDA_API_PAGINATION_LIMIT,
          limit: 10,
        })
      ).rejects.toThrow(/OpenFDA API pagination limit exceeded/);
    });

    it('retries on rate-limit 429 and succeeds on subsequent attempt', async () => {
      const mockResponse: OpenFdaNdcResponse = {
        results: [
          {
            product_ndc: '0002-1433',
            generic_name: 'Amoxicillin',
            product_type: 'HUMAN PRESCRIPTION DRUG',
          },
        ],
      };

      let calls = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        calls++;
        if (calls === 1) {
          return { ok: false, status: 429, text: async () => 'Rate limit' };
        }
        return { ok: true, status: 200, json: async () => mockResponse };
      });

      const res = await fetchOpenFdaNdcPage({
        skip: 0,
        limit: 10,
        fetchImpl: mockFetch as unknown as typeof fetch,
        backoffMs: 5,
      });

      expect(res.results?.length).toBe(1);
      expect(calls).toBe(2);
    });
  });

  describe('7. Safe Dry-Run Mode & Zero-Catalog Guarantee (syncOpenFdaDrugs)', () => {
    it('executes completely with null Supabase client (zero credentials needed)', async () => {
      const mockApiResponse: OpenFdaNdcResponse = {
        meta: {
          last_updated: '2026-09-20',
          results: { skip: 0, limit: 10, total: 1 },
        },
        results: [
          {
            product_ndc: '0002-1433',
            generic_name: 'Amoxicillin',
            brand_name: 'Amoxil',
            dosage_form: 'CAPSULE',
            product_type: 'HUMAN PRESCRIPTION DRUG',
            active_ingredients: [{ name: 'Amoxicillin', strength: '500 mg/1' }],
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      });

      const stats = await syncOpenFdaDrugs(null, {
        dryRun: true,
        maxRecords: 10,
        limit: 10,
        fetchImpl: mockFetch as unknown as typeof fetch,
      });

      expect(stats.dryRun).toBe(true);
      expect(stats.totalReceived).toBe(1);
      expect(stats.accepted).toBe(1);
      expect(stats.productsCreated).toBe(1);
      // Strict Invariant: catalogEntriesCreated MUST be 0
      expect(stats.catalogEntriesCreated).toBe(0);
      expect(stats.errors).toEqual([]);
    });

    it('in API mode, halts cleanly when reaching 25,000 boundary', async () => {
      const mockFetch = vi.fn();
      const stats = await syncOpenFdaDrugs(null, {
        dryRun: true,
        skip: 25000,
        fetchImpl: mockFetch as unknown as typeof fetch,
      });

      expect(stats.errors.length).toBeGreaterThan(0);
      expect(stats.errors[0]).toContain('25000');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('8. Bulk Download Zipped File Reader (readOpenFdaBulkFile)', () => {
    it('reads real openFDA zipped file and extracts records cleanly', async () => {
      const zipPath = path.resolve(__dirname, 'fixtures/sample_ndc.json.zip');
      const data = await readOpenFdaBulkFile(zipPath, 0, 10);

      expect(data.records.length).toBe(2);
      expect(data.records[0].product_ndc).toBe('1111-0001');
      expect(data.records[0].generic_name).toBe('AMOXICILLIN');
      expect(data.records[1].product_ndc).toBe('1111-0002');
      expect(data.records[1].generic_name).toBe('IBUPROFEN');
      expect(data.total).toBe(2);
      expect(data.metaLastUpdated).toBe('2026-09-23');
    });
  });

  describe('9. Migration 00009 Contract Verification', () => {
    const migration09Path = path.resolve(__dirname, '../supabase/migrations/00009_openfda_sync_hardening.sql');
    const sql = fs.readFileSync(migration09Path, 'utf8');

    it('contains strict date helper safe_parse_iso_or_compact_date without rollover', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.safe_parse_iso_or_compact_date(');
      expect(sql).toContain('make_date(v_year, v_month, v_day)');
      expect(sql).toContain('EXCEPTION WHEN OTHERS THEN');
    });

    it('enforces FDA_NDC restriction and non-empty checks in upsert RPC', () => {
      expect(sql).toContain("v_source_system != 'FDA_NDC'");
      expect(sql).toContain('jsonb_typeof(p_product) != \'object\'');
      expect(sql).toContain('jsonb_array_length(p_ingredients) = 0');
      expect(sql).toContain('dosage_form is required and cannot be empty');
    });

    it('performs exact ingredient synchronization (deletes obsolete links, preserves drug_ingredients)', () => {
      expect(sql).toContain('DELETE FROM public.drug_product_ingredients');
      expect(sql).toContain('NOT (ingredient_id = ANY(v_current_ingredient_ids))');
    });

    it('updates retrieved_at = NOW() upon product update', () => {
      expect(sql).toContain('retrieved_at = NOW()');
    });

    it('strictly revokes execution from PUBLIC, anon, and authenticated roles', () => {
      expect(sql).toContain('REVOKE ALL ON FUNCTION public.upsert_openfda_drug_product(JSONB, JSONB) FROM PUBLIC, anon, authenticated;');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.upsert_openfda_drug_product(JSONB, JSONB) TO service_role;');
    });
  });

  describe('10. Migration 00010 & Outcome Tracking Verification', () => {
    const migration10Path = path.resolve(__dirname, '../supabase/migrations/00010_openfda_sync_outcome_tracking.sql');
    const sql10 = fs.readFileSync(migration10Path, 'utf8');

    it('adds backward-compatible counter columns to drug_sync_runs', () => {
      expect(sql10).toContain('ADD COLUMN IF NOT EXISTS accepted_count');
      expect(sql10).toContain('ADD COLUMN IF NOT EXISTS rejected_count');
      expect(sql10).toContain('ADD COLUMN IF NOT EXISTS created_count');
      expect(sql10).toContain('ADD COLUMN IF NOT EXISTS unchanged_count');
    });

    it('redefines upsert_openfda_drug_product to return JSONB with structured outcome', () => {
      expect(sql10).toContain('DROP FUNCTION IF EXISTS public.upsert_openfda_drug_product(JSONB, JSONB);');
      expect(sql10).toContain('RETURNS JSONB');
      expect(sql10).toContain("'product_id', v_product_id");
      expect(sql10).toContain("'outcome', v_outcome");
    });

    it('uses deterministic advisory transaction locks for concurrency-safe outcome determination', () => {
      expect(sql10).toContain('pg_advisory_xact_lock');
      expect(sql10).toContain('hashtextextended');
      expect(sql10).toContain("v_outcome := 'created';");
      expect(sql10).toContain("v_outcome := 'updated';");
      expect(sql10).toContain("v_outcome := 'unchanged';");
    });

    it('skips redundant ingredient writes when outcome is unchanged', () => {
      expect(sql10).toContain("IF v_outcome IN ('created', 'updated') THEN");
    });

    it('enforces service_role security on new JSONB RPC function', () => {
      expect(sql10).toContain('REVOKE ALL ON FUNCTION public.upsert_openfda_drug_product(JSONB, JSONB) FROM PUBLIC, anon, authenticated;');
      expect(sql10).toContain('GRANT EXECUTE ON FUNCTION public.upsert_openfda_drug_product(JSONB, JSONB) TO service_role;');
    });

    it('correctly tracks valid created, updated, and unchanged outcomes with valid UUIDs', async () => {
      let callCount = 0;
      const updatePayloadSpy = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'test-run-id' }, error: null }),
            }),
          }),
          update: updatePayloadSpy,
        }),
        rpc: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ data: { product_id: '11111111-1111-1111-1111-111111111111', outcome: 'created' }, error: null });
          } else if (callCount === 2) {
            return Promise.resolve({ data: { product_id: '22222222-2222-2222-2222-222222222222', outcome: 'updated' }, error: null });
          } else {
            return Promise.resolve({ data: { product_id: '33333333-3333-3333-3333-333333333333', outcome: 'unchanged' }, error: null });
          }
        }),
      };

      const mockApiResponse: OpenFdaNdcResponse = {
        results: [
          {
            product_ndc: '0001-0001',
            generic_name: 'Drug One',
            dosage_form: 'TABLET',
            product_type: 'HUMAN PRESCRIPTION DRUG',
            active_ingredients: [{ name: 'Ing1', strength: '10 mg/1' }],
          },
          {
            product_ndc: '0001-0002',
            generic_name: 'Drug Two',
            dosage_form: 'TABLET',
            product_type: 'HUMAN PRESCRIPTION DRUG',
            active_ingredients: [{ name: 'Ing2', strength: '20 mg/1' }],
          },
          {
            product_ndc: '0001-0003',
            generic_name: 'Drug Three',
            dosage_form: 'TABLET',
            product_type: 'HUMAN PRESCRIPTION DRUG',
            active_ingredients: [{ name: 'Ing3', strength: '30 mg/1' }],
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      });

      const stats = await syncOpenFdaDrugs(mockSupabase as any, {
        dryRun: false,
        maxRecords: 3,
        limit: 3,
        fetchImpl: mockFetch as any,
      });

      expect(stats.productsCreated).toBe(1);
      expect(stats.productsUpdated).toBe(1);
      expect(stats.productsUnchanged).toBe(1);
      expect(stats.accepted).toBe(3);
      expect(stats.catalogEntriesCreated).toBe(0);
      expect(stats.errors).toEqual([]);

      // Verify cached_count backward compatibility = created + updated + unchanged
      expect(updatePayloadSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          created_count: 1,
          updated_count: 1,
          unchanged_count: 1,
          cached_count: 3,
          errors_count: 0,
        })
      );
    });

    it('handles fail-closed parsing for malformed RPC results, unknown outcomes, and RPC errors', async () => {
      let callCount = 0;
      const updatePayloadSpy = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'test-run-id' }, error: null }),
            }),
          }),
          update: updatePayloadSpy,
        }),
        rpc: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // Case A: Valid created
            return Promise.resolve({ data: { product_id: '11111111-1111-1111-1111-111111111111', outcome: 'created' }, error: null });
          } else if (callCount === 2) {
            // Case B: Malformed result (not an object or non-UUID)
            return Promise.resolve({ data: 'not-an-object', error: null });
          } else if (callCount === 3) {
            // Case C: Unknown outcome
            return Promise.resolve({ data: { product_id: '33333333-3333-3333-3333-333333333333', outcome: 'archived' }, error: null });
          } else {
            // Case D: RPC error
            return Promise.resolve({ data: null, error: { message: 'Database query timeout' } });
          }
        }),
      };

      const mockApiResponse: OpenFdaNdcResponse = {
        results: [
          {
            product_ndc: '0001-0001',
            generic_name: 'Drug One',
            dosage_form: 'TABLET',
            product_type: 'HUMAN PRESCRIPTION DRUG',
            active_ingredients: [{ name: 'Ing1', strength: '10 mg/1' }],
          },
          {
            product_ndc: '0001-0002',
            generic_name: 'Drug Two',
            dosage_form: 'TABLET',
            product_type: 'HUMAN PRESCRIPTION DRUG',
            active_ingredients: [{ name: 'Ing2', strength: '20 mg/1' }],
          },
          {
            product_ndc: '0001-0003',
            generic_name: 'Drug Three',
            dosage_form: 'TABLET',
            product_type: 'HUMAN PRESCRIPTION DRUG',
            active_ingredients: [{ name: 'Ing3', strength: '30 mg/1' }],
          },
          {
            product_ndc: '0001-0004',
            generic_name: 'Drug Four',
            dosage_form: 'TABLET',
            product_type: 'HUMAN PRESCRIPTION DRUG',
            active_ingredients: [{ name: 'Ing4', strength: '40 mg/1' }],
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      });

      const stats = await syncOpenFdaDrugs(mockSupabase as any, {
        dryRun: false,
        maxRecords: 4,
        limit: 4,
        fetchImpl: mockFetch as any,
      });

      // Exactly 1 product succeeded
      expect(stats.productsCreated).toBe(1);
      expect(stats.productsUpdated).toBe(0);
      expect(stats.productsUnchanged).toBe(0);

      // Exactly 3 operational errors logged (malformed, unknown outcome, rpc error)
      expect(stats.errors.length).toBe(3);
      expect(stats.errors[0]).toContain('Malformed or unknown RPC outcome');
      expect(stats.errors[1]).toContain('Malformed or unknown RPC outcome');
      expect(stats.errors[2]).toContain('RPC failed for product 0001-0004: Database query timeout');

      // Status must be partial since 1 succeeded and 3 failed with operational errors
      expect(updatePayloadSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'partial',
          created_count: 1,
          updated_count: 0,
          unchanged_count: 0,
          cached_count: 1,
          errors_count: 3,
        })
      );
    });

    it('sets status = failed when all products fail due to operational errors', async () => {
      const updatePayloadSpy = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'test-run-id' }, error: null }),
            }),
          }),
          update: updatePayloadSpy,
        }),
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'Fatal DB deadlock' } }),
      };

      const mockApiResponse: OpenFdaNdcResponse = {
        results: [
          {
            product_ndc: '0001-0001',
            generic_name: 'Drug One',
            dosage_form: 'TABLET',
            product_type: 'HUMAN PRESCRIPTION DRUG',
            active_ingredients: [{ name: 'Ing1', strength: '10 mg/1' }],
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      });

      const stats = await syncOpenFdaDrugs(mockSupabase as any, {
        dryRun: false,
        maxRecords: 1,
        limit: 1,
        fetchImpl: mockFetch as any,
      });

      expect(stats.productsCreated).toBe(0);
      expect(stats.errors.length).toBe(1);

      expect(updatePayloadSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          created_count: 0,
          cached_count: 0,
          errors_count: 1,
        })
      );
    });
  });
});

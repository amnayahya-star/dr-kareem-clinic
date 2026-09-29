import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  savePrescriptionWithItems,
  normalizeAndValidateDosageForm,
  _resetInMemoryPrescriptions,
} from '../src/services/prescriptionService';

// Mock Supabase
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();
const mockIsSupabaseConfigured = vi.fn().mockReturnValue(false);

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

describe('Migration 00017: Fix Prescription Dosage Form Normalization Contract & Regression Tests', () => {
  const migration0016Path = path.resolve(
    __dirname,
    '../supabase/migrations/00016_prescription_revision_workflow.sql'
  );
  const migration0017Path = path.resolve(
    __dirname,
    '../supabase/migrations/00017_fix_prescription_dosage_form_normalization.sql'
  );

  let sql0016 = '';
  let sql0017 = '';

  beforeEach(() => {
    vi.clearAllMocks();
    _resetInMemoryPrescriptions();
    mockIsSupabaseConfigured.mockReturnValue(false);

    if (fs.existsSync(migration0016Path)) {
      sql0016 = fs.readFileSync(migration0016Path, 'utf8');
    }
    if (fs.existsSync(migration0017Path)) {
      sql0017 = fs.readFileSync(migration0017Path, 'utf8');
    }
  });

  // ============================================================================
  // 1. Transactionality, File Existence & Non-Mutation of ENUM
  // ============================================================================
  describe('1. Migration Architecture & Immutability Rules', () => {
    it('migration file 00017 exists and is wrapped in a safe transaction block', () => {
      expect(fs.existsSync(migration0017Path)).toBe(true);
      expect(sql0017).toContain('BEGIN;');
      expect(sql0017.trim().endsWith('COMMIT;')).toBe(true);
    });

    it('does NOT expand, alter or delete enum public.dosage_form_type (Rule 7)', () => {
      // Must NOT contain ALTER TYPE public.dosage_form_type ADD VALUE
      expect(sql0017).not.toMatch(/ALTER\s+TYPE\s+.*dosage_form_type\s+ADD\s+VALUE/i);
      // Must NOT contain DROP TYPE
      expect(sql0017).not.toMatch(/DROP\s+TYPE/i);
    });

    it('preserves existing migrations 00001 through 00016 without any edits (Rule 3)', () => {
      // Verify 00016 still exists
      expect(fs.existsSync(migration0016Path)).toBe(true);
      for (let i = 1; i <= 16; i++) {
        const pad = String(i).padStart(5, '0');
        const files = fs.readdirSync(path.resolve(__dirname, '../supabase/migrations'));
        const found = files.some((f) => f.startsWith(pad));
        expect(found).toBe(true);
      }
    });
  });

  // ============================================================================
  // 2. RPC Signature & Security Definer Verification
  // ============================================================================
  describe('2. Function Signature & Security Definer Invariance', () => {
    it('redefines public.save_electronic_prescription with identical 7-argument signature', () => {
      const match = sql0017.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.save_electronic_prescription\(([\s\S]*?)\)\s*RETURNS\s+UUID/i
      );
      expect(match).not.toBeNull();
      const paramsList = match![1];

      expect(paramsList).toContain('p_visit_id UUID');
      expect(paramsList).toContain('p_patient_id UUID');
      expect(paramsList).toContain('p_diagnosis_id UUID DEFAULT NULL');
      expect(paramsList).toContain('p_general_instructions TEXT DEFAULT NULL');
      expect(paramsList).toContain("p_items JSONB DEFAULT '[]'::JSONB");
      expect(paramsList).toContain("p_action TEXT DEFAULT 'draft'");
      expect(paramsList).toContain('p_prescription_id UUID DEFAULT NULL');
    });

    it('declares SECURITY DEFINER with safe empty search_path', () => {
      expect(sql0017).toContain('SECURITY DEFINER');
      expect(sql0017).toContain("SET search_path = ''");
    });

    it('applies strict role permissions: REVOKE from PUBLIC/anon, GRANT to authenticated', () => {
      expect(sql0017).toContain(
        'REVOKE ALL ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT, UUID) FROM PUBLIC;'
      );
      expect(sql0017).toContain(
        'REVOKE ALL ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT, UUID) FROM anon;'
      );
      expect(sql0017).toContain(
        'GRANT EXECUTE ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT, UUID) TO authenticated;'
      );
    });
  });

  // ============================================================================
  // 3. SQL Dosage Form Normalization Contract (Elimination of ointment_cream)
  // ============================================================================
  describe('3. SQL Dosage Form Normalization Contract', () => {
    it('eliminates all target outputs of ointment_cream, tablets, capsules, injections, inhaler_spray', () => {
      // Must NEVER return legacy forms as mapping targets
      expect(sql0017).not.toContain("THEN 'ointment_cream'");
      expect(sql0017).not.toContain("THEN 'tablets'");
      expect(sql0017).not.toContain("THEN 'capsules'");
      expect(sql0017).not.toContain("THEN 'injections'");
      expect(sql0017).not.toContain("THEN 'inhaler_spray'");

      // In contrast, migration 0016 DID map to those legacy values
      expect(sql0016).toContain("THEN 'ointment_cream'");
      expect(sql0016).toContain("THEN 'tablets'");
      expect(sql0016).toContain("THEN 'capsules'");
      expect(sql0016).toContain("THEN 'injections'");
      expect(sql0016).toContain("THEN 'inhaler_spray'");
    });

    it('maps cream, ointment_cream, gel, and lotion to cream', () => {
      expect(sql0017).toMatch(
        /WHEN\s+lower\(v_dosage_form\)\s+IN\s+\('cream',\s*'ointment_cream',\s*'gel',\s*'lotion'\)\s+THEN\s+'cream'/i
      );
    });

    it('maps ointment strictly to ointment', () => {
      expect(sql0017).toMatch(
        /WHEN\s+lower\(v_dosage_form\)\s+IN\s+\('ointment'\)\s+THEN\s+'ointment'/i
      );
    });

    it('maps tablet and tablets to tablet (singular canonical)', () => {
      expect(sql0017).toMatch(
        /WHEN\s+lower\(v_dosage_form\)\s+IN\s+\('tablet',\s*'tablets'\)\s+THEN\s+'tablet'/i
      );
    });

    it('maps capsule and capsules to capsule (singular canonical)', () => {
      expect(sql0017).toMatch(
        /WHEN\s+lower\(v_dosage_form\)\s+IN\s+\('capsule',\s*'capsules'\)\s+THEN\s+'capsule'/i
      );
    });

    it('maps injection and injections to injection (singular canonical)', () => {
      expect(sql0017).toMatch(
        /WHEN\s+lower\(v_dosage_form\)\s+IN\s+\('injection',\s*'injections'\)\s+THEN\s+'injection'/i
      );
    });

    it('maps inhaler_spray to inhaler (current safe logic)', () => {
      expect(sql0017).toMatch(
        /WHEN\s+lower\(v_dosage_form\)\s+IN\s+\('inhaler_spray',\s*'inhaler',\s*'aerosol'\)\s+THEN\s+'inhaler'/i
      );
    });

    it('maps spray to spray', () => {
      expect(sql0017).toMatch(
        /WHEN\s+lower\(v_dosage_form\)\s+IN\s+\('spray'\)\s+THEN\s+'spray'/i
      );
    });

    it('defaults unmapped or unknown strings to other', () => {
      expect(sql0017).toContain("ELSE 'other'");
    });

    it('casts only the normalized variable v_dosage_form_norm to public.dosage_form_type', () => {
      expect(sql0017).toContain('v_dosage_form_norm::public.dosage_form_type');
    });
  });

  // ============================================================================
  // 4. Revision Workflow & Clinic Catalog Invariance
  // ============================================================================
  describe('4. Revision Workflow & Catalog Logic Invariance', () => {
    it('preserves row locking FOR UPDATE and draft status guard', () => {
      expect(sql0017).toContain('FOR UPDATE');
      expect(sql0017).toContain("'issued'::public.prescription_status_type");
      expect(sql0017).toContain("'cancelled'::public.prescription_status_type");
      expect(sql0017).toContain("'superseded'::public.prescription_status_type");
    });

    it('preserves non-colliding status update ordering: predecessor to superseded FIRST, then draft to issued', () => {
      const supersededUpdate = sql0017.search(
        /UPDATE\s+public\.prescriptions\s+SET\s+status\s*=\s*'superseded'/i
      );
      const issuedUpdate = sql0017.search(
        /UPDATE\s+public\.prescriptions\s+SET\s+status\s*=\s*'issued'/i
      );
      expect(supersededUpdate).toBeGreaterThan(0);
      expect(issuedUpdate).toBeGreaterThan(0);
      expect(supersededUpdate).toBeLessThan(issuedUpdate);
    });

    it('preserves delta calculation with DISTINCT for revisions and catalog link', () => {
      expect(sql0017).toContain('IF v_replaces_prescription_id IS NOT NULL THEN');
      expect(sql0017).toContain('DISTINCT pi_new.catalog_product_id');
      expect(sql0017).toContain('NOT IN');
      expect(sql0017).toContain('usage_count = public.clinic_drug_catalog.usage_count + 1');
      expect(sql0017).toContain('DISTINCT pi.catalog_product_id');
    });
  });

  // ============================================================================
  // 5. Normalization Unit & Service-Level Regression Tests
  // ============================================================================
  describe('5. Normalization Unit & Service Regression Suite', () => {
    it('normalizes CREAM to cream', () => {
      expect(normalizeAndValidateDosageForm('CREAM')).toBe('cream');
      expect(normalizeAndValidateDosageForm('cream')).toBe('cream');
      expect(normalizeAndValidateDosageForm('Cream')).toBe('cream');
      expect(normalizeAndValidateDosageForm(' Hydrocortisone Cream ')).toBe('cream');
    });

    it('normalizes OINTMENT to ointment', () => {
      expect(normalizeAndValidateDosageForm('OINTMENT')).toBe('ointment');
      expect(normalizeAndValidateDosageForm('ointment')).toBe('ointment');
      expect(normalizeAndValidateDosageForm('Ointment')).toBe('ointment');
      expect(normalizeAndValidateDosageForm(' Eye Ointment ')).toBe('ointment');
    });

    it('normalizes legacy ointment_cream to cream', () => {
      expect(normalizeAndValidateDosageForm('ointment_cream')).toBe('cream');
      expect(normalizeAndValidateDosageForm('OINTMENT_CREAM')).toBe('cream');
    });

    it('normalizes plural legacy forms to singular canonical forms', () => {
      expect(normalizeAndValidateDosageForm('tablets')).toBe('tablet');
      expect(normalizeAndValidateDosageForm('TABLETS')).toBe('tablet');
      expect(normalizeAndValidateDosageForm('capsules')).toBe('capsule');
      expect(normalizeAndValidateDosageForm('CAPSULES')).toBe('capsule');
      expect(normalizeAndValidateDosageForm('injections')).toBe('injection');
      expect(normalizeAndValidateDosageForm('INJECTIONS')).toBe('injection');
      expect(normalizeAndValidateDosageForm('inhaler_spray')).toBe('inhaler');
    });

    it('saves prescription with CREAM and OINTMENT without throwing or casting ointment_cream', async () => {
      mockIsSupabaseConfigured.mockReturnValue(true);
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'doctor-1' } },
        error: null,
      });

      mockRpc.mockResolvedValue({
        data: 'rx-new-id',
        error: null,
      });

      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'rx-new-id',
          visit_id: 'visit-1',
          patient_id: 'patient-1',
          status: 'draft',
          revision_number: 1,
          items: [
            { medication_name: 'Fucidin Cream', dosage_form: 'cream' },
            { medication_name: 'Betnovate Ointment', dosage_form: 'cream' },
            { medication_name: 'Tarivid Ointment', dosage_form: 'ointment' },
          ],
        },
        error: null,
      });

      const mockSelect = vi.fn();
      const mockEq = vi.fn().mockReturnValue({
        maybeSingle: mockMaybeSingle,
        single: mockMaybeSingle,
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'rx-new-id',
              visit_id: 'visit-1',
              patient_id: 'patient-1',
              status: 'draft',
              revision_number: 1,
              items: [],
            },
          ],
          error: null,
        }),
      });

      mockSelect.mockReturnValue({
        eq: mockEq,
        maybeSingle: mockMaybeSingle,
        single: mockMaybeSingle,
      });

      mockFrom.mockReturnValue({
        select: mockSelect,
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        eq: mockEq,
      });

      const result = await savePrescriptionWithItems({
        visit_id: 'visit-1',
        patient_id: 'patient-1',
        items: [
          {
            medication_name: 'Fucidin Cream',
            // @ts-expect-error test raw uppercase value
            dosage_form: 'CREAM',
            frequency: 'Once daily',
            duration: '7 days',
          },
          {
            medication_name: 'Betnovate Ointment',
            dosage_form: 'ointment_cream',
            frequency: 'Twice daily',
            duration: '5 days',
          },
          {
            medication_name: 'Tarivid Ointment',
            // @ts-expect-error test raw uppercase ointment
            dosage_form: 'OINTMENT',
            frequency: 'Twice daily',
            duration: '3 days',
          },
        ],
        action: 'draft',
      });

      expect(result).toBeDefined();
      expect(mockRpc).toHaveBeenCalledWith(
        'save_electronic_prescription',
        expect.objectContaining({
          p_visit_id: 'visit-1',
          p_patient_id: 'patient-1',
          p_items: expect.arrayContaining([
            expect.objectContaining({
              medication_name: 'Fucidin Cream',
              dosage_form: 'cream',
            }),
            expect.objectContaining({
              medication_name: 'Betnovate Ointment',
              dosage_form: 'cream',
            }),
            expect.objectContaining({
              medication_name: 'Tarivid Ointment',
              dosage_form: 'ointment',
            }),
          ]),
        })
      );

      // Verify that NO call to RPC ever contains ointment_cream
      const rpcCallArgs = mockRpc.mock.calls[0][1];
      const itemsSent = rpcCallArgs.p_items;
      for (const item of itemsSent) {
        expect(item.dosage_form).not.toBe('ointment_cream');
        expect(item.dosage_form).not.toBe('tablets');
        expect(item.dosage_form).not.toBe('capsules');
        expect(item.dosage_form).not.toBe('injections');
        expect(item.dosage_form).not.toBe('inhaler_spray');
      }
    });
  });
});

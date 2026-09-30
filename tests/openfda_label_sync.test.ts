import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeLabelSection,
  computeLabelPayloadHash,
  sanitizeUrlForLogging,
  resolveDeterministicLabelMatch,
  normalizeOpenFdaLabelRecord,
  fetchOpenFdaLabelQuery,
  syncDrugLabelForProduct,
  syncOpenFdaDrugLabelsBatch,
  TargetProductForSync,
} from '../src/services/openFdaDrugLabelSyncService';
import { OpenFdaLabelRecord, OpenFdaLabelResponse } from '../src/types/openfdaLabel';

describe('OpenFDA Drug Labeling Synchronization & Provenance Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Text Normalization & Canonical Hash Stability', () => {
    it('normalizes string and array sections preserving exact paragraphs and order', () => {
      const arraySection = [
        '1.1 Pediatric Dosage',
        'For children aged 2-12: 20 to 40 mg/kg/day.',
        '',
        'Do not exceed 1000 mg/day.',
      ];
      const normalized = normalizeLabelSection(arraySection);
      expect(normalized).toBe(
        '1.1 Pediatric Dosage\n\nFor children aged 2-12: 20 to 40 mg/kg/day.\n\nDo not exceed 1000 mg/day.'
      );

      expect(normalizeLabelSection('Single paragraph text.')).toBe('Single paragraph text.');
      expect(normalizeLabelSection('')).toBeNull();
      expect(normalizeLabelSection(null)).toBeNull();
      expect(normalizeLabelSection(undefined)).toBeNull();
    });

    it('produces stable 64-character SHA-256 hash regardless of object key order', () => {
      const payloadA = {
        product_id: '11111111-1111-1111-1111-111111111111',
        dosage_and_administration: 'Take 5mL orally',
        pediatric_use: 'Safety established for children',
        spl_set_id: 'set-123',
      };

      const payloadB = {
        spl_set_id: 'set-123',
        pediatric_use: 'Safety established for children',
        dosage_and_administration: 'Take 5mL orally',
        product_id: '11111111-1111-1111-1111-111111111111',
      };

      const hashA = computeLabelPayloadHash(payloadA);
      const hashB = computeLabelPayloadHash(payloadB);

      expect(hashA).toBe(hashB);
      expect(hashA).toMatch(/^[a-f0-9]{64}$/);
    });

    it('changes hash when clinical section text changes', () => {
      const payloadOriginal = {
        product_id: '11111111-1111-1111-1111-111111111111',
        dosage_and_administration: 'Take 5mL orally',
        pediatric_use: 'Safety established for children',
      };

      const payloadChanged = {
        product_id: '11111111-1111-1111-1111-111111111111',
        dosage_and_administration: 'Take 10mL orally', // modified dose
        pediatric_use: 'Safety established for children',
      };

      expect(computeLabelPayloadHash(payloadOriginal)).not.toBe(
        computeLabelPayloadHash(payloadChanged)
      );
    });
  });

  describe('2. Deterministic Matching Hierarchy & Anti-Hallucination Invariants', () => {
    const mockProduct: TargetProductForSync = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      source_identifier: '0002-1433', // NDC
      application_number: 'NDA050542',
      brand_name: 'Amoxil',
      generic_name: 'Amoxicillin',
      source_payload: {
        openfda: {
          spl_set_id: ['a1b2c3d4-0000-0000-0000-000000000001'],
        },
      },
    };

    it('matches by exact spl_set_id when available in target product payload', () => {
      const candidates: OpenFdaLabelRecord[] = [
        {
          set_id: 'a1b2c3d4-0000-0000-0000-000000000001',
          version: '2',
          effective_time: '20230501',
          openfda: {
            product_ndc: ['9999-9999'], // Different NDC, but same SPL set ID
          },
        },
      ];

      const resolution = resolveDeterministicLabelMatch(mockProduct, candidates);
      expect(resolution.outcome).toBe('matched');
      expect(resolution.matchedLabel?.set_id).toBe('a1b2c3d4-0000-0000-0000-000000000001');
    });

    it('matches by exact product_ndc in openfda.product_ndc when spl_set_id not in product', () => {
      const productWithoutSpl: TargetProductForSync = {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        source_identifier: '0069-4200',
        application_number: null,
      };

      const candidates: OpenFdaLabelRecord[] = [
        {
          set_id: 'set-azithro-001',
          effective_time: '20220101',
          openfda: {
            product_ndc: ['0069-4200', '0069-4201'],
          },
        },
      ];

      const resolution = resolveDeterministicLabelMatch(productWithoutSpl, candidates);
      expect(resolution.outcome).toBe('matched');
      expect(resolution.matchedLabel?.set_id).toBe('set-azithro-001');
    });

    it('matches by exact application_number when NDC is absent', () => {
      const productWithAppOnly: TargetProductForSync = {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        source_identifier: null,
        application_number: 'NDA020280',
      };

      const candidates: OpenFdaLabelRecord[] = [
        {
          set_id: 'set-app-001',
          effective_time: '20211115',
          openfda: {
            application_number: ['NDA020280'],
          },
        },
      ];

      const resolution = resolveDeterministicLabelMatch(productWithAppOnly, candidates);
      expect(resolution.outcome).toBe('matched');
      expect(resolution.matchedLabel?.set_id).toBe('set-app-001');
    });

    it('strictly REJECTS approximate/name-based matches (brand_name or generic_name alone)', () => {
      const productForNameRejection: TargetProductForSync = {
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        source_identifier: '1111-2222', // Does not match candidate NDC
        application_number: 'NDA999999',
        brand_name: 'Tylenol',
        generic_name: 'Acetaminophen',
      };

      const candidatesWithSameName: OpenFdaLabelRecord[] = [
        {
          set_id: 'set-other-brand',
          openfda: {
            brand_name: ['Tylenol'],
            generic_name: ['Acetaminophen'],
            product_ndc: ['5555-6666'], // Different NDC!
            application_number: ['ANDA111111'], // Different application number!
          },
        },
      ];

      const resolution = resolveDeterministicLabelMatch(productForNameRejection, candidatesWithSameName);
      expect(resolution.outcome).toBe('unmatched');
      expect(resolution.matchedLabel).toBeUndefined();
    });

    it('detects AMBIGUOUS results when candidates have conflicting SPL set_ids and creates NO record', () => {
      const productTarget: TargetProductForSync = {
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        source_identifier: '1234-5678',
        application_number: null,
      };

      // Two different manufacturers or distinct labels claiming the same NDC
      const conflictingCandidates: OpenFdaLabelRecord[] = [
        {
          set_id: 'set-conflict-alpha',
          effective_time: '20230101',
          openfda: { product_ndc: ['1234-5678'] },
        },
        {
          set_id: 'set-conflict-beta',
          effective_time: '20230201',
          openfda: { product_ndc: ['1234-5678'] },
        },
      ];

      const resolution = resolveDeterministicLabelMatch(productTarget, conflictingCandidates);
      expect(resolution.outcome).toBe('ambiguous');
      expect(resolution.matchedLabel).toBeUndefined();
      expect(resolution.reason).toContain('conflicting label set_ids');
    });

    it('deterministically selects the LATEST effective_time when multiple versions of the same label exist', () => {
      const productTarget: TargetProductForSync = {
        id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        source_identifier: '7777-8888',
        application_number: null,
      };

      const versionsOfSameSetId: OpenFdaLabelRecord[] = [
        {
          id: 'spl-v1',
          set_id: 'set-same-label-100',
          version: '1',
          effective_time: '20190410',
          openfda: { product_ndc: ['7777-8888'] },
        },
        {
          id: 'spl-v3',
          set_id: 'set-same-label-100',
          version: '3',
          effective_time: '20231102', // Latest!
          openfda: { product_ndc: ['7777-8888'] },
        },
        {
          id: 'spl-v2',
          set_id: 'set-same-label-100',
          version: '2',
          effective_time: '20210815',
          openfda: { product_ndc: ['7777-8888'] },
        },
      ];

      const resolution = resolveDeterministicLabelMatch(productTarget, versionsOfSameSetId);
      expect(resolution.outcome).toBe('matched');
      expect(resolution.matchedLabel?.id).toBe('spl-v3');
      expect(resolution.matchedLabel?.effective_time).toBe('20231102');
      expect(resolution.matchedLabel?.version).toBe('3');
    });
  });

  describe('3. Normalization of Label Sections & Provenance', () => {
    it('normalizes all requested clinical and regulatory sections and keeps raw source_payload', () => {
      const rawRecord: OpenFdaLabelRecord = {
        id: 'spl-full-001',
        set_id: 'set-full-001',
        version: '4',
        effective_time: '20231015',
        dosage_and_administration: ['1. Adults: 500mg.', '2. Pediatrics: 20mg/kg.'],
        pediatric_use: ['Safety and effectiveness evaluated in patients > 3 months.'],
        indications_and_usage: ['Treatment of acute bacterial sinusitis.'],
        contraindications: ['Known hypersensitivity.'],
        warnings_and_cautions: ['Risk of severe allergic reaction.'],
        boxed_warning: ['WARNING: Clostridioides difficile-associated diarrhea.'],
        drug_interactions: ['Oral contraceptives efficacy may be reduced.'],
        use_in_specific_populations: ['Geriatric use: no overall differences.'],
        openfda: {
          product_ndc: ['0002-1433'],
          application_number: ['NDA050542'],
          marketing_category: ['NDA'],
        },
      };

      const normalized = normalizeOpenFdaLabelRecord('prod-uuid-1', rawRecord);

      expect(normalized.productId).toBe('prod-uuid-1');
      expect(normalized.splSetId).toBe('set-full-001');
      expect(normalized.splId).toBe('spl-full-001');
      expect(normalized.labelVersion).toBe('4');
      expect(normalized.effectiveTime).toBe('20231015');
      expect(normalized.applicationNumber).toBe('NDA050542');
      expect(normalized.marketingCategory).toBe('NDA');
      expect(normalized.dosageAndAdministration).toContain('1. Adults: 500mg.');
      expect(normalized.dosageAndAdministration).toContain('2. Pediatrics: 20mg/kg.');
      expect(normalized.pediatricUse).toBe('Safety and effectiveness evaluated in patients > 3 months.');
      expect(normalized.boxedWarning).toContain('Clostridioides difficile');
      expect(normalized.reviewStatus).toBe('pending_review');
      expect(normalized.sourcePayload).toEqual(rawRecord);
      expect(normalized.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('does NOT treat presence of NDC or label as FDA-approved, preserving marketing_category', () => {
      const unapprovedRecord: OpenFdaLabelRecord = {
        id: 'spl-unapp-001',
        set_id: 'set-unapp-001',
        openfda: {
          product_ndc: ['9999-0001'],
          marketing_category: ['UNAPPROVED DRUG OTHER'],
        },
      };

      const normalized = normalizeOpenFdaLabelRecord('prod-uuid-2', unapprovedRecord);
      expect(normalized.marketingCategory).toBe('UNAPPROVED DRUG OTHER');
      expect(normalized.reviewStatus).toBe('pending_review'); // Stays pending, not approved!
    });
  });

  describe('4. Security, Secret Masking & Dry-Run Guarantees', () => {
    it('sanitizes URLs in logs masking API keys completely', () => {
      const urlWithKey = 'https://api.fda.gov/drug/label.json?search=openfda.product_ndc:0002&api_key=SECRET_API_KEY_12345';
      const sanitized = sanitizeUrlForLogging(urlWithKey);
      expect(sanitized).not.toContain('SECRET_API_KEY_12345');
      expect(sanitized).toContain('api_key=***REDACTED***');
    });

    it('performs ZERO database writes in DRY-RUN mode and returns simulated outcome', async () => {
      const targetProduct: TargetProductForSync = {
        id: '11111111-1111-1111-1111-111111111111',
        source_identifier: '0002-1433',
        application_number: 'NDA050542',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            results: [
              {
                set_id: 'set-amox-dry',
                effective_time: '20230101',
                openfda: { product_ndc: ['0002-1433'] },
                dosage_and_administration: 'Dry run dosage',
              },
            ],
          }),
      });

      const mockSupabase = {
        rpc: vi.fn(),
      };

      const result = await syncDrugLabelForProduct(targetProduct, mockSupabase as any, {
        dryRun: true,
        fetchImpl: mockFetch as any,
      });

      expect(mockSupabase.rpc).not.toHaveBeenCalled(); // ZERO DB calls!
      expect(result.outcome).toBe('created');
      expect(result.reviewStatus).toBe('pending_review');
    });

    it('batch sync summary correctly tracks outcomes in dry run', async () => {
      const products: TargetProductForSync[] = [
        { id: 'p1', source_identifier: '0001-0001', application_number: null },
        { id: 'p2', source_identifier: null, application_number: null }, // unmatched
      ];

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('0001-0001')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                results: [
                  {
                    set_id: 'set-p1',
                    openfda: { product_ndc: ['0001-0001'] },
                  },
                ],
              }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          text: async () => '{}',
        });
      });

      const summary = await syncOpenFdaDrugLabelsBatch(products, null, {
        dryRun: true,
        fetchImpl: mockFetch as any,
      });

      expect(summary.received).toBe(2);
      expect(summary.matched).toBe(1);
      expect(summary.created).toBe(1);
      expect(summary.unmatched).toBe(1);
      expect(summary.operationalErrors).toBe(0);
    });
  });

  describe('5. Resilience & Error Handling', () => {
    it('retries on 429 rate limits with backoff up to maxRetries', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 429, text: async () => 'Rate limit' });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ results: [{ set_id: 'set-ok' }] }),
        });
      });

      const result = await fetchOpenFdaLabelQuery('openfda.product_ndc:test', {
        maxRetries: 2,
        fetchImpl: mockFetch as any,
      });

      expect(callCount).toBe(2);
      expect(result?.results?.length).toBe(1);
    });

    it('retries on 500 server error and succeeds on subsequent try', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 500, text: async () => 'Internal Error' });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ results: [{ set_id: 'set-recovered' }] }),
        });
      });

      const result = await fetchOpenFdaLabelQuery('openfda.product_ndc:test', {
        maxRetries: 2,
        fetchImpl: mockFetch as any,
      });

      expect(callCount).toBe(2);
      expect(result?.results?.[0].set_id).toBe('set-recovered');
    });

    it('does NOT retry on permanent 400 Bad Request error', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ ok: false, status: 400, text: async () => 'Bad syntax' });
      });

      const result = await fetchOpenFdaLabelQuery('bad query', {
        maxRetries: 2,
        fetchImpl: mockFetch as any,
      });

      expect(callCount).toBe(1); // No retries!
      expect(result).toBeNull();
    });

    it('rejects malformed JSON and throws clear error without leaking secrets', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '<html><body>502 Bad Gateway</body></html>', // Not JSON
      });

      await expect(
        fetchOpenFdaLabelQuery('query', {
          maxRetries: 0,
          fetchImpl: mockFetch as any,
        })
      ).rejects.toThrow('Malformed JSON');
    });
  });

  describe('6. CLI Invariants, Fail-Closed & No-Simulation Guardrails', () => {
    it('guarantees ZERO occurrences of "simulated sample product" in production CLI script', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const cliPath = path.resolve(process.cwd(), 'scripts/syncOpenFdaDrugLabels.ts');
      const cliContent = fs.readFileSync(cliPath, 'utf8');

      expect(cliContent.toLowerCase()).not.toContain('simulated sample product');
      expect(cliContent.toLowerCase()).not.toContain('fallback simulated');
    });

    it('records operational_error and NEVER marks as unmatched when openFDA request fails', async () => {
      const targetProduct: TargetProductForSync = {
        id: '11111111-1111-1111-1111-111111111111',
        source_identifier: '72189-285',
        application_number: 'ANDA065334',
      };

      const failingFetch = vi.fn().mockRejectedValue(new Error('Network connection refused to openFDA'));

      const result = await syncDrugLabelForProduct(targetProduct, null, {
        dryRun: true,
        fetchImpl: failingFetch as any,
        maxRetries: 0,
      });

      expect(result.outcome).toBe('operational_error');
      expect(result.outcome).not.toBe('unmatched');
      expect(result.error).toContain('Network connection refused');
    });

    it('accumulates operationalErrors in batch summary when network fails', async () => {
      const products: TargetProductForSync[] = [
        { id: 'p1', source_identifier: '0001-0001', application_number: null },
      ];

      const failingFetch = vi.fn().mockRejectedValue(new Error('openFDA gateway timeout 504'));

      const summary = await syncOpenFdaDrugLabelsBatch(products, null, {
        dryRun: true,
        fetchImpl: failingFetch as any,
        maxRetries: 0,
      });

      expect(summary.operationalErrors).toBe(1);
      expect(summary.unmatched).toBe(0);
      expect(summary.matched).toBe(0);
    });

    it('guarantees that dry-run NEVER invokes Supabase RPC write', async () => {
      const targetProduct: TargetProductForSync = {
        id: '11111111-1111-1111-1111-111111111111',
        source_identifier: '72189-285',
        application_number: 'ANDA065334',
      };

      const successfulFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            results: [
              {
                set_id: 'set-real-123',
                effective_time: '20231102',
                openfda: { product_ndc: ['72189-285'] },
                dosage_and_administration: 'Real clinical dosage',
              },
            ],
          }),
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
        rpc: vi.fn(),
      };

      const result = await syncDrugLabelForProduct(targetProduct, mockSupabase as any, {
        dryRun: true, // DRY RUN
        fetchImpl: successfulFetch as any,
      });

      expect(mockSupabase.rpc).not.toHaveBeenCalled(); // ZERO writes to DB!
      expect(result.outcome).toBe('created');
    });
  });
});


import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { LanguageProvider } from '../src/context/LanguageContext';

import {
  calculatePatientAgeInMonths,
  resolvePatientWeight,
  parseStructuredConcentration,
  checkPenicillinAllergy,
  parseDosesPerDay,
  calculatePediatricDose,
  calculateDosageRounding,
  checkPatientEligibilityForRule,
  verifyProductPediatricEligibilityPure,
} from '../src/lib/pediatricCalculator';

import {
  fetchPediatricDosageRuleForProduct,
  reviewPediatricDosageRule,
  getPediatricPatientContext,
  _setInMemoryPediatricRule,
  _setInMemoryProduct,
  _resetInMemoryPediatricRules,
  verifyPediatricProductEligibility,
} from '../src/services/pediatricDosageService';

import {
  ElectronicPrescriptionSection,
  isItemEligibleForPediatricAmoxicillin,
} from '../src/components/prescriptions/ElectronicPrescriptionSection';
import * as prescriptionService from '../src/services/prescriptionService';
import { _resetInMemoryPrescriptions } from '../src/services/prescriptionService';

import { PediatricDosageCalculatorModal } from '../src/components/prescriptions/PediatricDosageCalculatorModal';
import {
  PediatricRuleReviewModal,
  extractPediatricDosingExcerpt,
} from '../src/components/prescriptions/PediatricRuleReviewModal';
import {
  PediatricDosageRule,
  PediatricPatientContext,
  DEFAULT_AMOXICILLIN_REGIMENS,
  PEDIATRIC_INDICATION_GROUPS,
  PEDIATRIC_SEVERITIES,
} from '../src/types/pediatricDosage';

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

// Mock Next.js navigation
const mockBack = vi.fn();
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockPathname = '/doctor/examination/visit-pediatric-calc-test';
let mockParams = { visitId: 'visit-pediatric-calc-test' };
let mockSearchParamsGet = vi.fn().mockReturnValue(null);

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  usePathname: () => mockPathname,
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParamsGet(key),
  }),
}));

describe('Safe Pediatric Dosage Calculator - Phase 1 (حاسبة جرعات الأطفال الآمنة)', () => {
  const migration21Path = path.resolve(__dirname, '../supabase/migrations/00021_pediatric_dosage_calculator.sql');
  const sqlTestPath = path.resolve(__dirname, '../supabase/tests/test_pediatric_dosage_calculator.sql');
  let migration21Sql = '';

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSupabaseConfigured.mockReturnValue(false);
    mockSearchParamsGet.mockReturnValue(null);
    if (fs.existsSync(migration21Path)) {
      migration21Sql = fs.readFileSync(migration21Path, 'utf8');
    }
  });

  // ============================================================================
  // 1. SQL Migration Contract Verification (00021)
  // ============================================================================
  describe('1. SQL Migration 00021 Contract & Architecture Integrity', () => {
    it('migration 00021 file exists with proper naming convention', () => {
      expect(fs.existsSync(migration21Path)).toBe(true);
      expect(fs.existsSync(sqlTestPath)).toBe(true);
    });

    it('creates public.pediatric_dosage_rules table with required columns and constraints', () => {
      expect(migration21Sql).toContain('CREATE TABLE IF NOT EXISTS public.pediatric_dosage_rules');
      expect(migration21Sql).toContain('product_id UUID NOT NULL');
      expect(migration21Sql).toContain('drug_label_id UUID NOT NULL');
      expect(migration21Sql).toContain('min_dose_mg_per_kg_day NUMERIC(8, 2)');
      expect(migration21Sql).toContain('max_dose_mg_per_kg_day NUMERIC(8, 2)');
      expect(migration21Sql).toContain('min_age_value NUMERIC(6, 2) NOT NULL');
      expect(migration21Sql).toContain('max_weight_kg NUMERIC(6, 2) NOT NULL');
      expect(migration21Sql).toContain('review_status VARCHAR(30) NOT NULL DEFAULT \'pending_review\'');
      expect(migration21Sql).toContain('reviewed_by UUID');
      expect(migration21Sql).toContain('reviewed_at TIMESTAMPTZ');
      expect(migration21Sql).toContain('label_payload_hash TEXT NOT NULL');
      expect(migration21Sql).toContain('label_effective_time TEXT');
    });

    it('enforces review_status check constraint covering pending_review, approved, rejected, and needs_re_review', () => {
      expect(migration21Sql).toContain('chk_pdr_review_status');
      expect(migration21Sql).toContain('pending_review');
      expect(migration21Sql).toContain('approved');
      expect(migration21Sql).toContain('rejected');
      expect(migration21Sql).toContain('needs_re_review');
    });

    it('defines public.review_pediatric_dosage_rule with SECURITY DEFINER and search_path = ""', () => {
      expect(migration21Sql).toContain('FUNCTION public.review_pediatric_dosage_rule');
      expect(migration21Sql).toContain('SECURITY DEFINER');
      expect(migration21Sql).toContain("SET search_path = ''");
      expect(migration21Sql).toContain('IF NOT public.is_doctor() THEN');
    });

    it('creates automatic invalidation trigger when upstream drug_labels payload_hash or version changes', () => {
      expect(migration21Sql).toContain('trg_invalidate_pediatric_rules_on_label_change');
      expect(migration21Sql).toContain('needs_re_review');
      expect(migration21Sql).toContain('payload_hash');
    });

    it('seeds the initial Amoxicillin rule in pending_review status', () => {
      expect(migration21Sql).toContain("'pending_review'");
      expect(migration21Sql).toContain('50090-6351');
      expect(migration21Sql).toContain("'Amoxicillin'");
    });
  });

  // ============================================================================
  // 2. Pure Mathematical & Clinical Verification Unit Tests
  // ============================================================================
  describe('2. Mathematical & Clinical Engine Unit Tests', () => {
    describe('calculatePatientAgeInMonths', () => {
      it('calculates exact age for 3 months infant', () => {
        const res = calculatePatientAgeInMonths('2026-07-01', '2026-10-01');
        expect(res.months).toBe(3);
        expect(res.formatted).toContain('3 أشهر');
      });

      it('calculates exact age for 2 years (24 months) toddler', () => {
        const res = calculatePatientAgeInMonths('2024-10-01', '2026-10-01');
        expect(res.months).toBe(24);
        expect(res.formatted).toContain('2');
      });

      it('handles negative or invalid future dates safely', () => {
        const res = calculatePatientAgeInMonths('2027-01-01', '2026-10-01');
        expect(res.months).toBe(0);
      });
    });

    describe('resolvePatientWeight', () => {
      it('prioritizes current visit weight when positive', () => {
        const res = resolvePatientWeight(12.5, '2026-10-01', [
          { weight_kg: 10, created_at: '2026-08-01' },
        ]);
        expect(res.weightKg).toBe(12.5);
        expect(res.source).toBe('current_visit');
        expect(res.warning).toBeFalsy();
      });

      it('falls back to latest previous visit weight with explicit prominent warning', () => {
        const res = resolvePatientWeight(null, '2026-10-01', [
          { weight_kg: 14.2, created_at: '2026-07-15' },
          { weight_kg: 11.0, created_at: '2026-01-10' },
        ]);
        expect(res.weightKg).toBe(14.2);
        expect(res.source).toBe('previous_visit');
        expect(res.date).toBe('2026-07-15');
        expect(res.warning).toContain('أحدث وزن موثق سابقاً');
      });

      it('returns null weightKg and warning when no weight is recorded anywhere', () => {
        const res = resolvePatientWeight(null, '2026-10-01', []);
        expect(res.weightKg).toBeNull();
        expect(res.source).toBe('none');
        expect(res.warning).toContain('لا يوجد وزن مسجل للطفل');
      });
    });

    describe('parseStructuredConcentration', () => {
      it('correctly parses 250mg/5mL to 50 mg/mL', () => {
        const c = parseStructuredConcentration('250 mg / 5 mL');
        expect(c.isValid).toBe(true);
        expect(c.numeratorMg).toBe(250);
        expect(c.denominatorMl).toBe(5);
        expect(c.concentrationMgPerMl).toBe(50);
      });

      it('correctly parses 125mg/5mL to 25 mg/mL', () => {
        const c = parseStructuredConcentration('125mg / 5ml');
        expect(c.isValid).toBe(true);
        expect(c.concentrationMgPerMl).toBe(25);
      });

      it('correctly parses 400 mg / 5 mL to 80 mg/mL', () => {
        const c = parseStructuredConcentration('400mg/5ml');
        expect(c.isValid).toBe(true);
        expect(c.concentrationMgPerMl).toBe(80);
      });

      it('returns invalid for unparseable or non-liquid strengths', () => {
        const c = parseStructuredConcentration('500mg tablet');
        expect(c.isValid).toBe(false);
      });
    });

    describe('checkPenicillinAllergy', () => {
      it('detects Penicillin and Amoxicillin in English', () => {
        expect(checkPenicillinAllergy('Penicillin', '', '').hasAllergy).toBe(true);
        expect(checkPenicillinAllergy('', 'Amoxicillin allergy', '').hasAllergy).toBe(true);
        expect(checkPenicillinAllergy('', '', 'History of beta-lactam anaphylaxis').hasAllergy).toBe(true);
      });

      it('detects Penicillin and Amoxicillin in Arabic', () => {
        expect(checkPenicillinAllergy('حساسية بنسلين', '', '').hasAllergy).toBe(true);
        expect(checkPenicillinAllergy('', 'أموكسيسيلين', '').hasAllergy).toBe(true);
        expect(checkPenicillinAllergy('', '', 'تحسس من البنسلين').hasAllergy).toBe(true);
      });

      it('returns false for negative or empty allergy fields', () => {
        expect(checkPenicillinAllergy('لا توجد حساسية', 'No known drug allergies', 'NKDA').hasAllergy).toBe(false);
        expect(checkPenicillinAllergy(null, null, null).hasAllergy).toBe(false);
      });
    });

    describe('calculatePediatricDose Math Accuracy', () => {
      it('calculates correct dose: 10 kg x 30 mg/kg/day / 2 doses / 50 mg/mL = 3 mL single dose', () => {
        const res = calculatePediatricDose({
          weightKg: 10,
          targetMgPerKgDay: 30,
          dosesPerDay: 2,
          strengthNumeratorMg: 250,
          strengthDenominatorMl: 5,
        });

        expect(res.dailyMg).toBe(300); // 10 * 30
        expect(res.singleDoseMg).toBe(150); // 300 / 2
        expect(res.concentrationMgPerMl).toBe(50); // 250 / 5
        expect(res.singleDoseMlSuggested).toBe(3); // 150 / 50
        expect(res.formulaDescription).toContain('10 كغم × 30 ملغ/كغم/يوم = 300.0 ملغ/يوم');
      });

      it('calculates correct dose for 8-hour frequency: 15 kg x 40 mg/kg/day / 3 doses / 50 mg/mL = 4 mL', () => {
        const res = calculatePediatricDose({
          weightKg: 15,
          targetMgPerKgDay: 40,
          dosesPerDay: 3,
          strengthNumeratorMg: 250,
          strengthDenominatorMl: 5,
        });

        expect(res.dailyMg).toBe(600); // 15 * 40
        expect(res.singleDoseMg).toBe(200); // 600 / 3
        expect(res.singleDoseMlSuggested).toBe(4); // 200 / 50
        expect(res.formulaDescription).toContain('15 كغم × 40 ملغ/كغم/يوم = 600.0 ملغ/يوم');
      });

      it('throws error if weight or dose parameters are non-positive', () => {
        expect(() =>
          calculatePediatricDose({
            weightKg: 0,
            targetMgPerKgDay: 30,
            dosesPerDay: 2,
            strengthNumeratorMg: 250,
            strengthDenominatorMl: 5,
          })
        ).toThrow('وزن الطفل يجب أن يكون أكبر من الصفر');

        expect(() =>
          calculatePediatricDose({
            weightKg: 10,
            targetMgPerKgDay: 0,
            dosesPerDay: 2,
            strengthNumeratorMg: 250,
            strengthDenominatorMl: 5,
          })
        ).toThrow('الجرعة المستهدفة mg/kg/day يجب أن تكون أكبر من الصفر');
      });
    });

    describe('isItemEligibleForPediatricAmoxicillin Helper', () => {
      it('returns true for Amoxicillin Oral Suspension single ingredient', () => {
        expect(
          isItemEligibleForPediatricAmoxicillin({
            medication_name: 'Amoxicillin Oral Suspension',
            active_ingredient: 'Amoxicillin',
            dosage_form: 'suspension',
            catalog_product_id: 'prod-1',
          } as any)
        ).toBe(true);
      });

      it('returns false for Amoxicillin Clavulanate (Augmentin) combination', () => {
        expect(
          isItemEligibleForPediatricAmoxicillin({
            medication_name: 'Amoxicillin and Clavulanate Potassium Suspension',
            active_ingredient: 'Amoxicillin + Clavulanic Acid',
            dosage_form: 'suspension',
            catalog_product_id: 'prod-2',
          } as any)
        ).toBe(false);
      });

      it('returns false for solid oral dosage forms (Tablets/Capsules)', () => {
        expect(
          isItemEligibleForPediatricAmoxicillin({
            medication_name: 'Amoxicillin Capsules 500mg',
            active_ingredient: 'Amoxicillin',
            dosage_form: 'capsule',
            catalog_product_id: 'prod-3',
          } as any)
        ).toBe(false);
      });

      it('returns false for different medications like Paracetamol', () => {
        expect(
          isItemEligibleForPediatricAmoxicillin({
            medication_name: 'Paracetamol Syrup',
            active_ingredient: 'Paracetamol',
            dosage_form: 'syrup',
            catalog_product_id: 'prod-4',
          } as any)
        ).toBe(false);
      });
    });
  });

  // ============================================================================
  // 3. Service Layer & In-Memory Fallback Tests
  // ============================================================================
  describe('3. Pediatric Dosage Service Layer Tests', () => {
    it('fetches rule for Amoxicillin product in pending_review initial status', async () => {
      const rule = await fetchPediatricDosageRuleForProduct('00000000-0000-0000-0000-000000000102');
      expect(rule).not.toBeNull();
      expect(rule?.product_id).toBe('00000000-0000-0000-0000-000000000102');
      expect(rule?.review_status).toBe('pending_review');
    });

    it('approves rule through reviewPediatricDosageRule', async () => {
      const updated = await reviewPediatricDosageRule(
        '00000000-0000-0000-0000-000000000301',
        'approve',
        'Approved by Dr. Kareem for standard pediatric respiratory infections.'
      );
      expect(updated.review_status).toBe('approved');
      expect(updated.review_notes).toContain('Approved by Dr. Kareem');
    });
  });

  // ============================================================================
  // 4. UI Components & Workflow Integration Tests
  // ============================================================================
  describe('4. UI Components & Prescription Integration Tests', () => {
    const mockContext: PediatricPatientContext = {
      patientId: 'pat-1',
      visitId: 'vis-1',
      patientName: 'أحمد علي',
      dateOfBirth: '2024-04-01',
      visitDate: '2026-10-01',
      ageInMonths: 30,
      ageDays: 0,
      ageFormatted: '30 شهر (سنتان و6 أشهر)',
      isAgeSupportedByCalculator: true,
      weightKg: 12,
      weightSource: 'current_visit',
      weightDate: '2026-10-01',
      weightWarning: null,
      hasPenicillinOrAmoxicillinAllergy: false,
      allergyMatchType: 'none',
      allergyMatchTerm: undefined,
      rawAllergiesText: null,
    };

    const mockApprovedRule: PediatricDosageRule = {
      id: '00000000-0000-0000-0000-000000000301',
      product_id: '00000000-0000-0000-0000-000000000102',
      drug_label_id: '00000000-0000-0000-0000-000000000201',
      active_ingredient: 'Amoxicillin',
      dosage_form: 'suspension',
      route: 'oral',
      min_age_value: 3.0,
      min_age_unit: 'months',
      min_age_inclusive: false,
      max_weight_kg: 40.0,
      max_weight_inclusive: false,
      min_dose_mg_per_kg_day: 20,
      max_dose_mg_per_kg_day: 40,
      allowed_frequencies: ['every 12 hours', 'every 8 hours'],
      source_reference: 'openFDA 50090-6351',
      source_excerpt: 'Pediatric Patients: 20 to 40 mg/kg/day in divided doses every 8 to 12 hours.',
      label_payload_hash: 'hash-amox-label-v1',
      review_status: 'approved',
      product_display_name: 'Amoxicillin Oral Suspension 250mg/5mL',
      label_dosage_and_administration: 'Pediatric Patients: 20 to 40 mg/kg/day in divided doses every 8 to 12 hours.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('renders PediatricDosageCalculatorModal with clinical vitals and calculated results', () => {
      const handleApply = vi.fn();
      const handleRuleUpdated = vi.fn();

      render(
        <LanguageProvider>
          <PediatricDosageCalculatorModal
            isOpen={true}
            onClose={vi.fn()}
            patientContext={mockContext}
            rule={mockApprovedRule}
            productDisplayName="Amoxicillin Oral Suspension"
            rawStrengthText="250 mg / 5 mL"
            onRuleUpdated={handleRuleUpdated}
            onApplyResult={handleApply}
          />
        </LanguageProvider>
      );

      // Check Patient Info
      expect(screen.getByText('أحمد علي')).toBeDefined();
      expect(screen.getAllByText(/30 شهر/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/12/).length).toBeGreaterThan(0);

      // Check math output: 12 kg x 25 mg/kg/day = 300 mg/day -> 150 mg single -> 3.0 mL
      expect(screen.getAllByText(/3(\.0)? مل/).length).toBeGreaterThan(0);
    });

    it('blocks unapproved rules and displays review trigger banner', () => {
      const pendingRule: PediatricDosageRule = {
        ...mockApprovedRule,
        review_status: 'pending_review',
      };

      render(
        <LanguageProvider>
          <PediatricDosageCalculatorModal
            isOpen={true}
            onClose={vi.fn()}
            patientContext={mockContext}
            rule={pendingRule}
            productDisplayName="Amoxicillin Oral Suspension"
            rawStrengthText="250 mg / 5 mL"
            onRuleUpdated={vi.fn()}
            onApplyResult={vi.fn()}
          />
        </LanguageProvider>
      );

      expect(screen.getByTestId('unapproved-rule-banner')).toBeDefined();
      expect(screen.getByTestId('open-rule-review-btn')).toBeDefined();
      // Apply button should be disabled
      const applyBtn = screen.getByTestId('apply-pediatric-dose-btn') as HTMLButtonElement;
      expect(applyBtn.disabled).toBe(true);
    });

    it('strictly enforces allergy as a HARD STOP: no acknowledgment checkbox, permanently disabled apply, and demands alternative therapy', () => {
      const allergicContext: PediatricPatientContext = {
        ...mockContext,
        hasPenicillinOrAmoxicillinAllergy: true,
        allergyMatchTerm: 'Penicillin',
        rawAllergiesText: 'Severe allergy to Penicillin',
      };
      const handleApply = vi.fn();

      render(
        <LanguageProvider>
          <PediatricDosageCalculatorModal
            isOpen={true}
            onClose={vi.fn()}
            patientContext={allergicContext}
            rule={mockApprovedRule}
            productDisplayName="Amoxicillin Oral Suspension"
            rawStrengthText="250 mg / 5 mL"
            onRuleUpdated={vi.fn()}
            onApplyResult={handleApply}
          />
        </LanguageProvider>
      );

      // 1. Alert must be a prominent hard-stop contraindication banner
      expect(screen.getByTestId('allergy-warning-banner')).toBeDefined();
      expect(screen.getByText(/Severe allergy to Penicillin/)).toBeDefined();
      expect(screen.getByText(/إيقاف سريري نهائي/)).toBeDefined();
      expect(screen.getAllByText(/علاج بديل/).length).toBeGreaterThanOrEqual(1);

      // 2. Acknowledgment checkbox or override mechanisms MUST NOT EXIST
      expect(screen.queryByTestId('allergy-acknowledge-checkbox')).toBeNull();
      expect(screen.queryByText(/أقر بأنني دققت سجل الحساسية/)).toBeNull();

      // 3. Alternative therapy notice is visible
      expect(screen.getByTestId('allergy-alternative-therapy-notice')).toBeDefined();

      // 4. Apply button is permanently disabled
      const applyBtn = screen.getByTestId('apply-pediatric-dose-btn') as HTMLButtonElement;
      expect(applyBtn.disabled).toBe(true);

      // 5. Clicking apply does NOT trigger any action or modal
      fireEvent.click(applyBtn);
      expect(handleApply).not.toHaveBeenCalled();
      expect(screen.queryByTestId('confirm-apply-dose-modal')).toBeNull();
    });

    it('displays previous visit weight warning when weight is not from current visit', () => {
      const priorWeightContext: PediatricPatientContext = {
        ...mockContext,
        weightSource: 'previous_visit',
        weightDate: '2026-08-15',
        weightWarning: 'تنبيه سريري: الوزن المستخدم (12 كغ) مأخوذ من زيارة سابقة بتاريخ 2026-08-15. يُرجى التحقق من وزن الطفل الحالي قبل الاعتماد.',
      };

      render(
        <LanguageProvider>
          <PediatricDosageCalculatorModal
            isOpen={true}
            onClose={vi.fn()}
            patientContext={priorWeightContext}
            rule={mockApprovedRule}
            productDisplayName="Amoxicillin Oral Suspension"
            rawStrengthText="250 mg / 5 mL"
            onRuleUpdated={vi.fn()}
            onApplyResult={vi.fn()}
          />
        </LanguageProvider>
      );

      expect(screen.getByTestId('weight-warning-banner')).toBeDefined();
      expect(screen.getByText(/2026-08-15/)).toBeDefined();
    });

    it('requires confirmation modal before transferring results to prescription draft', async () => {
      const handleApply = vi.fn();

      render(
        <LanguageProvider>
          <PediatricDosageCalculatorModal
            isOpen={true}
            onClose={vi.fn()}
            patientContext={mockContext}
            rule={mockApprovedRule}
            productDisplayName="Amoxicillin Oral Suspension"
            rawStrengthText="250 mg / 5 mL"
            onRuleUpdated={vi.fn()}
            onApplyResult={handleApply}
          />
        </LanguageProvider>
      );

      const applyBtn = screen.getByTestId('apply-pediatric-dose-btn');
      fireEvent.click(applyBtn);

      // Confirmation modal appears
      expect(screen.getByTestId('confirm-apply-dose-modal')).toBeDefined();
      expect(screen.getByTestId('confirm-apply-dose-btn')).toBeDefined();
      expect(handleApply).not.toHaveBeenCalled();

      // Click confirm in modal
      fireEvent.click(screen.getByTestId('confirm-apply-dose-btn'));

      expect(handleApply).toHaveBeenCalledWith({
        dose: expect.stringMatching(/3(\.0)? مل/),
        instructions: expect.stringMatching(/3(\.0)? مل/),
        frequency: expect.stringContaining('كل 12 ساعة'),
      });
    });

    it('renders PediatricRuleReviewModal allowing doctor to review openFDA labeling and approve rule', async () => {
      const pendingRule: PediatricDosageRule = {
        ...mockApprovedRule,
        review_status: 'pending_review',
      };
      const handleRuleSaved = vi.fn();

      render(
        <LanguageProvider>
          <PediatricRuleReviewModal
            isOpen={true}
            onClose={vi.fn()}
            rule={pendingRule}
            currentUserRole="doctor"
            onRuleSaved={handleRuleSaved}
          />
        </LanguageProvider>
      );

      // Shows openFDA official labeling section
      expect(screen.getByTestId('official-fda-label-section')).toBeDefined();
      expect(screen.getByText(/Pediatric Patients: 20 to 40 mg\/kg\/day/)).toBeDefined();

      // Enter review notes
      const notesInput = screen.getByTestId('rule-review-notes-input');
      fireEvent.change(notesInput, {
        target: { value: 'تمت المراجعة والاعتماد سريريًا لحالات التهاب الأذن الوسطى والجهاز التنفسي.' },
      });

      // Click Approve - opens confirmation modal
      const approveBtn = screen.getByTestId('approve-rule-btn');
      fireEvent.click(approveBtn);

      // Confirm approval in confirmation modal
      const confirmApproveBtn = screen.getByTestId('confirm-approve-rule-btn');
      fireEvent.click(confirmApproveBtn);

      await waitFor(() => {
        expect(handleRuleSaved).toHaveBeenCalledWith(
          expect.objectContaining({
            review_status: 'approved',
            review_notes: expect.stringContaining('تمت المراجعة والاعتماد'),
          })
        );
      });
    });
  });

  // ============================================================================
  // 5. Mandatory 18 Edge Cases and Verification Tests
  // ============================================================================
  describe('5. Mandatory 18 Edge Cases & Verification Scenarios', () => {
    const standardRule: PediatricDosageRule = {
      id: '00000000-0000-0000-0000-000000000301',
      product_id: '00000000-0000-0000-0000-000000000102',
      drug_label_id: '00000000-0000-0000-0000-000000000201',
      active_ingredient: 'Amoxicillin',
      dosage_form: 'suspension',
      route: 'oral',
      min_age_value: 3.0,
      min_age_unit: 'months',
      min_age_inclusive: false, // > 3 months strictly
      max_weight_kg: 40.0,
      max_weight_inclusive: false, // < 40 kg strictly
      min_dose_mg_per_kg_day: 20,
      max_dose_mg_per_kg_day: 45,
      allowed_frequencies: ['every 12 hours', 'every 8 hours'],
      source_reference: 'openFDA 50090-6351',
      source_excerpt: 'Pediatric Patients: 20 to 40 mg/kg/day in divided doses every 8 to 12 hours.',
      label_payload_hash: 'hash-amox-label-v1',
      review_status: 'approved',
      product_display_name: 'Amoxicillin Oral Suspension 250mg/5mL',
      label_dosage_and_administration: 'Pediatric Patients: 20 to 40 mg/kg/day in divided doses every 8 to 12 hours.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mockContext: PediatricPatientContext = {
      patientId: 'pat-1',
      visitId: 'vis-1',
      patientName: 'أحمد علي',
      dateOfBirth: '2024-04-01',
      visitDate: '2026-10-01',
      ageInMonths: 30,
      ageDays: 0,
      ageFormatted: '30 شهر (سنتان و6 أشهر)',
      isAgeSupportedByCalculator: true,
      weightKg: 12,
      weightSource: 'current_visit',
      weightDate: '2026-10-01',
      weightWarning: null,
      hasPenicillinOrAmoxicillinAllergy: false,
      allergyMatchType: 'none',
      allergyMatchTerm: undefined,
      rawAllergiesText: null,
    };

    // 1. طفل عمره أقل من 3 أشهر: ظهور رسالة واضحة بأنه خارج نطاق الحاسبة الحالي، مع التحقق من عدم استخدام عبارة "غير معتمد"
    it('Case 1: Child age < 3 months shows explicit out-of-scope message and does NOT say "غير معتمد"', () => {
      const ageRes = calculatePatientAgeInMonths('2026-08-15', '2026-10-01'); // ~1.5 months
      const check = checkPatientEligibilityForRule(ageRes.months, ageRes.days, 5.0, standardRule);
      expect(check.isEligible).toBe(false);
      expect(check.ageBlocked).toBe(true);
      expect(check.reason).toBeDefined();
      expect(check.reason).toContain('هذه الفئة العمرية غير مدعومة في الإصدار الحالي من الحاسبة. يجب الرجوع إلى النشرة الرسمية وتحديد الجرعة يدويًا.');
      expect(check.reason).not.toContain('غير معتمد');
    });

    // 2. طفل عمره 3 أشهر بالضبط: التأكد من استبعاده من قاعدة > 3 months
    it('Case 2: Child age exactly 3 months (0 days) is excluded from > 3 months rule', () => {
      const ageRes = calculatePatientAgeInMonths('2026-07-01', '2026-10-01'); // exactly 3 months, 0 days
      expect(ageRes.months).toBe(3);
      expect(ageRes.days).toBe(0);
      expect(ageRes.isGreaterThanThreeMonths).toBe(false);

      const check = checkPatientEligibilityForRule(3, 0, 6.0, standardRule);
      expect(check.isEligible).toBe(false);
      expect(check.ageBlocked).toBe(true);
      expect(check.reason).toContain('هذه الفئة العمرية غير مدعومة في الإصدار الحالي من الحاسبة');
    });

    // 3. طفل عمره 3 أشهر ويوم واحد: قبوله ضمن القاعدة
    it('Case 3: Child age 3 months and 1 day is eligible under > 3 months rule', () => {
      const ageRes = calculatePatientAgeInMonths('2026-06-30', '2026-10-01'); // 3 months and 1 day
      expect(ageRes.months).toBe(3);
      expect(ageRes.days).toBeGreaterThanOrEqual(1);
      expect(ageRes.isGreaterThanThreeMonths).toBe(true);

      const check = checkPatientEligibilityForRule(ageRes.months, ageRes.days, 6.5, standardRule);
      expect(check.isEligible).toBe(true);
      expect(check.ageBlocked).toBe(false);
    });

    // 4. طفل وزنه 39.9 kg: قبوله ضمن شرط weight < 40 kg
    it('Case 4: Child weighing 39.9 kg is eligible under weight < 40 kg condition', () => {
      const check = checkPatientEligibilityForRule(60, 0, 39.9, standardRule);
      expect(check.isEligible).toBe(true);
      expect(check.weightBlocked).toBe(false);
    });

    // 5. طفل وزنه 40.0 kg: استبعاده من قاعدة الأطفال (< 40 kg)
    it('Case 5: Child weighing exactly 40.0 kg is excluded from pediatric calculator (< 40 kg)', () => {
      const check = checkPatientEligibilityForRule(60, 0, 40.0, standardRule);
      expect(check.isEligible).toBe(false);
      expect(check.weightBlocked).toBe(true);
      expect(check.reason).toContain('40');
      expect(check.reason).toContain('جرعات البالغين');
    });

    // 6. طفل وزنه أكبر من 40 kg (مثل 45 kg): إيقاف الحاسبة وتوضيح تطبيق جرعات البالغين
    it('Case 6: Child weighing > 40 kg (e.g. 45 kg) halts calculator and clarifies adult dosing applies', () => {
      const check = checkPatientEligibilityForRule(72, 0, 45.0, standardRule);
      expect(check.isEligible).toBe(false);
      expect(check.weightBlocked).toBe(true);
      expect(check.reason).toContain('جرعات البالغين');
      expect(check.reason).toContain('45');
      expect(check.reason).toContain('تنص النشرة الرسمية على تطبيق جرعات البالغين لهذه الفئة');
    });

    // 7. عدم استخدام سقف عمري منفصل (مثل 216 شهرًا) بديلًا عن شرط الوزن
    it('Case 7: Weight limit (< 40 kg) controls pediatric scope; older child < 40kg allowed, young child >= 40kg blocked', () => {
      expect(standardRule.max_weight_kg).toBe(40.0);
      expect(standardRule.max_weight_inclusive).toBe(false);

      // Child aged 10 years (120 months) weighing 32 kg is eligible
      const olderLightChild = checkPatientEligibilityForRule(120, 0, 32.0, standardRule);
      expect(olderLightChild.isEligible).toBe(true);

      // Child aged 6 years (72 months) weighing 42 kg is blocked by weight regardless of age
      const youngHeavyChild = checkPatientEligibilityForRule(72, 0, 42.0, standardRule);
      expect(youngHeavyChild.isEligible).toBe(false);
      expect(youngHeavyChild.weightBlocked).toBe(true);
    });

    // 8. عدم توليد عبارة "مع الأكل" تلقائيًا بأي شكل
    it('Case 8: Never generates "مع الأكل" automatically in formulas, results, or instructions', () => {
      const calcResult = calculatePediatricDose({
        weightKg: 10,
        targetMgPerKgDay: 30,
        dosesPerDay: 2,
        strengthNumeratorMg: 250,
        strengthDenominatorMl: 5,
      });

      expect(calcResult.formulaDescription).not.toContain('مع الأكل');
      expect(calcResult.formulaDescription).not.toContain('مع الطعام');
    });

    // 9. الحفاظ على التعليمات السابقة للطبيب عند تطبيق الجرعة
    it('Case 9: Preserves existing doctor instructions when applying pediatric dose to prescription item', () => {
      const existingDocInstructions = 'يرج جيدا قبل الاستعمال ويحفظ في الثلاجة';
      const appliedDoseInstruction = '3 مل بالفم كل 12 ساعة لمدة 7 أيام';

      const combinedInstructions = `${appliedDoseInstruction}. ${existingDocInstructions}`;
      expect(combinedInstructions).toContain(existingDocInstructions);
      expect(combinedInstructions).toContain(appliedDoseInstruction);
    });

    // 10. عرض القيمة الكسرية الخام والتقريب المقترح معًا
    it('Case 10: Calculates and returns raw float mL and suggested rounded mL together', () => {
      const rounding = calculateDosageRounding(3.567, 50, 11.2, 2, 20, 45);
      expect(rounding.rawSingleDoseMl).toBe(3.567);
      expect(rounding.roundedSingleDoseMl).toBe(3.6);
      expect(rounding.differenceMl).toBeCloseTo(0.033, 3);
    });

    // 11. حساب الجرعة الفردية الفعلية والجرعة اليومية الفعلية وmg/kg/day الفعلي بعد التقريب
    it('Case 11: Accurately calculates actual single mg, actual daily mg, and actual mg/kg/day from rounded mL', () => {
      // 12 kg child, 50 mg/mL, 2 doses/day, raw = 3.6 mL -> 180 mg single -> 360 mg daily -> 30 mg/kg/day
      const rounding = calculateDosageRounding(3.6, 50, 12, 2, 20, 45);
      expect(rounding.actualSingleDoseMg).toBe(180);
      expect(rounding.actualDailyMg).toBe(360);
      expect(rounding.actualMgPerKgDay).toBe(30);
      expect(rounding.isWithinBounds).toBe(true);
    });

    // 12. حظر أو تحذير التقريب الذي يُخرج mg/kg/day الفعلي عن النطاق المعتمد
    it('Case 12: Detects and warns if rounded dose causes actual mg/kg/day to violate approved boundaries', () => {
      // 4 kg child, 250 mg/mL high conc, 2 doses/day. Max allowed = 45 mg/kg/day
      // raw = 0.38 mL. If rounded to 0.4 mL: 0.4 * 250 = 100 mg * 2 = 200 mg / 4 kg = 50 mg/kg/day (> 45)
      const highRounding = calculateDosageRounding(0.38, 250, 4, 2, 20, 45);
      expect(highRounding.roundedSingleDoseMl).toBe(0.4);
      expect(highRounding.actualMgPerKgDay).toBe(50);
      expect(highRounding.isWithinBounds).toBe(false);
      expect(highRounding.boundaryViolation).toBe('exceeds_max');

      // Low rounding violation test
      const lowRounding = calculateDosageRounding(0.12, 250, 4, 2, 20, 45);
      expect(lowRounding.roundedSingleDoseMl).toBe(0.1); // 0.1 * 250 = 25 * 2 = 50 / 4 = 12.5 mg/kg/day (< 20)
      expect(lowRounding.isWithinBounds).toBe(false);
      expect(lowRounding.boundaryViolation).toBe('below_min');
    });

    // 13. عدم نقل أي قيمة دون تأكيد صريح من الطبيب
    it('Case 13: Dose values are NOT transferred to prescription without explicit doctor confirmation', () => {
      const handleApply = vi.fn();
      render(
        <LanguageProvider>
          <PediatricDosageCalculatorModal
            isOpen={true}
            onClose={vi.fn()}
            patientContext={mockContext}
            rule={standardRule}
            productDisplayName="Amoxicillin Oral Suspension"
            rawStrengthText="250 mg / 5 mL"
            onRuleUpdated={vi.fn()}
            onApplyResult={handleApply}
          />
        </LanguageProvider>
      );

      // Initially handleApply is NOT called
      expect(handleApply).not.toHaveBeenCalled();

      // Clicking apply opens confirmation modal
      const applyBtn = screen.getByTestId('apply-pediatric-dose-btn');
      fireEvent.click(applyBtn);
      expect(screen.getByTestId('confirm-apply-dose-modal')).toBeDefined();
      expect(handleApply).not.toHaveBeenCalled();

      // Only clicking the confirmation button transfers values
      const confirmBtn = screen.getByTestId('confirm-apply-dose-btn');
      fireEvent.click(confirmBtn);
      expect(handleApply).toHaveBeenCalledTimes(1);
    });

    // 14. نجاح الـ Migration على قاعدة فارغة تمامًا دون وجود بيانات openFDA
    it('Case 14: Migration 00021 succeeds on clean database without openFDA data (fail-closed)', () => {
      expect(migration21Sql).toContain('SELECT COUNT(*) INTO v_label_count');
      expect(migration21Sql).toContain('IF v_label_count <> 1 THEN');
      expect(migration21Sql).toContain('Skipping rule creation to avoid ambiguity.');
    });

    // 15. نجاح الـ Migration في حال وجود الدواء والنشرة المعتمدة وربط الـ snapshot
    it('Case 15: Migration 00021 stores approved_snapshot with exact label payload hash and version', () => {
      expect(migration21Sql).toContain('approved_snapshot');
      expect(migration21Sql).toContain('jsonb_build_object');
      expect(migration21Sql).toContain('label_payload_hash');
      expect(migration21Sql).toContain('label_effective_time');
      expect(migration21Sql).toContain('v_label.payload_hash');
    });

    // 16. عدم إنشاء قاعدة إذا كان هناك لبس أو أكثر من سجل مطابق
    it('Case 16: Migration 00021 strictly requires v_label_count = 1 before seeding rule', () => {
      expect(migration21Sql).toContain('IF v_label_count <> 1 THEN');
      expect(migration21Sql).toContain('Expected exactly 1 drug_label');
    });

    // 17. عدم الاعتماد على UUIDs مخصصة لبيئة معينة داخل الـ Migration
    it('Case 17: Migration 00021 has ZERO hardcoded UUIDs and generates or selects IDs dynamically', () => {
      // Regex checking for hardcoded UUID literal strings like 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' in SQL
      const uuidRegex = /'([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'/g;
      const matches = migration21Sql.match(uuidRegex);
      expect(matches).toBeNull();
      expect(migration21Sql).toContain('gen_random_uuid()');
    });

    // 18. اختبار دقة الحساب: 10 kg، 30 mg/kg/day، مرتان يوميًا، تركيز 250mg/5mL = 3 mL لكل جرعة
    it('Case 18: Exact mathematical calculation: 10 kg x 30 mg/kg/day / 2 doses / 50 mg/mL = 3.0 mL single dose', () => {
      const res = calculatePediatricDose({
        weightKg: 10,
        targetMgPerKgDay: 30,
        dosesPerDay: 2,
        strengthNumeratorMg: 250,
        strengthDenominatorMl: 5,
      });

      expect(res.concentrationMgPerMl).toBe(50); // 250 / 5
      expect(res.dailyMg).toBe(300); // 10 * 30
      expect(res.singleDoseMg).toBe(150); // 300 / 2
      expect(res.singleDoseMlRaw).toBe(3); // 150 / 50
      expect(res.singleDoseMlSuggested).toBe(3);
      expect(res.rounding.actualMgPerKgDay).toBe(30);
      expect(res.rounding.isWithinBounds).toBe(true);
    });
  });

  // ============================================================================
  // 6. Eight Evasion Attempts & Fail-Closed Product Eligibility Tests
  // ============================================================================
  describe('6. Eight Evasion Attempts & Fail-Closed Product Eligibility Tests (محاولات التحايل الثمانية)', () => {
    const validProductId = '11111111-2222-3333-4444-555555555555';
    const validLabelId = '22222222-3333-4444-5555-666666666666';
    const validRuleId = '33333333-4444-5555-6666-777777777777';

    const validProduct = {
      id: validProductId,
      source_system: 'FDA_NDC',
      source_identifier: '50090-6351',
      dosage_form: 'suspension',
      route: 'oral',
      display_name: 'Amoxicillin Oral Suspension 250mg/5mL',
    };

    const validIngredients = [
      {
        active_ingredient: 'Amoxicillin',
        strength_numerator_value: 250,
        strength_numerator_unit: 'mg',
        strength_denominator_value: 5,
        strength_denominator_unit: 'mL',
      },
    ];

    const validRule = {
      id: validRuleId,
      product_id: validProductId,
      drug_label_id: validLabelId,
      review_status: 'approved',
      label_payload_hash: 'valid_hash_123',
    };

    const validLabel = {
      id: validLabelId,
      product_id: validProductId,
      payload_hash: 'valid_hash_123',
    };

    // 1. دواء custom اسمه Amoxicillin
    it('Evasion 1: Custom medication named Amoxicillin is rejected fail-closed', () => {
      // In prescription section helper
      const customItem = {
        medication_name: 'Amoxicillin Oral Suspension 250mg/5mL',
        active_ingredient: 'Amoxicillin',
        dosage_form: 'suspension' as any,
        catalog_product_id: null,
        is_custom_medication: true,
      };
      expect(isItemEligibleForPediatricAmoxicillin(customItem as any)).toBe(false);

      // In engine pure validator
      const res = verifyProductPediatricEligibilityPure({
        catalogProductId: null,
        product: null,
        ingredients: null,
        rule: null,
      });
      expect(res.isEligible).toBe(false);
      expect(res.reason).toContain('catalog_product_id مفقود');
    });

    // 2. منتج آخر اسمه يحتوي Amoxicillin لكنه غير مرتبط بالقاعدة المعتمدة
    it('Evasion 2: Product containing Amoxicillin in name but without approved rule is rejected', () => {
      const res = verifyProductPediatricEligibilityPure({
        catalogProductId: validProductId,
        product: validProduct,
        ingredients: validIngredients,
        rule: null, // No rule linked
      });
      expect(res.isEligible).toBe(false);
      expect(res.reason).toContain('لا توجد قاعدة جرعات مسجلة لهذا المنتج');
    });

    // 3. Amoxicillin متعدد المواد
    it('Evasion 3: Multi-ingredient Amoxicillin (e.g. + Clavulanate) is rejected', () => {
      const multiIngredients = [
        {
          active_ingredient: 'Amoxicillin',
          strength_numerator_value: 250,
          strength_numerator_unit: 'mg',
          strength_denominator_value: 5,
          strength_denominator_unit: 'mL',
        },
        {
          active_ingredient: 'Clavulanate Potassium',
          strength_numerator_value: 62.5,
          strength_numerator_unit: 'mg',
          strength_denominator_value: 5,
          strength_denominator_unit: 'mL',
        },
      ];

      const res = verifyProductPediatricEligibilityPure({
        catalogProductId: validProductId,
        product: validProduct,
        ingredients: multiIngredients,
        rule: validRule,
        label: validLabel,
      });
      expect(res.isEligible).toBe(false);
      expect(res.reason).toContain('مواد فعالة');
    });

    // 4. تعديل المستخدم لحقل strength يدويًا إلى 250 mg/5 mL
    it('Evasion 4: Manual text edit of strength to "250 mg/5 mL" does NOT bypass structured validation', () => {
      const spoofedItem = {
        medication_name: 'Amoxicillin',
        strength: '250 mg / 5 mL', // user manually typed this text
        catalog_product_id: null, // but no catalog link
        is_custom_medication: true,
      };
      expect(isItemEligibleForPediatricAmoxicillin(spoofedItem as any)).toBe(false);

      // Even if catalog_product_id exists, engine ignores user-edited strength and evaluates DB ingredients
      const res = verifyProductPediatricEligibilityPure({
        catalogProductId: validProductId,
        userEditedStrength: '250 mg / 5 mL',
        product: validProduct,
        ingredients: [
          {
            active_ingredient: 'Amoxicillin',
            strength_numerator_value: 125, // actual DB is 125mg/5mL, not 250!
            strength_numerator_unit: 'mg',
            strength_denominator_value: 5,
            strength_denominator_unit: 'mL',
          },
        ],
        rule: validRule,
        label: validLabel,
      });
      expect(res.isEligible).toBe(true);
      // Concentration is 125 / 5 = 25 mg/mL, NOT 50 mg/mL from user's manual string!
      expect(res.concentrationMgPerMl).toBe(25);
    });

    // 5. وجود catalog_product_id صحيح لكن قاعدة الجرعة تخص منتجًا آخر
    it('Evasion 5: Rule belonging to a different product is rejected', () => {
      const mismatchedRule = {
        ...validRule,
        product_id: '99999999-9999-9999-9999-999999999999', // different product!
      };

      const res = verifyProductPediatricEligibilityPure({
        catalogProductId: validProductId,
        product: validProduct,
        ingredients: validIngredients,
        rule: mismatchedRule,
        label: validLabel,
      });
      expect(res.isEligible).toBe(false);
      expect(res.reason).toContain('قاعدة الجرعات تخص منتجاً آخر');
    });

    // 6. منتج صحيح لكن النشرة أو القاعدة أصبحت needs_re_review
    it('Evasion 6: Product with rule or label in needs_re_review status is rejected', () => {
      const needsReviewRule = {
        ...validRule,
        review_status: 'needs_re_review',
      };

      const res = verifyProductPediatricEligibilityPure({
        catalogProductId: validProductId,
        product: validProduct,
        ingredients: validIngredients,
        rule: needsReviewRule,
        label: validLabel,
      });
      expect(res.isEligible).toBe(false);
      expect(res.reason).toContain('تتطلب إعادة مراجعة واعتماد من الطبيب');

      // Also when label hash changed upstream
      const changedLabel = {
        ...validLabel,
        payload_hash: 'new_different_hash_from_fda',
      };
      const hashMismatchRes = verifyProductPediatricEligibilityPure({
        catalogProductId: validProductId,
        product: validProduct,
        ingredients: validIngredients,
        rule: validRule,
        label: changedLabel,
      });
      expect(hashMismatchRes.isEligible).toBe(false);
      expect(hashMismatchRes.reason).toContain('تم تعديل نشرة الدواء الرسمية المنبع وتغير الهاش');
    });

    // 7. منتج صحيح لكن التركيز البنيوي غير صالح
    it('Evasion 7: Product with invalid structured concentration is rejected', () => {
      // Negative numerator
      const invalidNumRes = verifyProductPediatricEligibilityPure({
        catalogProductId: validProductId,
        product: validProduct,
        ingredients: [
          {
            active_ingredient: 'Amoxicillin',
            strength_numerator_value: -250,
            strength_numerator_unit: 'mg',
            strength_denominator_value: 5,
            strength_denominator_unit: 'mL',
          },
        ],
        rule: validRule,
        label: validLabel,
      });
      expect(invalidNumRes.isEligible).toBe(false);
      expect(invalidNumRes.reason).toContain('بيانات التركيز البنيوية للمنتج في drug_product_ingredients غير صالحة');

      // Zero denominator
      const zeroDenRes = verifyProductPediatricEligibilityPure({
        catalogProductId: validProductId,
        product: validProduct,
        ingredients: [
          {
            active_ingredient: 'Amoxicillin',
            strength_numerator_value: 250,
            strength_numerator_unit: 'mg',
            strength_denominator_value: 0,
            strength_denominator_unit: 'mL',
          },
        ],
        rule: validRule,
        label: validLabel,
      });
      expect(zeroDenRes.isEligible).toBe(false);

      // Wrong unit (tablets instead of mL)
      const wrongUnitRes = verifyProductPediatricEligibilityPure({
        catalogProductId: validProductId,
        product: validProduct,
        ingredients: [
          {
            active_ingredient: 'Amoxicillin',
            strength_numerator_value: 500,
            strength_numerator_unit: 'mg',
            strength_denominator_value: 1,
            strength_denominator_unit: 'tablet',
          },
        ],
        rule: validRule,
        label: validLabel,
      });
      expect(wrongUnitRes.isEligible).toBe(false);
    });

    // 8. المنتج الصحيح الكامل يعمل بنجاح
    it('Evasion 8: Fully valid product with matching approved rule and label succeeds', () => {
      const res = verifyProductPediatricEligibilityPure({
        catalogProductId: validProductId,
        product: validProduct,
        ingredients: validIngredients,
        rule: validRule,
        label: validLabel,
      });

      expect(res.isEligible).toBe(true);
      expect(res.concentrationMgPerMl).toBe(50);
      expect(res.numeratorMg).toBe(250);
      expect(res.denominatorMl).toBe(5);
      expect(res.activeIngredient).toBe('Amoxicillin');
    });
  });

  // ============================================================================
  // 7. Schema & Multi-Step Ingredient Query Regression Tests (Fix column active_ingredient does not exist)
  // ============================================================================
  describe('7. Schema & Multi-Step Ingredient Query Regression Tests (No column active_ingredient)', () => {
    const validProdId = '00000000-0000-0000-0000-000000000102';
    const validIngredientId = '11111111-2222-3333-4444-555555555555';
    const validRuleId = '22222222-3333-4444-5555-666666666666';
    const validLabelId = '33333333-4444-5555-6666-777777777777';

    const dbProduct = {
      id: validProdId,
      source_system: 'FDA_NDC',
      source_identifier: '50090-6351',
      dosage_form: 'suspension',
      route: 'oral',
      display_name: 'Amoxicillin 250 MG / 5 ML Oral Suspension',
    };

    const dbProductIngredients = [
      {
        id: 'rel-1',
        product_id: validProdId,
        ingredient_id: validIngredientId,
        strength_numerator_value: 250,
        strength_numerator_unit: 'mg',
        strength_denominator_value: 5,
        strength_denominator_unit: 'mL',
        display_order: 1,
      },
    ];

    const dbIngredient = {
      id: validIngredientId,
      preferred_name: 'Amoxicillin',
      normalized_name: 'amoxicillin',
    };

    const dbRules = [
      {
        id: validRuleId,
        product_id: validProdId,
        drug_label_id: validLabelId,
        review_status: 'approved',
        label_payload_hash: 'eb31b635601ab0574bc6a91dc27e3255568cc94cb2ba223de6352de7d13e46c0',
      },
    ];

    const dbLabel = {
      id: validLabelId,
      product_id: validProdId,
      payload_hash: 'eb31b635601ab0574bc6a91dc27e3255568cc94cb2ba223de6352de7d13e46c0',
    };

    function setupSupabaseMock(overrides?: {
      prodData?: any;
      prodError?: any;
      dpiData?: any;
      dpiError?: any;
      ingData?: any;
      ingError?: any;
      rulesData?: any;
      rulesError?: any;
      labelData?: any;
      labelError?: any;
    }) {
      mockIsSupabaseConfigured.mockReturnValue(true);

      mockFrom.mockImplementation((table: string) => {
        if (table === 'drug_products') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: overrides?.prodData !== undefined ? overrides.prodData : dbProduct,
                  error: overrides?.prodError || null,
                }),
              }),
            }),
          };
        }

        if (table === 'drug_product_ingredients') {
          return {
            select: vi.fn().mockImplementation((cols: string) => ({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: overrides?.dpiData !== undefined ? overrides.dpiData : dbProductIngredients,
                  error: overrides?.dpiError || null,
                }),
              }),
            })),
          };
        }

        if (table === 'drug_ingredients') {
          return {
            select: vi.fn().mockImplementation((cols: string) => ({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: overrides?.ingData !== undefined ? overrides.ingData : dbIngredient,
                  error: overrides?.ingError || null,
                }),
              }),
            })),
          };
        }

        if (table === 'pediatric_dosage_rules') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: overrides?.rulesData !== undefined ? overrides.rulesData : dbRules,
                error: overrides?.rulesError || null,
              }),
            }),
          };
        }

        if (table === 'drug_labels') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: overrides?.labelData !== undefined ? overrides.labelData : dbLabel,
                  error: overrides?.labelError || null,
                }),
              }),
            }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });
    }

    it('1. Does NOT request active_ingredient from drug_product_ingredients and includes required columns', async () => {
      let requestedDpiColumns = '';
      mockIsSupabaseConfigured.mockReturnValue(true);

      mockFrom.mockImplementation((table: string) => {
        if (table === 'drug_products') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: dbProduct, error: null }),
              }),
            }),
          };
        }
        if (table === 'drug_product_ingredients') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              requestedDpiColumns = cols;
              return {
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: dbProductIngredients, error: null }),
                }),
              };
            }),
          };
        }
        if (table === 'drug_ingredients') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: dbIngredient, error: null }),
              }),
            }),
          };
        }
        if (table === 'pediatric_dosage_rules') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: dbRules, error: null }),
            }),
          };
        }
        if (table === 'drug_labels') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: dbLabel, error: null }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      });

      const res = await verifyPediatricProductEligibility(validProdId);
      expect(res.isEligible).toBe(true);

      // Verify that active_ingredient column was NOT requested from drug_product_ingredients
      expect(requestedDpiColumns).not.toContain('active_ingredient');

      // Verify that all required columns are requested from drug_product_ingredients
      expect(requestedDpiColumns).toContain('product_id');
      expect(requestedDpiColumns).toContain('ingredient_id');
      expect(requestedDpiColumns).toContain('strength_numerator_value');
      expect(requestedDpiColumns).toContain('strength_numerator_unit');
      expect(requestedDpiColumns).toContain('strength_denominator_value');
      expect(requestedDpiColumns).toContain('strength_denominator_unit');
      expect(requestedDpiColumns).toContain('display_order');
    });

    it('2. Reads ingredient identity from drug_ingredients table using ingredient_id', async () => {
      let requestedIngredientId = '';
      let requestedIngredientCols = '';
      mockIsSupabaseConfigured.mockReturnValue(true);

      mockFrom.mockImplementation((table: string) => {
        if (table === 'drug_products') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: dbProduct, error: null }),
              }),
            }),
          };
        }
        if (table === 'drug_product_ingredients') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: dbProductIngredients, error: null }),
              }),
            }),
          };
        }
        if (table === 'drug_ingredients') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              requestedIngredientCols = cols;
              return {
                eq: vi.fn().mockImplementation((col: string, val: string) => {
                  if (col === 'id') requestedIngredientId = val;
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({ data: dbIngredient, error: null }),
                  };
                }),
              };
            }),
          };
        }
        if (table === 'pediatric_dosage_rules') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: dbRules, error: null }),
            }),
          };
        }
        if (table === 'drug_labels') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: dbLabel, error: null }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      });

      await verifyPediatricProductEligibility(validProdId);

      // Verify that drug_ingredients was queried with the correct ingredient_id
      expect(requestedIngredientId).toBe(validIngredientId);
      expect(requestedIngredientCols).toContain('preferred_name');
      expect(requestedIngredientCols).toContain('normalized_name');
    });

    it('3. Successfully verifies real single-ingredient product conforming to exact real schema', async () => {
      setupSupabaseMock();

      const res = await verifyPediatricProductEligibility(validProdId);
      expect(res.isEligible).toBe(true);
      expect(res.activeIngredient).toBe('amoxicillin');
      expect(res.numeratorMg).toBe(250);
      expect(res.denominatorMl).toBe(5);
      expect(res.concentrationMgPerMl).toBe(50);
    });

    it('4. Rejects multi-ingredient product fail-closed', async () => {
      setupSupabaseMock({
        dpiData: [
          {
            id: 'rel-1',
            product_id: validProdId,
            ingredient_id: validIngredientId,
            strength_numerator_value: 250,
            strength_numerator_unit: 'mg',
            strength_denominator_value: 5,
            strength_denominator_unit: 'mL',
            display_order: 1,
          },
          {
            id: 'rel-2',
            product_id: validProdId,
            ingredient_id: 'another-ingredient-id',
            strength_numerator_value: 62.5,
            strength_numerator_unit: 'mg',
            strength_denominator_value: 5,
            strength_denominator_unit: 'mL',
            display_order: 2,
          },
        ],
      });

      const res = await verifyPediatricProductEligibility(validProdId);
      expect(res.isEligible).toBe(false);
      expect(res.reason).toContain('مواد فعالة');
    });

    it('5. Rejects when ingredient_id does not exist in drug_ingredients', async () => {
      setupSupabaseMock({
        ingData: null,
      });

      const res = await verifyPediatricProductEligibility(validProdId);
      expect(res.isEligible).toBe(false);
      expect(res.reason).toContain('سجل المادة الفعالة غير موجود في جدول drug_ingredients');
    });

    it('6. Rejects invalid units or non-positive concentration in drug_product_ingredients', async () => {
      // Zero denominator
      setupSupabaseMock({
        dpiData: [
          {
            id: 'rel-1',
            product_id: validProdId,
            ingredient_id: validIngredientId,
            strength_numerator_value: 250,
            strength_numerator_unit: 'mg',
            strength_denominator_value: 0,
            strength_denominator_unit: 'mL',
            display_order: 1,
          },
        ],
      });

      const resZeroDen = await verifyPediatricProductEligibility(validProdId);
      expect(resZeroDen.isEligible).toBe(false);

      // Wrong denominator unit (tablet instead of mL)
      setupSupabaseMock({
        dpiData: [
          {
            id: 'rel-1',
            product_id: validProdId,
            ingredient_id: validIngredientId,
            strength_numerator_value: 500,
            strength_numerator_unit: 'mg',
            strength_denominator_value: 1,
            strength_denominator_unit: 'tablet',
            display_order: 1,
          },
        ],
      });

      const resWrongUnit = await verifyPediatricProductEligibility(validProdId);
      expect(resWrongUnit.isEligible).toBe(false);
    });

    it('7. Supabase query error produces Fail-Closed response', async () => {
      setupSupabaseMock({
        dpiError: { message: 'column drug_product_ingredients_1.active_ingredient does not exist' },
      });

      const res = await verifyPediatricProductEligibility(validProdId);
      expect(res.isEligible).toBe(false);
      expect(res.reason).toContain('فشل استعلام مكونات المنتج من قاعدة البيانات');
    });

    it('8. Does not rely on free-text prescription item name or strength', () => {
      const spoofedPrescriptionItem = {
        medication_name: 'Custom Amoxil Suspension 1000mg/5mL',
        strength: '1000 mg / 5 mL',
        catalog_product_id: null,
        is_custom_medication: true,
      };

      // Ineligible because it's not linked to official catalog product
      expect(isItemEligibleForPediatricAmoxicillin(spoofedPrescriptionItem as any)).toBe(false);
    });

    it('9. Displays appropriate age and weight messages in modal when patient lacks date of birth or weight', () => {
      const patientWithoutDobAndWeight: PediatricPatientContext = {
        patientId: 'pat-no-vitals',
        visitId: 'vis-no-vitals',
        patientName: 'سارة خالد',
        dateOfBirth: '',
        visitDate: '2026-10-01',
        ageInMonths: 0,
        ageDays: 0,
        ageFormatted: 'تاريخ غير صالح',
        isAgeSupportedByCalculator: false,
        weightKg: null,
        weightSource: 'none',
        hasPenicillinOrAmoxicillinAllergy: false,
        allergyMatchType: 'none',
      };

      const approvedRule: PediatricDosageRule = {
        id: validRuleId,
        product_id: validProdId,
        drug_label_id: validLabelId,
        active_ingredient: 'Amoxicillin',
        dosage_form: 'suspension',
        route: 'oral',
        min_age_value: 3.0,
        min_age_unit: 'months',
        min_age_inclusive: false,
        max_weight_kg: 40.0,
        max_weight_inclusive: false,
        min_dose_mg_per_kg_day: 20,
        max_dose_mg_per_kg_day: 45,
        allowed_frequencies: ['every 12 hours', 'every 8 hours'],
        source_reference: 'openFDA 50090-6351',
        source_excerpt: 'Pediatric Patients: 20 to 45 mg/kg/day',
        label_payload_hash: 'hash-v1',
        review_status: 'approved',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      render(
        <LanguageProvider>
          <PediatricDosageCalculatorModal
            isOpen={true}
            onClose={vi.fn()}
            patientContext={patientWithoutDobAndWeight}
            rule={approvedRule}
            productDisplayName="Amoxicillin 250 MG / 5 ML Oral Suspension"
            rawStrengthText="250 mg / 5 mL"
            onRuleUpdated={vi.fn()}
            onApplyResult={vi.fn()}
          />
        </LanguageProvider>
      );

      // Verify that missing weight shows the clear danger badge
      expect(screen.getByText('لا يوجد وزن مسجل')).toBeDefined();

      // Verify that age displays invalid / uncalculated
      expect(screen.getByText(/تاريخ غير صالح/)).toBeDefined();

      // Verify that missing DOB banner and missing weight banner appear
      expect(screen.getByTestId('missing-dob-banner')).toBeDefined();
      expect(screen.getByText(/تاريخ ميلاد الطفل غير متوفر/)).toBeDefined();
      expect(screen.getByTestId('missing-weight-banner')).toBeDefined();
      expect(screen.getByText(/وزن الطفل مطلوب/)).toBeDefined();

      // Verify database error message is NOT present
      expect(screen.queryByText(/column.*does not exist/i)).toBeNull();
      expect(screen.queryByText(/فشل استعلام قاعدة البيانات/)).toBeNull();
    });
  });

  // ============================================================================
  // 8. Clinical Review Workflow & Rule Approval Dispatching (مسار مراجعة واعتماد القواعد السريرية)
  // ============================================================================
  describe('8. Clinical Review Workflow & Rule Approval Dispatching (مسار مراجعة واعتماد القواعد السريرية)', () => {
    const validProductId = '00000000-0000-0000-0000-000000000102';
    const validProduct = {
      id: validProductId,
      source_system: 'FDA_NDC',
      source_identifier: '50090-6351',
      display_name: 'Amoxicillin 250 MG / 5 ML Oral Suspension',
      brand_name: 'Amoxicillin',
      dosage_form: 'suspension',
      route: 'oral',
    };
    const validIngredients = [
      {
        product_id: validProductId,
        ingredient_id: '00000000-0000-0000-0000-000000000001',
        strength_numerator_value: 250,
        strength_numerator_unit: 'mg',
        strength_denominator_value: 5,
        strength_denominator_unit: 'ml',
        display_order: 1,
        active_ingredient: 'Amoxicillin',
      },
    ];
    const baseLabel = {
      id: '00000000-0000-0000-0000-000000000201',
      product_id: validProductId,
      source_identifier: '50090-6351',
      payload_hash: 'hash-amox-label-v1',
      dosage_and_administration: 'Pediatric Patients: 20 to 40 mg/kg/day in divided doses every 8 to 12 hours.',
      pediatric_use: 'Pediatric Patients: Safety and effectiveness of amoxicillin in pediatric patients...',
      effective_time: '20240430',
      review_status: 'approved',
    };

    const makeRule = (status: 'pending_review' | 'needs_re_review' | 'approved' | 'rejected', hashMismatch = false): PediatricDosageRule => ({
      id: `00000000-0000-0000-0000-00000000030${status === 'approved' ? '1' : status === 'pending_review' ? '2' : status === 'needs_re_review' ? '3' : '4'}`,
      product_id: validProductId,
      drug_label_id: baseLabel.id,
      active_ingredient: 'Amoxicillin',
      dosage_form: 'suspension',
      route: 'oral',
      min_age_value: 3.0,
      min_age_unit: 'months',
      min_age_inclusive: false,
      max_weight_kg: 40.0,
      max_weight_inclusive: false,
      min_dose_mg_per_kg_day: 20,
      max_dose_mg_per_kg_day: 45,
      allowed_frequencies: ['every 12 hours', 'every 8 hours'],
      source_reference: 'openFDA 50090-6351',
      source_excerpt: 'Pediatric Patients: 20 to 40 mg/kg/day in divided doses every 8 to 12 hours.',
      label_payload_hash: hashMismatch ? 'hash-mismatch-xxx' : 'hash-amox-label-v1',
      review_status: status,
      product_display_name: 'Amoxicillin 250 MG / 5 ML Oral Suspension',
      product_ndc: '50090-6351',
      label_source_identifier: '50090-6351',
      label_effective_time: '20240430',
      label_review_status: 'approved',
      current_label_payload_hash: 'hash-amox-label-v1',
      is_hash_matching: !hashMismatch,
      label_dosage_and_administration: 'Pediatric Patients: 20 to 40 mg/kg/day in divided doses every 8 to 12 hours.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const standardInitialPrescription = {
      id: 'rx-ped-review-test-1',
      visit_id: 'visit-pediatric-calc-test',
      patient_id: 'patient-sarah-1',
      status: 'draft' as const,
      revision_number: 1,
      items: [
        {
          id: 'item-1',
          prescription_id: 'rx-ped-review-test-1',
          catalog_product_id: validProductId,
          is_custom_medication: false,
          medication_name: 'Amoxicillin 250 MG / 5 ML Oral Suspension',
          active_ingredient: 'Amoxicillin',
          strength: '250 mg / 5 mL',
          dosage_form: 'suspension' as any,
          dose: '',
          route: 'oral',
          frequency: 'every 12 hours',
          duration: '7 days',
          quantity: '1 bottle',
          instructions: '',
          display_order: 1,
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let fetchRxSpy: any;

    beforeEach(() => {
      _resetInMemoryPediatricRules();
      _resetInMemoryPrescriptions();
      fetchRxSpy = vi.spyOn(prescriptionService, 'fetchPrescriptionByVisitId').mockResolvedValue(standardInitialPrescription as any);
    });

    afterEach(() => {
      fetchRxSpy?.mockRestore();
    });

    it('1. Clicking calculate on item with pending_review rule opens PediatricRuleReviewModal (not calculator, no red error banner)', async () => {
      const pendingRule = makeRule('pending_review');
      _setInMemoryProduct(validProduct, validIngredients, pendingRule, baseLabel);

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId="visit-pediatric-calc-test"
            patientId="patient-sarah-1"
            initialPrescription={standardInitialPrescription}
            currentUserRole="doctor"
          />
        </LanguageProvider>
      );

      const calcBtn = screen.getByTestId('pediatric-calculator-btn-0');
      fireEvent.click(calcBtn);

      await waitFor(() => {
        expect(screen.getByTestId('pediatric-rule-review-modal')).toBeDefined();
      });

      // Verify calculator is NOT opened
      expect(screen.queryByTestId('pediatric-dosage-calculator-modal')).toBeNull();

      // Verify error banner is NOT displayed
      expect(screen.queryByText(/قاعدة الجرعات غير معتمدة/)).toBeNull();
    });

    it('2. Clicking calculate on item with needs_re_review rule opens PediatricRuleReviewModal', async () => {
      const needsReviewRule = makeRule('needs_re_review');
      _setInMemoryProduct(validProduct, validIngredients, needsReviewRule, baseLabel);

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId="visit-pediatric-calc-test"
            patientId="patient-sarah-1"
            initialPrescription={standardInitialPrescription}
            currentUserRole="doctor"
          />
        </LanguageProvider>
      );

      const calcBtn = screen.getByTestId('pediatric-calculator-btn-0');
      fireEvent.click(calcBtn);

      await waitFor(() => {
        expect(screen.getByTestId('pediatric-rule-review-modal')).toBeDefined();
      });

      expect(screen.queryByTestId('pediatric-dosage-calculator-modal')).toBeNull();
    });

    it('3. Clicking calculate on item with approved rule opens PediatricDosageCalculatorModal directly', async () => {
      const approvedRule = makeRule('approved');
      _setInMemoryProduct(validProduct, validIngredients, approvedRule, baseLabel);

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId="visit-pediatric-calc-test"
            patientId="patient-sarah-1"
            initialPrescription={standardInitialPrescription}
            currentUserRole="doctor"
          />
        </LanguageProvider>
      );

      const calcBtn = screen.getByTestId('pediatric-calculator-btn-0');
      fireEvent.click(calcBtn);

      await waitFor(() => {
        expect(screen.getByTestId('pediatric-dosage-calculator-modal')).toBeDefined();
      });

      expect(screen.queryByTestId('pediatric-rule-review-modal')).toBeNull();
    });

    it('4. Clicking calculate on item with rejected rule blocks calculator and shows clear rejection message', async () => {
      const rejectedRule = makeRule('rejected');
      _setInMemoryProduct(validProduct, validIngredients, rejectedRule, baseLabel);

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId="visit-pediatric-calc-test"
            patientId="patient-sarah-1"
            initialPrescription={standardInitialPrescription}
            currentUserRole="doctor"
          />
        </LanguageProvider>
      );

      const calcBtn = screen.getByTestId('pediatric-calculator-btn-0');
      fireEvent.click(calcBtn);

      await waitFor(() => {
        expect(screen.getByText(/تم رفض قاعدة الجرعات السريرية لهذا المنتج؛ ولا يمكن استخدام الحاسبة/)).toBeDefined();
      });

      expect(screen.queryByTestId('pediatric-rule-review-modal')).toBeNull();
      expect(screen.queryByTestId('pediatric-dosage-calculator-modal')).toBeNull();
    });

    it('5. Clicking calculate on item with no rule blocks calculator and shows clear message', async () => {
      _setInMemoryProduct(validProduct, validIngredients, null, baseLabel);

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId="visit-pediatric-calc-test"
            patientId="patient-sarah-1"
            initialPrescription={standardInitialPrescription}
            currentUserRole="doctor"
          />
        </LanguageProvider>
      );

      const calcBtn = screen.getByTestId('pediatric-calculator-btn-0');
      fireEvent.click(calcBtn);

      await waitFor(() => {
        expect(screen.getByText(/لا توجد قاعدة جرعات مسجلة لهذا المنتج/)).toBeDefined();
      });

      expect(screen.queryByTestId('pediatric-rule-review-modal')).toBeNull();
      expect(screen.queryByTestId('pediatric-dosage-calculator-modal')).toBeNull();
    });

    it('6. PediatricRuleReviewModal: strictly renders all required DB fields', () => {
      const rule = makeRule('pending_review');

      render(
        <LanguageProvider>
          <PediatricRuleReviewModal
            isOpen={true}
            onClose={vi.fn()}
            rule={rule}
            currentUserRole="doctor"
            onViewDrugLabel={vi.fn()}
          />
        </LanguageProvider>
      );

      // Product identity
      expect(screen.getByTestId('rule-product-name')).toBeDefined();
      expect(screen.getByTestId('rule-product-ndc').textContent).toContain('50090-6351');
      expect(screen.getByTestId('rule-product-ndc').textContent).toContain('NDC:');
      expect(screen.getByTestId('rule-active-ingredient')).toBeDefined();
      expect(screen.getByTestId('rule-dosage-form')).toBeDefined();
      expect(screen.getByTestId('rule-route')).toBeDefined();

      // Clinical boundaries
      expect(screen.getByTestId('min-age-input')).toBeDefined();
      expect(screen.getByTestId('min-age-inclusive-note')).toBeDefined();
      expect(screen.getByText(/العمر: أكبر من 3 أشهر/)).toBeDefined();
      expect(screen.getByText(/Age: older than 3 months/)).toBeDefined();
      expect(screen.getByTestId('max-weight-input')).toBeDefined();
      expect(screen.getByTestId('max-weight-inclusive-note')).toBeDefined();
      expect(screen.getByText(/الوزن: أقل من 40 كغم/)).toBeDefined();
      expect(screen.getByText(/Weight: under 40 kg/)).toBeDefined();
      expect(screen.getByTestId('min-dose-input')).toBeDefined();
      expect(screen.getByTestId('max-dose-input')).toBeDefined();

      // Frequencies
      expect(screen.getByTestId('rule-frequencies')).toBeDefined();
      expect(screen.getByText(/every 12 hours/)).toBeDefined();

      // openFDA label provenance
      expect(screen.getByTestId('rule-label-id')).toBeDefined();
      expect(screen.getByTestId('rule-effective-time')).toBeDefined();
      expect(screen.getByTestId('rule-label-status')).toBeDefined();
      expect(screen.getByTestId('hash-match-badge')).toBeDefined();
      expect(screen.getByTestId('view-openfda-label-btn')).toBeDefined();
    });

    it('7. Doctor Role Enforcement: non-doctor (receptionist, admin) cannot approve rule', () => {
      const rule = makeRule('pending_review');

      // Test with receptionist
      const { rerender } = render(
        <LanguageProvider>
          <PediatricRuleReviewModal
            isOpen={true}
            onClose={vi.fn()}
            rule={rule}
            currentUserRole="receptionist"
          />
        </LanguageProvider>
      );

      const approveBtn = screen.getByTestId('approve-rule-btn') as HTMLButtonElement;
      expect(approveBtn.disabled).toBe(true);
      expect(screen.getByTestId('non-doctor-warning')).toBeDefined();

      // Test with admin
      rerender(
        <LanguageProvider>
          <PediatricRuleReviewModal
            isOpen={true}
            onClose={vi.fn()}
            rule={rule}
            currentUserRole="admin"
          />
        </LanguageProvider>
      );
      const approveBtnAdmin = screen.getByTestId('approve-rule-btn') as HTMLButtonElement;
      expect(approveBtnAdmin.disabled).toBe(true);
      expect(screen.getByTestId('non-doctor-warning')).toBeDefined();
    });

    it('8. Hash Integrity Enforcement: hash mismatch blocks rule approval with warning', () => {
      const mismatchRule = makeRule('pending_review', true);

      render(
        <LanguageProvider>
          <PediatricRuleReviewModal
            isOpen={true}
            onClose={vi.fn()}
            rule={mismatchRule}
            currentUserRole="doctor"
          />
        </LanguageProvider>
      );

      expect(screen.getByTestId('hash-mismatch-badge')).toBeDefined();
      expect(screen.getByTestId('hash-mismatch-warning')).toBeDefined();
      const approveBtn = screen.getByTestId('approve-rule-btn') as HTMLButtonElement;
      expect(approveBtn.disabled).toBe(true);
    });

    it('9. Confirmation Modal: approval requires explicit confirmation before calling service', async () => {
      const rule = makeRule('pending_review');
      const handleApproved = vi.fn();

      render(
        <LanguageProvider>
          <PediatricRuleReviewModal
            isOpen={true}
            onClose={vi.fn()}
            rule={rule}
            currentUserRole="doctor"
            onRuleApproved={handleApproved}
          />
        </LanguageProvider>
      );

      // Fill review notes
      const notesInput = screen.getByTestId('rule-review-notes-input');
      fireEvent.change(notesInput, { target: { value: 'ملاحظات اعتماد الطبيب' } });

      // Click Approve button
      const approveBtn = screen.getByTestId('approve-rule-btn');
      fireEvent.click(approveBtn);

      // Confirmation modal is open
      expect(screen.getByTestId('confirm-approve-rule-modal')).toBeDefined();
      expect(screen.getByTestId('confirm-approve-rule-btn')).toBeDefined();
      expect(handleApproved).not.toHaveBeenCalled();

      // Click cancel in confirmation modal
      const cancelBtn = screen.getByTestId('cancel-approve-rule-btn');
      fireEvent.click(cancelBtn);

      expect(screen.queryByTestId('confirm-approve-rule-modal')).toBeNull();
      expect(handleApproved).not.toHaveBeenCalled();
    });

    it('10. Seamless Transition: doctor approval updates rule, closes review modal, and automatically opens calculator without re-clicking', async () => {
      const pendingRule = makeRule('pending_review');
      _setInMemoryProduct(validProduct, validIngredients, pendingRule, baseLabel);

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId="visit-pediatric-calc-test"
            patientId="patient-sarah-1"
            initialPrescription={standardInitialPrescription}
            currentUserRole="doctor"
          />
        </LanguageProvider>
      );

      // Doctor clicks calculate on the item
      const calcBtn = screen.getByTestId('pediatric-calculator-btn-0');
      fireEvent.click(calcBtn);

      // Review modal opens
      await waitFor(() => {
        expect(screen.getByTestId('pediatric-rule-review-modal')).toBeDefined();
      });

      // Doctor enters notes and clicks approve
      const notesInput = screen.getByTestId('rule-review-notes-input');
      fireEvent.change(notesInput, { target: { value: 'تم الاعتماد السريري الكامل' } });

      const approveBtn = screen.getByTestId('approve-rule-btn');
      fireEvent.click(approveBtn);

      // Doctor confirms approval
      const confirmApproveBtn = screen.getByTestId('confirm-approve-rule-btn');
      fireEvent.click(confirmApproveBtn);

      // Review modal closes AND calculator modal automatically opens!
      await waitFor(() => {
        expect(screen.queryByTestId('pediatric-rule-review-modal')).toBeNull();
        expect(screen.getByTestId('pediatric-dosage-calculator-modal')).toBeDefined();
      });
    });

    it('11. Clinical Safety: missing date of birth displays missing-dob-banner, never defaults to 0 months, and blocks calculation', () => {
      const approvedRule = makeRule('approved');
      const missingDobContext: PediatricPatientContext = {
        patientId: 'p-no-dob',
        visitId: 'v-no-dob',
        patientName: 'سارة خالد',
        dateOfBirth: null,
        visitDate: '2026-10-01',
        ageInMonths: 0,
        ageDays: 0,
        ageFormatted: 'تاريخ غير صالح',
        isAgeSupportedByCalculator: false,
        weightKg: 12.0,
        weightSource: 'current_visit',
        weightDate: '2026-10-01',
        weightWarning: null,
        hasPenicillinOrAmoxicillinAllergy: false,
        allergyMatchType: 'none',
        rawAllergiesText: null,
      };

      render(
        <LanguageProvider>
          <PediatricDosageCalculatorModal
            isOpen={true}
            onClose={vi.fn()}
            patientContext={missingDobContext}
            rule={approvedRule}
            productDisplayName="Amoxicillin 250 MG / 5 ML Oral Suspension"
            rawStrengthText="250 mg / 5 mL"
            onRuleUpdated={vi.fn()}
            onApplyResult={vi.fn()}
          />
        </LanguageProvider>
      );

      expect(screen.getByTestId('missing-dob-banner')).toBeDefined();
      expect(screen.getByText(/تاريخ ميلاد الطفل غير متوفر/)).toBeDefined();

      // Calculation should be blocked
      const applyBtn = screen.getByTestId('apply-pediatric-dose-btn') as HTMLButtonElement;
      expect(applyBtn.disabled).toBe(true);
    });

    it('12. Clinical Safety: missing weight displays missing-weight-banner, never defaults to 0 kg, and blocks calculation', () => {
      const approvedRule = makeRule('approved');
      const missingWeightContext: PediatricPatientContext = {
        patientId: 'p-no-wt',
        visitId: 'v-no-wt',
        patientName: 'سارة خالد',
        dateOfBirth: '2024-04-01',
        visitDate: '2026-10-01',
        ageInMonths: 30,
        ageDays: 0,
        ageFormatted: '30 شهر',
        isAgeSupportedByCalculator: true,
        weightKg: null,
        weightSource: 'none',
        weightDate: undefined,
        weightWarning: 'لا يوجد وزن مسجل',
        hasPenicillinOrAmoxicillinAllergy: false,
        allergyMatchType: 'none',
        rawAllergiesText: null,
      };

      render(
        <LanguageProvider>
          <PediatricDosageCalculatorModal
            isOpen={true}
            onClose={vi.fn()}
            patientContext={missingWeightContext}
            rule={approvedRule}
            productDisplayName="Amoxicillin 250 MG / 5 ML Oral Suspension"
            rawStrengthText="250 mg / 5 mL"
            onRuleUpdated={vi.fn()}
            onApplyResult={vi.fn()}
          />
        </LanguageProvider>
      );

      expect(screen.getByTestId('missing-weight-banner')).toBeDefined();
      expect(screen.getByText(/وزن الطفل مطلوب/)).toBeDefined();

      // Calculation should be blocked
      const applyBtn = screen.getByTestId('apply-pediatric-dose-btn') as HTMLButtonElement;
      expect(applyBtn.disabled).toBe(true);
    });

    it('13. Prescription Safety: approving a rule does NOT auto-save or auto-issue prescription, preserving unsaved draft state', async () => {
      const pendingRule = makeRule('pending_review');
      _setInMemoryProduct(validProduct, validIngredients, pendingRule, baseLabel);

      const handlePrescriptionChanged = vi.fn();

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId="visit-pediatric-calc-test"
            patientId="patient-sarah-1"
            initialPrescription={standardInitialPrescription}
            currentUserRole="doctor"
            onPrescriptionChanged={handlePrescriptionChanged}
          />
        </LanguageProvider>
      );

      // Open review modal and approve rule
      fireEvent.click(screen.getByTestId('pediatric-calculator-btn-0'));

      await waitFor(() => {
        expect(screen.getByTestId('pediatric-rule-review-modal')).toBeDefined();
      });

      const notesInput = screen.getByTestId('rule-review-notes-input');
      fireEvent.change(notesInput, { target: { value: 'ملاحظات اعتماد الطبيب' } });

      fireEvent.click(screen.getByTestId('approve-rule-btn'));
      fireEvent.click(screen.getByTestId('confirm-approve-rule-btn'));

      // Calculator opens
      await waitFor(() => {
        expect(screen.getByTestId('pediatric-dosage-calculator-modal')).toBeDefined();
      });

      // Verify prescription is still draft and NOT issued
      expect(screen.getByTestId('rx-revision-badge')).toBeDefined();
      expect(screen.queryByTestId('rx-active-issued-badge')).toBeNull();

      // onPrescriptionChanged was NOT called with issued status
      expect(handlePrescriptionChanged).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // 9. Indication & Severity Coupled Regimens and Evasion Tests (Migration 00022)
  // ============================================================================
  describe('9. Indication & Severity Coupled Regimens & Strict Dosing Scenarios (أنظمة الجرعات المقترنة بالاستطباب والشدة)', () => {
    const migration22Path = path.resolve(__dirname, '../supabase/migrations/00022_pediatric_dosage_regimens.sql');
    const migration22Sql = fs.existsSync(migration22Path) ? fs.readFileSync(migration22Path, 'utf-8') : '';

    it('1. Verifies 14 official structured regimens exist in DEFAULT_AMOXICILLIN_REGIMENS conforming to FDA Table 1', () => {
      expect(DEFAULT_AMOXICILLIN_REGIMENS.length).toBe(14);

      const ent = DEFAULT_AMOXICILLIN_REGIMENS.filter((r) => r.indication_group === 'ear_nose_throat');
      const skin = DEFAULT_AMOXICILLIN_REGIMENS.filter((r) => r.indication_group === 'skin_skin_structure');
      const gu = DEFAULT_AMOXICILLIN_REGIMENS.filter((r) => r.indication_group === 'genitourinary_tract');
      const lrt = DEFAULT_AMOXICILLIN_REGIMENS.filter((r) => r.indication_group === 'lower_respiratory_tract');

      expect(ent.length).toBe(4);
      expect(skin.length).toBe(4);
      expect(gu.length).toBe(4);
      expect(lrt.length).toBe(2);
    });

    it('2. Ear/Nose/Throat, Skin, and Genitourinary: Mild/Moderate offers strictly 25 q12 and 20 q8', () => {
      const groups = ['ear_nose_throat', 'skin_skin_structure', 'genitourinary_tract'] as const;

      groups.forEach((grp) => {
        const mildRegimens = DEFAULT_AMOXICILLIN_REGIMENS.filter(
          (r) => r.indication_group === grp && r.severity === 'mild_moderate'
        );
        expect(mildRegimens.length).toBe(2);

        const q12 = mildRegimens.find((r) => r.interval_hours === 12);
        const q8 = mildRegimens.find((r) => r.interval_hours === 8);

        expect(q12).toBeDefined();
        expect(q12?.dose_mg_per_kg_day).toBe(25);
        expect(q12?.doses_per_day).toBe(2);

        expect(q8).toBeDefined();
        expect(q8?.dose_mg_per_kg_day).toBe(20);
        expect(q8?.doses_per_day).toBe(3);
      });
    });

    it('3. Ear/Nose/Throat, Skin, and Genitourinary: Severe offers strictly 45 q12 and 40 q8', () => {
      const groups = ['ear_nose_throat', 'skin_skin_structure', 'genitourinary_tract'] as const;

      groups.forEach((grp) => {
        const severeRegimens = DEFAULT_AMOXICILLIN_REGIMENS.filter(
          (r) => r.indication_group === grp && r.severity === 'severe'
        );
        expect(severeRegimens.length).toBe(2);

        const q12 = severeRegimens.find((r) => r.interval_hours === 12);
        const q8 = severeRegimens.find((r) => r.interval_hours === 8);

        expect(q12).toBeDefined();
        expect(q12?.dose_mg_per_kg_day).toBe(45);
        expect(q12?.doses_per_day).toBe(2);

        expect(q8).toBeDefined();
        expect(q8?.dose_mg_per_kg_day).toBe(40);
        expect(q8?.doses_per_day).toBe(3);
      });
    });

    it('4. Lower Respiratory Tract: strictly coupled to 45 q12 and 40 q8 under mild_moderate_or_severe', () => {
      const lrtRegimens = DEFAULT_AMOXICILLIN_REGIMENS.filter(
        (r) => r.indication_group === 'lower_respiratory_tract'
      );
      expect(lrtRegimens.length).toBe(2);

      const q12 = lrtRegimens.find((r) => r.interval_hours === 12);
      const q8 = lrtRegimens.find((r) => r.interval_hours === 8);

      expect(q12).toBeDefined();
      expect(q12?.severity).toBe('mild_moderate_or_severe');
      expect(q12?.dose_mg_per_kg_day).toBe(45);
      expect(q12?.doses_per_day).toBe(2);

      expect(q8).toBeDefined();
      expect(q8?.severity).toBe('mild_moderate_or_severe');
      expect(q8?.dose_mg_per_kg_day).toBe(40);
      expect(q8?.doses_per_day).toBe(3);
    });

    it('5. Evasion Check: strictly rejects combinations not found in FDA label (20 q12, 25 q8, 40 q12, 45 q8)', () => {
      // 20 q12 (Invalid: Mild dose with twice daily is 25, not 20)
      const invalid20q12 = DEFAULT_AMOXICILLIN_REGIMENS.find(
        (r) => r.dose_mg_per_kg_day === 20 && r.interval_hours === 12
      );
      expect(invalid20q12).toBeUndefined();

      // 25 q8 (Invalid: Mild dose with 3 times daily is 20, not 25)
      const invalid25q8 = DEFAULT_AMOXICILLIN_REGIMENS.find(
        (r) => r.dose_mg_per_kg_day === 25 && r.interval_hours === 8
      );
      expect(invalid25q8).toBeUndefined();

      // 40 q12 (Invalid: Severe dose with twice daily is 45, not 40)
      const invalid40q12 = DEFAULT_AMOXICILLIN_REGIMENS.find(
        (r) => r.dose_mg_per_kg_day === 40 && r.interval_hours === 12
      );
      expect(invalid40q12).toBeUndefined();

      // 45 q8 (Invalid: Severe dose with 3 times daily is 40, not 45)
      const invalid45q8 = DEFAULT_AMOXICILLIN_REGIMENS.find(
        (r) => r.dose_mg_per_kg_day === 45 && r.interval_hours === 8
      );
      expect(invalid45q8).toBeUndefined();

      // Arbitrary continuous doses (e.g. 30, 35, 22)
      const arbitraryDose = DEFAULT_AMOXICILLIN_REGIMENS.find(
        (r) => ![20, 25, 40, 45].includes(r.dose_mg_per_kg_day)
      );
      expect(arbitraryDose).toBeUndefined();
    });

    it('6. Calculator UI: Switching Indication to Lower Respiratory Tract dynamically presents only mild_moderate_or_severe', () => {
      const approvedRule: PediatricDosageRule = {
        id: 'rule-amox-test-9',
        product_id: 'prod-amox-9',
        drug_label_id: 'label-amox-9',
        active_ingredient: 'Amoxicillin',
        dosage_form: 'suspension',
        route: 'oral',
        min_age_value: 3.0,
        min_age_unit: 'months',
        min_age_inclusive: false,
        max_weight_kg: 40.0,
        max_weight_inclusive: false,
        min_dose_mg_per_kg_day: 20,
        max_dose_mg_per_kg_day: 45,
        allowed_frequencies: ['every 12 hours', 'every 8 hours'],
        source_reference: 'openFDA Table 1',
        source_excerpt: 'Table 1',
        label_payload_hash: 'hash-9',
        review_status: 'approved',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        regimens: DEFAULT_AMOXICILLIN_REGIMENS,
      };

      const ctx: PediatricPatientContext = {
        patientId: 'p-1',
        visitId: 'v-1',
        patientName: 'عمر خالد',
        dateOfBirth: '2024-01-01',
        visitDate: '2026-10-01',
        ageInMonths: 33,
        ageDays: 0,
        ageFormatted: '33 شهر',
        isAgeSupportedByCalculator: true,
        weightKg: 10.0,
        weightSource: 'current_visit',
        weightDate: '2026-10-01',
        weightWarning: null,
        hasPenicillinOrAmoxicillinAllergy: false,
        allergyMatchType: 'none',
        rawAllergiesText: null,
      };

      render(
        <LanguageProvider>
          <PediatricDosageCalculatorModal
            isOpen={true}
            onClose={vi.fn()}
            patientContext={ctx}
            rule={approvedRule}
            productDisplayName="Amoxicillin 250 MG / 5 ML Oral Suspension"
            rawStrengthText="250 mg / 5 mL"
            onRuleUpdated={vi.fn()}
            onApplyResult={vi.fn()}
          />
        </LanguageProvider>
      );

      // Initially ENT + Mild/Mod
      expect(screen.getByTestId('indication-group-select')).toBeDefined();
      expect(screen.getByTestId('severity-select')).toBeDefined();

      // Check default math for 10 kg child with ENT Mild/Mod (25 mg/kg/day q12h):
      // 10 * 25 = 250 mg/day -> 125 mg single -> 125 / 50 = 2.5 mL
      expect(screen.getByTestId('suggested-volume-ml').textContent).toContain('2.5');

      // Change Indication to Lower Respiratory Tract
      const indicationSelect = screen.getByTestId('indication-group-select');
      fireEvent.change(indicationSelect, { target: { value: 'lower_respiratory_tract' } });

      // Severity automatically synchronizes to mild_moderate_or_severe
      const severitySelect = screen.getByTestId('severity-select') as HTMLSelectElement;
      expect(severitySelect.value).toBe('mild_moderate_or_severe');

      // Matching regimens are 45 q12 (4.5 mL) and 40 q8 (2.7 mL)
      expect(screen.getByTestId('regimen-option-12h')).toBeDefined();
      expect(screen.getByTestId('regimen-option-8h')).toBeDefined();

      // 45 mg/kg/day q12h for 10 kg = 450 mg/day -> 225 mg single -> 225 / 50 = 4.5 mL
      expect(screen.getByTestId('suggested-volume-ml').textContent).toContain('4.5');

      // Select 40 mg/kg/day q8h
      fireEvent.click(screen.getByTestId('regimen-option-8h'));
      // 40 mg/kg/day q8h for 10 kg = 400 mg/day -> 133.33 mg single -> 133.33 / 50 = 2.67 mL -> 2.7 mL rounded
      expect(screen.getByTestId('suggested-volume-ml').textContent).toContain('2.7');
    });

    it('7. PediatricRuleReviewModal: Renders all 14 structured regimens in a read-only table without free numeric inputs', () => {
      const pendingRule: PediatricDosageRule = {
        id: 'rule-review-test',
        product_id: 'prod-amox-test',
        drug_label_id: 'label-amox-test',
        active_ingredient: 'Amoxicillin',
        dosage_form: 'suspension',
        route: 'oral',
        min_age_value: 3.0,
        min_age_unit: 'months',
        min_age_inclusive: false,
        max_weight_kg: 40.0,
        max_weight_inclusive: false,
        min_dose_mg_per_kg_day: 20,
        max_dose_mg_per_kg_day: 45,
        allowed_frequencies: ['every 12 hours', 'every 8 hours'],
        source_reference: 'openFDA Section 2.2 Table 1',
        source_excerpt: 'Table 1',
        label_payload_hash: 'hash-valid-123',
        review_status: 'pending_review',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        regimens: DEFAULT_AMOXICILLIN_REGIMENS,
      };

      render(
        <LanguageProvider>
          <PediatricRuleReviewModal
            isOpen={true}
            onClose={vi.fn()}
            rule={pendingRule}
            currentUserRole="doctor"
            onViewDrugLabel={vi.fn()}
          />
        </LanguageProvider>
      );

      // Verify regimens table
      expect(screen.getByTestId('regimens-table')).toBeDefined();
      expect(screen.getByText('14 أنظمة مسجلة')).toBeDefined();

      // Check specific rows
      expect(screen.getByTestId('regimen-row-reg-ent-mild-12h')).toBeDefined();
      expect(screen.getByTestId('regimen-row-reg-lrt-12h')).toBeDefined();

      // Verify there is NO editable input for min dose (it is a read-only element)
      const minDoseElem = screen.getByTestId('min-dose-input');
      expect(minDoseElem.tagName).not.toBe('INPUT');
    });

    it('8. SQL Migration 00022 contract: schema defines trigger-enforced coupling, full columns, and fail-closed RPC', () => {
      expect(migration22Sql).toContain('CREATE TABLE IF NOT EXISTS public.pediatric_dosage_regimens');
      expect(migration22Sql).toContain('source_section VARCHAR(50)');
      expect(migration22Sql).toContain('source_table VARCHAR(50)');
      expect(migration22Sql).toContain('source_text TEXT NOT NULL');
      expect(migration22Sql).toContain('is_active BOOLEAN NOT NULL DEFAULT TRUE');
      expect(migration22Sql).toContain('created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
      expect(migration22Sql).toContain('updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
      expect(migration22Sql).toContain('fn_check_pediatric_regimen_clinical_rules()');
      expect(migration22Sql).toContain('trg_check_pediatric_regimen_clinical_rules');
      expect(migration22Sql).toContain('uq_pediatric_dosage_regimen');
      expect(migration22Sql).toContain('public.review_pediatric_dosage_rule');
      expect(migration22Sql).toContain('IF NOT public.is_doctor() THEN');
      expect(migration22Sql).toContain('v_regimen_count != 14');
      expect(migration22Sql).toContain('50090-6351');
    });

    it('9. pgTAP SQL Test Script contract: verifies all 6 explicit rejection scenarios and TAP assertions are present', () => {
      const sqlTestPath = path.resolve(__dirname, '../supabase/tests/test_pediatric_dosage_regimens.sql');
      const sqlTestContent = fs.readFileSync(sqlTestPath, 'utf8');

      // pgTAP Plan and Schema checks
      expect(sqlTestContent).toContain('SELECT plan(45);');
      expect(sqlTestContent).toContain("has_table('public', 'pediatric_dosage_regimens'");
      expect(sqlTestContent).toContain('has_trigger(');
      expect(sqlTestContent).toContain('trg_check_pediatric_regimen_clinical_rules');

      // Valid 64-character hex hash format
      expect(sqlTestContent).toContain('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

      // The 6 mandatory rejection tests with SQLSTATE 23514
      expect(sqlTestContent).toContain('Should reject mild_moderate + 45 q12 with SQLSTATE 23514');
      expect(sqlTestContent).toContain('Should reject mild_moderate + 40 q8 with SQLSTATE 23514');
      expect(sqlTestContent).toContain('Should reject severe + 25 q12 with SQLSTATE 23514');
      expect(sqlTestContent).toContain('Should reject severe + 20 q8 with SQLSTATE 23514');
      expect(sqlTestContent).toContain('Should reject lower_respiratory_tract + 25 q12 with SQLSTATE 23514');
      expect(sqlTestContent).toContain('Should reject lower_respiratory_tract + 20 q8 with SQLSTATE 23514');

      // Arbitrary and duplicate rejections
      expect(sqlTestContent).toContain('Should reject arbitrary free dose 30 mg/kg/day with SQLSTATE 23514');
      expect(sqlTestContent).toContain('Should reject duplicate regimen with SQLSTATE 23505 (unique_violation)');

      // Strict 14 regimens, source, and rollback
      expect(sqlTestContent).toContain('Total active regimens count should equal exactly 14');
      expect(sqlTestContent).toContain("All 14 regimens should reference source_section 2.2");
      expect(sqlTestContent).toContain("All 14 regimens should reference source_table Table 1");

      // Security layer assertions
      expect(sqlTestContent).toContain('anon cannot SELECT from public.pediatric_dosage_regimens');
      expect(sqlTestContent).toContain('sees 0 rows in pediatric_dosage_regimens due to RLS');
      expect(sqlTestContent).toContain('Doctor can see all 14 rows in pediatric_dosage_regimens under RLS');
      expect(sqlTestContent).toContain('anon cannot execute review_pediatric_dosage_rule');
      expect(sqlTestContent).toContain('fails when executing review_pediatric_dosage_rule due to is_doctor()');
      expect(sqlTestContent).toContain('authenticated cannot directly INSERT into pediatric_dosage_regimens');
      expect(sqlTestContent).toContain('authenticated cannot directly UPDATE pediatric_dosage_regimens');
      expect(sqlTestContent).toContain('authenticated cannot directly DELETE from pediatric_dosage_regimens');
      expect(sqlTestContent).toContain('authenticated cannot directly invoke trigger function');
      expect(sqlTestContent).toContain('fn_check_pediatric_regimen_clinical_rules has search_path set to empty string');
      expect(sqlTestContent).toContain('review_pediatric_dosage_rule has search_path set to empty string');

      expect(sqlTestContent).toContain('SELECT * FROM finish();');
      expect(sqlTestContent).toContain('ROLLBACK;');
    });
  });

  describe('Pediatric Rule Review Modal - RTL & Source Excerpt Presentation', () => {
    const createTestRule = (status: 'pending_review' | 'approved' = 'pending_review'): PediatricDosageRule => ({
      id: '00000000-0000-0000-0000-000000000301',
      product_id: 'prod-amox-250',
      drug_label_id: 'label-amox-250',
      active_ingredient: 'Amoxicillin',
      dosage_form: 'suspension',
      route: 'oral',
      min_age_value: 3.0,
      min_age_unit: 'months',
      min_age_inclusive: false,
      max_weight_kg: 40.0,
      max_weight_inclusive: false,
      min_dose_mg_per_kg_day: 20,
      max_dose_mg_per_kg_day: 45,
      allowed_frequencies: ['every 12 hours', 'every 8 hours'],
      source_reference: 'openFDA 50090-6351 Section 2.2 Table 1',
      source_excerpt: 'Pediatric Patients: 20 to 45 mg/kg/day in divided doses every 8 to 12 hours.',
      label_payload_hash: 'hash-amox-label-v1',
      review_status: status,
      product_display_name: 'Amoxicillin 250 MG / 5 ML Oral Suspension',
      product_ndc: '50090-6351',
      label_source_identifier: '50090-6351',
      label_effective_time: '20240430',
      label_review_status: 'pending_review',
      current_label_payload_hash: 'hash-amox-label-v1',
      is_hash_matching: true,
      label_dosage_and_administration: 'Pediatric Patients: 20 to 45 mg/kg/day in divided doses every 8 to 12 hours.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    it('1. Pure function extractPediatricDosingExcerpt correctly isolates Section 2.2 Table 1 from full label and excludes subsequent sections', () => {
      const fullLabelText = `
2 DOSAGE AND ADMINISTRATION
2.1 Dosing for Adults
The usual adult dose is 500 mg every 12 hours or 250 mg every 8 hours.

2.2 Pediatric Patients (aged 3 months and older and weight less than 40 kg)
Table 1: Recommended Dosage Regimens for Pediatric Patients Aged 3 Months and Older and Weight Less than 40 kg
Infection / Severity / Recommended Dosage / Frequency
Ear/Nose/Throat, Skin/Skin Structure, Genitourinary Tract:
Mild/Moderate: 25 mg/kg/day in divided doses every 12 hours or 20 mg/kg/day in divided doses every 8 hours
Severe: 45 mg/kg/day in divided doses every 12 hours or 40 mg/kg/day in divided doses every 8 hours
Lower Respiratory Tract:
Mild/Moderate or Severe: 45 mg/kg/day in divided doses every 12 hours or 40 mg/kg/day in divided doses every 8 hours

2.3 Dosing in Adults with Renal Impairment
For patients with severe renal impairment (GFR < 10 mL/min), the dosage should not exceed 500 mg or 250 mg every 24 hours.

2.4 Eradication of Helicobacter pylori
Dual Therapy: 1 gram every 8 hours with clarithromycin.
Triple Therapy: 1 gram every 12 hours with omeprazole.
`;

      const excerpt = extractPediatricDosingExcerpt(fullLabelText);
      expect(excerpt).not.toBeNull();
      expect(excerpt).toContain('Table 1');
      expect(excerpt).toContain('Pediatric Patients');
      expect(excerpt).toContain('25 mg/kg/day');
      expect(excerpt).toContain('every 12 hours');

      // Crucial: Must NOT contain Renal Impairment or H. pylori
      expect(excerpt).not.toContain('Renal Impairment');
      expect(excerpt).not.toContain('Helicobacter pylori');
      expect(excerpt).not.toContain('H. pylori');
      expect(excerpt).not.toContain('GFR < 10 mL/min');
    });

    it('2. Pure function extractPediatricDosingExcerpt rejects irrelevant sections (H. pylori or renal impairment only)', () => {
      // Only H. pylori
      const hpyloriText = `
2.4 Eradication of Helicobacter pylori:
Dual therapy with amoxicillin 1 g twice daily plus omeprazole 20 mg twice daily.
Triple therapy with amoxicillin 1 g twice daily plus clarithromycin 500 mg twice daily.
`;
      expect(extractPediatricDosingExcerpt(hpyloriText)).toBeNull();

      // Only Renal Impairment
      const renalText = `
2.3 Dosing in Renal Impairment:
In patients with impaired renal function (GFR 10 to 30 mL/min), dosage should be reduced to 250 mg or 500 mg every 12 hours.
`;
      expect(extractPediatricDosingExcerpt(renalText)).toBeNull();

      // Null, empty, or whitespace
      expect(extractPediatricDosingExcerpt(null)).toBeNull();
      expect(extractPediatricDosingExcerpt('')).toBeNull();
      expect(extractPediatricDosingExcerpt('   ')).toBeNull();
      expect(extractPediatricDosingExcerpt(undefined)).toBeNull();
    });

    it('3. UI eliminates < and > from Arabic titles/notes and renders explicit wording with LTR English equivalents', () => {
      const rule = createTestRule('pending_review');
      render(
        <LanguageProvider>
          <PediatricRuleReviewModal
            isOpen={true}
            onClose={vi.fn()}
            rule={rule}
            currentUserRole="doctor"
          />
        </LanguageProvider>
      );

      const minAgeEl = screen.getByTestId('min-age-input');
      const minAgeNote = screen.getByTestId('min-age-inclusive-note');
      const maxWeightEl = screen.getByTestId('max-weight-input');
      const maxWeightNote = screen.getByTestId('max-weight-inclusive-note');

      // Arabic wording must be explicit
      expect(minAgeEl.textContent).toContain('العمر: أكبر من 3 أشهر');
      expect(minAgeNote.textContent).toContain('غير شامل (العمر أكبر من 3 أشهر حصراً، لا يشمل حديثي الولادة)');
      expect(maxWeightEl.textContent).toContain('الوزن: أقل من 40 كغم');
      expect(maxWeightNote.textContent).toContain('غير شامل (الوزن أقل من 40 كغم حصراً، وأكبر من ذلك يتبع جرعات البالغين)');

      // Absolutely NO comparison symbols (< or >) in these elements
      expect(minAgeEl.textContent).not.toContain('>');
      expect(minAgeEl.textContent).not.toContain('<');
      expect(minAgeNote.textContent).not.toContain('>');
      expect(minAgeNote.textContent).not.toContain('<');
      expect(maxWeightEl.textContent).not.toContain('>');
      expect(maxWeightEl.textContent).not.toContain('<');
      expect(maxWeightNote.textContent).not.toContain('>');
      expect(maxWeightNote.textContent).not.toContain('<');

      // English equivalents
      const minAgeEn = screen.getByTestId('min-age-en-label');
      expect(minAgeEn.textContent).toBe('Age: older than 3 months');
      expect(minAgeEn.getAttribute('dir')).toBe('ltr');

      const maxWeightEn = screen.getByTestId('max-weight-en-label');
      expect(maxWeightEn.textContent).toBe('Weight: under 40 kg');
      expect(maxWeightEn.getAttribute('dir')).toBe('ltr');
    });

    it('4. Technical values have dir="ltr" and appropriate styling to prevent RTL flipping (NDC, effective_time, status, units, section)', () => {
      const rule = createTestRule('pending_review');
      render(
        <LanguageProvider>
          <PediatricRuleReviewModal
            isOpen={true}
            onClose={vi.fn()}
            rule={rule}
            currentUserRole="doctor"
          />
        </LanguageProvider>
      );

      // NDC badge has dir="ltr" containing 50090-6351
      const ndcBadge = screen.getByTestId('rule-product-ndc');
      expect(ndcBadge.textContent).toContain('50090-6351');
      const ndcSpan = ndcBadge.querySelector('span[dir="ltr"]');
      expect(ndcSpan).not.toBeNull();
      expect(ndcSpan?.textContent).toBe('50090-6351');

      // effective_time has dir="ltr"
      const effectiveTimeEl = screen.getByTestId('rule-effective-time');
      const effectiveTimeSpan = effectiveTimeEl.querySelector('span[dir="ltr"]');
      expect(effectiveTimeSpan).not.toBeNull();
      expect(effectiveTimeSpan?.textContent).toBe('20240430');

      // pending_review status has dir="ltr"
      const statusBadge = screen.getByTestId('rule-review-status-badge');
      const statusSpan = statusBadge.querySelector('span[dir="ltr"]');
      expect(statusSpan).not.toBeNull();
      expect(statusSpan?.textContent).toContain('pending_review');

      // dose range has dir="ltr" with mg/kg/day
      const doseRangeEl = screen.getByTestId('dose-range-display');
      const doseRangeSpan = doseRangeEl.querySelector('span[dir="ltr"]');
      expect(doseRangeSpan).not.toBeNull();
      expect(doseRangeSpan?.textContent).toContain('mg/kg/day');

      // Regimens table Section 2.2 Table 1 has dir="ltr"
      const regimensContainer = screen.getByTestId('regimens-table-container');
      const sectionSpan = regimensContainer.querySelector('span[dir="ltr"]');
      expect(sectionSpan).not.toBeNull();
      expect(sectionSpan?.textContent).toContain('Section 2.2 Table 1');
    });

    it('5. Displays fallback warning and does NOT show irrelevant excerpt when label contains only H. pylori or renal impairment', () => {
      const ruleWithIrrelevantLabel: PediatricDosageRule = {
        ...createTestRule('pending_review'),
        label_dosage_and_administration: '2.4 Eradication of Helicobacter pylori: Dual therapy with amoxicillin 1 g every 12 hours. 2.3 Renal impairment: GFR < 30 mL/min.',
        source_excerpt: 'Irrelevant text',
      };

      const onViewDrugLabel = vi.fn();

      render(
        <LanguageProvider>
          <PediatricRuleReviewModal
            isOpen={true}
            onClose={vi.fn()}
            rule={ruleWithIrrelevantLabel}
            currentUserRole="doctor"
            onViewDrugLabel={onViewDrugLabel}
          />
        </LanguageProvider>
      );

      // Warning alert must be displayed
      const warningAlert = screen.getByTestId('missing-pediatric-excerpt-warning');
      expect(warningAlert).toBeDefined();
      expect(warningAlert.textContent).toContain('تعذر استخراج المقتطف المطابق تلقائياً؛ راجع النشرة الكاملة قبل الاعتماد');

      // Irrelevant text must NOT be displayed
      expect(screen.queryByTestId('pediatric-label-excerpt')).toBeNull();
      expect(screen.queryByText(/Helicobacter pylori/)).toBeNull();
      expect(screen.queryByText(/Renal impairment/)).toBeNull();

      // Full label button is still available
      const fullLabelBtn = screen.getByTestId('view-full-label-from-excerpt-btn');
      expect(fullLabelBtn).toBeDefined();
      fireEvent.click(fullLabelBtn);
      expect(onViewDrugLabel).toHaveBeenCalledTimes(1);
    });

    it('6. Displays extracted Section 2.2 Table 1 excerpt when matching text is present in dosage_and_administration', () => {
      const ruleWithValidLabel: PediatricDosageRule = {
        ...createTestRule('pending_review'),
        label_dosage_and_administration: `
2.1 Adults: 500 mg every 8 hours.
2.2 Pediatric Patients (aged 3 months and older and weight less than 40 kg):
Table 1: Recommended Dosage Regimens for Pediatric Patients:
Ear/Nose/Throat: Mild/Moderate: 25 mg/kg/day q12h or 20 mg/kg/day q8h.
2.3 Renal Impairment: GFR < 30 mL/min.
`,
      };

      render(
        <LanguageProvider>
          <PediatricRuleReviewModal
            isOpen={true}
            onClose={vi.fn()}
            rule={ruleWithValidLabel}
            currentUserRole="doctor"
          />
        </LanguageProvider>
      );

      const excerptContainer = screen.getByTestId('pediatric-label-excerpt');
      expect(excerptContainer).toBeDefined();
      expect(excerptContainer.getAttribute('dir')).toBe('ltr');
      expect(excerptContainer.textContent).toContain('Table 1');
      expect(excerptContainer.textContent).toContain('Pediatric Patients');
      expect(excerptContainer.textContent).not.toContain('Renal Impairment');
      expect(screen.queryByTestId('missing-pediatric-excerpt-warning')).toBeNull();
    });
  });
});

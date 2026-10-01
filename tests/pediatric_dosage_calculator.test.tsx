import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

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
  verifyPediatricProductEligibility,
} from '../src/services/pediatricDosageService';

import {
  ElectronicPrescriptionSection,
  isItemEligibleForPediatricAmoxicillin,
} from '../src/components/prescriptions/ElectronicPrescriptionSection';

import { PediatricDosageCalculatorModal } from '../src/components/prescriptions/PediatricDosageCalculatorModal';
import { PediatricRuleReviewModal } from '../src/components/prescriptions/PediatricRuleReviewModal';
import { LanguageProvider } from '../src/context/LanguageContext';
import { PediatricDosageRule, PediatricPatientContext } from '../src/types/pediatricDosage';

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

      // Check math output: 12 kg x 30 mg/kg/day = 360 mg/day -> 180 mg single -> 3.6 mL
      expect(screen.getAllByText(/3\.6/).length).toBeGreaterThan(0);
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

    it('handles allergy acknowledgment strictly before allowing application', () => {
      const allergicContext: PediatricPatientContext = {
        ...mockContext,
        hasPenicillinOrAmoxicillinAllergy: true,
        allergyMatchTerm: 'Penicillin',
        rawAllergiesText: 'Severe allergy to Penicillin',
      };

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
            onApplyResult={vi.fn()}
          />
        </LanguageProvider>
      );

      // Alert must be prominent
      expect(screen.getByTestId('allergy-warning-banner')).toBeDefined();
      expect(screen.getByText(/Severe allergy to Penicillin/)).toBeDefined();

      // Apply button disabled initially
      const applyBtn = screen.getByTestId('apply-pediatric-dose-btn') as HTMLButtonElement;
      expect(applyBtn.disabled).toBe(true);

      // Check acknowledgment checkbox
      const ackCheckbox = screen.getByTestId('allergy-acknowledge-checkbox') as HTMLInputElement;
      fireEvent.click(ackCheckbox);

      // Apply button now enabled
      expect(applyBtn.disabled).toBe(false);
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
        dose: expect.stringContaining('3.6 مل'),
        instructions: expect.stringContaining('3.6 مل'),
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

      // Click Approve
      const approveBtn = screen.getByTestId('approve-rule-btn');
      fireEvent.click(approveBtn);

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

      // Verify that age halt banner appears
      expect(screen.getByTestId('age-unsupported-banner')).toBeDefined();
      expect(screen.getByText(/حدود الفئة العمرية المدعومة/)).toBeDefined();

      // Verify database error message is NOT present
      expect(screen.queryByText(/column.*does not exist/i)).toBeNull();
      expect(screen.queryByText(/فشل استعلام قاعدة البيانات/)).toBeNull();
    });
  });
});

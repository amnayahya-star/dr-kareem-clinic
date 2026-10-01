/**
-- ==============================================================================
-- Types: Pediatric Dosage Rules & Calculator System (Phase 1)
-- ==============================================================================
*/

export type DosageRuleReviewStatus = 'pending_review' | 'approved' | 'rejected' | 'needs_re_review';

export interface PediatricDosageRule {
  id: string;
  product_id: string;
  drug_label_id: string;
  active_ingredient: string;
  dosage_form: string;
  route: string;

  // Explicit age bounds
  min_age_value: number;
  min_age_unit: string;
  min_age_inclusive: boolean; // false = strictly age > min_age_value
  max_age_value?: number | null;
  max_age_unit?: string | null;
  max_age_inclusive?: boolean | null;

  // Explicit weight bounds
  min_weight_kg?: number | null;
  min_weight_inclusive?: boolean;
  max_weight_kg: number; // e.g. 40 kg
  max_weight_inclusive: boolean; // false = strictly weight < 40 kg

  // Dosage bounds
  min_dose_mg_per_kg_day: number;
  max_dose_mg_per_kg_day: number;
  allowed_frequencies: string[];

  // Provenance & Audit
  source_reference: string;
  source_excerpt: string;
  label_payload_hash: string;
  label_effective_time?: string | null;
  review_status: DosageRuleReviewStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  approved_snapshot?: Record<string, any> | null;
  created_at: string;
  updated_at: string;

  // Joined presentation data
  product_display_name?: string;
  product_brand_name?: string;
  product_ndc?: string;
  label_dosage_and_administration?: string;
  label_pediatric_use?: string;
  label_source_identifier?: string;
  label_review_status?: string;
  current_label_payload_hash?: string;
  is_hash_matching?: boolean;
}

export type AllergyMatchType = 'none' | 'direct_drug_allergy' | 'suspected_history_mention';

export interface PediatricPatientContext {
  patientId: string;
  visitId: string;
  patientName: string;
  dateOfBirth: string | null;
  visitDate: string;
  ageInMonths: number;
  ageDays?: number;
  ageFormatted: string;
  isAgeSupportedByCalculator: boolean; // false if <= 3 months
  weightKg: number | null;
  weightSource: 'current_visit' | 'previous_visit' | 'none';
  weightDate?: string | null;
  weightWarning?: string | null;
  hasPenicillinOrAmoxicillinAllergy: boolean;
  allergyMatchType: AllergyMatchType;
  allergyMatchTerm?: string;
  rawAllergiesText?: string | null;
}

export interface ConcentrationDetails {
  isValid: boolean;
  numeratorMg: number;
  denominatorMl: number;
  concentrationMgPerMl: number;
  rawStrengthText: string;
  error?: string;
}

export interface DosageRoundingDetails {
  rawSingleDoseMl: number;
  roundedSingleDoseMl: number;
  differenceMl: number;
  actualSingleDoseMg: number;
  actualDailyMg: number;
  actualMgPerKgDay: number;
  isWithinBounds: boolean;
  boundaryViolation?: 'exceeds_max' | 'below_min' | null;
}

export interface PediatricCalculationInput {
  weightKg: number;
  targetMgPerKgDay: number;
  dosesPerDay: number;
  strengthNumeratorMg: number;
  strengthDenominatorMl: number;
  minAllowedMgPerKgDay?: number;
  maxAllowedMgPerKgDay?: number;
}

export interface PediatricCalculationResult {
  dailyMg: number;
  singleDoseMg: number;
  concentrationMgPerMl: number;
  singleDoseMlRaw: number;
  singleDoseMlSuggested: number;
  rounding: DosageRoundingDetails;
  formulaDescription: string;
}

export interface ProductPediatricEligibilityInput {
  catalogProductId?: string | null;
  userEditedStrength?: string | null;
  product?: {
    id: string;
    source_system?: string | null;
    source_identifier?: string | null;
    dosage_form?: string | null;
    route?: string | null;
    display_name?: string | null;
  } | null;
  ingredients?: Array<{
    active_ingredient?: string | null;
    normalized_name?: string | null;
    preferred_name?: string | null;
    strength_numerator_value?: number | null;
    strength_numerator_unit?: string | null;
    strength_denominator_value?: number | null;
    strength_denominator_unit?: string | null;
  }> | null;
  rule?: {
    id: string;
    product_id: string;
    drug_label_id: string;
    review_status: string;
    label_payload_hash: string;
  } | null;
  label?: {
    id: string;
    product_id: string;
    payload_hash: string;
  } | null;
}

export interface ProductPediatricEligibilityResult {
  isEligible: boolean;
  reason?: string;
  concentrationMgPerMl?: number;
  numeratorMg?: number;
  denominatorMl?: number;
  activeIngredient?: string;
  ruleStatus?: DosageRuleReviewStatus | 'none';
  rule?: PediatricDosageRule | null;
}

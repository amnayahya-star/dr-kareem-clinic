/**
-- ==============================================================================
-- Types: Pediatric Dosage Rules & Calculator System (Phase 1)
-- ==============================================================================
*/

export type DosageRuleReviewStatus = 'pending_review' | 'approved' | 'rejected' | 'needs_re_review';

export type PediatricIndicationGroup =
  | 'ear_nose_throat'
  | 'skin_skin_structure'
  | 'genitourinary_tract'
  | 'lower_respiratory_tract';

export type PediatricSeverity =
  | 'mild_moderate'
  | 'severe'
  | 'mild_moderate_or_severe';

export interface PediatricDosageRegimen {
  id: string;
  rule_id: string;
  indication_group: PediatricIndicationGroup;
  severity: PediatricSeverity;
  dose_mg_per_kg_day: number;
  interval_hours: 8 | 12;
  doses_per_day: 2 | 3;
  source_section: string;
  source_table: string;
  source_text: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

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

  // Regimens
  regimens?: PediatricDosageRegimen[];

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

export const PEDIATRIC_INDICATION_GROUPS: Array<{
  id: PediatricIndicationGroup;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
}> = [
  {
    id: 'ear_nose_throat',
    labelAr: 'التهاب الأذن والأنف والحنجرة (Ear/Nose/Throat)',
    labelEn: 'Ear / Nose / Throat',
    descriptionAr: 'يشمل التهاب الأذن الوسطى والبلعوم واللوزتين والجيوب الأنفية',
  },
  {
    id: 'skin_skin_structure',
    labelAr: 'التهاب الجلد وأنسجة الجلد (Skin/Skin Structure)',
    labelEn: 'Skin / Skin Structure',
    descriptionAr: 'يشمل الالتهابات الجلدية البكتيرية السطحية والعميقة',
  },
  {
    id: 'genitourinary_tract',
    labelAr: 'التهاب المسالك البولية والتناسلية (Genitourinary Tract)',
    labelEn: 'Genitourinary Tract',
    descriptionAr: 'يشمل التهابات المسالك البولية غير المصحوبة بمضاعفات',
  },
  {
    id: 'lower_respiratory_tract',
    labelAr: 'التهاب الجهاز التنفسي السفلي (Lower Respiratory Tract)',
    labelEn: 'Lower Respiratory Tract',
    descriptionAr: 'يشمل الالتهاب الرئوي والشعب الهوائية (جرعات مرتفعة حصراً)',
  },
];

export const PEDIATRIC_SEVERITIES: Array<{
  id: PediatricSeverity;
  labelAr: string;
  labelEn: string;
}> = [
  {
    id: 'mild_moderate',
    labelAr: 'خفيف إلى متوسط (Mild/Moderate)',
    labelEn: 'Mild to Moderate',
  },
  {
    id: 'severe',
    labelAr: 'شديد (Severe)',
    labelEn: 'Severe',
  },
  {
    id: 'mild_moderate_or_severe',
    labelAr: 'خفيف إلى متوسط أو شديد (Mild/Moderate or Severe)',
    labelEn: 'Mild/Moderate or Severe',
  },
];

export function getAllowedSeveritiesForIndication(
  group: PediatricIndicationGroup
): PediatricSeverity[] {
  if (group === 'lower_respiratory_tract') {
    return ['mild_moderate_or_severe'];
  }
  return ['mild_moderate', 'severe'];
}

export const DEFAULT_AMOXICILLIN_REGIMENS: PediatricDosageRegimen[] = [
  // Ear/Nose/Throat
  {
    id: 'reg-ent-mild-12h',
    rule_id: 'rule-amox-default',
    indication_group: 'ear_nose_throat',
    severity: 'mild_moderate',
    dose_mg_per_kg_day: 25.00,
    interval_hours: 12,
    doses_per_day: 2,
    source_section: '2.2',
    source_table: 'Table 1',
    source_text: 'Ear/Nose/Throat - Mild/Moderate: 25 mg/kg/day in divided doses every 12 hours',
    is_active: true,
  },
  {
    id: 'reg-ent-mild-8h',
    rule_id: 'rule-amox-default',
    indication_group: 'ear_nose_throat',
    severity: 'mild_moderate',
    dose_mg_per_kg_day: 20.00,
    interval_hours: 8,
    doses_per_day: 3,
    source_section: '2.2',
    source_table: 'Table 1',
    source_text: 'Ear/Nose/Throat - Mild/Moderate: 20 mg/kg/day in divided doses every 8 hours',
    is_active: true,
  },
  {
    id: 'reg-ent-severe-12h',
    rule_id: 'rule-amox-default',
    indication_group: 'ear_nose_throat',
    severity: 'severe',
    dose_mg_per_kg_day: 45.00,
    interval_hours: 12,
    doses_per_day: 2,
    source_section: '2.2',
    source_table: 'Table 1',
    source_text: 'Ear/Nose/Throat - Severe: 45 mg/kg/day in divided doses every 12 hours',
    is_active: true,
  },
  {
    id: 'reg-ent-severe-8h',
    rule_id: 'rule-amox-default',
    indication_group: 'ear_nose_throat',
    severity: 'severe',
    dose_mg_per_kg_day: 40.00,
    interval_hours: 8,
    doses_per_day: 3,
    source_section: '2.2',
    source_table: 'Table 1',
    source_text: 'Ear/Nose/Throat - Severe: 40 mg/kg/day in divided doses every 8 hours',
    is_active: true,
  },

  // Skin/Skin Structure
  {
    id: 'reg-skin-mild-12h',
    rule_id: 'rule-amox-default',
    indication_group: 'skin_skin_structure',
    severity: 'mild_moderate',
    dose_mg_per_kg_day: 25.00,
    interval_hours: 12,
    doses_per_day: 2,
    source_section: '2.2',
    source_table: 'Table 1',
    source_text: 'Skin/Skin Structure - Mild/Moderate: 25 mg/kg/day in divided doses every 12 hours',
    is_active: true,
  },
  {
    id: 'reg-skin-mild-8h',
    rule_id: 'rule-amox-default',
    indication_group: 'skin_skin_structure',
    severity: 'mild_moderate',
    dose_mg_per_kg_day: 20.00,
    interval_hours: 8,
    doses_per_day: 3,
    source_section: '2.2',
    source_table: 'Table 1',
    source_text: 'Skin/Skin Structure - Mild/Moderate: 20 mg/kg/day in divided doses every 8 hours',
    is_active: true,
  },
  {
    id: 'reg-skin-severe-12h',
    rule_id: 'rule-amox-default',
    indication_group: 'skin_skin_structure',
    severity: 'severe',
    dose_mg_per_kg_day: 45.00,
    interval_hours: 12,
    doses_per_day: 2,
    source_section: '2.2',
    source_table: 'Table 1',
    source_text: 'Skin/Skin Structure - Severe: 45 mg/kg/day in divided doses every 12 hours',
    is_active: true,
  },
  {
    id: 'reg-skin-severe-8h',
    rule_id: 'rule-amox-default',
    indication_group: 'skin_skin_structure',
    severity: 'severe',
    dose_mg_per_kg_day: 40.00,
    interval_hours: 8,
    doses_per_day: 3,
    source_section: '2.2',
    source_table: 'Table 1',
    source_text: 'Skin/Skin Structure - Severe: 40 mg/kg/day in divided doses every 8 hours',
    is_active: true,
  },

  // Genitourinary Tract
  {
    id: 'reg-gu-mild-12h',
    rule_id: 'rule-amox-default',
    indication_group: 'genitourinary_tract',
    severity: 'mild_moderate',
    dose_mg_per_kg_day: 25.00,
    interval_hours: 12,
    doses_per_day: 2,
    source_section: '2.2',
    source_table: 'Table 1',
    source_text: 'Genitourinary Tract - Mild/Moderate: 25 mg/kg/day in divided doses every 12 hours',
    is_active: true,
  },
  {
    id: 'reg-gu-mild-8h',
    rule_id: 'rule-amox-default',
    indication_group: 'genitourinary_tract',
    severity: 'mild_moderate',
    dose_mg_per_kg_day: 20.00,
    interval_hours: 8,
    doses_per_day: 3,
    source_section: '2.2',
    source_table: 'Table 1',
    source_text: 'Genitourinary Tract - Mild/Moderate: 20 mg/kg/day in divided doses every 8 hours',
    is_active: true,
  },
  {
    id: 'reg-gu-severe-12h',
    rule_id: 'rule-amox-default',
    indication_group: 'genitourinary_tract',
    severity: 'severe',
    dose_mg_per_kg_day: 45.00,
    interval_hours: 12,
    doses_per_day: 2,
    source_section: '2.2',
    source_table: 'Table 1',
    source_text: 'Genitourinary Tract - Severe: 45 mg/kg/day in divided doses every 12 hours',
    is_active: true,
  },
  {
    id: 'reg-gu-severe-8h',
    rule_id: 'rule-amox-default',
    indication_group: 'genitourinary_tract',
    severity: 'severe',
    dose_mg_per_kg_day: 40.00,
    interval_hours: 8,
    doses_per_day: 3,
    source_section: '2.2',
    source_table: 'Table 1',
    source_text: 'Genitourinary Tract - Severe: 40 mg/kg/day in divided doses every 8 hours',
    is_active: true,
  },

  // Lower Respiratory Tract
  {
    id: 'reg-lrt-12h',
    rule_id: 'rule-amox-default',
    indication_group: 'lower_respiratory_tract',
    severity: 'mild_moderate_or_severe',
    dose_mg_per_kg_day: 45.00,
    interval_hours: 12,
    doses_per_day: 2,
    source_section: '2.2',
    source_table: 'Table 1',
    source_text: 'Lower Respiratory Tract - Mild/Moderate or Severe: 45 mg/kg/day in divided doses every 12 hours',
    is_active: true,
  },
  {
    id: 'reg-lrt-8h',
    rule_id: 'rule-amox-default',
    indication_group: 'lower_respiratory_tract',
    severity: 'mild_moderate_or_severe',
    dose_mg_per_kg_day: 40.00,
    interval_hours: 8,
    doses_per_day: 3,
    source_section: '2.2',
    source_table: 'Table 1',
    source_text: 'Lower Respiratory Tract - Mild/Moderate or Severe: 40 mg/kg/day in divided doses every 8 hours',
    is_active: true,
  },
];

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

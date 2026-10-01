/**
-- ==============================================================================
-- Pediatric Dosage Service: Clinical Rules & Patient Context Integration
-- ==============================================================================
*/

import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  PediatricDosageRule,
  PediatricPatientContext,
  ProductPediatricEligibilityResult,
} from '@/types/pediatricDosage';
import {
  calculatePatientAgeInMonths,
  resolvePatientWeight,
  checkPenicillinAllergy,
  verifyProductPediatricEligibilityPure,
} from '@/lib/pediatricCalculator';
import { fetchPatientById } from './patientService';

// In-Memory Fallback State (for testing and offline demo)
const IN_MEMORY_RULES = new Map<string, PediatricDosageRule>();
const IN_MEMORY_PRODUCTS = new Map<string, {
  product: any;
  ingredients: any[];
  rule?: any;
  label?: any;
}>();

export function _resetInMemoryPediatricRules(): void {
  IN_MEMORY_RULES.clear();
  IN_MEMORY_PRODUCTS.clear();
}

export function _setInMemoryPediatricRule(rule: PediatricDosageRule): void {
  IN_MEMORY_RULES.set(rule.id, rule);
  if (rule.product_id) {
    IN_MEMORY_RULES.set(`prod_${rule.product_id}`, rule);
  }
}

export function _setInMemoryProduct(
  product: any,
  ingredients: any[],
  rule?: any,
  label?: any
): void {
  IN_MEMORY_PRODUCTS.set(product.id, {
    product,
    ingredients,
    rule,
    label,
  });
  if (rule) {
    _setInMemoryPediatricRule(rule);
  }
}

/**
 * 1. جلب قاعدة الجرعة المنظمة الخاصة بمنتج دوائي معين
 */
export async function fetchPediatricDosageRuleForProduct(
  productId: string
): Promise<PediatricDosageRule | null> {
  if (!productId || !productId.trim()) return null;
  const cleanId = productId.trim();

  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const direct = IN_MEMORY_RULES.get(`prod_${cleanId}`) || IN_MEMORY_RULES.get(cleanId);
    if (direct) return direct;

    // Default seeded fallback for Amoxicillin 250mg/5mL
    if (
      cleanId === '00000000-0000-0000-0000-000000000102' ||
      cleanId.toLowerCase().includes('amox')
    ) {
      return {
        id: 'rule-amox-default',
        product_id: cleanId,
        drug_label_id: 'label-amox-default',
        active_ingredient: 'Amoxicillin',
        dosage_form: 'suspension',
        route: 'oral',
        min_age_value: 3.0,
        min_age_unit: 'months',
        min_age_inclusive: false, // strictly age > 3 months
        max_age_value: null,
        max_age_unit: 'months',
        max_age_inclusive: true,
        min_weight_kg: null,
        min_weight_inclusive: true,
        max_weight_kg: 40.0,
        max_weight_inclusive: false, // strictly weight < 40 kg
        min_dose_mg_per_kg_day: 20,
        max_dose_mg_per_kg_day: 45,
        allowed_frequencies: ['every 12 hours', 'every 8 hours'],
        source_reference: 'openFDA Drug Labeling (A-S Medication Solutions / Aurobindo) Section 2.2 Table 1',
        source_excerpt:
          'Pediatric Patients Aged 3 Months and Older and Weight Less than 40 kg: Mild/Moderate: 25 mg/kg/day in divided doses every 12 hours or 20 mg/kg/day in divided doses every 8 hours. Severe: 45 mg/kg/day in divided doses every 12 hours or 40 mg/kg/day in divided doses every 8 hours.',
        label_payload_hash: 'eb31b635601ab0574bc6a91dc27e3255568cc94cb2ba223de6352de7d13e46c0',
        label_effective_time: '20240430',
        review_status: 'pending_review',
        review_notes: 'قاعدة أولية مقترحة من نشرة openFDA تتطلب مراجعة واعتماد الطبيب',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        product_display_name: 'Amoxicillin 250 MG / 5 ML Oral Suspension',
        product_brand_name: 'Amoxil',
      };
    }

    return null;
  }

  const { data, error } = await supabase
    .from('pediatric_dosage_rules')
    .select(`
      *,
      drug_products:product_id (
        display_name,
        brand_name
      ),
      drug_labels:drug_label_id (
        dosage_and_administration,
        pediatric_use,
        payload_hash,
        effective_time,
        review_status
      )
    `)
    .eq('product_id', cleanId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching pediatric dosage rule:', error);
    throw new Error(`فشل جلب قاعدة الجرعة المنظمة: ${error.message}`);
  }

  if (!data) return null;

  return {
    ...data,
    product_display_name: data.drug_products?.display_name,
    product_brand_name: data.drug_products?.brand_name,
    label_dosage_and_administration: data.drug_labels?.dosage_and_administration,
    label_pediatric_use: data.drug_labels?.pediatric_use,
  };
}

/**
 * 2. جلب جميع القواعد التي تتطلب مراجعة الطبيب (pending_review أو needs_re_review)
 */
export async function fetchPendingDosageRules(): Promise<PediatricDosageRule[]> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    return Array.from(IN_MEMORY_RULES.values()).filter(
      (r) => r.review_status === 'pending_review' || r.review_status === 'needs_re_review'
    );
  }

  const { data, error } = await supabase
    .from('pediatric_dosage_rules')
    .select(`
      *,
      drug_products:product_id (
        display_name,
        brand_name
      ),
      drug_labels:drug_label_id (
        dosage_and_administration,
        pediatric_use,
        payload_hash,
        effective_time
      )
    `)
    .in('review_status', ['pending_review', 'needs_re_review'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pending dosage rules:', error);
    throw new Error(`فشل جلب قواعد الجرعات المعلقة: ${error.message}`);
  }

  return (data || []).map((r: any) => ({
    ...r,
    product_display_name: r.drug_products?.display_name,
    product_brand_name: r.drug_products?.brand_name,
    label_dosage_and_administration: r.drug_labels?.dosage_and_administration,
    label_pediatric_use: r.drug_labels?.pediatric_use,
  }));
}

/**
 * 3. اعتماد أو رفض قاعدة الجرعة من قبل الطبيب (RPC call)
 */
export async function reviewPediatricDosageRule(
  ruleId: string,
  action: 'approve' | 'reject',
  notes: string,
  customFields?: Partial<PediatricDosageRule>
): Promise<PediatricDosageRule> {
  if (!ruleId || !ruleId.trim()) {
    throw new Error('معرف قاعدة الجرعة إلزامي');
  }

  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    let rule = IN_MEMORY_RULES.get(ruleId);
    if (!rule) {
      for (const r of Array.from(IN_MEMORY_RULES.values())) {
        if (r.id === ruleId) {
          rule = r;
          break;
        }
      }
    }

    if (!rule) {
      const fallback = await fetchPediatricDosageRuleForProduct('00000000-0000-0000-0000-000000000102');
      if (fallback) {
        rule = fallback;
      }
    }

    if (!rule) {
      throw new Error('لم يتم العثور على قاعدة الجرعة المحددة');
    }

    const minDose = customFields?.min_dose_mg_per_kg_day ?? rule.min_dose_mg_per_kg_day;
    const maxDose = customFields?.max_dose_mg_per_kg_day ?? rule.max_dose_mg_per_kg_day;
    const minAgeVal = customFields?.min_age_value ?? rule.min_age_value;
    const minAgeInc = customFields?.min_age_inclusive ?? rule.min_age_inclusive;
    const maxWeight = customFields?.max_weight_kg ?? rule.max_weight_kg;
    const maxWeightInc = customFields?.max_weight_inclusive ?? rule.max_weight_inclusive;
    const allowedFreq = customFields?.allowed_frequencies ?? rule.allowed_frequencies;

    const snapshot = action === 'approve' ? {
      approved_at: new Date().toISOString(),
      approved_by: 'doc-mock-uid',
      min_dose_mg_per_kg_day: minDose,
      max_dose_mg_per_kg_day: maxDose,
      min_age_value: minAgeVal,
      min_age_inclusive: minAgeInc,
      max_weight_kg: maxWeight,
      max_weight_inclusive: maxWeightInc,
      allowed_frequencies: allowedFreq,
      review_notes: notes.trim(),
    } : null;

    const updated: PediatricDosageRule = {
      ...rule,
      review_status: action === 'approve' ? 'approved' : 'rejected',
      reviewed_by: 'doc-mock-uid',
      reviewed_at: new Date().toISOString(),
      review_notes: notes.trim(),
      min_dose_mg_per_kg_day: minDose,
      max_dose_mg_per_kg_day: maxDose,
      min_age_value: minAgeVal,
      min_age_inclusive: minAgeInc,
      max_weight_kg: maxWeight,
      max_weight_inclusive: maxWeightInc,
      allowed_frequencies: allowedFreq,
      approved_snapshot: snapshot,
      updated_at: new Date().toISOString(),
    };

    _setInMemoryPediatricRule(updated);
    return updated;
  }

  const { data, error } = await supabase.rpc('review_pediatric_dosage_rule', {
    p_rule_id: ruleId,
    p_action: action,
    p_notes: notes.trim(),
    p_custom_fields: customFields || null,
  });

  if (error) {
    throw new Error(error.message || 'فشل اعتماد/رفض قاعدة الجرعة في قاعدة البيانات');
  }

  if (!data) {
    throw new Error('لم يتم استلام استجابة صالحة بعد مراجعة القاعدة');
  }

  return data as PediatricDosageRule;
}

/**
 * 4. تجميع وبناء السياق السريري لحاسبة جرعة الطفل
 */
export async function getPediatricPatientContext(
  visitId: string,
  patientId: string
): Promise<PediatricPatientContext> {
  const patientFile = await fetchPatientById(patientId);
  if (!patientFile) {
    throw new Error('لم يتم العثور على ملف الطفل');
  }

  const currentVisit = (patientFile.visits || []).find((v) => v.id === visitId);
  const visitDate = currentVisit?.date || new Date().toISOString();

  // 1. حساب العمر ومقارنته بشرط 3 أشهر
  const ageCalc = calculatePatientAgeInMonths(patientFile.dateOfBirth, visitDate);

  // 2. تجميع قياسات الوزن
  const currentWeight = currentVisit?.weightKg ?? null;
  const previousMeasurements = (patientFile.visits || [])
    .filter((v): v is typeof v & { weightKg: number } => v.id !== visitId && typeof v.weightKg === 'number' && v.weightKg > 0)
    .map((v) => ({
      weight_kg: v.weightKg,
      created_at: v.date,
    }));

  const weightResolution = resolvePatientWeight(currentWeight, visitDate, previousMeasurements);

  // 3. فحص حساسية البنسلين مع التمييز بين الحساسية المؤكدة والتاريخ الطبي
  const allergyCheck = checkPenicillinAllergy(
    patientFile.allergies,
    patientFile.drugAllergies,
    patientFile.medicalHistory
  );

  return {
    patientId: patientFile.id,
    visitId,
    patientName: patientFile.fullName,
    dateOfBirth: patientFile.dateOfBirth,
    visitDate,
    ageInMonths: ageCalc.months,
    ageFormatted: ageCalc.formatted,
    isAgeSupportedByCalculator: ageCalc.isGreaterThanThreeMonths,
    weightKg: weightResolution.weightKg,
    weightSource: weightResolution.source,
    weightDate: weightResolution.date,
    weightWarning: weightResolution.warning,
    hasPenicillinOrAmoxicillinAllergy: allergyCheck.hasAllergy,
    allergyMatchType: allergyCheck.matchType,
    allergyMatchTerm: allergyCheck.matchedTerm,
    rawAllergiesText: allergyCheck.description,
  };
}

/**
 * 5. التحقق الصارم من أهلية المنتج الدوائي لحاسبة جرعات الأطفال (Fail-Closed)
 */
export async function verifyPediatricProductEligibility(
  productId: string
): Promise<ProductPediatricEligibilityResult> {
  if (!productId || !productId.trim()) {
    return {
      isEligible: false,
      reason: 'الدواء غير مرتبط بمنتج موثق في دليل الأدوية الرسمي (catalog_product_id مفقود)',
    };
  }
  const cleanId = productId.trim();
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const mem = IN_MEMORY_PRODUCTS.get(cleanId);
    if (mem) {
      return verifyProductPediatricEligibilityPure({
        catalogProductId: cleanId,
        product: mem.product,
        ingredients: mem.ingredients,
        rule: mem.rule,
        label: mem.label,
      });
    }

    // Default seeded product check
    if (cleanId === '00000000-0000-0000-0000-000000000102') {
      const defaultRule = await fetchPediatricDosageRuleForProduct(cleanId);
      return verifyProductPediatricEligibilityPure({
        catalogProductId: cleanId,
        product: {
          id: cleanId,
          source_system: 'FDA_NDC',
          source_identifier: '50090-6351',
          dosage_form: 'suspension',
          route: 'oral',
          display_name: 'Amoxicillin Oral Suspension 250mg/5mL',
        },
        ingredients: [
          {
            active_ingredient: 'Amoxicillin',
            strength_numerator_value: 250,
            strength_numerator_unit: 'mg',
            strength_denominator_value: 5,
            strength_denominator_unit: 'mL',
          },
        ],
        rule: defaultRule,
        label: defaultRule
          ? {
              id: defaultRule.drug_label_id,
              product_id: cleanId,
              payload_hash: defaultRule.label_payload_hash,
            }
          : null,
      });
    }

    return {
      isEligible: false,
      reason: 'سجل المنتج الدوائي غير موجود في قاعدة البيانات',
    };
  }

  const { data: prod, error } = await supabase
    .from('drug_products')
    .select(`
      id,
      source_system,
      source_identifier,
      dosage_form,
      route,
      display_name,
      drug_product_ingredients (
        active_ingredient,
        strength_numerator_value,
        strength_numerator_unit,
        strength_denominator_value,
        strength_denominator_unit
      ),
      pediatric_dosage_rules (
        id,
        product_id,
        drug_label_id,
        review_status,
        label_payload_hash
      ),
      drug_labels (
        id,
        product_id,
        payload_hash
      )
    `)
    .eq('id', cleanId)
    .maybeSingle();

  if (error) {
    return {
      isEligible: false,
      reason: `فشل استعلام قاعدة البيانات للتحقق من أهلية المنتج: ${error.message}`,
    };
  }

  if (!prod) {
    return {
      isEligible: false,
      reason: 'سجل المنتج الدوائي غير موجود في قاعدة البيانات',
    };
  }

  const ingredients = (prod.drug_product_ingredients as any[]) || [];
  const rules = (prod.pediatric_dosage_rules as any[]) || [];
  const rule = rules.find((r) => r.product_id === prod.id) || null;
  const labels = (prod.drug_labels as any[]) || [];
  const label = rule ? labels.find((l) => l.id === rule.drug_label_id) || null : null;

  return verifyProductPediatricEligibilityPure({
    catalogProductId: cleanId,
    product: prod,
    ingredients,
    rule,
    label,
  });
}

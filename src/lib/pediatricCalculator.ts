import {
  ConcentrationDetails,
  PediatricCalculationInput,
  PediatricCalculationResult,
  DosageRoundingDetails,
  PediatricDosageRule,
  AllergyMatchType,
  ProductPediatricEligibilityInput,
  ProductPediatricEligibilityResult,
} from '@/types/pediatricDosage';

/**
 * 1. حساب عمر الطفل الدقيق بالشهور والأيام ومقارنته بالحدود السريرية
 */
export function calculatePatientAgeInMonths(
  dateOfBirthStr: string,
  visitDateStr: string = new Date().toISOString()
): {
  months: number;
  days: number;
  totalDays: number;
  formatted: string;
  isGreaterThanThreeMonths: boolean;
} {
  const dob = new Date(dateOfBirthStr);
  const visit = new Date(visitDateStr);

  if (isNaN(dob.getTime()) || isNaN(visit.getTime())) {
    return {
      months: 0,
      days: 0,
      totalDays: 0,
      formatted: 'تاريخ غير صالح',
      isGreaterThanThreeMonths: false,
    };
  }

  if (visit < dob) {
    return {
      months: 0,
      days: 0,
      totalDays: 0,
      formatted: 'تاريخ الميلاد في المستقبل',
      isGreaterThanThreeMonths: false,
    };
  }

  const diffTime = visit.getTime() - dob.getTime();
  const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  let years = visit.getFullYear() - dob.getFullYear();
  let months = visit.getMonth() - dob.getMonth();
  let days = visit.getDate() - dob.getDate();

  if (days < 0) {
    months -= 1;
    // Days in previous month
    const prevMonthLastDay = new Date(visit.getFullYear(), visit.getMonth(), 0).getDate();
    days += prevMonthLastDay;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalCalculatedMonths = years * 12 + months;

  // Formatting in Arabic
  let formatted = '';
  if (years === 0 && months === 0) {
    formatted = `${days} يوم`;
  } else if (years === 0) {
    formatted = `${months} ${months === 1 ? 'شهر' : months === 2 ? 'شهران' : months <= 10 ? 'أشهر' : 'شهر'}`;
    if (days > 0) formatted += ` و${days} يوم`;
  } else {
    formatted = `${years} ${years === 1 ? 'سنة' : years === 2 ? 'سنتان' : years <= 10 ? 'سنوات' : 'سنة'}`;
    if (months > 0) {
      formatted += ` و${months} ${months === 1 ? 'شهر' : months === 2 ? 'شهران' : months <= 10 ? 'أشهر' : 'شهر'}`;
    }
  }

  // Exactly 3 months means totalCalculatedMonths === 3 && days === 0
  // Strictly greater than 3 months means totalCalculatedMonths > 3 || (totalCalculatedMonths === 3 && days > 0)
  const isGreaterThanThreeMonths = totalCalculatedMonths > 3 || (totalCalculatedMonths === 3 && days > 0);

  return {
    months: totalCalculatedMonths,
    days,
    totalDays,
    formatted,
    isGreaterThanThreeMonths,
  };
}

/**
 * 2. حل وتحديد الوزن السريري للطفل
 */
export function resolvePatientWeight(
  currentVisitWeightKg: number | null | undefined,
  visitDateStr: string,
  previousMeasurements: Array<{ weight_kg: number; created_at: string }> = []
): {
  weightKg: number | null;
  source: 'current_visit' | 'previous_visit' | 'none';
  date?: string;
  warning?: string;
} {
  if (currentVisitWeightKg && currentVisitWeightKg > 0) {
    return {
      weightKg: currentVisitWeightKg,
      source: 'current_visit',
      date: visitDateStr,
    };
  }

  const validPrevious = (previousMeasurements || [])
    .filter((m) => m && m.weight_kg && m.weight_kg > 0)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (validPrevious.length > 0) {
    const latest = validPrevious[0];
    const prevDateFormatted = new Date(latest.created_at).toLocaleDateString('ar-EG');
    return {
      weightKg: latest.weight_kg,
      source: 'previous_visit',
      date: latest.created_at,
      warning: `تنبيه سريري: لا يوجد وزن مسجل لزيارة اليوم. تم استخدام أحدث وزن موثق سابقاً (${latest.weight_kg} كغم بتاريخ ${prevDateFormatted}). يرجى التحقق من مناسبته للطفل حالياً.`,
    };
  }

  return {
    weightKg: null,
    source: 'none',
    warning: 'لا يوجد وزن مسجل للطفل في هذه الزيارة أو الزيارات السابقة. يتعذر حساب الجرعة بدون وزن مؤكد.',
  };
}

/**
 * 3. فحص أهلية الطفل للقاعدة المنظمة بدقة (العمر الشامل/غير الشامل وحد الوزن الأقصى < 40 kg)
 */
export function checkPatientEligibilityForRule(
  ageMonths: number,
  ageDays: number,
  weightKg: number | null,
  rule: PediatricDosageRule
): {
  isEligible: boolean;
  ageBlocked: boolean;
  weightBlocked: boolean;
  reason?: string;
} {
  // فحص العمر: قاعدة هذه المرحلة مخصصة للأطفال age > 3 months (min_age_inclusive = false)
  const isAtLeastMinAge = rule.min_age_inclusive
    ? ageMonths >= rule.min_age_value
    : ageMonths > rule.min_age_value || (ageMonths === rule.min_age_value && ageDays > 0);

  if (!isAtLeastMinAge) {
    return {
      isEligible: false,
      ageBlocked: true,
      weightBlocked: false,
      reason: 'هذه الفئة العمرية غير مدعومة في الإصدار الحالي من الحاسبة. يجب الرجوع إلى النشرة الرسمية وتحديد الجرعة يدويًا.',
    };
  }

  // فحص الحد الأقصى للعمر إن وجد توثيق منفصل له
  if (rule.max_age_value) {
    const exceedsMaxAge = rule.max_age_inclusive
      ? ageMonths > rule.max_age_value
      : ageMonths >= rule.max_age_value;

    if (exceedsMaxAge) {
      return {
        isEligible: false,
        ageBlocked: true,
        weightBlocked: false,
        reason: `عمر المريض (${ageMonths} شهر) يتجاوز الحد الموثق للقاعدة (${rule.max_age_value} شهر).`,
      };
    }
  }

  // فحص الوزن: إلزامي وجود وزن
  if (weightKg === null || weightKg <= 0) {
    return {
      isEligible: false,
      ageBlocked: false,
      weightBlocked: true,
      reason: 'لم يتم تسجيل وزن للطفل. يتعذر تفعيل الحاسبة دون وزن مؤكد.',
    };
  }

  // فحص شرط الوزن: الوزن يجب أن يكون أقل من 40 كغم (max_weight_inclusive = false)
  const exceedsMaxWeight = rule.max_weight_inclusive
    ? weightKg > rule.max_weight_kg
    : weightKg >= rule.max_weight_kg;

  if (exceedsMaxWeight) {
    return {
      isEligible: false,
      ageBlocked: false,
      weightBlocked: true,
      reason: `وزن الطفل (${weightKg} كغم) يبلغ أو يتجاوز ${rule.max_weight_kg} كغم؛ وتنص النشرة الرسمية على تطبيق جرعات البالغين لهذه الفئة، لذا لا يمكن استخدام هذه الحاسبة المخصصة لجرعات الأطفال أقل من ${rule.max_weight_kg} كغم.`,
    };
  }

  // فحص الحد الأدنى للوزن إن وُجد
  if (rule.min_weight_kg && weightKg < rule.min_weight_kg) {
    return {
      isEligible: false,
      ageBlocked: false,
      weightBlocked: true,
      reason: `وزن الطفل (${weightKg} كغم) أقل من الحد الأدنى المقرر للقاعدة (${rule.min_weight_kg} كغم).`,
    };
  }

  return {
    isEligible: true,
    ageBlocked: false,
    weightBlocked: false,
  };
}

/**
 * 4. تحليل التركيز المنظم للأدوية السائلة
 */
export function parseStructuredConcentration(
  rawStrengthText: string,
  drugProductIngredients?: Array<{
    strength_numerator_value?: number | null;
    strength_numerator_unit?: string | null;
    strength_denominator_value?: number | null;
    strength_denominator_unit?: string | null;
  }>
): ConcentrationDetails {
  if (drugProductIngredients && drugProductIngredients.length > 0) {
    const dpi = drugProductIngredients[0];
    const num = Number(dpi.strength_numerator_value);
    const den = Number(dpi.strength_denominator_value || 1);
    const numUnit = (dpi.strength_numerator_unit || '').toLowerCase().trim();
    const denUnit = (dpi.strength_denominator_unit || 'ml').toLowerCase().trim();

    if (num > 0 && den > 0 && (numUnit === 'mg' || numUnit === 'milligram') && (denUnit === 'ml' || denUnit === 'milliliter')) {
      const conc = num / den;
      return {
        isValid: true,
        numeratorMg: num,
        denominatorMl: den,
        concentrationMgPerMl: Number(conc.toFixed(4)),
        rawStrengthText: `${num} mg / ${den} mL`,
      };
    }
  }

  if (!rawStrengthText || !rawStrengthText.trim()) {
    return {
      isValid: false,
      numeratorMg: 0,
      denominatorMl: 0,
      concentrationMgPerMl: 0,
      rawStrengthText: '',
      error: 'لم يتم تحديد تركيز المنتج الدوائي',
    };
  }

  const clean = rawStrengthText.replace(/\s+/g, ' ').trim();
  const match = clean.match(/(\d+(?:\.\d+)?)\s*(?:mg|مغم|ملغ)\s*(?:\/|per|لكل)\s*(?:(\d+(?:\.\d+)?)\s*)?(?:ml|mL|مل)/i);

  if (match) {
    const num = parseFloat(match[1]);
    const den = match[2] ? parseFloat(match[2]) : 1;

    if (!isNaN(num) && num > 0 && !isNaN(den) && den > 0) {
      const conc = num / den;
      return {
        isValid: true,
        numeratorMg: num,
        denominatorMl: den,
        concentrationMgPerMl: Number(conc.toFixed(4)),
        rawStrengthText: `${num} mg / ${den} mL`,
      };
    }
  }

  return {
    isValid: false,
    numeratorMg: 0,
    denominatorMl: 0,
    concentrationMgPerMl: 0,
    rawStrengthText,
    error: `تعذر استخراج تركيز سائل صالح (mg/mL) من النص: "${rawStrengthText}"`,
  };
}

/**
 * 5. فحص حساسية البنسلين والأموكسيسيلين مع التمييز بين الحساسية الدوائية المباشرة والإشارة النصية في التاريخ الطبي
 */
export function checkPenicillinAllergy(
  allergiesGeneral?: string | null,
  drugAllergies?: string | null,
  medicalHistory?: string | null
): {
  hasAllergy: boolean;
  matchType: AllergyMatchType;
  matchedTerm?: string;
  sourceField?: string;
  description: string;
} {
  const keywords = [
    'penicillin',
    'amoxicillin',
    'amoxil',
    'ampicillin',
    'beta-lactam',
    'betalactam',
    'beta lactam',
    'clavulan',
    'augmentin',
    'بنسلين',
    'بنسيلين',
    'بنسللين',
    'أموكسيسيلين',
    'اموكسيسيلين',
    'أموكسيل',
    'اموكسيل',
    'أمبيسيلين',
    'امبيسيلين',
    'بيتا لاكتام',
    'أوجمنتين',
    'اوجمنتين',
  ];

  const cleanTerm = (text?: string | null): string =>
    (text || '').toLowerCase().replace(/[-_.,/]/g, ' ').trim();

  // 1. فحص سجل حساسيات الأدوية المباشر (Direct Drug Allergies)
  const drugText = cleanTerm(drugAllergies);
  if (drugText && !drugText.includes('no known') && !drugText.includes('nkda') && !drugText.includes('لا توجد')) {
    for (const kw of keywords) {
      if (drugText.includes(kw)) {
        return {
          hasAllergy: true,
          matchType: 'direct_drug_allergy',
          matchedTerm: kw,
          sourceField: 'drug_allergies',
          description: `تحذير سريري حرج: توثيق مباشر لحساسية من (${kw}) في سجل حساسيات الأدوية للطفل.`,
        };
      }
    }
  }

  // 2. فحص سجل الحساسيات العام
  const generalText = cleanTerm(allergiesGeneral);
  if (generalText && !generalText.includes('no known') && !generalText.includes('لا توجد')) {
    for (const kw of keywords) {
      if (generalText.includes(kw)) {
        return {
          hasAllergy: true,
          matchType: 'direct_drug_allergy',
          matchedTerm: kw,
          sourceField: 'allergies',
          description: `تحذير سريري حرج: توثيق حساسية من (${kw}) في ملف الطفل.`,
        };
      }
    }
  }

  // 3. فحص التاريخ الطبي (Potential mention in medical history - NOT a confirmed diagnosis)
  const historyText = cleanTerm(medicalHistory);
  if (historyText) {
    for (const kw of keywords) {
      if (historyText.includes(kw)) {
        return {
          hasAllergy: true,
          matchType: 'suspected_history_mention',
          matchedTerm: kw,
          sourceField: 'medical_history',
          description: `تنبيه سريري: توجد إشارة نصية إلى (${kw}) في التاريخ الطبي للطفل، وليست تشخيصاً مؤكداً لحساسية دوائية. يُرجى التحقق السريري قبل الاستخدام.`,
        };
      }
    }
  }

  return {
    hasAllergy: false,
    matchType: 'none',
    description: 'لم يُعثر على توثيق سابق لحساسية البنسلين أو مشتقاته في ملف الطفل.',
  };
}

/**
 * 6. دالة نقية لاختبار وحساب التقريب السريري مع فحص عدم خروج الجرعة الفعلية عن المجال المعتمد
 */
export function calculateDosageRounding(
  rawSingleDoseMl: number,
  concentrationMgPerMl: number,
  weightKg: number,
  dosesPerDay: number,
  minAllowedMgPerKgDay: number = 20,
  maxAllowedMgPerKgDay: number = 45
): DosageRoundingDetails {
  if (rawSingleDoseMl <= 0 || concentrationMgPerMl <= 0 || weightKg <= 0 || dosesPerDay <= 0) {
    return {
      rawSingleDoseMl: 0,
      roundedSingleDoseMl: 0,
      differenceMl: 0,
      actualSingleDoseMg: 0,
      actualDailyMg: 0,
      actualMgPerKgDay: 0,
      isWithinBounds: false,
    };
  }

  // تقريب مقترح إلى أقرب 0.1 مل
  const roundedSingleDoseMl = Math.round(rawSingleDoseMl * 10) / 10;
  const differenceMl = Number((roundedSingleDoseMl - rawSingleDoseMl).toFixed(4));

  // حساب الجرعة الفعلية الناتجة بعد التقريب
  const actualSingleDoseMg = Number((roundedSingleDoseMl * concentrationMgPerMl).toFixed(2));
  const actualDailyMg = Number((actualSingleDoseMg * dosesPerDay).toFixed(2));
  const actualMgPerKgDay = Number((actualDailyMg / weightKg).toFixed(2));

  // فحص أمان الحدود: التأكد من أن التقريب لا يؤدي إلى تجاوز الجرعة القصوى أو الهبوط عن الدنيا
  // نسمح بتفاوت طفيف جداً 0.05 mg/kg/day للأخطاء العشرية فقط
  let boundaryViolation: 'exceeds_max' | 'below_min' | null = null;
  if (actualMgPerKgDay > maxAllowedMgPerKgDay + 0.05) {
    boundaryViolation = 'exceeds_max';
  } else if (actualMgPerKgDay < minAllowedMgPerKgDay - 0.05) {
    boundaryViolation = 'below_min';
  }

  return {
    rawSingleDoseMl: Number(rawSingleDoseMl.toFixed(4)),
    roundedSingleDoseMl,
    differenceMl,
    actualSingleDoseMg,
    actualDailyMg,
    actualMgPerKgDay,
    isWithinBounds: boundaryViolation === null,
    boundaryViolation,
  };
}

/**
 * 7. تحديد عدد الجرعات اليومية من النص
 */
export function parseDosesPerDay(frequency: string): number | null {
  if (!frequency || !frequency.trim()) return null;
  const f = frequency.toLowerCase().trim();

  if (f.includes('12') || f.includes('مرتين') || f.includes('مرتان') || f.includes('bid') || f.includes('twice') || f.includes('2 times') || f.includes('2x')) {
    return 2;
  }
  if (f.includes('8') || f.includes('3') || f.includes('ثلاث') || f.includes('tid') || f.includes('three') || f.includes('3 times') || f.includes('3x')) {
    return 3;
  }
  if (f.includes('6') || f.includes('4') || f.includes('أربع') || f.includes('اربع') || f.includes('qid') || f.includes('four') || f.includes('4 times') || f.includes('4x')) {
    return 4;
  }
  if (f.includes('24') || f.includes('مرة واحدة') || f.includes('مرة يوميا') || f.includes('مرة باليوم') || f.includes('qd') || f.includes('once') || f.includes('1 time') || f.includes('1x')) {
    return 1;
  }
  return null;
}

/**
 * 8. الحساب الرياضي البحت لجرعة الأطفال
 */
export function calculatePediatricDose(input: PediatricCalculationInput): PediatricCalculationResult {
  const {
    weightKg,
    targetMgPerKgDay,
    dosesPerDay,
    strengthNumeratorMg,
    strengthDenominatorMl,
    minAllowedMgPerKgDay = 20,
    maxAllowedMgPerKgDay = 45,
  } = input;

  if (weightKg <= 0) {
    throw new Error('وزن الطفل يجب أن يكون أكبر من الصفر');
  }

  if (targetMgPerKgDay <= 0) {
    throw new Error('الجرعة المستهدفة mg/kg/day يجب أن تكون أكبر من الصفر');
  }

  if (dosesPerDay <= 0) {
    throw new Error('عدد الجرعات اليومية يجب أن يكون أكبر من الصفر');
  }

  if (strengthNumeratorMg <= 0 || strengthDenominatorMl <= 0) {
    throw new Error('بيانات تركيز الدواء غير صحيحة');
  }

  const dailyMg = weightKg * targetMgPerKgDay;
  const singleDoseMg = dailyMg / dosesPerDay;
  const concentrationMgPerMl = strengthNumeratorMg / strengthDenominatorMl;
  const singleDoseMlRaw = singleDoseMg / concentrationMgPerMl;

  const rounding = calculateDosageRounding(
    singleDoseMlRaw,
    concentrationMgPerMl,
    weightKg,
    dosesPerDay,
    minAllowedMgPerKgDay,
    maxAllowedMgPerKgDay
  );

  const formulaDescription =
    `${weightKg} كغم × ${targetMgPerKgDay} ملغ/كغم/يوم = ${dailyMg.toFixed(1)} ملغ/يوم ÷ ${dosesPerDay} جرعات = ${singleDoseMg.toFixed(1)} ملغ/جرعة ÷ (${strengthNumeratorMg} ملغ / ${strengthDenominatorMl} مل = ${concentrationMgPerMl.toFixed(1)} ملغ/مل) = ${singleDoseMlRaw.toFixed(2)} مل`;

  return {
    dailyMg: Number(dailyMg.toFixed(2)),
    singleDoseMg: Number(singleDoseMg.toFixed(2)),
    concentrationMgPerMl: Number(concentrationMgPerMl.toFixed(4)),
    singleDoseMlRaw: Number(singleDoseMlRaw.toFixed(4)),
    singleDoseMlSuggested: rounding.roundedSingleDoseMl,
    rounding,
    formulaDescription,
  };
}

/**
 * 9. التحقق الصارم من أهلية المنتج الدوائي لحاسبة جرعات الأطفال (Fail-Closed)
 * لا يعتمد على النص القابل للتعديل بل على الحقول البنيوية الموثوقة من قاعدة البيانات
 */
export function verifyProductPediatricEligibilityPure(
  input: ProductPediatricEligibilityInput
): ProductPediatricEligibilityResult {
  const { catalogProductId, product, ingredients, rule, label } = input;

  // 1. التحقق من وجود معرف المنتج في الدليل (عدم كونه دواء مخصص custom أو بدون ربط)
  if (!catalogProductId || !catalogProductId.trim()) {
    return {
      isEligible: false,
      reason: 'الدواء غير مرتبط بمنتج موثق في دليل الأدوية الرسمي (catalog_product_id مفقود)',
    };
  }

  // 2. التحقق من وجود سجل المنتج
  if (!product || !product.id) {
    return {
      isEligible: false,
      reason: 'سجل المنتج الدوائي غير موجود في قاعدة البيانات',
    };
  }

  // 3. التحقق من أن المنتج مسجل بنظام FDA_NDC
  if (product.source_system !== 'FDA_NDC') {
    return {
      isEligible: false,
      reason: `نظام المصدر (${product.source_system || 'غير محدد'}) غير مدعوم؛ الحاسبة تشترط مصدر FDA_NDC المعتمد`,
    };
  }

  // 4. التحقق من كود المنتج في هذه المرحلة (المرحلة الأولى: 50090-6351)
  if (product.source_identifier !== '50090-6351') {
    return {
      isEligible: false,
      reason: `كود المنتج (${product.source_identifier || 'فارغ'}) غير مدعوم في المرحلة الحالية (المدعوم حصراً: 50090-6351)`,
    };
  }

  // 5. التحقق من أحادية المادة الفعالة من drug_product_ingredients
  if (!ingredients || ingredients.length === 0) {
    return {
      isEligible: false,
      reason: 'لا توجد مواد فعالة مسجلة للمنتج في drug_product_ingredients',
    };
  }

  if (ingredients.length > 1) {
    return {
      isEligible: false,
      reason: `المنتج يحتوي على ${ingredients.length} مواد فعالة؛ الحاسبة تشترط مستحضراً أحادي المادة الفعالة فقط`,
    };
  }

  const ing = ingredients[0];
  const activeIngName = (
    ing.normalized_name ||
    ing.preferred_name ||
    ing.active_ingredient ||
    ''
  ).trim();
  const activeIng = activeIngName.toLowerCase();

  // 6. التحقق من أن المادة الفعالة هي Amoxicillin
  if (!activeIng.includes('amoxicillin') && !activeIng.includes('أموكسيسيلين')) {
    return {
      isEligible: false,
      reason: `المادة الفعالة (${activeIngName || 'غير محددة'}) ليست Amoxicillin`,
    };
  }

  // استبعاد أي مادة مشتركة أخرى
  if (activeIng.includes('clavulan') || activeIng.includes('كلاف')) {
    return {
      isEligible: false,
      reason: 'المستحضرات المركبة (مثل أموكسيسيلين + كلافولانات) غير مدعومة في هذه الحاسبة',
    };
  }

  // 7. التحقق من الشكل الصيدلاني وطريق الإعطاء
  const form = (product.dosage_form || '').toLowerCase();
  const route = (product.route || '').toLowerCase();
  const isLiquid = form.includes('suspension') || form.includes('syrup') || form.includes('معلق') || form.includes('شراب');
  const isOral = route.includes('oral') || route.includes('فم');

  if (!isLiquid) {
    return {
      isEligible: false,
      reason: `الشكل الصيدلاني (${product.dosage_form}) غير مدعوم؛ الحاسبة مخصصة للمعلقات الفموية السائلة`,
    };
  }

  if (!isOral) {
    return {
      isEligible: false,
      reason: `طريق الإعطاء (${product.route}) غير مدعوم؛ الحاسبة مخصصة للاستخدام الفموي`,
    };
  }

  // 8. التحقق الصارم من الحقول البنيوية للتركيز في drug_product_ingredients
  const numVal = Number(ing.strength_numerator_value);
  const denVal = Number(
    ing.strength_denominator_value !== undefined && ing.strength_denominator_value !== null
      ? ing.strength_denominator_value
      : 1
  );
  const numUnit = (ing.strength_numerator_unit || '').toLowerCase().trim();
  const denUnit = (ing.strength_denominator_unit || '').toLowerCase().trim();

  const isMg = numUnit === 'mg' || numUnit === 'milligram';
  const isMl = denUnit === 'ml' || denUnit === 'milliliter';

  if (isNaN(numVal) || numVal <= 0 || isNaN(denVal) || denVal <= 0 || !isMg || !isMl) {
    return {
      isEligible: false,
      reason: 'بيانات التركيز البنيوية للمنتج في drug_product_ingredients غير صالحة أو مفقودة (تشترط mg في البسط و mL في المقام)',
    };
  }

  // 9. التحقق من وجود قاعدة جرعات مرتبطة ومطابقة
  if (!rule || !rule.id) {
    return {
      isEligible: false,
      reason: 'لا توجد قاعدة جرعات مسجلة لهذا المنتج',
    };
  }

  if (rule.product_id !== product.id) {
    return {
      isEligible: false,
      reason: 'قاعدة الجرعات تخص منتجاً آخر ولا تطابق معرف المنتج المختار',
    };
  }

  // 10. التحقق من حالة مراجعة القاعدة (يجب أن تكون approved حصراً)
  if (rule.review_status !== 'approved') {
    return {
      isEligible: false,
      reason:
        rule.review_status === 'needs_re_review'
          ? 'قاعدة الجرعات تتطلب إعادة مراجعة واعتماد من الطبيب لتحديث النشرة الرسمية'
          : `قاعدة الجرعات غير معتمدة (حالتها الحالية: ${rule.review_status})`,
    };
  }

  // 11. التحقق من النشرة الرسمية والهاش المعتمد
  if (label) {
    if (label.product_id !== product.id || label.id !== rule.drug_label_id) {
      return {
        isEligible: false,
        reason: 'عدم تطابق أمني بين سجل النشرة الرسمية وقاعدة الجرعات',
      };
    }
    if (label.payload_hash !== rule.label_payload_hash) {
      return {
        isEligible: false,
        reason: 'تم تعديل نشرة الدواء الرسمية المنبع وتغير الهاش؛ القاعدة تتطلب إعادة اعتماد',
      };
    }
  }

  const conc = Number((numVal / denVal).toFixed(4));

  return {
    isEligible: true,
    concentrationMgPerMl: conc,
    numeratorMg: numVal,
    denominatorMl: denVal,
    activeIngredient: ing.active_ingredient || 'Amoxicillin',
  };
}

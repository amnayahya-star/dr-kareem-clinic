'use client';

import React, { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  PediatricDosageRule,
  PediatricPatientContext,
  ProductPediatricEligibilityResult,
  PediatricCalculationResult,
  PediatricIndicationGroup,
  PediatricSeverity,
  PediatricDosageRegimen,
  PEDIATRIC_INDICATION_GROUPS,
  PEDIATRIC_SEVERITIES,
  DEFAULT_AMOXICILLIN_REGIMENS,
  getAllowedSeveritiesForIndication,
} from '@/types/pediatricDosage';
import {
  parseStructuredConcentration,
  calculatePediatricDose,
  checkPatientEligibilityForRule,
} from '@/lib/pediatricCalculator';
import { PediatricRuleReviewModal } from './PediatricRuleReviewModal';
import {
  Calculator,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Scale,
  Calendar,
  Pill,
  ArrowRight,
  Info,
  CheckCircle2,
  Check,
  FileText,
  Activity,
} from 'lucide-react';

interface PediatricDosageCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientContext: PediatricPatientContext | null;
  rule: PediatricDosageRule | null;
  productDisplayName: string;
  rawStrengthText: string;
  productEligibility?: ProductPediatricEligibilityResult | null;
  onRuleUpdated: (updatedRule: PediatricDosageRule) => void;
  onApplyResult: (result: {
    dose: string;
    instructions: string;
    frequency: string;
  }) => void;
}

export function PediatricDosageCalculatorModal({
  isOpen,
  onClose,
  patientContext,
  rule,
  productDisplayName,
  rawStrengthText,
  productEligibility,
  onRuleUpdated,
  onApplyResult,
}: PediatricDosageCalculatorModalProps) {
  // Clinical selection states (strict doctor choice, never auto-inferred)
  const [selectedIndicationGroup, setSelectedIndicationGroup] = useState<PediatricIndicationGroup>('ear_nose_throat');
  const [selectedSeverity, setSelectedSeverity] = useState<PediatricSeverity>('mild_moderate');
  const [selectedRegimenId, setSelectedRegimenId] = useState<string | null>(null);

  const [useRoundedDose, setUseRoundedDose] = useState<boolean>(true);

  // Temporary inputs when DOB or weight is missing from patient record (for calculation only, never modifies patient record)
  const [tempAgeMonths, setTempAgeMonths] = useState<string>('');
  const [tempWeightKg, setTempWeightKg] = useState<string>('');

  // Modals inside calculator
  const [isReviewRuleModalOpen, setIsReviewRuleModalOpen] = useState<boolean>(false);

  // Available regimens from rule or official default
  const allRegimens: PediatricDosageRegimen[] = useMemo(() => {
    if (rule?.regimens && rule.regimens.length > 0) {
      return rule.regimens;
    }
    return DEFAULT_AMOXICILLIN_REGIMENS;
  }, [rule]);

  // Allowed severities for currently selected indication group
  const allowedSeverities = useMemo(() => {
    return getAllowedSeveritiesForIndication(selectedIndicationGroup);
  }, [selectedIndicationGroup]);

  // Handle indication change and synchronize severity safely
  const handleIndicationChange = (newGroup: PediatricIndicationGroup) => {
    setSelectedIndicationGroup(newGroup);
    const validSeverities = getAllowedSeveritiesForIndication(newGroup);
    if (!validSeverities.includes(selectedSeverity)) {
      setSelectedSeverity(validSeverities[0]);
    }
    setSelectedRegimenId(null);
  };

  // Filter matching regimens strictly by indication group and severity
  const matchingRegimens = useMemo(() => {
    return allRegimens.filter(
      (r) =>
        r.indication_group === selectedIndicationGroup &&
        r.severity === selectedSeverity &&
        r.is_active
    );
  }, [allRegimens, selectedIndicationGroup, selectedSeverity]);

  // Currently selected regimen
  const activeRegimen: PediatricDosageRegimen | null = useMemo(() => {
    if (matchingRegimens.length === 0) return null;
    if (selectedRegimenId) {
      const found = matchingRegimens.find((r) => r.id === selectedRegimenId);
      if (found) return found;
    }
    return matchingRegimens[0];
  }, [matchingRegimens, selectedRegimenId]);

  // Concentration parsing (strictly prioritizes structured database fields over user-editable text)
  const concentrationDetails = useMemo(() => {
    if (
      productEligibility &&
      productEligibility.concentrationMgPerMl &&
      productEligibility.numeratorMg &&
      productEligibility.denominatorMl
    ) {
      return {
        isValid: true,
        numeratorMg: productEligibility.numeratorMg,
        denominatorMl: productEligibility.denominatorMl,
        concentrationMgPerMl: productEligibility.concentrationMgPerMl,
        rawStrengthText: `${productEligibility.numeratorMg} mg / ${productEligibility.denominatorMl} mL`,
      };
    }
    return parseStructuredConcentration(rawStrengthText);
  }, [productEligibility, rawStrengthText]);

  // Patient Age Resolution (auto from DOB or temporary input for calculation only)
  const hasAutoDob = Boolean(
    patientContext?.dateOfBirth &&
    patientContext.dateOfBirth.trim() &&
    patientContext.ageFormatted !== 'تاريخ غير صالح'
  );
  const parsedTempAge = parseInt(tempAgeMonths, 10);
  const hasTempAge = !hasAutoDob && !isNaN(parsedTempAge) && parsedTempAge > 0;
  const effectiveAgeMonths = hasAutoDob
    ? (patientContext?.ageInMonths ?? 0)
    : (hasTempAge ? parsedTempAge : 0);
  const hasEffectiveAge = hasAutoDob || hasTempAge;
  const ageDisplayText = hasAutoDob
    ? (patientContext?.ageFormatted || 'غير محدد')
    : (patientContext?.ageFormatted === 'تاريخ غير صالح'
        ? 'تاريخ غير صالح'
        : (hasTempAge ? `${parsedTempAge} شهر (إدخال مؤقت)` : 'غير مسجل'));

  // Patient Weight Resolution (auto from latest measurement or temporary input for calculation only)
  const hasAutoWeight = Boolean(patientContext?.weightKg && patientContext.weightKg > 0);
  const parsedTempWeight = parseFloat(tempWeightKg);
  const hasTempWeight = !hasAutoWeight && !isNaN(parsedTempWeight) && parsedTempWeight > 0;
  const effectiveWeightKg = hasAutoWeight
    ? (patientContext?.weightKg ?? null)
    : (hasTempWeight ? parsedTempWeight : null);
  const hasEffectiveWeight = hasAutoWeight || hasTempWeight;
  const weightDisplayText = hasAutoWeight
    ? `${patientContext?.weightKg} كغم`
    : (hasTempWeight ? `${parsedTempWeight} كغم (إدخال مؤقت)` : 'غير مسجل');

  // Eligibility check for Age and Weight (Fail-closed)
  const eligibility = useMemo(() => {
    if (!rule || !hasEffectiveAge || !hasEffectiveWeight || !effectiveWeightKg) {
      return { isEligible: false, ageBlocked: false, weightBlocked: false, reason: '' };
    }
    return checkPatientEligibilityForRule(
      effectiveAgeMonths,
      0,
      effectiveWeightKg,
      rule
    );
  }, [rule, hasEffectiveAge, hasEffectiveWeight, effectiveAgeMonths, effectiveWeightKg]);

  // Dynamic Calculation Result with clinical rounding analysis
  const calculationResult: PediatricCalculationResult | null = useMemo(() => {
    if (
      !hasEffectiveAge ||
      !hasEffectiveWeight ||
      !effectiveWeightKg ||
      effectiveWeightKg <= 0 ||
      !eligibility.isEligible ||
      !activeRegimen ||
      !concentrationDetails.isValid
    ) {
      return null;
    }

    try {
      return calculatePediatricDose({
        weightKg: effectiveWeightKg,
        targetMgPerKgDay: activeRegimen.dose_mg_per_kg_day,
        dosesPerDay: activeRegimen.doses_per_day,
        strengthNumeratorMg: concentrationDetails.numeratorMg,
        strengthDenominatorMl: concentrationDetails.denominatorMl,
        minAllowedMgPerKgDay: activeRegimen.dose_mg_per_kg_day,
        maxAllowedMgPerKgDay: activeRegimen.dose_mg_per_kg_day,
      });
    } catch {
      return null;
    }
  }, [hasEffectiveAge, hasEffectiveWeight, effectiveWeightKg, activeRegimen, concentrationDetails, eligibility]);

  if (!isOpen) return null;

  const isRuleRejected = rule?.review_status === 'rejected';
  const hasAllergy = Boolean(patientContext?.hasPenicillinOrAmoxicillinAllergy);

  // Can apply only when eligible, math valid, not rejected, and NO allergy exists (Hard Stop)
  // Note: pending_review does NOT block calculation; it is purely informational.
  const canApply =
    !isRuleRejected &&
    hasEffectiveAge &&
    hasEffectiveWeight &&
    eligibility.isEligible &&
    !hasAllergy &&
    activeRegimen !== null &&
    calculationResult !== null;

  const selectedDoseMl = calculationResult
    ? useRoundedDose
      ? calculationResult.singleDoseMlSuggested
      : calculationResult.singleDoseMlRaw
    : 0;

  const actualSingleDoseMg = calculationResult
    ? useRoundedDose
      ? calculationResult.rounding.actualSingleDoseMg
      : calculationResult.singleDoseMg
    : 0;

  const actualMgPerKgDay = calculationResult
    ? useRoundedDose
      ? calculationResult.rounding.actualMgPerKgDay
      : (activeRegimen?.dose_mg_per_kg_day || 0)
    : 0;

  const freqArabic =
    activeRegimen?.interval_hours === 12
      ? 'كل 12 ساعة (مرتان يومياً)'
      : activeRegimen?.interval_hours === 8
      ? 'كل 8 ساعات (3 مرات يومياً)'
      : `كل ${activeRegimen?.interval_hours} ساعة`;

  const handleApplyDose = () => {
    if (!canApply || hasAllergy || !calculationResult || !activeRegimen) return;

    const volumeStr = `${selectedDoseMl} مل`;
    const mgStr = `(${actualSingleDoseMg} mg)`;
    const doseText = `${volumeStr} ${mgStr}`;

    const instructionsText = `${volumeStr} بالفم ${freqArabic}`;

    onApplyResult({
      dose: doseText,
      instructions: instructionsText,
      frequency: freqArabic,
    });

    onClose();
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="حاسبة جرعات الأطفال الآمنة (أموكسيسيلين)"
        description="أداة حساب رياضي مساعدة للطبيب تعتمد على وزن الطفل وأنظمة الجرعات المنظمة لنشرة FDA المعتمدة."
        maxWidth="xl"
      >
        <div className="space-y-4 text-xs text-slate-700" data-testid="pediatric-dosage-calculator-modal">
          {/* Disclaimer banner & Medical Provenance Link */}
          <div
            className="p-3 bg-blue-50/80 border border-blue-200 rounded-2xl text-[11px] text-blue-950 flex items-center justify-between flex-wrap gap-2"
            data-testid="calculator-disclaimer-banner"
          >
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="font-bold">
                الحاسبة أداة مساعدة مبنية على نشرة openFDA؛ القرار النهائي للطبيب.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsReviewRuleModalOpen(true)}
              className="text-[11px] text-clinic-700 hover:text-clinic-900 underline font-bold cursor-pointer inline-flex items-center gap-1"
              data-testid="open-rule-source-info-btn"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>عرض المصدر الطبي وقاعدة الحساب</span>
            </button>
          </div>

          {/* 1. Patient Clinical Vitals & Drug Concentration Context */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Patient Context Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-clinic-600" />
                  <span>بيانات الطفل والوزن:</span>
                </span>
                <span className="font-black text-slate-900">{patientContext?.patientName}</span>
              </div>

              {/* Age Row */}
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                <span className="text-slate-500">العمر المحسوب:</span>
                <span className="font-bold text-slate-800" data-testid="patient-age-display">
                  {ageDisplayText}{' '}
                  {effectiveAgeMonths > 0 && (
                    <span className="font-mono text-slate-400">({effectiveAgeMonths} شهر)</span>
                  )}
                </span>
              </div>

              {/* Temporary Age Input when DOB missing */}
              {!hasAutoDob && (
                <div className="p-2 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1.5" data-testid="temp-age-container">
                  <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                    <span>العمر غير مسجل — إدخال مؤقت:</span>
                    <span className="text-[10px] text-amber-700 font-normal">للحساب فقط</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="216"
                      placeholder="العمر بالشهور (مثال: 24)"
                      value={tempAgeMonths}
                      onChange={(e) => setTempAgeMonths(e.target.value)}
                      className="w-full p-1.5 text-xs font-bold bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                      data-testid="temp-age-months-input"
                    />
                    <span className="text-xs text-amber-800 font-bold shrink-0">شهر</span>
                  </div>
                  <div className="text-[10px] text-amber-700" data-testid="temp-age-notice">
                    إدخال مؤقت للحساب فقط ولا يتم تعديل ملف المريض في قاعدة البيانات.
                  </div>
                </div>
              )}

              {/* Weight Row */}
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                <span className="text-slate-500">الوزن المعتمد:</span>
                {hasEffectiveWeight ? (
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-slate-900 text-sm" data-testid="patient-weight-display">
                      {effectiveWeightKg} كغم
                    </span>
                    {hasAutoWeight ? (
                      <Badge
                        variant={patientContext?.weightSource === 'current_visit' ? 'success' : 'warning'}
                        size="sm"
                        className="font-bold"
                        data-testid="weight-source-badge"
                      >
                        {patientContext?.weightSource === 'current_visit' ? 'زيارة اليوم' : 'قياس سابق'}
                      </Badge>
                    ) : (
                      <Badge variant="warning" size="sm" className="font-bold">
                        مؤقت
                      </Badge>
                    )}
                  </div>
                ) : (
                  <Badge variant="danger" size="sm" className="font-bold">
                    لا يوجد وزن مسجل
                  </Badge>
                )}
              </div>

              {/* Temporary Weight Input when weight missing */}
              {!hasAutoWeight && (
                <div className="p-2 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1.5" data-testid="temp-weight-container">
                  <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                    <span>الوزن غير مسجل — إدخال مؤقت:</span>
                    <span className="text-[10px] text-amber-700 font-normal">للحساب فقط</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="150"
                      placeholder="الوزن بالكيلوغرام (مثال: 12.5)"
                      value={tempWeightKg}
                      onChange={(e) => setTempWeightKg(e.target.value)}
                      className="w-full p-1.5 text-xs font-bold bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                      data-testid="temp-weight-kg-input"
                    />
                    <span className="text-xs text-amber-800 font-bold shrink-0">كغم</span>
                  </div>
                  <div className="text-[10px] text-amber-700" data-testid="temp-weight-notice">
                    إدخال مؤقت للحساب فقط ولا يتم تعديل ملف المريض في قاعدة البيانات.
                  </div>
                </div>
              )}

              {/* Weight warning for previous visits */}
              {hasAutoWeight && patientContext?.weightWarning && (
                <div
                  className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 font-medium leading-relaxed flex items-start gap-1.5"
                  data-testid="weight-warning-banner"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>{patientContext.weightWarning}</span>
                </div>
              )}
            </div>

            {/* Drug & Concentration Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Pill className="w-4 h-4 text-clinic-600" />
                  <span>المنتج والتركيز المنظم:</span>
                </span>
                <Badge variant="outline" size="sm" className="font-bold border-clinic-300 text-clinic-800">
                  أحادي المادة الفعالة
                </Badge>
              </div>

              <div className="text-[11px] font-bold text-slate-900 line-clamp-1">
                {productDisplayName}
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                <span className="text-slate-500">التركيز المصدر:</span>
                <span className="font-mono font-bold text-slate-800">
                  {concentrationDetails.rawStrengthText || rawStrengthText}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">التركيز بالـ mL:</span>
                {concentrationDetails.isValid ? (
                  <span className="font-mono font-black text-clinic-700">
                    {concentrationDetails.concentrationMgPerMl} mg/mL
                  </span>
                ) : (
                  <span className="text-rose-600 font-bold">غير صالح</span>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">طريق الاستخدام:</span>
                <span className="font-bold text-slate-700">فموي (Oral)</span>
              </div>
            </div>
          </div>

          {/* Missing DOB Banner */}
          {!hasEffectiveAge && (
            <div
              className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-950 font-bold flex items-start gap-2.5"
              data-testid="missing-dob-banner"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="block font-black text-amber-900">تاريخ ميلاد الطفل غير متوفر:</span>
                <p className="font-normal text-[11px] leading-relaxed">
                  لا يمكن التحقق من أهلية الطفل أو حساب الجرعة لعدم توفر تاريخ الميلاد في ملف المريض. يرجى إدخال تاريخ الميلاد أولاً في الملف الشخصي.
                </p>
              </div>
            </div>
          )}

          {/* Missing Weight Banner */}
          {!hasEffectiveWeight && (
            <div
              className="p-3.5 bg-rose-50 border border-rose-300 rounded-2xl text-xs text-rose-950 font-bold flex items-start gap-2.5"
              data-testid="missing-weight-banner"
            >
              <Scale className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="block font-black text-rose-900">وزن الطفل مطلوب:</span>
                <p className="font-normal text-[11px] leading-relaxed">
                  لا يمكن تشغيل الحاسبة بدون قياس وتسجيل وزن الطفل بالكيلوغرام في الزيارة الحالية. لا يتم استخدام أوزان افتراضية.
                </p>
              </div>
            </div>
          )}

          {/* Age Eligibility Halt Banner (<= 3 months) */}
          {hasEffectiveAge && eligibility.ageBlocked && (
            <div
              className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-950 font-bold flex items-start gap-2.5"
              data-testid="age-unsupported-banner"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="block font-black text-amber-900">حدود الفئة العمرية المدعومة:</span>
                <p className="font-normal text-[11px] leading-relaxed">
                  {eligibility.reason ||
                    'هذه الفئة العمرية غير مدعومة في الإصدار الحالي من الحاسبة. يجب الرجوع إلى النشرة الرسمية وتحديد الجرعة يدويًا.'}
                </p>
              </div>
            </div>
          )}

          {/* Weight Eligibility Halt Banner (>= 40 kg or missing) */}
          {hasEffectiveWeight && !eligibility.ageBlocked && eligibility.weightBlocked && (
            <div
              className="p-3.5 bg-rose-50 border border-rose-300 rounded-2xl text-xs text-rose-950 font-bold flex items-start gap-2.5"
              data-testid="weight-blocked-banner"
            >
              <Scale className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="block font-black text-rose-900">تعذر الحساب بسبب شرط الوزن:</span>
                <p className="font-normal text-[11px] leading-relaxed">
                  {eligibility.reason}
                </p>
              </div>
            </div>
          )}

          {/* Allergy Hard Stop Banner (Absolute Contraindication - Zero Override) */}
          {hasAllergy && (
            <div
              className="p-4 bg-rose-50 border-2 border-rose-500 rounded-2xl space-y-2.5 shadow-sm"
              data-testid="allergy-warning-banner"
            >
              <div className="flex items-center gap-2 font-black text-rose-900 text-xs">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>
                  إيقاف سريري نهائي (موانع الاستعمال - Contraindication): تم اكتشاف وتوثيق حساسية تجاه البنسلين / الأموكسيسيلين / بيتا-لاكتام
                </span>
              </div>
              <p className="text-[11px] text-rose-950 leading-relaxed font-semibold">
                {patientContext?.rawAllergiesText || 'حساسية مثبتة في الملف الطبي للطفل.'}
              </p>
              <div className="p-3 bg-white/90 border border-rose-300 rounded-xl text-[11px] font-bold text-rose-900 leading-relaxed">
                استخدام هذا الدواء ممنوع نهائياً لهذا المريض لوجود حساسية مسجلة. تم تعطيل الحاسبة وحظر تطبيق الجرعة ولا يُسمح بأي تجاوز (Override) في هذه المرحلة. يجب على الطبيب المعالج اختيار علاج بديل من فئة دوائية أخرى.
              </div>
            </div>
          )}

          {/* 3. Doctor Interactive Regimen Selector (Strictly Coupled to FDA Table 1) */}
          {!isRuleRejected && eligibility.isEligible && !hasAllergy && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4" data-testid="regimen-selector-container">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-clinic-600" />
                  <span>تحديد النظام العلاجي السريري (حسب النشرة الرسمية 2.2 Table 1):</span>
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {matchingRegimens.length} أنظمة مطابقة
                </span>
              </div>

              {/* Step 1: Indication Group Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  1. مجموعة العدوى (Indication Group):
                </label>
                <select
                  value={selectedIndicationGroup}
                  onChange={(e) => handleIndicationChange(e.target.value as PediatricIndicationGroup)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-clinic-500 focus:border-clinic-500"
                  data-testid="indication-group-select"
                >
                  {PEDIATRIC_INDICATION_GROUPS.map((grp) => (
                    <option key={grp.id} value={grp.id}>
                      {grp.labelAr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2: Severity Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  2. شدة العدوى المسموحة لهذه المجموعة (Severity):
                </label>
                <select
                  value={selectedSeverity}
                  onChange={(e) => {
                    setSelectedSeverity(e.target.value as PediatricSeverity);
                    setSelectedRegimenId(null);
                  }}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-clinic-500 focus:border-clinic-500"
                  data-testid="severity-select"
                >
                  {allowedSeverities.map((sev) => {
                    const found = PEDIATRIC_SEVERITIES.find((s) => s.id === sev);
                    return (
                      <option key={sev} value={sev}>
                        {found ? found.labelAr : sev}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Step 3: Exact Regimen Selection from Matching FDA Options */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  3. اختر نظام الجرعة وفترة التكرار المعتمدة:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="regimen-options-grid">
                  {matchingRegimens.map((reg) => {
                    const isSelected = activeRegimen?.id === reg.id;
                    return (
                      <div
                        key={reg.id}
                        onClick={() => setSelectedRegimenId(reg.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-clinic-50 border-clinic-600 ring-2 ring-clinic-500/20 text-clinic-950 font-bold shadow-sm'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                        data-testid={`regimen-option-${reg.interval_hours}h`}
                      >
                        <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-100">
                          <span className="font-mono text-sm font-black text-clinic-700">
                            {reg.dose_mg_per_kg_day} mg/kg/day
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-clinic-600" />}
                        </div>
                        <div className="text-[11px] text-slate-700">
                          مقسمة كل <strong className="font-bold">{reg.interval_hours} ساعة</strong> ({reg.doses_per_day} جرعات/يوم)
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono pt-1">
                          {reg.source_section} {reg.source_table}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 4. Comprehensive Clinical Rounding Policy & Result Breakdown */}
          {calculationResult && activeRegimen && !hasAllergy && (
            <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl space-y-3.5" data-testid="calculation-results-card">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-emerald-700" />
                  <span>نتائج الحساب والجرعات المستخرجة:</span>
                </span>
                <span className="text-[11px] font-mono text-emerald-800 font-bold">
                  {activeRegimen.dose_mg_per_kg_day} mg/kg/day ({activeRegimen.interval_hours === 12 ? 'q12h' : 'q8h'})
                </span>
              </div>

              {/* Clear 4-Value Dose Breakdown Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs">
                <div className="p-2 bg-slate-50 rounded-lg text-center">
                  <div className="text-[10px] text-slate-500 font-bold">إجمالي الجرعة اليومية</div>
                  <div className="text-base font-black text-slate-900 font-mono" data-testid="calculated-daily-mg">
                    {calculationResult.dailyMg} mg/day
                  </div>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg text-center">
                  <div className="text-[10px] text-slate-500 font-bold">جرعة المرة الواحدة</div>
                  <div className="text-base font-black text-slate-900 font-mono" data-testid="calculated-single-mg">
                    {actualSingleDoseMg} mg/dose
                  </div>
                </div>
                <div className="p-2 bg-emerald-50 rounded-lg text-center border border-emerald-300">
                  <div className="text-[10px] text-emerald-800 font-bold">حجم المرة الواحدة</div>
                  <div className="text-base font-black text-emerald-700 font-mono" data-testid="calculated-single-ml">
                    {selectedDoseMl} mL/dose
                  </div>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg text-center">
                  <div className="text-[10px] text-slate-500 font-bold">التكرار اليومي</div>
                  <div className="text-xs font-bold text-slate-800 mt-1" data-testid="calculated-frequency">
                    {freqArabic}
                  </div>
                </div>
              </div>

              {/* Rounding Policy Selection Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="rounding-options-container">
                {/* Option A: Suggested Rounded Volume */}
                <div
                  onClick={() => setUseRoundedDose(true)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    useRoundedDose
                      ? 'bg-white border-emerald-500 shadow-sm ring-2 ring-emerald-500/20'
                      : 'bg-white/60 border-emerald-200 hover:border-emerald-300'
                  }`}
                  data-testid="option-rounded-dose"
                >
                  <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-100">
                    <span className="font-bold text-slate-800 text-[11px]">القيمة المقترحة المقربة:</span>
                    {useRoundedDose && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <div className="text-xl font-black text-emerald-700 font-mono" data-testid="suggested-volume-ml">
                    {calculationResult.singleDoseMlSuggested} مل
                  </div>
                  <div className="text-[11px] text-slate-600 space-y-0.5 pt-1">
                    <div>
                      المكافئ الفعلي للمرة:{' '}
                      <span className="font-bold text-slate-900 font-mono">
                        {calculationResult.rounding.actualSingleDoseMg} mg
                      </span>
                    </div>
                    <div>
                      الجرعة اليومية الفعلية:{' '}
                      <span className="font-bold text-slate-900 font-mono">
                        {calculationResult.rounding.actualMgPerKgDay} mg/kg/day
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      فرق التقريب:{' '}
                      <span className="font-mono">
                        {calculationResult.rounding.differenceMl > 0 ? '+' : ''}
                        {calculationResult.rounding.differenceMl} مل
                      </span>
                    </div>
                  </div>
                </div>

                {/* Option B: Raw Float Volume */}
                <div
                  onClick={() => setUseRoundedDose(false)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    !useRoundedDose
                      ? 'bg-white border-emerald-500 shadow-sm ring-2 ring-emerald-500/20'
                      : 'bg-white/60 border-emerald-200 hover:border-emerald-300'
                  }`}
                  data-testid="option-raw-dose"
                >
                  <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-100">
                    <span className="font-bold text-slate-800 text-[11px]">القيمة الخام غير المقربة:</span>
                    {!useRoundedDose && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <div className="text-xl font-black text-slate-700 font-mono" data-testid="raw-volume-ml">
                    {calculationResult.singleDoseMlRaw} مل
                  </div>
                  <div className="text-[11px] text-slate-600 space-y-0.5 pt-1">
                    <div>
                      المكافئ النظري للمرة:{' '}
                      <span className="font-bold text-slate-900 font-mono">
                        {calculationResult.singleDoseMg} mg
                      </span>
                    </div>
                    <div>
                      المستهدف السريري للنظام:{' '}
                      <span className="font-bold text-slate-900 font-mono">
                        {activeRegimen.dose_mg_per_kg_day} mg/kg/day
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">بدون أي انحراف تقريبي</div>
                  </div>
                </div>
              </div>

              {/* Mathematical Formula Description Card */}
              <div className="p-2.5 bg-white rounded-xl border border-clinic-200 text-[11px] font-mono text-slate-700 leading-relaxed dir-ltr text-center">
                {calculationResult.formulaDescription}
              </div>
            </div>
          )}

          {/* 5. Action Buttons */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={onClose} className="text-xs">
              إلغاء
            </Button>

            <div className="flex items-center gap-3">
              {hasAllergy && (
                <div
                  className="px-3 py-1.5 bg-rose-100 border border-rose-300 rounded-xl text-rose-900 font-bold text-[11px] flex items-center gap-1.5"
                  data-testid="allergy-alternative-therapy-notice"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>ممنوع الاستخدام بسبب الحساسية — يجب اختيار علاج بديل</span>
                </div>
              )}

              <Button
                type="button"
                variant="primary"
                disabled={!canApply || hasAllergy}
                onClick={handleApplyDose}
                className="bg-clinic-600 hover:bg-clinic-700 text-white font-bold text-xs gap-1.5 px-6 h-10 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="apply-pediatric-dose-btn"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>استخدام هذه الجرعة</span>
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Doctor Rule Review & Provenance Modal (Read-Only) */}
      <PediatricRuleReviewModal
        isOpen={isReviewRuleModalOpen}
        onClose={() => setIsReviewRuleModalOpen(false)}
        rule={rule}
        readOnly={true}
        onRuleUpdated={(updated) => {
          onRuleUpdated(updated);
        }}
      />
    </>
  );
}

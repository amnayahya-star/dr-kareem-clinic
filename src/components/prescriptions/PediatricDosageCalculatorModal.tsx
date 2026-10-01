'use client';

import React, { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  PediatricDosageRule,
  PediatricPatientContext,
  PediatricCalculationResult,
  ProductPediatricEligibilityResult,
} from '@/types/pediatricDosage';
import {
  parseStructuredConcentration,
  parseDosesPerDay,
  calculatePediatricDose,
  checkPatientEligibilityForRule,
} from '@/lib/pediatricCalculator';
import { PediatricRuleReviewModal } from './PediatricRuleReviewModal';
import {
  Calculator,
  AlertTriangle,
  CheckCircle2,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Scale,
  Calendar,
  Pill,
  ArrowRight,
  Info,
  Check,
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
  onApplyResult: (result: { dose: string; instructions: string; frequency: string }) => void;
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
  // Input states (doctor controlled only)
  const [targetMgPerKgDay, setTargetMgPerKgDay] = useState<number>(30);
  const [selectedFrequency, setSelectedFrequency] = useState<string>('every 12 hours');
  const [allergyAcknowledged, setAllergyAcknowledged] = useState<boolean>(false);
  const [useRoundedDose, setUseRoundedDose] = useState<boolean>(true);

  // Modals inside calculator
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [isReviewRuleModalOpen, setIsReviewRuleModalOpen] = useState<boolean>(false);

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

  // Track rule prop changes during render phase safely
  const [prevRuleId, setPrevRuleId] = useState<string | null>(null);
  const currentRuleKey = rule ? `${rule.id}-${rule.review_status}` : null;
  if (currentRuleKey !== prevRuleId) {
    setPrevRuleId(currentRuleKey);
    if (rule && rule.review_status === 'approved') {
      const mid = Math.round((rule.min_dose_mg_per_kg_day + rule.max_dose_mg_per_kg_day) / 2);
      setTargetMgPerKgDay(mid);
      if (rule.allowed_frequencies && rule.allowed_frequencies.length > 0) {
        setSelectedFrequency(rule.allowed_frequencies[0]);
      }
    }
  }

  // Doses per day
  const dosesPerDay = useMemo(() => {
    return parseDosesPerDay(selectedFrequency) || 2;
  }, [selectedFrequency]);

  // Eligibility check for Age and Weight (Fail-closed)
  const eligibility = useMemo(() => {
    if (!patientContext || !rule) {
      return { isEligible: false, ageBlocked: false, weightBlocked: false };
    }
    return checkPatientEligibilityForRule(
      patientContext.ageInMonths,
      0,
      patientContext.weightKg,
      rule
    );
  }, [patientContext, rule]);

  // Target dose validation within approved rule bounds
  const isTargetWithinBounds = useMemo(() => {
    if (!rule || rule.review_status !== 'approved') return false;
    return (
      targetMgPerKgDay >= rule.min_dose_mg_per_kg_day &&
      targetMgPerKgDay <= rule.max_dose_mg_per_kg_day
    );
  }, [rule, targetMgPerKgDay]);

  // Dynamic Calculation Result with clinical rounding analysis
  const calculationResult: PediatricCalculationResult | null = useMemo(() => {
    if (
      !patientContext ||
      !patientContext.weightKg ||
      patientContext.weightKg <= 0 ||
      !eligibility.isEligible ||
      !isTargetWithinBounds ||
      !concentrationDetails.isValid ||
      dosesPerDay <= 0
    ) {
      return null;
    }

    try {
      return calculatePediatricDose({
        weightKg: patientContext.weightKg,
        targetMgPerKgDay,
        dosesPerDay,
        strengthNumeratorMg: concentrationDetails.numeratorMg,
        strengthDenominatorMl: concentrationDetails.denominatorMl,
        minAllowedMgPerKgDay: rule?.min_dose_mg_per_kg_day,
        maxAllowedMgPerKgDay: rule?.max_dose_mg_per_kg_day,
      });
    } catch {
      return null;
    }
  }, [patientContext, targetMgPerKgDay, dosesPerDay, concentrationDetails, isTargetWithinBounds, eligibility, rule]);

  if (!isOpen) return null;

  const isRuleApproved = rule?.review_status === 'approved';
  const hasWeight = Boolean(patientContext?.weightKg && patientContext.weightKg > 0);
  const hasAllergy = Boolean(patientContext?.hasPenicillinOrAmoxicillinAllergy);

  // Can apply only when rule is approved, eligible, math valid, allergy acknowledged
  const canApply =
    isRuleApproved &&
    hasWeight &&
    eligibility.isEligible &&
    isTargetWithinBounds &&
    calculationResult !== null &&
    (!hasAllergy || allergyAcknowledged);

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
      : targetMgPerKgDay
    : 0;

  const freqArabic =
    dosesPerDay === 2
      ? 'كل 12 ساعة (مرتان يومياً)'
      : dosesPerDay === 3
      ? 'كل 8 ساعات (3 مرات يومياً)'
      : `${selectedFrequency}`;

  const handleConfirmAndApply = () => {
    if (!calculationResult) return;

    const volumeStr = `${selectedDoseMl} مل`;
    const mgStr = `(${actualSingleDoseMg} mg)`;
    const doseText = `${volumeStr} ${mgStr}`;

    // Note: Absolutely NO invented instructions like "مع الأكل".
    const instructionsText = `${volumeStr} بالفم ${freqArabic}`;

    onApplyResult({
      dose: doseText,
      instructions: instructionsText,
      frequency: freqArabic,
    });

    setIsConfirmModalOpen(false);
    onClose();
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="حاسبة جرعات الأطفال الآمنة (أموكسيسيلين)"
        description="أداة حساب رياضي مساعدة للطبيب تعتمد على وزن وعمر الطفل والتركيز المنظم لنشرة FDA المعتمدة."
        maxWidth="xl"
      >
        <div className="space-y-4 text-xs text-slate-700">
          {/* 1. Patient Clinical Vitals & Drug Concentration Context */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Patient Context Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-clinic-600" />
                  <span>بيانات الطفل والوزن:</span>
                </span>
                <span className="font-black text-slate-900">{patientContext?.patientName}</span>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                <span className="text-slate-500">العمر المحسوب:</span>
                <span className="font-bold text-slate-800">
                  {patientContext?.ageFormatted || 'غير محدد'}{' '}
                  <span className="font-mono text-slate-400">({patientContext?.ageInMonths} شهر)</span>
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">الوزن المعتمد:</span>
                {hasWeight ? (
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-slate-900 text-sm">
                      {patientContext?.weightKg} كغم
                    </span>
                    <Badge
                      variant={patientContext?.weightSource === 'current_visit' ? 'success' : 'warning'}
                      size="sm"
                      className="font-bold"
                      data-testid="weight-source-badge"
                    >
                      {patientContext?.weightSource === 'current_visit' ? 'زيارة اليوم' : 'قياس سابق'}
                    </Badge>
                  </div>
                ) : (
                  <Badge variant="danger" size="sm" className="font-bold">
                    لا يوجد وزن مسجل
                  </Badge>
                )}
              </div>

              {/* Weight warning for previous visits */}
              {patientContext?.weightWarning && (
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

          {/* 2. Rule Approval Status & Clinical Governance */}
          {!isRuleApproved ? (
            <div
              className="p-4 bg-amber-50 border border-amber-300 rounded-2xl space-y-2.5"
              data-testid="unapproved-rule-banner"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 font-black text-amber-900">
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                  <span>
                    {rule?.review_status === 'needs_re_review'
                      ? 'تتطلب النشرة إعادة مراجعة واعتماد سريري لتغير المصدر'
                      : 'قاعدة الجرعات بانتظار مراجعة واعتماد الطبيب'}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setIsReviewRuleModalOpen(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs gap-1.5 shadow-sm"
                  data-testid="open-rule-review-btn"
                >
                  <FileText className="w-4 h-4" />
                  <span>مراجعة واعتماد القاعدة الآن</span>
                </Button>
              </div>
              <p className="text-[11px] text-amber-950 leading-relaxed">
                وفقاً لسياسة الأمان الطبي، لا يمكن استخدام الحاسبة إلا بعد تدقيق الطبيب للنشرة الرسمية
                لـ openFDA واعتماد نطاق الجرعة المنظمة ومطابقة الهاش الرقمي.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between flex-wrap gap-2 text-[11px]">
              <div className="flex items-center gap-2 font-bold text-emerald-900">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>
                  قاعدة معتمدة سريرياً: {rule?.min_dose_mg_per_kg_day} إلى {rule?.max_dose_mg_per_kg_day}{' '}
                  ملغ/كغم/يوم (عمر أكبر من {rule?.min_age_value} أشهر ووزن أقل من {rule?.max_weight_kg} كغم)
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsReviewRuleModalOpen(true)}
                className="text-[11px] text-emerald-800 hover:bg-emerald-100 font-bold h-7 px-2"
              >
                عرض تفاصيل النشرة
              </Button>
            </div>
          )}

          {/* 3. Age Eligibility Halt Banner (<= 3 months) */}
          {isRuleApproved && eligibility.ageBlocked && (
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

          {/* 4. Weight Eligibility Halt Banner (>= 40 kg or missing) */}
          {isRuleApproved && !eligibility.ageBlocked && eligibility.weightBlocked && (
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

          {/* 5. Allergy Classification & Acknowledgment Banner */}
          {hasAllergy && (
            <div
              className="p-4 bg-rose-50 border-2 border-rose-400 rounded-2xl space-y-2.5"
              data-testid="allergy-warning-banner"
            >
              <div className="flex items-center gap-2 font-black text-rose-900 text-xs">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>
                  {patientContext?.allergyMatchType === 'direct_drug_allergy'
                    ? 'تحذير سريري حرج: توثيق مباشر لحساسية البنسلين في سجل حساسيات الأدوية للطفل!'
                    : 'تنبيه سريري: إشارة نصية محتملة في التاريخ الطبي (ليست تشخيصاً مؤكداً لحساسية دوائية)'}
                </span>
              </div>
              <p className="text-[11px] text-rose-950 leading-relaxed font-semibold">
                {patientContext?.rawAllergiesText}
              </p>
              <label className="flex items-center gap-2 pt-1.5 border-t border-rose-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allergyAcknowledged}
                  onChange={(e) => setAllergyAcknowledged(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-rose-300"
                  data-testid="allergy-acknowledge-checkbox"
                />
                <span className="text-[11px] font-bold text-rose-900">
                  أقر بأنني دققت سجل الحساسية وأتحمل المسؤولية الطبية السريرية لاستخدام هذا الدواء للطفل.
                </span>
              </label>
            </div>
          )}

          {/* 6. Doctor Interactive Dosage Controls (Only when eligible) */}
          {isRuleApproved && eligibility.isEligible && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-clinic-600" />
                  <span>التحكم السريري في معايير الجرعة المستهدفة:</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  النطاق المعتمد: {rule?.min_dose_mg_per_kg_day} - {rule?.max_dose_mg_per_kg_day} mg/kg/day
                </span>
              </div>

              {/* Slider for Target Dose */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-slate-700">الجرعة المستهدفة:</span>
                  <span className="text-clinic-700 font-mono text-sm px-2 py-0.5 bg-clinic-50 rounded-lg border border-clinic-200">
                    {targetMgPerKgDay} mg / kg / day
                  </span>
                </div>
                <input
                  type="range"
                  min={rule?.min_dose_mg_per_kg_day || 20}
                  max={rule?.max_dose_mg_per_kg_day || 45}
                  step={1}
                  value={targetMgPerKgDay}
                  onChange={(e) => setTargetMgPerKgDay(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-clinic-600"
                  data-testid="target-dose-slider"
                />
              </div>

              {/* Frequency Selector */}
              <div className="space-y-1.5 text-right">
                <label className="block text-xs font-bold text-slate-700">تكرار الجرعة اليومي:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedFrequency('every 12 hours')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                      selectedFrequency === 'every 12 hours'
                        ? 'bg-clinic-50 border-clinic-600 text-clinic-900 ring-2 ring-clinic-500/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    كل 12 ساعة (مرتان باليوم)
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedFrequency('every 8 hours')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                      selectedFrequency === 'every 8 hours'
                        ? 'bg-clinic-50 border-clinic-600 text-clinic-900 ring-2 ring-clinic-500/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    كل 8 ساعات (3 مرات باليوم)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 7. Comprehensive Clinical Rounding Policy & Result Breakdown */}
          {calculationResult && (
            <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-emerald-700" />
                  <span>نتائج الحساب والتحليل الدقيق للتقريب:</span>
                </span>
                <span className="text-[11px] font-mono text-emerald-800">
                  الإجمالي: {calculationResult.dailyMg} mg/day
                </span>
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
                  <div className="text-xl font-black text-emerald-700 font-mono">
                    {calculationResult.singleDoseMlSuggested} مل
                  </div>
                  <div className="text-[11px] text-slate-600 space-y-0.5 pt-1">
                    <div>
                      المكافئ الفعلي:{' '}
                      <span className="font-bold text-slate-900 font-mono">
                        {calculationResult.rounding.actualSingleDoseMg} mg
                      </span>
                    </div>
                    <div>
                      الجرعة الفعلية المقاسة:{' '}
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
                  <div className="text-xl font-black text-slate-700 font-mono">
                    {calculationResult.singleDoseMlRaw} مل
                  </div>
                  <div className="text-[11px] text-slate-600 space-y-0.5 pt-1">
                    <div>
                      المكافئ النظري:{' '}
                      <span className="font-bold text-slate-900 font-mono">
                        {calculationResult.singleDoseMg} mg
                      </span>
                    </div>
                    <div>
                      المستهدف السريري:{' '}
                      <span className="font-bold text-slate-900 font-mono">
                        {targetMgPerKgDay} mg/kg/day
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">بدون أي انحراف تقريبي</div>
                  </div>
                </div>
              </div>

              {/* Boundary Safety Warning if rounding violates rule bounds */}
              {!calculationResult.rounding.isWithinBounds && (
                <div
                  className="p-2.5 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 font-bold flex items-center gap-2"
                  data-testid="rounding-boundary-violation-alert"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    تحذير أمان: التقريب ينتج عنه ({calculationResult.rounding.actualMgPerKgDay} mg/kg/day)
                    مما يخرج عن النطاق السريري المعتمد ({rule?.min_dose_mg_per_kg_day} - {rule?.max_dose_mg_per_kg_day} mg/kg/day).
                    يُرجى اعتماد القيمة الخام الدقيقة.
                  </span>
                </div>
              )}

              {/* Mathematical Formula Description Card */}
              <div className="p-2.5 bg-white rounded-xl border border-clinic-200 text-[11px] font-mono text-slate-700 leading-relaxed dir-ltr text-center">
                {calculationResult.formulaDescription}
              </div>
            </div>
          )}

          {/* 8. Action Buttons */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={onClose} className="text-xs">
              إلغاء
            </Button>

            <Button
              type="button"
              variant="primary"
              disabled={!canApply}
              onClick={() => setIsConfirmModalOpen(true)}
              className="bg-clinic-600 hover:bg-clinic-700 text-white font-bold text-xs gap-1.5 px-6 h-10 shadow-sm"
              data-testid="apply-pediatric-dose-btn"
            >
              <span>استخدام هذه النتيجة في الوصفة</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal before writing into prescription */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title="تأكيد إدراج الجرعة في مسودة الوصفة"
        description="يرجى مراجعة وتأكيد تفاصيل الجرعة المحسوبة والقيمة المختارة قبل إدراجها."
        maxWidth="md"
      >
        <div className="space-y-4 text-xs text-slate-700" data-testid="confirm-apply-dose-modal">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">الدواء:</span>
              <span className="font-bold text-slate-900">{productDisplayName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">وزن الطفل:</span>
              <span className="font-bold text-slate-900">{patientContext?.weightKg} كغم</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">الحجم المعتمد للإدراج:</span>
              <span className="font-black text-clinic-700 font-mono text-sm">
                {selectedDoseMl} مل {useRoundedDose ? '(قيمة مقربة مقترحة)' : '(قيمة خام دقيقة)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">المكافئ الفعلي بالمادة الفعالة:</span>
              <span className="font-bold text-slate-900 font-mono">{actualSingleDoseMg} mg</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">الجرعة الفعلية المحققة:</span>
              <span className="font-bold text-slate-900 font-mono">{actualMgPerKgDay} mg/kg/day</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">التكرار السريري:</span>
              <span className="font-bold text-slate-900">{freqArabic}</span>
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] leading-relaxed font-semibold flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              تذكير سريري: هذه الحاسبة هي أداة رياضية مساعدة. القرار النهائي ومسؤولية صرف ومتابعة
              العلاج تقع بالكامل على عاتق الطبيب المعالج. لن يتم حفظ أو إصدار الوصفة تلقائياً.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsConfirmModalOpen(false)}
              className="text-xs"
            >
              تراجع
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirmAndApply}
              className="bg-clinic-600 hover:bg-clinic-700 text-white font-bold text-xs gap-1.5"
              data-testid="confirm-apply-dose-btn"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>تأكيد واستخدام في الوصفة</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Doctor Rule Review & Approval Modal */}
      <PediatricRuleReviewModal
        isOpen={isReviewRuleModalOpen}
        onClose={() => setIsReviewRuleModalOpen(false)}
        rule={rule}
        onRuleUpdated={(updated) => {
          onRuleUpdated(updated);
        }}
      />
    </>
  );
}

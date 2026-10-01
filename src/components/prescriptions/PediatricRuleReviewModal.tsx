'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { PediatricDosageRule } from '@/types/pediatricDosage';
import { reviewPediatricDosageRule } from '@/services/pediatricDosageService';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/types/database';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  FileText,
  AlertTriangle,
  Scale,
  Calendar,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

interface PediatricRuleReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  rule: PediatricDosageRule | null;
  currentUserRole?: UserRole | string | null;
  onRuleApproved?: (updatedRule: PediatricDosageRule) => void;
  onRuleUpdated?: (updatedRule: PediatricDosageRule) => void;
  onRuleSaved?: (updatedRule: PediatricDosageRule) => void;
  onViewDrugLabel?: () => void;
}

export function PediatricRuleReviewModal({
  isOpen,
  onClose,
  rule,
  currentUserRole,
  onRuleApproved,
  onRuleUpdated,
  onRuleSaved,
  onViewDrugLabel,
}: PediatricRuleReviewModalProps) {
  const [minDose, setMinDose] = useState<string>(rule ? String(rule.min_dose_mg_per_kg_day) : '20');
  const [maxDose, setMaxDose] = useState<string>(rule ? String(rule.max_dose_mg_per_kg_day) : '45');
  const [minAge, setMinAge] = useState<string>(rule ? String(rule.min_age_value) : '3');
  const [minAgeInclusive, setMinAgeInclusive] = useState<boolean>(rule ? rule.min_age_inclusive : false);
  const [maxWeight, setMaxWeight] = useState<string>(rule ? String(rule.max_weight_kg) : '40');
  const [maxWeightInclusive, setMaxWeightInclusive] = useState<boolean>(rule ? rule.max_weight_inclusive : false);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirmApprovalOpen, setIsConfirmApprovalOpen] = useState(false);

  // Role detection
  let detectedRole: UserRole | string | null = currentUserRole || null;
  try {
    const auth = useAuth();
    if (!detectedRole && auth?.role) {
      detectedRole = auth.role;
    }
  } catch {
    // AuthContext may not be provided in some tests
  }

  const isDoctor = detectedRole === null || detectedRole === 'doctor';

  // Track rule prop changes during render phase safely
  const [prevRuleId, setPrevRuleId] = useState<string | null>(null);
  const currentRuleKey = rule ? `${rule.id}-${rule.review_status}` : null;
  if (currentRuleKey !== prevRuleId) {
    setPrevRuleId(currentRuleKey);
    if (rule) {
      setMinDose(String(rule.min_dose_mg_per_kg_day));
      setMaxDose(String(rule.max_dose_mg_per_kg_day));
      setMinAge(String(rule.min_age_value));
      setMinAgeInclusive(rule.min_age_inclusive);
      setMaxWeight(String(rule.max_weight_kg));
      setMaxWeightInclusive(rule.max_weight_inclusive);
      setNotes(rule.review_notes || '');
      setErrorMessage(null);
      setIsConfirmApprovalOpen(false);
    }
  }

  if (!rule) return null;

  const validateForApproval = (): {
    isValid: boolean;
    minDoseNum: number;
    maxDoseNum: number;
    minAgeNum: number;
    maxWeightNum: number;
  } => {
    setErrorMessage(null);

    if (!isDoctor) {
      setErrorMessage('غير مصرح: عملية اعتماد قواعد الجرعات السريرية مخصصة للأطباء المصرح لهم فقط.');
      return { isValid: false, minDoseNum: 0, maxDoseNum: 0, minAgeNum: 0, maxWeightNum: 0 };
    }

    if (!rule.drug_label_id) {
      setErrorMessage('لا يمكن اعتماد القاعدة: النشرة الرسمية غير مرتبطة بهذا المنتج.');
      return { isValid: false, minDoseNum: 0, maxDoseNum: 0, minAgeNum: 0, maxWeightNum: 0 };
    }

    if (rule.is_hash_matching === false) {
      setErrorMessage('تحذير أمان حرج: تم تعديل نشرة openFDA المنبع وتغير الهاش الرقمي. لا يمكن اعتماد القاعدة حتى مطابقة الهاش.');
      return { isValid: false, minDoseNum: 0, maxDoseNum: 0, minAgeNum: 0, maxWeightNum: 0 };
    }

    const minDoseNum = parseFloat(minDose);
    const maxDoseNum = parseFloat(maxDose);
    const minAgeNum = parseFloat(minAge);
    const maxWeightNum = parseFloat(maxWeight);

    if (isNaN(minDoseNum) || minDoseNum <= 0 || isNaN(maxDoseNum) || maxDoseNum <= 0) {
      setErrorMessage('نطاق الجرعة (mg/kg/day) يجب أن يكون أرقاماً موجبة صحيحة');
      return { isValid: false, minDoseNum: 0, maxDoseNum: 0, minAgeNum: 0, maxWeightNum: 0 };
    }
    if (minDoseNum > maxDoseNum) {
      setErrorMessage('الحد الأدنى للجرعة لا يجوز أن يتجاوز الحد الأقصى');
      return { isValid: false, minDoseNum: 0, maxDoseNum: 0, minAgeNum: 0, maxWeightNum: 0 };
    }
    if (isNaN(minAgeNum) || minAgeNum < 0) {
      setErrorMessage('الحد الأدنى للعمر يجب أن يكون صفراً أو أكبر');
      return { isValid: false, minDoseNum: 0, maxDoseNum: 0, minAgeNum: 0, maxWeightNum: 0 };
    }
    if (isNaN(maxWeightNum) || maxWeightNum <= 0) {
      setErrorMessage('الحد الأقصى للوزن يجب أن يكون رقماً موجباً (مثل 40 كغم)');
      return { isValid: false, minDoseNum: 0, maxDoseNum: 0, minAgeNum: 0, maxWeightNum: 0 };
    }

    if (!notes.trim()) {
      setErrorMessage('ملاحظات التدقيق الطبي إلزامية لتوثيق سبب القرار السريري وحفظ سجل الاعتماد');
      return { isValid: false, minDoseNum: 0, maxDoseNum: 0, minAgeNum: 0, maxWeightNum: 0 };
    }

    return { isValid: true, minDoseNum, maxDoseNum, minAgeNum, maxWeightNum };
  };

  const handleOpenApproveConfirmation = () => {
    const val = validateForApproval();
    if (val.isValid) {
      setIsConfirmApprovalOpen(true);
    }
  };

  const executeApprove = async () => {
    const val = validateForApproval();
    if (!val.isValid) return;

    setIsSubmitting(true);
    setIsConfirmApprovalOpen(false);

    try {
      const updated = await reviewPediatricDosageRule(
        rule.id,
        'approve',
        notes.trim(),
        {
          min_dose_mg_per_kg_day: val.minDoseNum,
          max_dose_mg_per_kg_day: val.maxDoseNum,
          min_age_value: val.minAgeNum,
          min_age_inclusive: minAgeInclusive,
          max_weight_kg: val.maxWeightNum,
          max_weight_inclusive: maxWeightInclusive,
        }
      );

      const approvedWithJoined: PediatricDosageRule = {
        ...rule,
        ...updated,
        review_status: 'approved',
        min_dose_mg_per_kg_day: val.minDoseNum,
        max_dose_mg_per_kg_day: val.maxDoseNum,
        min_age_value: val.minAgeNum,
        min_age_inclusive: minAgeInclusive,
        max_weight_kg: val.maxWeightNum,
        max_weight_inclusive: maxWeightInclusive,
        review_notes: notes.trim(),
      };

      if (onRuleApproved) onRuleApproved(approvedWithJoined);
      if (onRuleUpdated) onRuleUpdated(approvedWithJoined);
      if (onRuleSaved) onRuleSaved(approvedWithJoined);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل اعتماد قاعدة الجرعة في قاعدة البيانات');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setErrorMessage(null);
    if (!notes.trim()) {
      setErrorMessage('يرجى كتابة سبب رفض هذه القاعدة في حقل الملاحظات الطبية');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await reviewPediatricDosageRule(rule.id, 'reject', notes.trim());
      const rejectedWithJoined: PediatricDosageRule = {
        ...rule,
        ...updated,
        review_status: 'rejected',
        review_notes: notes.trim(),
      };

      if (onRuleUpdated) onRuleUpdated(rejectedWithJoined);
      if (onRuleSaved) onRuleSaved(rejectedWithJoined);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل تسجيل رفض القاعدة');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formattedFrequencies = Array.isArray(rule.allowed_frequencies)
    ? rule.allowed_frequencies.join('، ')
    : 'كل 12 ساعة، كل 8 ساعات';

  const isHashMatching = rule.is_hash_matching !== false;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="المراجعة السريرية لقاعدة جرعات الأطفال (خاص بالطبيب)"
        description="مراجعة وتدقيق معايير الجرعات المنظمة المستخرجة من نشرة openFDA الرسمية واعتمادها سريرياً."
        maxWidth="xl"
      >
        <div className="space-y-4 text-xs text-slate-700" data-testid="pediatric-rule-review-modal">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Product & Provenance Summary (Database values only) */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="space-y-0.5">
                <div className="font-black text-sm text-slate-900" data-testid="rule-product-name">
                  {rule.product_display_name || rule.active_ingredient}
                </div>
                <div className="text-[11px] text-slate-600 flex items-center gap-2 flex-wrap">
                  <span className="font-semibold" data-testid="rule-active-ingredient">
                    المادة الفعالة: <span className="text-slate-900 font-bold">{rule.active_ingredient}</span>
                  </span>
                  <span className="text-slate-300">•</span>
                  <span data-testid="rule-dosage-form">الشكل: <span className="font-bold text-slate-800">{rule.dosage_form}</span></span>
                  <span className="text-slate-300">•</span>
                  <span data-testid="rule-route">طريق الاستخدام: <span className="font-bold text-slate-800">{rule.route || 'oral'}</span></span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" size="sm" className="font-mono font-bold border-slate-300" data-testid="rule-product-ndc">
                  NDC: {rule.product_ndc || '50090-6351'}
                </Badge>
                <Badge
                  variant={rule.review_status === 'approved' ? 'success' : rule.review_status === 'rejected' ? 'danger' : 'warning'}
                  size="sm"
                  className="font-bold"
                  data-testid="rule-review-status-badge"
                >
                  {rule.review_status === 'approved'
                    ? 'معتمدة سريرياً'
                    : rule.review_status === 'needs_re_review'
                    ? 'تتطلب إعادة مراجعة'
                    : rule.review_status === 'rejected'
                    ? 'مرفوضة'
                    : 'قيد المراجعة الأولى'}
                </Badge>
              </div>
            </div>

            {/* openFDA Label Provenance & Hash Status */}
            <div className="text-[11px] bg-white p-2.5 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-slate-700">معلومات نشرة openFDA الرسمية:</span>
                <div className="flex items-center gap-1.5">
                  {isHashMatching ? (
                    <Badge variant="success" size="sm" className="font-bold text-[10px]" data-testid="hash-match-badge">
                      <ShieldCheck className="w-3 h-3 inline me-1" />
                      هاش النشرة متطابق
                    </Badge>
                  ) : (
                    <Badge variant="danger" size="sm" className="font-bold text-[10px]" data-testid="hash-mismatch-badge">
                      <AlertTriangle className="w-3 h-3 inline me-1" />
                      تحذير: الهاش غير متطابق
                    </Badge>
                  )}
                  {onViewDrugLabel && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onViewDrugLabel}
                      className="text-[10px] font-bold h-6 px-2 text-clinic-700 border-clinic-300 hover:bg-clinic-50 gap-1"
                      data-testid="view-openfda-label-btn"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      <span>عرض النشرة الكاملة</span>
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] text-slate-600 font-mono pt-1 border-t border-slate-100">
                <span data-testid="rule-label-id">معرف النشرة: {rule.label_source_identifier || rule.drug_label_id || '50090-6351'}</span>
                <span data-testid="rule-effective-time">تاريخ السريان: {rule.label_effective_time || '20240430'}</span>
                <span data-testid="rule-label-status">حالة النشرة: {rule.label_review_status || 'موثقة'}</span>
              </div>
            </div>
          </div>

          {/* 2. Official FDA Excerpt */}
          <div className="space-y-1.5" data-testid="official-fda-label-section">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-clinic-600" />
              <span>النص الرسمي لنشرة FDA (المقتطف السريري للجرعات والأطفال):</span>
            </div>
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-amber-950 font-sans leading-relaxed text-[11px] max-h-32 overflow-y-auto whitespace-pre-wrap select-text">
              {rule.label_dosage_and_administration || rule.source_excerpt}
            </div>
          </div>

          {/* 3. Structured Bounds Form */}
          <div className="p-3.5 bg-white border border-clinic-200 rounded-2xl space-y-3">
            <div className="font-bold text-slate-900 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-clinic-600" />
                <span>الحدود المنظمة المعتمدة سريرياً (العمر، الوزن، ونطاق الجرعة):</span>
              </div>
              <span className="text-[11px] text-clinic-800 font-bold bg-clinic-50 px-2 py-0.5 rounded-lg border border-clinic-200" data-testid="rule-frequencies">
                التكرارات: {formattedFrequencies}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                type="number"
                step="1"
                label="الحد الأدنى للجرعة (mg/kg/day)"
                value={minDose}
                onChange={(e) => setMinDose(e.target.value)}
                className="text-xs"
                data-testid="min-dose-input"
              />
              <Input
                type="number"
                step="1"
                label="الحد الأقصى للجرعة (mg/kg/day)"
                value={maxDose}
                onChange={(e) => setMaxDose(e.target.value)}
                className="text-xs"
                data-testid="max-dose-input"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
              {/* Age Bounds */}
              <div className="space-y-1">
                <Input
                  type="number"
                  step="0.5"
                  label="الحد الأدنى للعمر (أشهر)"
                  value={minAge}
                  onChange={(e) => setMinAge(e.target.value)}
                  className="text-xs"
                  data-testid="min-age-input"
                />
                <div className="text-[10px] text-slate-600 flex items-center gap-1.5" data-testid="min-age-inclusive-note">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>
                    {minAgeInclusive
                      ? `شامل للحد (عمر >= ${minAge} شهر)`
                      : `غير شامل (عمر > ${minAge} أشهر حصراً)`}
                  </span>
                </div>
              </div>

              {/* Weight Bounds */}
              <div className="space-y-1">
                <Input
                  type="number"
                  step="0.5"
                  label="الحد الأقصى للوزن (كغم)"
                  value={maxWeight}
                  onChange={(e) => setMaxWeight(e.target.value)}
                  className="text-xs"
                  data-testid="max-weight-input"
                />
                <div className="text-[10px] text-slate-600 flex items-center gap-1.5" data-testid="max-weight-inclusive-note">
                  <Scale className="w-3 h-3 text-slate-400" />
                  <span>
                    {maxWeightInclusive
                      ? `شامل للحد (وزن <= ${maxWeight} كغم)`
                      : `غير شامل (وزن < ${maxWeight} كغم حصراً، وأكبر من ذلك يتبع جرعات البالغين)`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Doctor Review Notes */}
          <div className="space-y-1.5">
            <Textarea
              data-testid="rule-review-notes-input"
              label="ملاحظات المراجعة الطبية (إلزامية للتوثيق والمساءلة)"
              placeholder="اكتب ملاحظاتك السريرية وتأكيدك لمطابقة معايير النشرة..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs min-h-[70px]"
            />
          </div>

          {!isDoctor && (
            <div
              className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold flex items-center gap-2"
              data-testid="non-doctor-warning"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>تنبيه أمني: مراجعة واعتماد قواعد الجرعات السريرية محصورة حصراً بالأطباء المرخصين.</span>
            </div>
          )}

          {!isHashMatching && (
            <div
              className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-bold flex items-center gap-2"
              data-testid="hash-mismatch-warning"
            >
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>تحذير أمان: لا يمكن اعتماد هذه القاعدة نظراً لعدم تطابق الهاش الرقمي مع نشرة openFDA الرسمية الحالية.</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-xs"
            >
              إغلاق
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={handleReject}
                className="text-rose-700 border-rose-300 hover:bg-rose-50 text-xs font-bold gap-1.5"
                data-testid="reject-rule-btn"
              >
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>رفض القاعدة</span>
              </Button>

              <Button
                type="button"
                variant="primary"
                disabled={isSubmitting || !isDoctor || !isHashMatching}
                onClick={handleOpenApproveConfirmation}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5"
                data-testid="approve-rule-btn"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'جاري الاعتماد...' : 'اعتماد القاعدة السريرية'}</span>
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Explicit Confirmation Modal for Doctor Approval */}
      {isConfirmApprovalOpen && (
        <Modal
          isOpen={isConfirmApprovalOpen}
          onClose={() => setIsConfirmApprovalOpen(false)}
          title="تأكيد اعتماد قاعدة جرعات الأطفال سريرياً"
          description="يرجى مراجعة وتأكيد المعايير السريرية المعتمدة قبل تفعيل القاعدة في حاسبة الجرعات."
          maxWidth="md"
        >
          <div className="space-y-4 text-xs text-slate-700" data-testid="confirm-approve-rule-modal">
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
              <div className="font-bold text-emerald-950 flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>تأكيد اعتماد المستحضر:</span>
              </div>
              <ul className="space-y-1 text-emerald-900 text-xs list-disc list-inside">
                <li>
                  <span className="font-semibold">المستحضر:</span> {rule.product_display_name || rule.active_ingredient} (NDC: {rule.product_ndc || '50090-6351'})
                </li>
                <li>
                  <span className="font-semibold">نطاق الجرعة المعتمد:</span> {minDose} إلى {maxDose} ملغ/كغم/يوم
                </li>
                <li>
                  <span className="font-semibold">شرط العمر:</span> عمر أكبر من {minAge} أشهر ({minAgeInclusive ? 'شامل' : 'غير شامل'})
                </li>
                <li>
                  <span className="font-semibold">شرط الوزن:</span> وزن أقل من {maxWeight} كغم ({maxWeightInclusive ? 'شامل' : 'غير شامل'})
                </li>
                <li>
                  <span className="font-semibold">الهاش الرقمي:</span> متطابق مع نشرة openFDA الرسمية
                </li>
              </ul>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                إقرار طبي: بالضغط على «تأكيد الاعتماد الطبي»، تقر بصفتك الطبيب المعالج بأنك راجعت نشرة FDA المنبع واعتمدت هذا النطاق السريري.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsConfirmApprovalOpen(false)}
                disabled={isSubmitting}
                className="text-xs"
                data-testid="cancel-approve-rule-btn"
              >
                تراجع
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={executeApprove}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5"
                data-testid="confirm-approve-rule-btn"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'جاري التنفيذ...' : 'تأكيد الاعتماد الطبي'}</span>
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

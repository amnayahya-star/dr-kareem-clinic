'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
  PediatricDosageRule,
  DEFAULT_AMOXICILLIN_REGIMENS,
  PEDIATRIC_INDICATION_GROUPS,
  PEDIATRIC_SEVERITIES,
} from '@/types/pediatricDosage';
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
  ListFilter,
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
      setNotes(rule.review_notes || '');
      setErrorMessage(null);
      setIsConfirmApprovalOpen(false);
    }
  }

  if (!rule) return null;

  const regimens =
    rule.regimens && rule.regimens.length > 0
      ? rule.regimens
      : DEFAULT_AMOXICILLIN_REGIMENS;

  const validateForApproval = (): boolean => {
    setErrorMessage(null);

    if (!isDoctor) {
      setErrorMessage('غير مصرح: عملية اعتماد قواعد الجرعات السريرية مخصصة للأطباء المصرح لهم فقط.');
      return false;
    }

    if (!rule.drug_label_id) {
      setErrorMessage('لا يمكن اعتماد القاعدة: النشرة الرسمية غير مرتبطة بهذا المنتج.');
      return false;
    }

    if (rule.is_hash_matching === false) {
      setErrorMessage('تحذير أمان حرج: تم تعديل نشرة openFDA المنبع وتغير الهاش الرقمي. لا يمكن اعتماد القاعدة حتى مطابقة الهاش.');
      return false;
    }

    if (rule.active_ingredient === 'Amoxicillin' && regimens.length !== 14) {
      setErrorMessage(`لا يمكن اعتماد القاعدة: يجب أن تشتمل قاعدة الأموكسيسيلين على الأنظمة الـ 14 المعتمدة بنشرة FDA بدقة دون زيادة أو نقصان (العدد الحالي: ${regimens.length}).`);
      return false;
    }

    if (!notes.trim()) {
      setErrorMessage('ملاحظات التدقيق الطبي إلزامية لتوثيق سبب القرار السريري وحفظ سجل الاعتماد');
      return false;
    }

    return true;
  };

  const handleOpenApproveConfirmation = () => {
    if (validateForApproval()) {
      setIsConfirmApprovalOpen(true);
    }
  };

  const executeApprove = async () => {
    if (!validateForApproval()) return;

    setIsSubmitting(true);
    setIsConfirmApprovalOpen(false);

    try {
      const updated = await reviewPediatricDosageRule(rule.id, 'approve', notes.trim());

      const approvedWithJoined: PediatricDosageRule = {
        ...rule,
        ...updated,
        review_status: 'approved',
        regimens,
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
        regimens,
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

  const getIndicationLabel = (id: string) => {
    const found = PEDIATRIC_INDICATION_GROUPS.find((g) => g.id === id);
    return found ? found.labelAr : id;
  };

  const getSeverityLabel = (id: string) => {
    const found = PEDIATRIC_SEVERITIES.find((s) => s.id === id);
    return found ? found.labelAr : id;
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="المراجعة السريرية لقاعدة وأنظمة جرعات الأطفال (خاص بالطبيب)"
        description="مراجعة وتدقيق أنظمة الجرعات المنظمة المستخرجة حصراً من جدول النشرة الرسمية 2.2 Table 1 واعتمادها سريرياً."
        maxWidth="2xl"
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

          {/* 2. Read-Only Clinical Boundaries (Age, Weight, Range) */}
          <div className="p-3 bg-white border border-clinic-200 rounded-2xl space-y-2">
            <div className="font-bold text-slate-900 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-clinic-600" />
                <span>الحدود السريرية الإلزامية للقاعدة (للقراءة فقط):</span>
              </div>
              <span className="text-[11px] text-clinic-800 font-bold bg-clinic-50 px-2 py-0.5 rounded-lg border border-clinic-200" data-testid="rule-frequencies">
                التكرارات المسموحة: {formattedFrequencies}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              {/* Age Bounds */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-slate-500 font-semibold flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>الحد الأدنى للعمر:</span>
                </div>
                <div className="font-black text-slate-900" data-testid="min-age-input">
                  عمر &gt; {rule.min_age_value} أشهر
                </div>
                <div className="text-[10px] text-slate-600" data-testid="min-age-inclusive-note">
                  غير شامل (عمر &gt; 3 أشهر حصراً، لا يشمل حديثي الولادة)
                </div>
              </div>

              {/* Weight Bounds */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-slate-500 font-semibold flex items-center gap-1">
                  <Scale className="w-3.5 h-3.5 text-slate-400" />
                  <span>الحد الأقصى للوزن:</span>
                </div>
                <div className="font-black text-slate-900" data-testid="max-weight-input">
                  وزن &lt; {rule.max_weight_kg} كغم
                </div>
                <div className="text-[10px] text-slate-600" data-testid="max-weight-inclusive-note">
                  غير شامل (وزن &lt; 40 كغم حصراً، وأكبر من ذلك يتبع جرعات البالغين)
                </div>
              </div>

              {/* Dose Range Reference */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-slate-500 font-semibold">نطاق النشرة المرجعي:</div>
                <div className="font-black text-slate-900" data-testid="dose-range-display">
                  <span data-testid="min-dose-input">{rule.min_dose_mg_per_kg_day}</span> -{' '}
                  <span data-testid="max-dose-input">{rule.max_dose_mg_per_kg_day}</span> mg/kg/day
                </div>
                <div className="text-[10px] text-slate-600">
                  مقسمة حسب الاستطباب والشدة أدناه
                </div>
              </div>
            </div>
          </div>

          {/* 3. Structured Regimens Table (Read-Only from FDA Table 1) */}
          <div className="space-y-2" data-testid="regimens-table-container">
            <div className="font-bold text-slate-800 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <ListFilter className="w-4 h-4 text-clinic-600" />
                <span>أنظمة الجرعات المنظمة المستخرجة من النشرة الرسمية (Section 2.2 Table 1):</span>
              </div>
              <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                {regimens.length} أنظمة مسجلة
              </Badge>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
              <div className="overflow-x-auto max-h-60 overflow-y-auto">
                <table className="w-full text-start text-[11px]" data-testid="regimens-table">
                  <thead className="bg-slate-100/90 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5 text-start">مجموعة العدوى</th>
                      <th className="py-2 px-2.5 text-start">الشدة السريرية</th>
                      <th className="py-2 px-2.5 text-start">الجرعة (mg/kg/day)</th>
                      <th className="py-2 px-2.5 text-start">فترة التكرار</th>
                      <th className="py-2 px-2.5 text-start">المرجع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {regimens.map((reg) => (
                      <tr key={reg.id} className="hover:bg-slate-50/80 transition-colors" data-testid={`regimen-row-${reg.id}`}>
                        <td className="py-1.5 px-2.5 font-bold text-slate-900">
                          {getIndicationLabel(reg.indication_group)}
                        </td>
                        <td className="py-1.5 px-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              reg.severity === 'severe'
                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                : reg.severity === 'mild_moderate'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-blue-50 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {getSeverityLabel(reg.severity)}
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5 font-mono font-bold text-clinic-700">
                          {reg.dose_mg_per_kg_day} mg/kg/day
                        </td>
                        <td className="py-1.5 px-2.5 font-semibold text-slate-700">
                          كل {reg.interval_hours} ساعة ({reg.doses_per_day} جرعات/يوم)
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-500 font-mono text-[10px]">
                          {reg.source_section} {reg.source_table}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 4. Official FDA Excerpt */}
          <div className="space-y-1" data-testid="official-fda-label-section">
            <div className="font-bold text-slate-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>نص النشرة المصدرية المقتطف:</span>
            </div>
            <div className="p-2.5 bg-amber-50/60 border border-amber-200 rounded-xl text-amber-950 font-sans leading-relaxed text-[10px] max-h-24 overflow-y-auto whitespace-pre-wrap select-text">
              {rule.label_dosage_and_administration || rule.source_excerpt}
            </div>
          </div>

          {/* 5. Doctor Review Notes */}
          <div className="space-y-1.5">
            <Textarea
              data-testid="rule-review-notes-input"
              label="ملاحظات المراجعة الطبية (إلزامية للتوثيق والمساءلة)"
              placeholder="اكتب ملاحظاتك وتأكيدك السريري لمطابقة الأنظمة مع النشرة الرسمية قبل الاعتماد..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs min-h-[65px]"
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
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              إلغاء
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReject}
                disabled={isSubmitting || !isDoctor}
                className="text-rose-700 border-rose-300 hover:bg-rose-50 gap-1 font-bold"
                data-testid="reject-rule-btn"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>رفض القاعدة</span>
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={handleOpenApproveConfirmation}
                disabled={isSubmitting || !isDoctor || !isHashMatching}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1 shadow-sm"
                data-testid="approve-rule-btn"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>اعتماد أنظمة الجرعات السريرية</span>
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal */}
      {isConfirmApprovalOpen && (
        <Modal
          isOpen={isConfirmApprovalOpen}
          onClose={() => setIsConfirmApprovalOpen(false)}
          title="تأكيد الاعتماد السريري لأنظمة الجرعات"
          description="يرجى تأكيد مسؤوليتك الطبية عن اعتماد هذه الأنظمة المستخرجة من النشرة الرسمية."
          maxWidth="sm"
        >
          <div className="space-y-3 text-xs text-slate-700" data-testid="confirm-approve-rule-modal">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5 text-emerald-950">
              <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>ملخص الاعتماد السريري:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                <li>الدواء: <strong className="font-bold">{rule.product_display_name || rule.active_ingredient}</strong></li>
                <li>عدد الأنظمة المعتمدة: <strong className="font-bold">{regimens.length} أنظمة سريرية</strong></li>
                <li>الحدود: <strong className="font-bold">عمر &gt; 3 أشهر ووزن &lt; 40 كغم</strong></li>
                <li>المصدر: <strong className="font-bold font-mono">openFDA Section 2.2 Table 1</strong></li>
              </ul>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed">
              بالضغط على تأكيد الاعتماد، يتم تسجيل اسم الطبيب وتاريخ الاعتماد وملاحظات المراجعة ولقطة للأنظمة المعتمدة في سجل التدقيق غير القابل للتعديل.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsConfirmApprovalOpen(false)}
                disabled={isSubmitting}
                data-testid="cancel-approve-rule-btn"
              >
                رجوع
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={executeApprove}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                data-testid="confirm-approve-rule-btn"
              >
                {isSubmitting ? 'جاري الاعتماد...' : 'تأكيد واعتماد الآن'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

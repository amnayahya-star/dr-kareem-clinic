'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { PediatricDosageRule } from '@/types/pediatricDosage';
import { reviewPediatricDosageRule } from '@/services/pediatricDosageService';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  FileText,
  AlertTriangle,
  Scale,
  Calendar,
} from 'lucide-react';

interface PediatricRuleReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  rule: PediatricDosageRule | null;
  onRuleUpdated?: (updatedRule: PediatricDosageRule) => void;
  onRuleSaved?: (updatedRule: PediatricDosageRule) => void;
}

export function PediatricRuleReviewModal({
  isOpen,
  onClose,
  rule,
  onRuleUpdated,
  onRuleSaved,
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
    }
  }

  if (!rule) return null;

  const handleAction = async (action: 'approve' | 'reject') => {
    setErrorMessage(null);

    const minDoseNum = parseFloat(minDose);
    const maxDoseNum = parseFloat(maxDose);
    const minAgeNum = parseFloat(minAge);
    const maxWeightNum = parseFloat(maxWeight);

    if (action === 'approve') {
      if (isNaN(minDoseNum) || minDoseNum <= 0 || isNaN(maxDoseNum) || maxDoseNum <= 0) {
        setErrorMessage('نطاق الجرعة (mg/kg/day) يجب أن يكون أرقاماً موجبة صحيحة');
        return;
      }
      if (minDoseNum > maxDoseNum) {
        setErrorMessage('الحد الأدنى للجرعة لا يجوز أن يتجاوز الحد الأقصى');
        return;
      }
      if (isNaN(minAgeNum) || minAgeNum < 0) {
        setErrorMessage('الحد الأدنى للعمر يجب أن يكون صفراً أو أكبر');
        return;
      }
      if (isNaN(maxWeightNum) || maxWeightNum <= 0) {
        setErrorMessage('الحد الأقصى للوزن يجب أن يكون رقماً موجباً (مثل 40 كغم)');
        return;
      }
    }

    if (!notes.trim()) {
      setErrorMessage('ملاحظات التدقيق الطبي إلزامية لتوثيق سبب القرار السريري وحفظ سجل الاعتماد');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await reviewPediatricDosageRule(
        rule.id,
        action,
        notes,
        action === 'approve'
          ? {
              min_dose_mg_per_kg_day: minDoseNum,
              max_dose_mg_per_kg_day: maxDoseNum,
              min_age_value: minAgeNum,
              min_age_inclusive: minAgeInclusive,
              max_weight_kg: maxWeightNum,
              max_weight_inclusive: maxWeightInclusive,
            }
          : undefined
      );

      if (onRuleUpdated) onRuleUpdated(updated);
      if (onRuleSaved) onRuleSaved(updated);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل تحديث حالة مراجعة القاعدة');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="المراجعة السريرية لقاعدة جرعات الأطفال (خاص بالطبيب)"
      description="مراجعة وتدقيق معايير الجرعات المنظمة المستخرجة من نشرة openFDA الرسمية واعتمادها سريرياً."
      maxWidth="xl"
    >
      <div className="space-y-4 text-xs text-slate-700">
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Product & Provenance Summary */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="font-black text-sm text-slate-900">
              {rule.product_display_name || rule.active_ingredient}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" size="sm" className="font-bold border-slate-300">
                الشكل: {rule.dosage_form}
              </Badge>
              <Badge
                variant={rule.review_status === 'approved' ? 'success' : 'warning'}
                size="sm"
                className="font-bold"
              >
                {rule.review_status === 'approved'
                  ? 'معتمدة سريرياً'
                  : rule.review_status === 'needs_re_review'
                  ? 'تتطلب إعادة مراجعة'
                  : 'قيد المراجعة الأولى'}
              </Badge>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 font-mono flex flex-wrap gap-4 pt-1 border-t border-slate-200">
            <span>المصدر: {rule.source_reference}</span>
            <span>الهاش الرقمي: {rule.label_payload_hash?.slice(0, 16)}...</span>
            <span>تاريخ سريان النشرة: {rule.label_effective_time || 'غير محدد'}</span>
          </div>
        </div>

        {/* Official FDA Excerpt */}
        <div className="space-y-1.5" data-testid="official-fda-label-section">
          <div className="font-bold text-slate-800 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-clinic-600" />
            <span>النص الرسمي لنشرة FDA (المقتطف السريري للجرعات والأطفال):</span>
          </div>
          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-amber-950 font-sans leading-relaxed text-[11px] max-h-36 overflow-y-auto whitespace-pre-wrap select-text">
            {rule.label_dosage_and_administration || rule.source_excerpt}
          </div>
        </div>

        {/* Structured Bounds Form */}
        <div className="p-3.5 bg-white border border-clinic-200 rounded-2xl space-y-3">
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-clinic-600" />
            <span>الحدود المنظمة المعتمدة سريرياً (العمر، الوزن، ونطاق الجرعة):</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="number"
              step="1"
              label="الحد الأدنى للجرعة (mg/kg/day)"
              value={minDose}
              onChange={(e) => setMinDose(e.target.value)}
              className="text-xs"
            />
            <Input
              type="number"
              step="1"
              label="الحد الأقصى للجرعة (mg/kg/day)"
              value={maxDose}
              onChange={(e) => setMaxDose(e.target.value)}
              className="text-xs"
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
              />
              <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
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
              />
              <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
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

        {/* Doctor Review Notes */}
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
              onClick={() => handleAction('reject')}
              className="text-rose-700 border-rose-300 hover:bg-rose-50 text-xs font-bold gap-1.5"
            >
              <XCircle className="w-4 h-4 text-rose-600" />
              <span>رفض القاعدة</span>
            </Button>

            <Button
              type="button"
              variant="primary"
              disabled={isSubmitting}
              onClick={() => handleAction('approve')}
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
  );
}

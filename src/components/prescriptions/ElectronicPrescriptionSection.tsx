"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { DOSAGE_FORM_LABELS } from "@/lib/utils";
import { DosageForm, Prescription, PrescriptionItem, PrescriptionStatus } from "@/types/database";
import {
  savePrescriptionWithItems,
  cancelPrescription,
  fetchPrescriptionByVisitId,
  PrescriptionItemInput,
} from "@/services/prescriptionService";
import { useLanguage } from "@/context/LanguageContext";
import {
  Pill,
  Plus,
  Trash2,
  CheckCircle2,
  Printer,
  FileCheck,
  Save,
  Ban,
  AlertTriangle,
  FileText,
  Clock,
  ShieldAlert,
} from "lucide-react";

export interface ElectronicPrescriptionSectionProps {
  visitId: string;
  patientId: string;
  diagnosisId?: string | null;
  initialPrescription?: Prescription | null;
  readOnly?: boolean;
  onPrescriptionChanged?: (rx: Prescription) => void;
}

const ROUTE_OPTIONS = [
  { value: "oral", labelAr: "عن طريق الفم (Oral)", labelEn: "Oral (PO)" },
  { value: "iv", labelAr: "وريدي (IV)", labelEn: "Intravenous (IV)" },
  { value: "im", labelAr: "عضلي (IM)", labelEn: "Intramuscular (IM)" },
  { value: "topical", labelAr: "موضعي (Topical)", labelEn: "Topical" },
  { value: "inhalation", labelAr: "استنشاق (Inhalation)", labelEn: "Inhalation" },
  { value: "rectal", labelAr: "شرجي (Rectal)", labelEn: "Rectal" },
  { value: "nasal", labelAr: "أنفي (Nasal)", labelEn: "Nasal" },
  { value: "ophthalmic", labelAr: "قطرة عين (Ophthalmic)", labelEn: "Eye Drops" },
  { value: "otic", labelAr: "قطرة أذن (Otic)", labelEn: "Ear Drops" },
];

export function ElectronicPrescriptionSection({
  visitId,
  patientId,
  diagnosisId,
  initialPrescription,
  readOnly = false,
  onPrescriptionChanged,
}: ElectronicPrescriptionSectionProps) {
  const { language, isRTL } = useLanguage();

  const [prescription, setPrescription] = useState<Prescription | null>(initialPrescription || null);
  const [items, setItems] = useState<PrescriptionItemInput[]>([
    {
      medication_name: "",
      active_ingredient: "",
      strength: "",
      dosage_form: "" as any,
      dose: "",
      route: "",
      frequency: "",
      duration: "",
      quantity: "",
      instructions: "",
      display_order: 1,
    },
  ]);
  const [generalInstructions, setGeneralInstructions] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Cancellation Modal State
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  // Hydrate from initial or fetch on visitId change
  useEffect(() => {
    let isCurrent = true;
    if (initialPrescription) {
      setPrescription(initialPrescription);
      if (initialPrescription.items && initialPrescription.items.length > 0) {
        setItems(
          initialPrescription.items.map((it, idx) => ({
            id: it.id,
            medication_name: it.medication_name || "",
            active_ingredient: it.active_ingredient || "",
            strength: it.strength || "",
            dosage_form: it.dosage_form || ("" as any),
            dose: it.dose || "",
            route: it.route || it.route_or_instructions || "",
            frequency: it.frequency || "",
            duration: it.duration || "",
            quantity: it.quantity || "",
            instructions: it.instructions || "",
            display_order: it.display_order ?? idx + 1,
          }))
        );
      }
      if (initialPrescription.general_instructions) {
        setGeneralInstructions(initialPrescription.general_instructions);
      }
      return;
    }

    if (visitId) {
      setIsLoading(true);
      fetchPrescriptionByVisitId(visitId)
        .then((rx) => {
          if (!isCurrent) return;
          if (rx) {
            setPrescription(rx);
            if (rx.items && rx.items.length > 0) {
              setItems(
                rx.items.map((it, idx) => ({
                  id: it.id,
                  medication_name: it.medication_name || "",
                  active_ingredient: it.active_ingredient || "",
                  strength: it.strength || "",
                  dosage_form: it.dosage_form || ("" as any),
                  dose: it.dose || "",
                  route: it.route || it.route_or_instructions || "",
                  frequency: it.frequency || "",
                  duration: it.duration || "",
                  quantity: it.quantity || "",
                  instructions: it.instructions || "",
                  display_order: it.display_order ?? idx + 1,
                }))
              );
            }
            if (rx.general_instructions) {
              setGeneralInstructions(rx.general_instructions);
            }
          }
        })
        .catch((err) => {
          console.warn("Could not fetch existing prescription:", err);
        })
        .finally(() => {
          if (isCurrent) setIsLoading(false);
        });
    }

    return () => {
      isCurrent = false;
    };
  }, [visitId, initialPrescription]);

  // Add a new medication line
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        medication_name: "",
        active_ingredient: "",
        strength: "",
        dosage_form: "" as any,
        dose: "",
        route: "",
        frequency: "",
        duration: "",
        quantity: "",
        instructions: "",
        display_order: prev.length + 1,
      },
    ]);
  };

  // Remove a medication line
  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Update item field
  const handleUpdateItem = (index: number, field: keyof PrescriptionItemInput, value: any) => {
    setItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, [field]: value } : it))
    );
  };

  // Save as Draft
  const handleSaveDraft = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavingDraft(true);

    // Include items where doctor started typing medication_name
    const draftItems = items
      .filter((it) => it.medication_name && it.medication_name.trim() !== "")
      .map((it, idx) => ({
        ...it,
        display_order: idx + 1,
      }));

    try {
      const saved = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        diagnosis_id: diagnosisId || null,
        general_instructions: generalInstructions.trim() || null,
        items: draftItems,
        action: "draft",
      });

      setPrescription(saved);
      setSuccessMessage(language === "ar" ? "تم حفظ مسودة الوصفة الطبية بنجاح" : "Prescription draft saved successfully");
      if (onPrescriptionChanged) onPrescriptionChanged(saved);
    } catch (err: any) {
      setErrorMessage(err.message || (language === "ar" ? "فشل حفظ مسودة الوصفة" : "Failed to save draft"));
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Issue & Finalize Prescription
  const handleIssuePrescription = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    // Strict Validation for Issuance
    const filledItems = items.filter((it) => it.medication_name && it.medication_name.trim() !== "");
    if (filledItems.length === 0) {
      setErrorMessage(
        language === "ar"
          ? "لا يمكن إصدار وصفة طبية فارغة. يرجى إضافة دواء واحد على الأقل مع اسم الدواء"
          : "Cannot issue an empty prescription. Please add at least one medication."
      );
      return;
    }

    for (let i = 0; i < filledItems.length; i++) {
      const it = filledItems[i];
      if (!it.dosage_form) {
        setErrorMessage(
          language === "ar"
            ? `يرجى اختيار الشكل الدوائي للدواء #${i + 1} (${it.medication_name})`
            : `Please select dosage form for medication #${i + 1}`
        );
        return;
      }
      if (!it.frequency?.trim() || !it.duration?.trim()) {
        setErrorMessage(
          language === "ar"
            ? `يرجى تحديد التكرار ومدة العلاج للدواء #${i + 1} (${it.medication_name})`
            : `Please specify frequency and duration for medication #${i + 1}`
        );
        return;
      }
    }

    setIsIssuing(true);

    try {
      const issued = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        diagnosis_id: diagnosisId || null,
        general_instructions: generalInstructions.trim() || null,
        items: filledItems,
        action: "issue",
      });

      setPrescription(issued);
      setSuccessMessage(
        language === "ar"
          ? "تم اعتماد وإصدار الوصفة الطبية بنجاح! أصبحت جاهزة للطباعة."
          : "Prescription issued successfully! Ready for printing."
      );
      if (onPrescriptionChanged) onPrescriptionChanged(issued);
    } catch (err: any) {
      setErrorMessage(err.message || (language === "ar" ? "فشل إصدار الوصفة الطبية" : "Failed to issue prescription"));
    } finally {
      setIsIssuing(false);
    }
  };

  // Cancel Prescription Handler
  const handleConfirmCancel = async () => {
    if (!prescription) return;
    setIsCancelling(true);
    setErrorMessage(null);

    try {
      const cancelled = await cancelPrescription(prescription.id, cancellationReason);
      setPrescription(cancelled);
      setIsCancelModalOpen(false);
      setSuccessMessage(language === "ar" ? "تم إلغاء الوصفة الطبية بنجاح" : "Prescription cancelled successfully");
      if (onPrescriptionChanged) onPrescriptionChanged(cancelled);
    } catch (err: any) {
      setErrorMessage(err.message || (language === "ar" ? "فشل إلغاء الوصفة الطبية" : "Failed to cancel prescription"));
    } finally {
      setIsCancelling(false);
    }
  };

  const isIssued = prescription?.status === "issued";
  const isCancelled = prescription?.status === "cancelled";
  const isDraft = prescription?.status === "draft";
  const isLocked = isIssued || isCancelled || readOnly;

  // Check if saved draft has incomplete items
  const hasNoSavedItems = !prescription?.items || prescription.items.length === 0;
  const hasIncompleteSavedItem = prescription?.items?.some(
    (it) => !it.medication_name?.trim() || !it.dosage_form || !it.frequency?.trim() || !it.duration?.trim()
  );
  const isDraftIncomplete = isDraft && (hasNoSavedItems || hasIncompleteSavedItem);

  return (
    <Card className="border border-slate-200 shadow-sm space-y-5 bg-white p-5 sm:p-6 rounded-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-clinic-100 text-clinic-700 flex items-center justify-center font-bold">
            <Pill className="w-5 h-5 text-clinic-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900">
                {language === "ar" ? "الوصفة الطبية الإلكترونية" : "Electronic Prescription (e-Rx)"}
              </h3>
              {isIssued && (
                <Badge variant="success" size="sm" className="font-bold">
                  {language === "ar" ? "وصفة صادرة ومعتمدة" : "Issued"}
                </Badge>
              )}
              {isCancelled && (
                <Badge variant="danger" size="sm" className="font-bold">
                  {language === "ar" ? "وصفة ملغاة" : "Cancelled"}
                </Badge>
              )}
              {isDraft && isDraftIncomplete && (
                <Badge variant="warning" size="sm" className="font-bold">
                  {language === "ar" ? "مسودة غير مكتملة" : "Draft (Incomplete)"}
                </Badge>
              )}
              {isDraft && !isDraftIncomplete && (
                <Badge variant="info" size="sm" className="font-bold">
                  {language === "ar" ? "مسودة جاهزة للإصدار" : "Draft (Ready to Issue)"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {language === "ar"
                ? "إدارة بنود الأدوية والجرعات والتعليمات السريرية المعتمدة"
                : "Manage medications, dosages, and clinical instructions"}
            </p>
          </div>
        </div>

        {/* Action Buttons for Issued Prescription */}
        {isIssued && (
          <div className="flex items-center gap-2">
            <Link href={`/secretary/prescriptions/${visitId}/print`}>
              <Button variant="outline" size="sm" className="font-bold gap-1.5 border-clinic-300 text-clinic-800">
                <Printer className="w-4 h-4 text-clinic-600" />
                <span>{language === "ar" ? "طباعة الوصفة" : "Print Prescription"}</span>
              </Button>
            </Link>

            {!readOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCancelModalOpen(true)}
                className="font-bold gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                <Ban className="w-4 h-4 text-rose-600" />
                <span>{language === "ar" ? "إلغاء الوصفة" : "Cancel Prescription"}</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl text-xs font-bold flex items-center gap-2.5">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {isCancelled && prescription?.cancellation_reason && (
        <div className="p-3 bg-slate-100 rounded-2xl text-xs text-slate-700 border border-slate-200">
          <span className="font-bold text-slate-900">{language === "ar" ? "سبب الإلغاء: " : "Cancellation Reason: "}</span>
          <span>{prescription.cancellation_reason}</span>
        </div>
      )}

      {/* Medication Lines */}
      <div className="space-y-4">
        {items.map((item, index) => (
          <div
            key={item.id || `item-${index}`}
            className={`p-4 rounded-2xl border transition-all ${
              isLocked
                ? "bg-slate-50/70 border-slate-200"
                : "bg-slate-50 border-slate-200/90 hover:border-clinic-300 shadow-2xs"
            }`}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black bg-clinic-600 text-white px-2.5 py-0.5 rounded-lg">
                  {language === "ar" ? `دواء #${index + 1}` : `Medication #${index + 1}`}
                </span>
                {item.active_ingredient && (
                  <span className="text-[11px] text-slate-500 font-semibold font-mono">
                    ({item.active_ingredient})
                  </span>
                )}
              </div>

              {!isLocked && items.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveItem(index)}
                  className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                  title={language === "ar" ? "حذف هذا الدواء" : "Remove medication"}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Row 1: Name, Active Ingredient, Strength, Dosage Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Input
                label={language === "ar" ? "اسم الدواء (العلمي/التجاري)" : "Medication Name"}
                required
                disabled={isLocked}
                placeholder="مثال: Paracetamol / Amoxicillin"
                value={item.medication_name}
                onChange={(e) => handleUpdateItem(index, "medication_name", e.target.value)}
                className="font-bold text-slate-900 text-xs"
              />

              <Input
                label={language === "ar" ? "المادة الفعالة (اختياري)" : "Active Ingredient"}
                disabled={isLocked}
                placeholder="مثال: Acetaminophen"
                value={item.active_ingredient || ""}
                onChange={(e) => handleUpdateItem(index, "active_ingredient", e.target.value)}
                className="text-xs font-medium"
              />

              <Input
                label={language === "ar" ? "التركيز (Strength)" : "Strength"}
                disabled={isLocked}
                placeholder="مثال: 120mg / 5ml أو 250mg"
                value={item.strength || ""}
                onChange={(e) => handleUpdateItem(index, "strength", e.target.value)}
                className="text-xs font-mono"
              />

              <div className="space-y-1.5 text-right">
                <label className="block text-xs font-bold text-slate-700">
                  {language === "ar" ? "الشكل الدوائي" : "Dosage Form"}
                </label>
                <select
                  disabled={isLocked}
                  className="block w-full rounded-xl border border-slate-200 bg-white text-slate-800 text-xs h-11 px-3 focus:outline-none focus:ring-2 focus:ring-clinic-500 disabled:bg-slate-100 disabled:text-slate-500 font-bold"
                  value={item.dosage_form || ""}
                  onChange={(e) => handleUpdateItem(index, "dosage_form", e.target.value as DosageForm)}
                >
                  <option value="">{language === "ar" ? "-- اختر الشكل الدوائي --" : "-- Select Dosage Form --"}</option>
                  {Object.entries(DOSAGE_FORM_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Dose, Route, Frequency, Duration, Quantity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-3">
              <Input
                label={language === "ar" ? "الجرعة" : "Dose"}
                disabled={isLocked}
                placeholder="مثال: 5 مل أو 1 قرص"
                value={item.dose || ""}
                onChange={(e) => handleUpdateItem(index, "dose", e.target.value)}
                className="text-xs font-semibold"
              />

              <div className="space-y-1.5 text-right">
                <label className="block text-xs font-bold text-slate-700">
                  {language === "ar" ? "طريق الاستخدام" : "Route"}
                </label>
                <select
                  disabled={isLocked}
                  className="block w-full rounded-xl border border-slate-200 bg-white text-slate-800 text-xs h-11 px-3 focus:outline-none focus:ring-2 focus:ring-clinic-500 disabled:bg-slate-100 disabled:text-slate-500 font-medium"
                  value={item.route || ""}
                  onChange={(e) => handleUpdateItem(index, "route", e.target.value)}
                >
                  <option value="">{language === "ar" ? "-- اختياري: اختر الطريق --" : "-- Optional: Select Route --"}</option>
                  {ROUTE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={language === "ar" ? opt.labelAr : opt.labelEn}>
                      {language === "ar" ? opt.labelAr : opt.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label={language === "ar" ? "عدد مرات الاستخدام (التكرار)" : "Frequency"}
                required
                disabled={isLocked}
                placeholder="مثال: 3 مرات يومياً / كل 8 ساعات"
                value={item.frequency}
                onChange={(e) => handleUpdateItem(index, "frequency", e.target.value)}
                className="text-xs font-semibold"
              />

              <Input
                label={language === "ar" ? "المدة" : "Duration"}
                required
                disabled={isLocked}
                placeholder="مثال: 5 أيام / أسبوع"
                value={item.duration}
                onChange={(e) => handleUpdateItem(index, "duration", e.target.value)}
                className="text-xs font-semibold"
              />

              <Input
                label={language === "ar" ? "الكمية (اختياري)" : "Quantity"}
                disabled={isLocked}
                placeholder="مثال: 1 زجاجة / 2 عبوة"
                value={item.quantity || ""}
                onChange={(e) => handleUpdateItem(index, "quantity", e.target.value)}
                className="text-xs"
              />
            </div>

            {/* Row 3: Special Instructions */}
            <div className="pt-3">
              <Input
                label={language === "ar" ? "تعليمات خاصة بالدواء (اختياري)" : "Instructions"}
                disabled={isLocked}
                placeholder="مثال: بعد الأكل بنصف ساعة / قبل النوم مباشرة"
                value={item.instructions || ""}
                onChange={(e) => handleUpdateItem(index, "instructions", e.target.value)}
                className="text-xs font-medium"
              />
            </div>
          </div>
        ))}

        {!isLocked && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddItem}
            className="w-full border-dashed border-2 py-3 text-clinic-700 font-black gap-2 hover:bg-clinic-50/50"
          >
            <Plus className="w-4 h-4" />
            <span>{language === "ar" ? "إضافة دواء آخر للوصفة" : "Add Another Medication"}</span>
          </Button>
        )}

        {/* General Instructions */}
        <div className="pt-2">
          <Textarea
            label={language === "ar" ? "تعليمات وإرشادات عامة للأهل والطفل" : "General Prescription Instructions"}
            disabled={isLocked}
            rows={2}
            value={generalInstructions}
            onChange={(e) => setGeneralInstructions(e.target.value)}
            className="text-xs font-medium"
          />
        </div>
      </div>

      {/* Bottom Action Buttons (for Doctor when not locked) */}
      {!isLocked && (
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            disabled={isSavingDraft || isIssuing}
            onClick={handleSaveDraft}
            className="w-full sm:w-auto font-bold gap-2 text-slate-700 hover:bg-slate-50 h-12 px-6"
          >
            <Save className="w-4 h-4 text-slate-500" />
            <span>{isSavingDraft ? (language === "ar" ? "جاري الحفظ..." : "Saving Draft...") : (language === "ar" ? "حفظ كمسودة" : "Save as Draft")}</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            disabled={isSavingDraft || isIssuing}
            onClick={handleIssuePrescription}
            className="w-full sm:w-auto font-black gap-2 bg-clinic-600 hover:bg-clinic-700 h-12 px-8 shadow-sm text-sm"
          >
            <FileCheck className="w-5 h-5 ml-1" />
            <span>{isIssuing ? (language === "ar" ? "جاري الاعتماد والإصدار..." : "Issuing...") : (language === "ar" ? "اعتماد وإصدار الوصفة" : "Approve & Issue Prescription")}</span>
          </Button>
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title={language === "ar" ? "تأكيد إلغاء الوصفة الطبية" : "Confirm Prescription Cancellation"}
        description={
          language === "ar"
            ? "هل أنت متأكد من رغبتك بإلغاء هذه الوصفة الصادرة؟ لا يمكن التراجع عن هذا الإجراء."
            : "Are you sure you want to cancel this issued prescription?"
        }
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 space-y-1">
            <div className="flex items-center gap-2 font-black">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>{language === "ar" ? "تنبيه طبي" : "Medical Alert"}</span>
            </div>
            <p>
              {language === "ar"
                ? "سيتم تحويل حالة الوصفة إلى ملغاة في سجل الطفل وشاشة السكرتارية لمنع صرفها أو طباعتها."
                : "The prescription will be marked as cancelled in the child's record and reception view."}
            </p>
          </div>

          <Textarea
            label={language === "ar" ? "سبب الإلغاء (اختياري)" : "Cancellation Reason (Optional)"}
            placeholder={language === "ar" ? "اكتب سبب الإلغاء أو تعديل الخطة العلاجية..." : "Reason for cancellation..."}
            value={cancellationReason}
            onChange={(e) => setCancellationReason(e.target.value)}
            className="text-xs"
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsCancelModalOpen(false)}>
              {language === "ar" ? "تراجع" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={isCancelling}
              onClick={handleConfirmCancel}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              {isCancelling ? (language === "ar" ? "جاري الإلغاء..." : "Cancelling...") : (language === "ar" ? "تأكيد الإلغاء" : "Confirm Cancellation")}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

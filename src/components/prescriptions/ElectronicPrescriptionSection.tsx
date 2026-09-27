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
  fetchPrescriptionRevisions,
  createPrescriptionRevision,
  PrescriptionItemInput,
} from "@/services/prescriptionService";
import { MedicationAutocompleteInput } from "./MedicationAutocompleteInput";
import {
  DrugSearchResult,
  mapDosageFormToFormType,
  mapRouteToStandardRoute,
  ROUTE_OPTIONS,
} from "@/services/drugSearchService";
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
  GitBranch,
  History,
  RotateCcw,
} from "lucide-react";

export interface ElectronicPrescriptionSectionProps {
  visitId: string;
  patientId: string;
  diagnosisId?: string | null;
  initialPrescription?: Prescription | null;
  readOnly?: boolean;
  onPrescriptionChanged?: (rx: Prescription) => void;
}

function mapPrescriptionToFormItems(rx?: Prescription | null): PrescriptionItemInput[] {
  if (rx?.items && rx.items.length > 0) {
    return rx.items.map((it, idx) => ({
      id: it.id,
      catalog_product_id: it.catalog_product_id || null,
      is_custom_medication: it.is_custom_medication !== undefined ? it.is_custom_medication : (it.catalog_product_id ? false : true),
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
    }));
  }
  return [
    {
      catalog_product_id: null,
      is_custom_medication: true,
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
  ];
}

/**
 * Check if a single prescription item has all mandatory fields completed
 */
export function isPrescriptionItemComplete(it: PrescriptionItemInput): boolean {
  const hasMedName = Boolean(it.medication_name && it.medication_name.trim().length > 0);
  const hasDosageForm = Boolean(it.dosage_form && String(it.dosage_form).trim().length > 0);
  const hasFrequency = Boolean(it.frequency && it.frequency.trim().length > 0);
  const hasDuration = Boolean(it.duration && it.duration.trim().length > 0);

  return hasMedName && hasDosageForm && hasFrequency && hasDuration;
}

/**
 * Check if a prescription item has been touched/has any field entered
 */
export function isPrescriptionItemTouched(it: PrescriptionItemInput): boolean {
  return Boolean(
    (it.medication_name && it.medication_name.trim().length > 0) ||
    (it.dosage_form && String(it.dosage_form).trim().length > 0) ||
    (it.frequency && it.frequency.trim().length > 0) ||
    (it.duration && it.duration.trim().length > 0) ||
    (it.active_ingredient && it.active_ingredient.trim().length > 0) ||
    (it.strength && it.strength.trim().length > 0) ||
    (it.dose && it.dose.trim().length > 0) ||
    (it.route && it.route.trim().length > 0) ||
    (it.quantity && it.quantity.trim().length > 0) ||
    (it.instructions && it.instructions.trim().length > 0)
  );
}

/**
 * Calculate readiness of prescription draft items in real time based on current local state
 */
export function isPrescriptionDraftReady(items: PrescriptionItemInput[]): boolean {
  if (!items || items.length === 0) return false;
  const touched = items.filter(isPrescriptionItemTouched);
  if (touched.length === 0) return false;
  return touched.every(isPrescriptionItemComplete);
}

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
  const [items, setItems] = useState<PrescriptionItemInput[]>(() => mapPrescriptionToFormItems(initialPrescription));
  const [generalInstructions, setGeneralInstructions] = useState<string>(
    initialPrescription?.general_instructions || ""
  );

  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Revisions & Auditable Amendment States
  const [revisions, setRevisions] = useState<Prescription[]>([]);
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [isCreatingRevision, setIsCreatingRevision] = useState(false);
  const [isConfirmIssueModalOpen, setIsConfirmIssueModalOpen] = useState(false);

  // Cancellation Modal State
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  // Load all revisions for this visit
  const loadRevisions = React.useCallback(async (targetVisitId: string) => {
    try {
      const list = await fetchPrescriptionRevisions(targetVisitId);
      setRevisions(list);
    } catch (err) {
      console.warn("Could not fetch prescription revisions:", err);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;
    if (visitId) {
      fetchPrescriptionRevisions(visitId)
        .then((list) => {
          if (isCurrent) setRevisions(list);
        })
        .catch((err) => {
          console.warn("Could not fetch prescription revisions:", err);
        });
    }
    return () => {
      isCurrent = false;
    };
  }, [visitId]);

  // Stable Hydration tracking
  const lastHydratedVisitIdRef = React.useRef<string | null>(null);
  const savedBaselineRef = React.useRef<{
    items: PrescriptionItemInput[];
    generalInstructions: string;
  } | null>(null);

  // Track previous props to adjust state during render phase safely
  const [prevVisitId, setPrevVisitId] = useState(visitId);
  const [prevInitialRx, setPrevInitialRx] = useState(initialPrescription);

  // When visitId changes, reset editable state to the new visit's prescription
  if (visitId !== prevVisitId) {
    setPrevVisitId(visitId);
    setPrevInitialRx(initialPrescription);
    const rx =
      initialPrescription && initialPrescription.visit_id === visitId
        ? initialPrescription
        : null;
    setPrescription(rx);
    const mapped = mapPrescriptionToFormItems(rx);
    setItems(mapped);
    const instructions = rx?.general_instructions || "";
    setGeneralInstructions(instructions);
    setIsDirty(false);
    setErrorMessage(null);
    setSuccessMessage(null);
  } else if (
    initialPrescription &&
    initialPrescription.visit_id === visitId &&
    initialPrescription !== prevInitialRx &&
    !isDirty
  ) {
    // When late-arriving initialPrescription arrives and user hasn't edited anything
    setPrevInitialRx(initialPrescription);
    if (
      prescription === null ||
      prescription.id !== initialPrescription.id ||
      prescription.status !== initialPrescription.status
    ) {
      setPrescription(initialPrescription);
      const mapped = mapPrescriptionToFormItems(initialPrescription);
      setItems(mapped);
      const instructions = initialPrescription.general_instructions || "";
      setGeneralInstructions(instructions);
    }
  }

  // Update baseline ref when prescription or baseline items change
  useEffect(() => {
    savedBaselineRef.current = {
      items,
      generalInstructions,
    };
    lastHydratedVisitIdRef.current = visitId;
  }, [visitId, items, generalInstructions]);

  // Fetch prescription asynchronously from server if not provided via initialPrescription
  useEffect(() => {
    let isCurrent = true;

    if (visitId && (!initialPrescription || initialPrescription.visit_id !== visitId)) {
      fetchPrescriptionByVisitId(visitId)
        .then((rx) => {
          if (!isCurrent) return;
          if (rx) {
            setPrescription(rx);
            const mapped = mapPrescriptionToFormItems(rx);
            setItems(mapped);
            const instructions = rx.general_instructions || "";
            setGeneralInstructions(instructions);
          } else {
            setPrescription(null);
            const mapped = mapPrescriptionToFormItems(null);
            setItems(mapped);
            setGeneralInstructions("");
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

  // Browser BeforeUnload Guard when there are unsaved edits
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !readOnly && prescription?.status !== "issued" && prescription?.status !== "cancelled") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, readOnly, prescription?.status]);

  // Add a new medication line
  const handleAddItem = () => {
    setIsDirty(true);
    setItems((prev) => [
      ...prev,
      {
        catalog_product_id: null,
        is_custom_medication: true,
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
    setIsDirty(true);
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Update item field
  const handleUpdateItem = (index: number, field: keyof PrescriptionItemInput, value: any) => {
    setIsDirty(true);
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        if (field === "medication_name") {
          // عندما يعدّل الطبيب اسم الدواء يدويًا بعد اختيار نتيجة:
          // امسح catalog_product_id واجعل is_custom_medication = true
          // دون مسح بقية الحقول تلقائيًا
          return {
            ...it,
            medication_name: value,
            catalog_product_id: null,
            is_custom_medication: true,
          };
        }
        return { ...it, [field]: value };
      })
    );
  };

  // اختيار دواء من الكتالوج عبر قائمة الإكمال التلقائي
  const handleSelectMedicationResult = (index: number, drug: DrugSearchResult) => {
    setIsDirty(true);
    const convertedForm = mapDosageFormToFormType(drug.dosage_form);
    const convertedRoute = mapRouteToStandardRoute(drug.route);

    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        return {
          ...it,
          catalog_product_id: drug.product_id,
          is_custom_medication: false,
          medication_name: drug.display_name,
          active_ingredient: drug.active_ingredient || it.active_ingredient || "",
          strength: drug.strength || it.strength || "",
          dosage_form: convertedForm || it.dosage_form,
          route: convertedRoute || it.route,
        };
      })
    );
  };

  // Switch active viewed revision
  const handleSelectRevision = (selectedRx: Prescription) => {
    setPrescription(selectedRx);
    const mapped = mapPrescriptionToFormItems(selectedRx);
    setItems(mapped);
    setGeneralInstructions(selectedRx.general_instructions || "");
    setIsDirty(false);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Start new revision from issued prescription (Doctor only)
  const handleStartRevision = async () => {
    if (!prescription) return;
    const cleanReason = revisionReason.trim();
    if (cleanReason.length < 3) {
      setErrorMessage(
        language === "ar"
          ? "سبب التعديل إلزامي ويجب ألا يقل عن 3 أحرف"
          : "Revision reason is required (at least 3 characters)"
      );
      return;
    }

    setIsCreatingRevision(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const newDraft = await createPrescriptionRevision(prescription.id, cleanReason);
      setPrescription(newDraft);
      const mapped = mapPrescriptionToFormItems(newDraft);
      setItems(mapped);
      setGeneralInstructions(newDraft.general_instructions || "");
      setIsDirty(false);
      setIsRevisionModalOpen(false);
      setRevisionReason("");
      setSuccessMessage(
        language === "ar"
          ? "تم إنشاء مسودة مراجعة جديدة بنجاح. أنت الآن تعدل النسخة الجديدة وستبقى النسخة الأصلية محفوظة."
          : "New revision draft created. You are now editing the new revision while the original is preserved."
      );
      await loadRevisions(visitId);
      if (onPrescriptionChanged) onPrescriptionChanged(newDraft);
    } catch (err: any) {
      setErrorMessage(err.message || (language === "ar" ? "فشل إنشاء مراجعة للوصفة" : "Failed to create revision"));
    } finally {
      setIsCreatingRevision(false);
    }
  };

  // Save as Draft
  const handleSaveDraft = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavingDraft(true);

    // Include items where doctor started typing medication_name
    const draftItems: PrescriptionItemInput[] = items
      .filter((it) => it.medication_name && it.medication_name.trim() !== "")
      .map((it, idx) => ({
        ...it,
        catalog_product_id: it.catalog_product_id || null,
        is_custom_medication: it.is_custom_medication !== undefined ? it.is_custom_medication : (it.catalog_product_id ? false : true),
        medication_name: it.medication_name.trim(),
        active_ingredient: it.active_ingredient?.trim() || null,
        strength: it.strength?.trim() || null,
        dosage_form: it.dosage_form || null,
        dose: it.dose?.trim() || null,
        route: it.route?.trim() || null,
        frequency: it.frequency ? it.frequency.trim() : null,
        duration: it.duration ? it.duration.trim() : null,
        quantity: it.quantity?.trim() || null,
        instructions: it.instructions?.trim() || null,
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
        prescription_id: prescription?.id,
      });

      setPrescription(saved);
      const savedMapped = mapPrescriptionToFormItems(saved);
      setItems(savedMapped);
      savedBaselineRef.current = {
        items: savedMapped,
        generalInstructions: generalInstructions.trim(),
      };
      setIsDirty(false); // Clean dirty state after confirmed save
      setSuccessMessage(language === "ar" ? "تم حفظ مسودة الوصفة الطبية بنجاح" : "Prescription draft saved successfully");
      await loadRevisions(visitId);
      if (onPrescriptionChanged) onPrescriptionChanged(saved);
    } catch (err: any) {
      // Retain doctor's typed items in state and keep isDirty
      setErrorMessage(err.message || (language === "ar" ? "فشل حفظ مسودة الوصفة" : "Failed to save draft"));
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Validation before Issuing
  const validateBeforeIssue = (): PrescriptionItemInput[] | null => {
    setSuccessMessage(null);
    setErrorMessage(null);

    const filledItems = items.filter((it) => it.medication_name && it.medication_name.trim() !== "");
    if (filledItems.length === 0) {
      setErrorMessage(
        language === "ar"
          ? "لا يمكن إصدار وصفة طبية فارغة: يرجى إضافة دواء واحد على الأقل مع اسم الدواء وتفاصيله العلاجية."
          : "Cannot issue an empty prescription: Please add at least one medication with required details."
      );
      return null;
    }

    for (let i = 0; i < filledItems.length; i++) {
      const it = filledItems[i];
      const missingFields: string[] = [];

      if (!it.dosage_form || it.dosage_form === ("" as any)) {
        missingFields.push(language === "ar" ? "الشكل الدوائي" : "dosage form");
      }
      if (!it.frequency || it.frequency.trim() === "") {
        missingFields.push(language === "ar" ? "عدد مرات الاستخدام (التكرار)" : "frequency");
      }
      if (!it.duration || it.duration.trim() === "") {
        missingFields.push(language === "ar" ? "المدة" : "duration");
      }

      if (missingFields.length > 0) {
        let missingFieldsText = "";
        if (missingFields.length === 1) {
          missingFieldsText = missingFields[0];
        } else if (missingFields.length === 2) {
          missingFieldsText =
            language === "ar"
              ? `${missingFields[0]} و${missingFields[1]}`
              : `${missingFields[0]} and ${missingFields[1]}`;
        } else {
          const allExceptLast = missingFields.slice(0, -1).join(language === "ar" ? "، " : ", ");
          const last = missingFields[missingFields.length - 1];
          missingFieldsText =
            language === "ar"
              ? `${allExceptLast}، و${last}`
              : `${allExceptLast}, and ${last}`;
        }

        const medNameSuffix = it.medication_name?.trim() ? ` (${it.medication_name.trim()})` : "";

        setErrorMessage(
          language === "ar"
            ? `لا يمكن إصدار الوصفة: أكمل ${missingFieldsText} للدواء رقم ${i + 1}${medNameSuffix}.`
            : `Cannot issue prescription: Please complete ${missingFieldsText} for medication #${i + 1}${medNameSuffix}.`
        );

        const firstField = !it.dosage_form || it.dosage_form === ("" as any)
          ? "dosage_form"
          : !it.frequency?.trim()
          ? "frequency"
          : "duration";

        const targetEl =
          document.getElementById(`medication-item-${i}-${firstField}`) ||
          document.getElementById(`medication-item-${i}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
          if ("focus" in targetEl && typeof (targetEl as HTMLElement).focus === "function") {
            (targetEl as HTMLElement).focus();
          }
        }
        return null;
      }
    }

    return filledItems;
  };

  // Execute Issue & Finalize Prescription
  const handleExecuteIssue = async () => {
    const filledItems = validateBeforeIssue();
    if (!filledItems) return;

    setIsIssuing(true);

    try {
      const isRev = prescription?.status === "draft" && Boolean(prescription?.replaces_prescription_id);
      const issued = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        diagnosis_id: diagnosisId || null,
        general_instructions: generalInstructions.trim() || null,
        items: filledItems,
        action: "issue",
        prescription_id: prescription?.id,
      });

      setPrescription(issued);
      const mapped = mapPrescriptionToFormItems(issued);
      setItems(mapped);
      savedBaselineRef.current = {
        items: mapped,
        generalInstructions: generalInstructions.trim(),
      };
      setIsDirty(false); // Clean dirty state after issuance
      setSuccessMessage(
        isRev
          ? (language === "ar" ? "تم اعتماد النسخة المعدلة بنجاح! أصبحت جاهزة للطباعة." : "Revised prescription approved successfully! Ready for printing.")
          : (language === "ar" ? "تم اعتماد وإصدار الوصفة الطبية بنجاح! أصبحت جاهزة للطباعة." : "Prescription issued successfully! Ready for printing.")
      );
      await loadRevisions(visitId);
      if (onPrescriptionChanged) onPrescriptionChanged(issued);
    } catch (err: any) {
      setErrorMessage(err.message || (language === "ar" ? "فشل إصدار الوصفة الطبية" : "Failed to issue prescription"));
    } finally {
      setIsIssuing(false);
    }
  };

  // Issue button click handler (triggers confirmation modal for revisions)
  const handleIssuePrescription = () => {
    const filledItems = validateBeforeIssue();
    if (!filledItems) return;

    const isRev = prescription?.status === "draft" && Boolean(prescription?.replaces_prescription_id);
    if (isRev) {
      setIsConfirmIssueModalOpen(true);
    } else {
      handleExecuteIssue();
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
      setIsDirty(false);
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
  const isSuperseded = prescription?.status === "superseded";
  const isDraft = !prescription || prescription.status === "draft";
  const isRevisionDraft = isDraft && Boolean(prescription?.replaces_prescription_id);
  const isLocked = isIssued || isCancelled || isSuperseded || readOnly;

  const latestRevision = revisions.length > 0 ? (revisions.find((r) => r.status === "issued") || revisions[revisions.length - 1]) : null;

  // Real-time readiness calculation based strictly on local draft items
  const isDraftReadyToIssue = isPrescriptionDraftReady(items);

  return (
    <Card className="border border-slate-200 shadow-sm space-y-5 bg-white p-5 sm:p-6 rounded-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-clinic-100 text-clinic-700 flex items-center justify-center font-bold">
            <Pill className="w-5 h-5 text-clinic-600" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-black text-slate-900">
                {language === "ar" ? "الوصفة الطبية الإلكترونية" : "Electronic Prescription (e-Rx)"}
              </h3>
              {prescription?.revision_number && (
                <Badge variant="outline" size="sm" className="font-bold border-slate-300 text-slate-700" data-testid="rx-revision-badge">
                  {language === "ar" ? `نسخة ${prescription.revision_number}` : `Rev ${prescription.revision_number}`}
                </Badge>
              )}
              {isIssued && (
                <>
                  <Badge variant="success" size="sm" className="font-bold">
                    {language === "ar" ? "وصفة صادرة ومعتمدة" : "Issued"}
                  </Badge>
                  <Badge variant="success" size="sm" className="font-bold bg-emerald-100 text-emerald-800 border-emerald-300" data-testid="rx-active-issued-badge">
                    {language === "ar" ? "النسخة المعتمدة الحالية" : "Active Issued"}
                  </Badge>
                </>
              )}
              {isSuperseded && (
                <Badge variant="outline" size="sm" className="font-bold bg-amber-50 text-amber-900 border-amber-300" data-testid="rx-superseded-badge">
                  {language === "ar" ? "نسخة قديمة مستبدلة" : "Superseded"}
                </Badge>
              )}
              {isCancelled && (
                <Badge variant="danger" size="sm" className="font-bold">
                  {language === "ar" ? "وصفة ملغاة" : "Cancelled"}
                </Badge>
              )}
              {!isIssued && !isCancelled && !isSuperseded && !isDraftReadyToIssue && (
                <Badge variant="warning" size="sm" className="font-bold" data-testid="rx-draft-incomplete-badge">
                  {language === "ar" ? "مسودة غير مكتملة" : "Draft (Incomplete)"}
                </Badge>
              )}
              {!isIssued && !isCancelled && !isSuperseded && isDraftReadyToIssue && (
                <Badge variant="info" size="sm" className="font-bold" data-testid="rx-draft-ready-badge">
                  {language === "ar" ? "مسودة جاهزة للإصدار" : "Draft (Ready to Issue)"}
                </Badge>
              )}
              {isDirty && !isLocked && (
                <span
                  data-testid="rx-dirty-badge"
                  className="inline-flex items-center gap-1 rounded-full border bg-amber-50 text-amber-800 border-amber-300 px-2.5 py-0.5 text-xs font-bold shadow-2xs animate-pulse"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>{language === "ar" ? "تعديلات غير محفوظة" : "Unsaved Changes"}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {language === "ar"
                ? "إدارة بنود الأدوية والجرعات والتعليمات السريرية المعتمدة"
                : "Manage medications, dosages, and clinical instructions"}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Print button available for issued or superseded prescriptions */}
          {(isIssued || isSuperseded) && (
            <Link href={`/secretary/prescriptions/${visitId}/print${prescription?.id ? `?prescriptionId=${prescription.id}` : ""}`}>
              <Button variant="outline" size="sm" className="font-bold gap-1.5 border-clinic-300 text-clinic-800">
                <Printer className="w-4 h-4 text-clinic-600" />
                <span>{language === "ar" ? "طباعة الوصفة" : "Print Prescription"}</span>
              </Button>
            </Link>
          )}

          {/* Revise Prescription (Amend) - Doctor only, when prescription is issued */}
          {isIssued && !readOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setRevisionReason("");
                setIsRevisionModalOpen(true);
              }}
              data-testid="edit-prescription-btn"
              className="font-bold gap-1.5 border-clinic-400 text-clinic-800 hover:bg-clinic-50"
            >
              <GitBranch className="w-4 h-4 text-clinic-600" />
              <span>{language === "ar" ? "تعديل الوصفة" : "Revise Prescription"}</span>
            </Button>
          )}

          {/* Cancel button - Doctor only, when issued */}
          {isIssued && !readOnly && (
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
      </div>

      {/* Revisions History Navigation Bar */}
      {revisions.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-xs">
          <span className="font-bold text-slate-600 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-slate-500" />
            <span>{language === "ar" ? "سجل النسخ:" : "Revision History:"}</span>
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {revisions.map((rev) => {
              const isSelected = rev.id === prescription?.id;
              const isRevIssued = rev.status === "issued";
              const isRevSuperseded = rev.status === "superseded";
              const isRevDraft = rev.status === "draft";
              return (
                <button
                  key={rev.id}
                  type="button"
                  onClick={() => handleSelectRevision(rev)}
                  data-testid={`rx-revision-tab-${rev.revision_number}`}
                  className={`px-3 py-1 rounded-xl font-bold transition-all text-xs flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? "bg-clinic-600 text-white shadow-xs"
                      : "bg-white text-slate-700 border border-slate-200 hover:border-clinic-400"
                  }`}
                >
                  <span>{language === "ar" ? `نسخة ${rev.revision_number || 1}` : `Rev ${rev.revision_number || 1}`}</span>
                  {isRevIssued && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${isSelected ? "bg-clinic-800 text-clinic-100" : "bg-emerald-100 text-emerald-800"}`}>
                      {language === "ar" ? "المعتمدة" : "Active"}
                    </span>
                  )}
                  {isRevSuperseded && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${isSelected ? "bg-clinic-800 text-clinic-100" : "bg-slate-200 text-slate-600"}`}>
                      {language === "ar" ? "مستبدلة" : "Superseded"}
                    </span>
                  )}
                  {isRevDraft && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${isSelected ? "bg-clinic-800 text-clinic-100" : "bg-amber-100 text-amber-800"}`}>
                      {language === "ar" ? "مسودة" : "Draft"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Revision Draft Banner */}
      {isRevisionDraft && (
        <div
          data-testid="rx-revision-draft-banner"
          className="p-4 bg-sky-50 border-2 border-sky-300 text-sky-950 rounded-2xl text-xs font-bold flex items-start gap-2.5 shadow-sm animate-in fade-in"
        >
          <GitBranch className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-black text-sm">
                {language === "ar"
                  ? `أنت تعدّل مسودة مراجعة جديدة (نسخة ${prescription?.revision_number || 2})`
                  : `Editing Revision Draft (Rev ${prescription?.revision_number || 2})`}
              </span>
              <span className="bg-sky-200 text-sky-900 px-2 py-0.5 rounded-md text-[11px] font-bold">
                {language === "ar" ? "مسودة قيد التعديل" : "Revision Draft"}
              </span>
            </div>
            <p className="text-sky-800 font-medium">
              {language === "ar"
                ? "أنت تعدّل نسخة جديدة. ستبقى الوصفة الأصلية محفوظة."
                : "You are editing a new revision. The original prescription remains preserved."}
            </p>
            {prescription?.revision_reason && (
              <p className="text-sky-900 text-[11px] font-semibold">
                <span className="font-bold">{language === "ar" ? "سبب التعديل: " : "Revision Reason: "}</span>
                {prescription.revision_reason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Superseded Warning Banner */}
      {isSuperseded && (
        <div
          data-testid="rx-superseded-banner"
          className="p-4 bg-amber-50 border-2 border-amber-400 text-amber-950 rounded-2xl text-xs font-bold flex items-start gap-2.5 shadow-sm animate-in fade-in"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-black text-sm text-amber-950">
                {language === "ar" ? "تم استبدال هذه الوصفة بنسخة أحدث" : "This prescription has been superseded by a newer revision"}
              </span>
              <span className="bg-amber-200 text-amber-900 px-2 py-0.5 rounded-md text-[11px] font-bold">
                {language === "ar" ? `نسخة ${prescription?.revision_number || 1} (قديمة ومستبدلة)` : `Rev ${prescription?.revision_number || 1} (Superseded)`}
              </span>
            </div>
            <p className="text-amber-800 font-medium">
              {language === "ar"
                ? "هذه النسخة أصبحت للأرشيف التاريخي فقط وغير معتمدة للصرف أو الاستخدام السريري الحالي."
                : "This revision is archived for historical audit only and is no longer valid for dispensing."}
            </p>
            {latestRevision && latestRevision.id !== prescription?.id && (
              <div className="pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleSelectRevision(latestRevision)}
                  className="border-amber-400 text-amber-950 hover:bg-amber-100 font-black text-xs gap-1.5"
                  data-testid="switch-to-latest-rx-btn"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {language === "ar"
                      ? `الانتقال إلى النسخة الأحدث المعتمدة (نسخة ${latestRevision.revision_number || 2})`
                      : `Switch to latest revision (Rev ${latestRevision.revision_number || 2})`}
                  </span>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alerts */}
      {errorMessage && (
        <div
          data-testid="rx-error-alert"
          className="p-4 bg-rose-50 border-2 border-rose-300 text-rose-900 rounded-2xl text-xs font-bold flex items-start gap-2.5 shadow-sm animate-in fade-in"
        >
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="leading-relaxed font-bold">{errorMessage}</p>
          </div>
        </div>
      )}

      {!errorMessage && successMessage && (
        <div
          data-testid="rx-success-alert"
          className="p-4 bg-emerald-50 border-2 border-emerald-300 text-emerald-900 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-sm"
        >
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
            id={`medication-item-${index}`}
            key={item.id ? `persisted-${item.id}` : `draft-item-${index}`}
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
              <MedicationAutocompleteInput
                label={language === "ar" ? "اسم الدواء (العلمي/التجاري)" : "Medication Name"}
                required
                disabled={isLocked}
                placeholder="مثال: Paracetamol / Amoxicillin"
                value={item.medication_name}
                isCustomMedication={item.is_custom_medication ?? !item.catalog_product_id}
                hasCatalogLink={Boolean(item.catalog_product_id)}
                language={language}
                onChange={(val) => handleUpdateItem(index, "medication_name", val)}
                onSelectResult={(drug) => handleSelectMedicationResult(index, drug)}
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
                  id={`medication-item-${index}-dosage_form`}
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
                  id={`medication-item-${index}-route`}
                  data-testid={`medication-item-${index}-route`}
                  disabled={isLocked}
                  className="block w-full rounded-xl border border-slate-200 bg-white text-slate-800 text-xs h-11 px-3 focus:outline-none focus:ring-2 focus:ring-clinic-500 disabled:bg-slate-100 disabled:text-slate-500 font-medium"
                  value={mapRouteToStandardRoute(item.route) || item.route || ""}
                  onChange={(e) => handleUpdateItem(index, "route", e.target.value)}
                >
                  <option value="">{language === "ar" ? "-- اختياري: اختر الطريق --" : "-- Optional: Select Route --"}</option>
                  {ROUTE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {language === "ar" ? opt.labelAr : opt.labelEn}
                    </option>
                  ))}
                  {Boolean(item.route && !ROUTE_OPTIONS.some((opt) => opt.value === mapRouteToStandardRoute(item.route))) && (
                    <option value={item.route || ""}>{item.route}</option>
                  )}
                </select>
              </div>

              <div className="space-y-1.5 text-right">
                <Input
                  id={`medication-item-${index}-frequency`}
                  label={language === "ar" ? "عدد مرات الاستخدام (التكرار)" : "Frequency"}
                  required
                  disabled={isLocked}
                  placeholder="مثال: 3 مرات يومياً / كل 8 ساعات"
                  value={item.frequency || ""}
                  onChange={(e) => handleUpdateItem(index, "frequency", e.target.value)}
                  className="text-xs font-semibold"
                />
              </div>

              <div className="space-y-1.5 text-right">
                <Input
                  id={`medication-item-${index}-duration`}
                  label={language === "ar" ? "المدة" : "Duration"}
                  required
                  disabled={isLocked}
                  placeholder="مثال: 5 أيام / أسبوع"
                  value={item.duration || ""}
                  onChange={(e) => handleUpdateItem(index, "duration", e.target.value)}
                  className="text-xs font-semibold"
                />
              </div>

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
            onChange={(e) => {
              setIsDirty(true);
              setGeneralInstructions(e.target.value);
            }}
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
            data-testid="save-draft-prescription-btn"
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
            data-testid="issue-prescription-btn"
            className="w-full sm:w-auto font-black gap-2 bg-clinic-600 hover:bg-clinic-700 h-12 px-8 shadow-sm text-sm"
          >
            <FileCheck className="w-5 h-5 ml-1" />
            <span>
              {isIssuing
                ? (language === "ar" ? "جاري الاعتماد والإصدار..." : "Issuing...")
                : isRevisionDraft
                ? (language === "ar" ? "اعتماد النسخة المعدلة" : "Approve Revised Prescription")
                : (language === "ar" ? "اعتماد وإصدار الوصفة" : "Approve & Issue Prescription")}
            </span>
          </Button>
        </div>
      )}

      {/* Revision Creation Modal (Doctor only) */}
      <Modal
        isOpen={isRevisionModalOpen}
        onClose={() => setIsRevisionModalOpen(false)}
        title={language === "ar" ? "تعديل الوصفة الطبية الصادرة" : "Revise Issued Prescription"}
        description={
          language === "ar"
            ? "سيتم إنشاء مسودة مراجعة جديدة مرتبطة بالوصفة الأصلية مع الحفاظ على النسخة الصادرة دون أي تغيير."
            : "A new revision draft will be created linked to the original prescription."
        }
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl text-xs text-sky-950 space-y-1">
            <div className="flex items-center gap-2 font-black text-sky-900">
              <GitBranch className="w-4 h-4 text-sky-600" />
              <span>{language === "ar" ? "إجراء آمن وخاضع للتدقيق" : "Auditable Clinical Revision"}</span>
            </div>
            <p>
              {language === "ar"
                ? "تبقى النسخة الأصلية محفوظة كما هي. سيتم نسخ جميع الأدوية الحالية لتتمكن من تعديلها أو إضافة أدوية جديدة ثم اعتماد النسخة المعدلة."
                : "The original prescription will remain intact and all current medications will be copied into the revision draft."}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              {language === "ar" ? "سبب التعديل (إلزامي) *" : "Revision Reason (Required) *"}
            </label>
            <Textarea
              id="revision-reason-input"
              data-testid="revision-reason-input"
              placeholder={
                language === "ar"
                  ? "اكتب سبب التعديل بالتفصيل (مثال: تصحيح الجرعة، تغيير المضاد الحيوي، حساسية...)"
                  : "Describe the clinical reason for revision..."
              }
              rows={3}
              value={revisionReason}
              onChange={(e) => setRevisionReason(e.target.value)}
              className="text-xs font-medium"
            />
            {revisionReason.trim().length > 0 && revisionReason.trim().length < 3 && (
              <p className="text-[11px] text-rose-600 font-bold mt-1">
                {language === "ar" ? "يجب ألا يقل سبب التعديل عن 3 أحرف" : "Reason must be at least 3 characters"}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsRevisionModalOpen(false)}>
              {language === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={isCreatingRevision || revisionReason.trim().length < 3}
              onClick={handleStartRevision}
              data-testid="confirm-create-revision-btn"
              className="bg-clinic-600 hover:bg-clinic-700 text-white font-bold gap-1.5"
            >
              <GitBranch className="w-4 h-4" />
              <span>{isCreatingRevision ? (language === "ar" ? "جاري إنشاء المسودة..." : "Creating...") : (language === "ar" ? "بدء تعديل مسودة جديدة" : "Start Revision Draft")}</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Issue of Revision Modal */}
      <Modal
        isOpen={isConfirmIssueModalOpen}
        onClose={() => setIsConfirmIssueModalOpen(false)}
        title={language === "ar" ? "تأكيد اعتماد النسخة المعدلة" : "Confirm Approval of Revised Prescription"}
        description={
          language === "ar"
            ? `هل أنت متأكد من اعتماد النسخة المعدلة (نسخة ${prescription?.revision_number || 2})؟`
            : "Are you sure you want to approve and issue this revised prescription?"
        }
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1">
            <div className="flex items-center gap-2 font-black">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>{language === "ar" ? "تنبيه استبدال الوصفة" : "Prescription Supersession Notice"}</span>
            </div>
            <p>
              {language === "ar"
                ? "بمجرد اعتماد هذه النسخة، سيتم تلقائياً تحويل النسخة الصادرة السابقة إلى «مستبدلة» وتصبح هذه النسخة هي المعتمدة رسمياً للصرف والطباعة."
                : "Approving this revision will immediately mark the predecessor prescription as superseded."}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsConfirmIssueModalOpen(false)}>
              {language === "ar" ? "تراجع" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={isIssuing}
              onClick={() => {
                setIsConfirmIssueModalOpen(false);
                handleExecuteIssue();
              }}
              data-testid="confirm-issue-revision-btn"
              className="bg-clinic-600 hover:bg-clinic-700 text-white font-bold gap-1.5"
            >
              <FileCheck className="w-4 h-4" />
              <span>{isIssuing ? (language === "ar" ? "جاري الاعتماد..." : "Issuing...") : (language === "ar" ? "تأكيد الاعتماد والإصدار" : "Confirm & Approve")}</span>
            </Button>
          </div>
        </div>
      </Modal>

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

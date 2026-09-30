"use client";

import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DrugLabel } from "@/types/database";
import { fetchDrugLabelByProductId } from "@/services/prescriptionService";
import {
  FileText,
  AlertTriangle,
  Clock,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
} from "lucide-react";

interface DrugLabelViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string | null;
  medicationName?: string | null;
  language?: "ar" | "en";
}

export const DrugLabelViewerModal: React.FC<DrugLabelViewerModalProps> = ({
  isOpen,
  onClose,
  productId,
  medicationName,
  language = "ar",
}) => {
  const [label, setLabel] = useState<DrugLabel | null>(null);
  const [fetchedProductId, setFetchedProductId] = useState<string | null>(null);
  const loading = Boolean(isOpen && productId && fetchedProductId !== productId);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    dosage_and_administration: true,
    pediatric_use: true,
    indications_and_usage: false,
    contraindications: true,
    warnings_and_cautions: false,
    boxed_warning: true,
    drug_interactions: false,
    use_in_specific_populations: false,
  });

  const displayedLabel = isOpen && productId && fetchedProductId === productId ? label : null;

  useEffect(() => {
    if (!isOpen || !productId) {
      return;
    }

    let isMounted = true;

    fetchDrugLabelByProductId(productId)
      .then((data) => {
        if (isMounted) {
          setLabel(data);
          setFetchedProductId(productId);
        }
      })
      .catch((err) => {
        console.error("Failed to load drug label:", err);
        if (isMounted) {
          setLabel(null);
          setFetchedProductId(productId);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, productId]);

  const toggleSection = (sectionKey: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const getStatusBadge = () => {
    if (!displayedLabel) return null;
    const status = displayedLabel.review_status || "pending_review";

    if (status === "approved") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {language === "ar" ? "معتمد سريرياً في العيادة" : "Clinically Approved"}
        </span>
      );
    }

    if (status === "needs_re_review") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5" />
          {language === "ar" ? "بحاجة لإعادة مراجعة طبية (تحديث المصدر)" : "Re-review Required"}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
        <Clock className="w-3.5 h-3.5" />
        {language === "ar" ? "قيد المراجعة الطبية" : "Pending Medical Review"}
      </span>
    );
  };

  const sections: { key: string; titleAr: string; titleEn: string; content?: string | null; alert?: boolean }[] = [
    {
      key: "boxed_warning",
      titleAr: "التحذير الصندوقي البارز (Boxed Warning)",
      titleEn: "Boxed Warning",
      content: displayedLabel?.boxed_warning,
      alert: true,
    },
    {
      key: "pediatric_use",
      titleAr: "استخدام الأطفال (Pediatric Use)",
      titleEn: "Pediatric Use",
      content: displayedLabel?.pediatric_use,
    },
    {
      key: "dosage_and_administration",
      titleAr: "الجرعات وطريقة الإعطاء (Dosage and Administration)",
      titleEn: "Dosage & Administration",
      content: displayedLabel?.dosage_and_administration,
    },
    {
      key: "indications_and_usage",
      titleAr: "الاستطبابات والاستخدام (Indications and Usage)",
      titleEn: "Indications & Usage",
      content: displayedLabel?.indications_and_usage,
    },
    {
      key: "contraindications",
      titleAr: "موانع الاستعمال (Contraindications)",
      titleEn: "Contraindications",
      content: displayedLabel?.contraindications,
    },
    {
      key: "warnings_and_cautions",
      titleAr: "التحذيرات والاحتياطات (Warnings and Precautions)",
      titleEn: "Warnings & Precautions",
      content: displayedLabel?.warnings_and_cautions,
    },
    {
      key: "drug_interactions",
      titleAr: "التفاعلات الدوائية (Drug Interactions)",
      titleEn: "Drug Interactions",
      content: displayedLabel?.drug_interactions,
    },
    {
      key: "use_in_specific_populations",
      titleAr: "الاستخدام في فئات خاصة (Use in Specific Populations)",
      titleEn: "Specific Populations",
      content: displayedLabel?.use_in_specific_populations,
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        language === "ar"
          ? `النشرة الدوائية الرسمية: ${medicationName || ""}`
          : `Official Drug Label: ${medicationName || ""}`
      }
      description={
        language === "ar"
          ? "بيانات النشرة الرسمية المسترجعة من هيئة الغذاء والدواء الأمريكية (openFDA)"
          : "Official labeling text retrieved from US FDA (openFDA)"
      }
      maxWidth="2xl"
    >
      <div className="space-y-4 max-h-[75vh] overflow-y-auto px-1 pr-2">
        {/* Source and Provenance Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-900 text-white">
              <FileText className="w-3.5 h-3.5" />
              {language === "ar" ? "المصدر: openFDA" : "Source: openFDA"}
            </span>
            {getStatusBadge()}
          </div>

          {displayedLabel && (
            <div className="text-[11px] font-mono text-slate-500 space-x-2 rtl:space-x-reverse">
              {displayedLabel.effective_time && (
                <span>
                  {language === "ar" ? "تاريخ النشرة:" : "Effective:"} {displayedLabel.effective_time}
                </span>
              )}
              {displayedLabel.last_synced_at && (
                <span>
                  {language === "ar" ? "آخر مزامنة:" : "Synced:"}{" "}
                  {new Date(displayedLabel.last_synced_at).toLocaleDateString(language === "ar" ? "ar-EG" : "en-US")}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Clinical Disclaimer Banner */}
        <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-2xl flex items-start gap-3 text-xs text-amber-900 leading-relaxed">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold block">
              {language === "ar" ? "تنبيه طبي للاستخدام السريري" : "Clinical Disclaimer"}
            </span>
            <p className="text-[11px] text-amber-800">
              {language === "ar"
                ? "هذه النصوص مسترجعة كمرجع رسمي للمراجعة الطبية والبحثية فقط، ولا تشكل توصية علاجية تلقائية أو حساباً معتمداً لجرعات الأطفال، ولا تعوض التقدير السريري للطبيب المعالج."
                : "This content is provided for reference and medical review only. It does not constitute automated therapeutic advice or pediatric dosing calculations."}
            </p>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="py-12 text-center text-slate-500 space-y-2">
            <div className="w-6 h-6 border-2 border-clinic-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs">{language === "ar" ? "جاري جلب النشرة الرسمية..." : "Loading drug label..."}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !displayedLabel && (
          <div className="py-10 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-1">
            <Info className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-xs font-bold text-slate-700">
              {language === "ar" ? "لا توجد نشرة رسمية مرتبطة بهذا المنتج حتى الآن" : "No official label found for this product yet"}
            </p>
            <p className="text-[11px] text-slate-400">
              {language === "ar"
                ? "يمكن مزامنة النشرة عبر أداة المزامنة عند توفر معرف NDC أو SPL Set ID."
                : "Label can be synchronized using the sync tool when NDC or SPL Set ID is available."}
            </p>
          </div>
        )}

        {/* Label Sections Accordion */}
        {!loading && displayedLabel && (
          <div className="space-y-2.5">
            {sections
              .filter((sec) => Boolean(sec.content))
              .map((sec) => {
                const isExpanded = Boolean(expandedSections[sec.key]);
                return (
                  <div
                    key={sec.key}
                    className={`rounded-2xl border transition-all ${
                      sec.alert
                        ? "bg-rose-50/60 border-rose-200"
                        : "bg-white border-slate-200 shadow-2xs hover:border-slate-300"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSection(sec.key)}
                      className="w-full flex items-center justify-between p-3.5 text-right font-bold text-xs text-slate-900 cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        {sec.alert && <AlertTriangle className="w-4 h-4 text-rose-600" />}
                        {language === "ar" ? sec.titleAr : sec.titleEn}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-slate-100 text-xs text-slate-700 leading-relaxed font-sans whitespace-pre-line select-text">
                        {sec.content}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-slate-100">
          <Button type="button" variant="primary" onClick={onClose} className="text-xs">
            {language === "ar" ? "إغلاق" : "Close"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

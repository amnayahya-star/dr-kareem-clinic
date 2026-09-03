"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PatientFile } from "@/lib/mock-data/patients";
import {
  fetchDeletedPatients,
  restorePatient,
  permanentDeletePatient,
  calculateRemainingDays,
} from "@/services/patientService";
import { useLanguage } from "@/context/LanguageContext";
import { normalizeArabicText, formatArabicDate } from "@/lib/utils";
import {
  Trash2,
  RotateCcw,
  Clock,
  Archive,
  ArrowRight,
  Search,
  Users,
  ShieldAlert,
} from "lucide-react";

export default function RecycleBinPage() {
  const { language, t, isRTL } = useLanguage();
  const [deletedPatients, setDeletedPatients] = useState<PatientFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const data = await fetchDeletedPatients();
        setDeletedPatients(data);
      } catch (err) {
        console.error("Error loading deleted patients:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Filtered Deleted Patients by Search Query
  const filteredDeleted = useMemo(() => {
    if (!searchQuery.trim()) return deletedPatients;
    const q = normalizeArabicText(searchQuery);
    return deletedPatients.filter((p) => {
      const matchName = normalizeArabicText(p.fullName).includes(q);
      const matchFile = p.fileNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchPhone = p.phone.includes(searchQuery) || (p.secondaryPhone && p.secondaryPhone.includes(searchQuery));
      const matchGuardian = normalizeArabicText(p.guardianName).includes(q);
      return matchName || matchFile || matchPhone || matchGuardian;
    });
  }, [searchQuery, deletedPatients]);

  // Handle Restore
  const handleRestore = async (patient: PatientFile) => {
    try {
      const restored = await restorePatient(patient.id);
      if (restored) {
        setDeletedPatients((prev) => prev.filter((p) => p.id !== patient.id));
        setActionSuccessMessage(
          language === "ar"
            ? `تمت استعادة ملف الطفل (${patient.fullName}) إلى سجل العيادة النشط بنجاح!`
            : `Restored (${patient.fullName}) back to active clinic records!`
        );
        setTimeout(() => setActionSuccessMessage(null), 4000);
      }
    } catch (err: any) {
      alert(`خطأ في استعادة الملف: ${err.message}`);
    }
  };

  // Handle Permanent Delete
  const handlePermanent = async (patient: PatientFile) => {
    if (!window.confirm(t("confirmPermanentDelete"))) return;

    try {
      await permanentDeletePatient(patient.id);
      setDeletedPatients((prev) => prev.filter((p) => p.id !== patient.id));
      setActionSuccessMessage(
        language === "ar"
          ? `تم حذف ملف (${patient.fullName}) نهائياً من النظام.`
          : `Permanently deleted (${patient.fullName}) from system.`
      );
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(`خطأ في الحذف النهائي: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Breadcrumb & Return */}
      <div className="flex items-center justify-between">
        <Link
          href="/secretary"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3.5 py-2 rounded-xl transition-colors shadow-xs"
        >
          <ArrowRight className="w-4 h-4" />
          <span>{t("backToChildrenTable")}</span>
        </Link>
      </div>

      {/* Success Alert */}
      {actionSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold shadow-xs">
          {actionSuccessMessage}
        </div>
      )}

      {/* Main Header Card */}
      <div className="bg-white rounded-3xl p-6 border-2 border-rose-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0 border border-rose-200">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">
                {t("recycleBinTitle")} ({deletedPatients.length})
              </h2>
              <p className="text-xs text-rose-600 font-semibold mt-0.5">
                {t("recycleBinDesc")}
              </p>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        {deletedPatients.length > 0 && (
          <div className="relative pt-1">
            <div className={`absolute inset-y-0 ${isRTL ? "right-0 pr-4" : "left-0 pl-4"} pt-1 flex items-center pointer-events-none text-slate-400`}>
              <Search className="w-5 h-5 text-rose-500" />
            </div>
            <input
              type="text"
              placeholder={t("searchPlaceholderSecretary")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full h-12 ${isRTL ? "pr-12 pl-10" : "pl-12 pr-10"} rounded-2xl border-2 border-slate-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none transition-all`}
            />
          </div>
        )}
      </div>

      {/* Deleted Patients Table */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        {filteredDeleted.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <Archive className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-600">{t("emptyRecycleBin")}</p>
            <Link href="/secretary">
              <Button variant="primary" size="sm" className="font-bold">
                {t("activePatientsTab")}
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full ${isRTL ? "text-right" : "text-left"} border-collapse`}>
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-xs font-bold">
                  <th className={`pb-3 ${isRTL ? "pr-2" : "pl-2"}`}>{t("childFullName")} / {t("fileNumber")}</th>
                  <th className="pb-3">{t("guardian")} & {t("phone")}</th>
                  <th className="pb-3">{t("daysRemainingLabel")}</th>
                  <th className={`pb-3 ${isRTL ? "text-left pl-2" : "text-right pr-2"}`}>{t("action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-bold">
                {filteredDeleted.map((patient) => {
                  const daysLeft = calculateRemainingDays(patient.deletedAt);
                  return (
                    <tr key={patient.id} className="hover:bg-rose-50/40 transition-colors">
                      <td className={`py-3.5 ${isRTL ? "pr-2" : "pl-2"}`}>
                        <div>
                          <span className="font-extrabold text-slate-900 block">
                            {patient.fullName}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500 font-bold">
                            {patient.fileNumber}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 text-xs text-slate-600">
                        <span className="block font-bold">{patient.guardianName}</span>
                        <span className="font-mono text-slate-500 text-[11px]">{patient.phone}</span>
                      </td>

                      <td className="py-3.5 text-xs">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 font-black">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>
                            {daysLeft} {t("daysCount")}
                          </span>
                        </span>
                      </td>

                      <td className={`py-3.5 ${isRTL ? "text-left pl-2" : "text-right pr-2"}`}>
                        <div className="flex items-center gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleRestore(patient)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-xs"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{t("restoreChildBtn")}</span>
                          </Button>

                          <button
                            type="button"
                            onClick={() => handlePermanent(patient)}
                            className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-100/60 rounded-xl transition-colors"
                            title={t("permanentDeleteBtn")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

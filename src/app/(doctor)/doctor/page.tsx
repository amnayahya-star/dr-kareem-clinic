"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Card } from "@/components/ui/Card";
import { MOCK_PATIENT_FILES, PatientFile, VisitRecord, MedicalPhoto } from "@/lib/mock-data/patients";
import { fetchPatients } from "@/services/patientService";
import { saveDoctorDiagnosis } from "@/services/visitService";
import {
  notifyDoctorApprovedVisit,
  subscribeToClinicNotifications,
  getClinicNotifications,
  playNotificationChime,
  ClinicNotification,
} from "@/services/notificationService";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";
import { calculateArabicAge, formatArabicDate, normalizeArabicText } from "@/lib/utils";
import {
  Search,
  Stethoscope,
  AlertTriangle,
  FlaskConical,
  Pill,
  History,
  Eye,
  CheckCircle2,
  X,
  FileCheck,
  Calendar,
  Layers,
  Scale,
  Thermometer,
  Ruler,
  Award,
  Users,
  ChevronLeft,
  ArrowRight,
  User,
  CalendarDays,
  UserCheck,
  BellRing,
  FileText,
} from "lucide-react";

export default function DoctorClinicalWorkstationPage() {
  const { language, t, isRTL } = useLanguage();
  const [patients, setPatients] = useState<PatientFile[]>(MOCK_PATIENT_FILES);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Date Filter State ('all' | 'today' | 'yesterday' | 'custom')
  const [dateFilterMode, setDateFilterMode] = useState<"all" | "today" | "yesterday" | "custom">("all");
  const [customFilterDate, setCustomFilterDate] = useState<string>("");

  // Selected Child ID (null means viewing the doctor bio & children directory)
  const [activePatientId, setActivePatientId] = useState<string | null>(null);

  // Active Tab for opened child: 'clinical' | 'visit_photos' | 'history'
  const [activeTab, setActiveTab] = useState<"clinical" | "visit_photos" | "history">("clinical");

  // Selected Photo for Fullscreen Preview Modal
  const [previewPhoto, setPreviewPhoto] = useState<MedicalPhoto | null>(null);

  // Current Consultation Form State
  const [symptoms, setSymptoms] = useState(language === "ar" ? "ارتفاع حرارة وسعال مستمر منذ يومين" : "Fever and persistent cough for 2 days");
  const [clinicalExam, setClinicalExam] = useState(language === "ar" ? "احتقان بالبلعوم، أصوات تنفسية خشنة خفيفة بالصدر" : "Pharyngeal congestion, mild coarse breath sounds in chest");
  const [diagnosisText, setDiagnosisText] = useState("Acute Viral Bronchitis (التهاب القصبات الهوائية الفيروسي الحاد)");
  const [recommendations, setRecommendations] = useState(language === "ar" ? "سوائل دافئة، راحة تامة، خافض حرارة عند اللزوم، تجنب مشتقات البنسلين" : "Warm fluids, rest, antipyretics PRN, avoid penicillin");
  const [doctorNotes, setDoctorNotes] = useState(language === "ar" ? "متابعة الحرارة بعد 48 ساعة" : "Follow up temperature in 48 hours");
  const [isApprovedSuccess, setIsApprovedSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Today & Yesterday Strings
  const todayStr = new Date().toISOString().split("T")[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  const [activeArrivalAlert, setActiveArrivalAlert] = useState<ClinicNotification | null>(null);

  // Load patients on mount and subscribe to Realtime Arrival Alerts from Secretary
  useEffect(() => {
    let previousPatientCount = 0;

    async function loadData() {
      try {
        const data = await fetchPatients();
        if (data && data.length > 0) {
          setPatients(data);
          previousPatientCount = data.length;
        }
      } catch (err) {
        console.error("Error loading doctor data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();

    // فحص الإشعارات المعلقة مسبقاً
    const unreadArrivals = getClinicNotifications().filter(
      (n) => n.type === "new_patient_arrived" && !n.isRead
    );
    if (unreadArrivals.length > 0) {
      setActiveArrivalAlert(unreadArrivals[0]);
    }

    // 1. الاستماع الفوري للبث المباشر (BroadcastChannel)
    const unsubscribe = subscribeToClinicNotifications((notif) => {
      if (notif.type === "new_patient_arrived") {
        playNotificationChime("high");
        setActiveArrivalAlert(notif);
        fetchPatients().then((data) => {
          if (data && data.length > 0) setPatients(data);
        });
      }
    });

    // 2. فحص دوري ذكي كل 3 ثواني لمزامنة قاعدة البيانات عبر مختلف الأجهزة
    const interval = setInterval(async () => {
      try {
        const latestData = await fetchPatients();
        if (latestData && latestData.length > 0) {
          // إذا تمت إضافة طفل جديد أو زيارة جديدة لم تكن موجودة
          if (previousPatientCount > 0 && latestData.length > previousPatientCount) {
            const newestChild = latestData[0];
            const newestVisit = newestChild.visits[0];
            playNotificationChime("high");
            setActiveArrivalAlert({
              id: `arrival-${Date.now()}`,
              type: "new_patient_arrived",
              patientId: newestChild.id,
              childName: newestChild.fullName,
              weightKg: newestVisit?.weightKg,
              temperatureC: newestVisit?.temperatureC,
              labPhotosCount: newestVisit?.labPhotos?.length || 0,
              timestamp: new Date().toISOString(),
              isRead: false,
            });
          }
          previousPatientCount = latestData.length;
          setPatients(latestData);
        }
      } catch (e) {
        // silent sync
      }
    }, 3000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // Filtered Children based on search & day selection
  const filteredPatients = useMemo(() => {
    let result = patients;

    // 1. Date Filter
    if (dateFilterMode === "today") {
      result = result.filter((p) => p.visits.some((v) => v.date === todayStr));
    } else if (dateFilterMode === "yesterday") {
      result = result.filter((p) => p.visits.some((v) => v.date === yesterdayStr));
    } else if (dateFilterMode === "custom" && customFilterDate) {
      result = result.filter((p) => p.visits.some((v) => v.date === customFilterDate));
    }

    // 2. Search Query Filter
    if (searchQuery.trim()) {
      const q = normalizeArabicText(searchQuery);
      result = result.filter((p) => {
        const matchName = normalizeArabicText(p.fullName).includes(q);
        const matchFile = p.fileNumber.toLowerCase().includes(searchQuery.toLowerCase());
        const matchPhone = p.phone.includes(searchQuery) || (p.secondaryPhone && p.secondaryPhone.includes(searchQuery));
        const matchGuardian = normalizeArabicText(p.guardianName).includes(q);

        return matchName || matchFile || matchPhone || matchGuardian;
      });
    }

    return result;
  }, [searchQuery, patients, dateFilterMode, customFilterDate, todayStr, yesterdayStr]);

  // Active Selected Child
  const activePatient = patients.find((p) => p.id === activePatientId) || null;
  const latestVisit = activePatient?.visits?.[0] || null;

  // Handle Select Child
  const handleSelectChild = (id: string) => {
    setActivePatientId(id);
    setSearchQuery("");
    setIsApprovedSuccess(false);
    setActiveTab("clinical");
  };

  // Complete & Approve Visit
  const handleApproveVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePatient || !latestVisit) return;

    setIsSubmitting(true);
    try {
      await saveDoctorDiagnosis({
        visitId: latestVisit.id,
        patientId: activePatient.id,
        symptoms,
        clinicalExamination: clinicalExam,
        diagnosisText,
        recommendations,
        doctorNotes,
      });

      // إرسال تنبيه فوري للسكرتير لتصوير الوصفة
      notifyDoctorApprovedVisit({
        visitId: latestVisit.id,
        patientId: activePatient.id,
        childName: activePatient.fullName,
        diagnosisText,
      });

      const updatedVisits = activePatient.visits.map((v, idx) =>
        idx === 0
          ? {
              ...v,
              diagnosisText,
              clinicalExamination: clinicalExam,
              recommendations,
              doctorNotes,
              isCompleted: true,
            }
          : v
      );

      const updatedPatient: PatientFile = {
        ...activePatient,
        visits: updatedVisits,
      };

      setPatients(patients.map((p) => (p.id === activePatient.id ? updatedPatient : p)));
      setIsApprovedSuccess(true);
    } catch (err: any) {
      alert(language === "ar" ? `فشل اعتماد الزيارة: ${err.message}` : `Failed to approve visit: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* 0. تنبيه فوري لحظي عند دخول مراجع جديد من السكرتير */}
      {activeArrivalAlert && (
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white p-4 sm:p-5 rounded-3xl shadow-xl border-2 border-emerald-300 animate-bounce duration-1000 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30">
              <UserCheck className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider bg-white text-emerald-950 px-2.5 py-0.5 rounded-full">
                  {language === "ar" ? "🔔 مراجع جديد بالانتظار" : "New Patient Waiting"}
                </span>
                <span className="text-xs text-emerald-100 font-mono">
                  {new Date(activeArrivalAlert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black mt-1">
                {language === "ar"
                  ? `أدخل السكرتير بيانات الطفل: ${activeArrivalAlert.childName}`
                  : `Reception recorded vitals for: ${activeArrivalAlert.childName}`}
              </h3>
              <p className="text-xs text-emerald-100 mt-0.5 font-medium">
                {activeArrivalAlert.weightKg ? `${t("weight")}: ${activeArrivalAlert.weightKg} ${t("kg")} ` : ""}
                {activeArrivalAlert.temperatureC ? `| ${t("temperature")}: ${activeArrivalAlert.temperatureC} °C ` : ""}
                {activeArrivalAlert.labPhotosCount ? `| (${activeArrivalAlert.labPhotosCount}) ${t("labPhotosTitle")}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                handleSelectChild(activeArrivalAlert.patientId);
                setActiveArrivalAlert(null);
              }}
              className="bg-white text-emerald-950 hover:bg-emerald-50 font-black shadow-md gap-2 h-11 px-5"
            >
              <Stethoscope className="w-4 h-4 text-emerald-700" />
              <span>{language === "ar" ? "🩺 بدء الفحص السريري الآن" : "Start Examination Now"}</span>
            </Button>
            <button
              onClick={() => setActiveArrivalAlert(null)}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              title={t("close")}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* 1. تعريف الطبيب والهوية الرسمية */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-clinic-900 text-white rounded-3xl p-6 sm:p-7 shadow-lg border border-slate-700/60 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-72 h-72 bg-clinic-500/10 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />

        <div className={`relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center ${isRTL ? "sm:text-right" : "sm:text-left"}`}>
          {/* صورة الطبيب الرسمية */}
          <div className="relative shrink-0">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl overflow-hidden border-3 border-clinic-400/90 shadow-2xl bg-slate-800">
              <img
                src="/dr-kareem.jpg"
                alt="الدكتور عبد الكريم عليوي"
                className="w-full h-full object-cover object-top"
              />
            </div>
            <div className={`absolute -bottom-2 ${isRTL ? "-right-2" : "-left-2"} bg-clinic-500 text-white p-1.5 rounded-xl shadow-md`}>
              <Award className="w-4 h-4" />
            </div>
          </div>

          {/* معلومات وألقاب الطبيب */}
          <div className="flex-1 space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-clinic-500/20 text-clinic-300 text-xs font-bold border border-clinic-500/30 mb-1">
              <Stethoscope className="w-3.5 h-3.5" />
              <span>{t("doctorConsultantBadge")}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              {t("clinicName")}
            </h1>

            <div className="space-y-1 pt-1 text-slate-200">
              <p className={`text-sm sm:text-base font-bold text-clinic-200 flex items-center justify-center ${isRTL ? "sm:justify-start" : "sm:justify-start"} gap-1.5`}>
                <span>•</span>
                <span>{t("boardCert")}</span>
              </p>
              <p className={`text-xs sm:text-sm font-semibold text-slate-300 flex items-center justify-center ${isRTL ? "sm:justify-start" : "sm:justify-start"} gap-1.5`}>
                <span>•</span>
                <span>{t("royalCollegeFellow")}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. إذا لم يتم اختيار طفل -> عرض شريط البحث + تقسيم الأطفال حسب الأيام */}
      {!activePatient ? (
        <div className="space-y-6">
          {/* شريط البحث المباشر والفلترة حسب الأيام */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Search className="w-5 h-5 text-clinic-600" />
                <span>{t("doctorSearchTitle")}</span>
              </h2>
            </div>

            {/* حقل البحث */}
            <div className="relative">
              <div className={`absolute inset-y-0 ${isRTL ? "right-0 pr-4" : "left-0 pl-4"} flex items-center pointer-events-none text-slate-400`}>
                <Search className="w-5 h-5 text-clinic-600" />
              </div>
              <input
                type="text"
                placeholder={t("searchPlaceholderDoctor")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full h-14 ${isRTL ? "pr-12 pl-10" : "pl-12 pr-10"} rounded-2xl border-2 border-slate-200 focus:border-clinic-500 focus:ring-2 focus:ring-clinic-100 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none transition-all`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className={`absolute inset-y-0 ${isRTL ? "left-0 pl-3.5" : "right-0 pr-3.5"} flex items-center text-slate-400 hover:text-slate-600`}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* فلترة وتقسيم الأطفال حسب الأيام */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-500 ml-1 flex items-center gap-1">
                  <CalendarDays className="w-4 h-4 text-clinic-600" />
                  <span>{t("filterByDay")}</span>
                </span>

                {/* All */}
                <button
                  type="button"
                  onClick={() => setDateFilterMode("all")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    dateFilterMode === "all"
                      ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {t("allPatients")}
                </button>

                {/* Today */}
                <button
                  type="button"
                  onClick={() => setDateFilterMode("today")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    dateFilterMode === "today"
                      ? "bg-clinic-600 text-white border-clinic-600 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {t("todayVisitors")} ({language === "ar" ? formatArabicDate(new Date()) : new Date().toLocaleDateString()})
                </button>

                {/* Yesterday */}
                <button
                  type="button"
                  onClick={() => setDateFilterMode("yesterday")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    dateFilterMode === "yesterday"
                      ? "bg-clinic-600 text-white border-clinic-600 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {t("yesterdayVisitors")}
                </button>
              </div>

              {/* Custom Date Picker */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">{t("pickCustomDay")}</span>
                <input
                  type="date"
                  value={customFilterDate}
                  onChange={(e) => {
                    setCustomFilterDate(e.target.value);
                    if (e.target.value) {
                      setDateFilterMode("custom");
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border outline-none ${
                    dateFilterMode === "custom" && customFilterDate
                      ? "border-clinic-500 ring-2 ring-clinic-100 bg-white text-clinic-900 font-black"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                />
                {dateFilterMode === "custom" && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomFilterDate("");
                      setDateFilterMode("all");
                    }}
                    className="text-xs text-rose-500 hover:underline font-bold"
                  >
                    {t("cancel")}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* جدول سلسلة الأطفال المراجعين */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-clinic-600" />
                <span>
                  {dateFilterMode === "all"
                    ? `${t("doctorChildrenList")} (${filteredPatients.length})`
                    : dateFilterMode === "today"
                    ? `${t("todayVisitors")} (${filteredPatients.length})`
                    : dateFilterMode === "yesterday"
                    ? `${t("yesterdayVisitors")} (${filteredPatients.length})`
                    : `${customFilterDate} (${filteredPatients.length})`}
                </span>
              </h3>
              <span className="text-xs text-slate-400">{t("clickChildToExamine")}</span>
            </div>

            {filteredPatients.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <CalendarDays className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-600">{t("noChildrenFound")}</p>
                {dateFilterMode !== "all" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDateFilterMode("all")}
                    className="font-bold mt-2"
                  >
                    {t("allPatients")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className={`w-full ${isRTL ? "text-right" : "text-left"} border-collapse`}>
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 text-xs font-bold">
                      <th className={`pb-3 ${isRTL ? "pr-2" : "pl-2"}`}>{t("childFullName")} / {t("fileNumber")}</th>
                      <th className="pb-3">{t("age")} / {t("gender")}</th>
                      <th className="pb-3">{t("guardian")} & {t("phone")}</th>
                      <th className="pb-3">{t("lastVisitDate")}</th>
                      <th className="pb-3">{t("labTestsAndRx")}</th>
                      <th className={`pb-3 ${isRTL ? "text-left pl-2" : "text-right pr-2"}`}>{t("action")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm font-bold">
                    {filteredPatients.map((patient) => {
                      const latestV = patient.visits[0];
                      return (
                        <tr
                          key={patient.id}
                          className="hover:bg-slate-50/80 transition-colors group"
                        >
                          <td className={`py-3.5 ${isRTL ? "pr-2" : "pl-2"}`}>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-clinic-50 text-slate-700 group-hover:text-clinic-700 flex items-center justify-center font-bold text-sm shrink-0 transition-colors">
                                {patient.fullName.charAt(0)}
                              </div>
                              <div>
                                <span className="font-extrabold text-slate-900 group-hover:text-clinic-700 transition-colors block">
                                  {patient.fullName}
                                </span>
                                <span className="text-[11px] font-mono font-bold text-slate-500">
                                  {patient.fileNumber}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 text-xs text-slate-600">
                            <span className="block font-bold">{calculateArabicAge(patient.dateOfBirth)}</span>
                            <span className="text-slate-400 text-[10px]">
                              {patient.gender === "male" ? t("male") : t("female")}
                            </span>
                          </td>

                          <td className="py-3.5 text-xs text-slate-600">
                            <span className="block font-bold">{patient.guardianName}</span>
                            <span className="font-mono text-slate-500 text-[11px]">{patient.phone}</span>
                          </td>

                          <td className="py-3.5 text-xs text-slate-700">
                            {latestV ? (
                              <div>
                                <span className="font-bold text-clinic-900 block">
                                  {language === "ar" ? formatArabicDate(latestV.date) : latestV.date}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {latestV.weightKg ? `${t("weight")}: ${latestV.weightKg}${t("kg")} ` : ""}
                                  {latestV.temperatureC ? `| ${t("temperature")}: ${latestV.temperatureC}°C` : ""}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">{t("noVisitsRecorded")}</span>
                            )}
                          </td>

                          <td className="py-3.5 text-xs">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {patient.allergies && (
                                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                  {t("allergyWarning")}
                                </span>
                              )}
                              <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                {patient.allLabPhotos.length} {t("labPhotosTitle")}
                              </span>
                            </div>
                          </td>

                          <td className={`py-3.5 ${isRTL ? "text-left pl-2" : "text-right pr-2"}`}>
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {/* زر الملف الطبي والتطعيمات المستقل */}
                              <Link
                                href={`/doctor/patients/${patient.id}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-clinic-700 bg-clinic-50 hover:bg-clinic-100 border border-clinic-200 transition-colors shadow-2xs"
                              >
                                <FileText className="w-3.5 h-3.5 text-clinic-600" />
                                <span>{language === "ar" ? "الملف الطبي والتطعيمات" : "Medical File & Vaccines"}</span>
                              </Link>

                              {/* زر بدء الفحص السريري المستقل */}
                              <button
                                type="button"
                                onClick={() => handleSelectChild(patient.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black text-slate-700 hover:text-white bg-slate-100 hover:bg-slate-900 transition-colors shadow-2xs cursor-pointer"
                              >
                                <Stethoscope className="w-3.5 h-3.5 text-clinic-600" />
                                <span>{t("startExam")}</span>
                                <ChevronLeft className="w-3.5 h-3.5" />
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
      ) : (
        /* 3. عند اختيار طفل -> عرض ملف الطفل والفحص السريري والتحاليل */
        <div className="space-y-6">
          {/* زر الرجوع لسلسلة الأطفال */}
          <button
            onClick={() => setActivePatientId(null)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3.5 py-2 rounded-xl transition-colors shadow-xs"
          >
            <ArrowRight className="w-4 h-4" />
            <span>{t("backToDoctorList")}</span>
          </button>

          {/* بطاقة معلومات الطفل والتحذيرات */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-xl shadow-sm">
                  {activePatient.fullName.charAt(0)}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                      {activePatient.fullName}
                    </h2>
                    <span className="font-mono text-xs font-bold bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg">
                      {activePatient.fileNumber}
                    </span>
                    <Link
                      href={`/doctor/patients/${activePatient.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-clinic-700 bg-clinic-50 hover:bg-clinic-100 border border-clinic-200 transition-colors shadow-2xs"
                    >
                      <FileText className="w-3.5 h-3.5 text-clinic-600" />
                      <span>{language === "ar" ? "فتح وتعديل الملف الطبي الكامل" : "Open Full Medical File"}</span>
                    </Link>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    {t("age")}: <strong className="text-slate-800">{calculateArabicAge(activePatient.dateOfBirth)}</strong> |{" "}
                    {t("gender")}: {activePatient.gender === "male" ? t("male") : t("female")} | {t("guardian")}: {activePatient.guardianName} ({activePatient.phone})
                  </p>
                </div>
              </div>

              {/* أزرار التبديل */}
              <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl gap-1">
                <button
                  onClick={() => setActiveTab("clinical")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                    activeTab === "clinical"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Stethoscope className="w-4 h-4 text-clinic-600" />
                  <span>{t("tabClinicalExam")}</span>
                </button>

                <button
                  onClick={() => setActiveTab("visit_photos")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                    activeTab === "visit_photos"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Layers className="w-4 h-4 text-amber-600" />
                  <span>{t("tabVisitPhotos")}</span>
                </button>

                <button
                  onClick={() => setActiveTab("history")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                    activeTab === "history"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <History className="w-4 h-4 text-teal-600" />
                  <span>{t("tabHistory")} ({activePatient.visits.length})</span>
                </button>
              </div>
            </div>

            {/* شريط التحذيرات الطبية */}
            {(activePatient.allergies || activePatient.chronicDiseases) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activePatient.allergies && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-rose-900 text-xs font-bold">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    <div>
                      <span className="text-rose-700 font-black">{t("allergyWarning")}: </span>
                      <span>{activePatient.allergies}</span>
                    </div>
                  </div>
                )}
                {activePatient.chronicDiseases && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-2.5 text-amber-900 text-xs font-bold">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <span className="text-amber-700 font-black">{t("chronicWarning")}: </span>
                      <span>{activePatient.chronicDiseases}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* التبويب 1: الفحص السريري والتشخيص الطبي */}
          {activeTab === "clinical" && (
            <div className="space-y-6">
              {isApprovedSuccess ? (
                <Card className="text-center py-12 space-y-3 bg-white border-emerald-200 shadow-sm">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900">
                    {t("visitApprovedSuccessTitle")} {activePatient.fullName}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {t("visitApprovedSuccessDesc")}
                  </p>
                  <Button
                    variant="primary"
                    className="font-bold mt-2"
                    onClick={() => setActivePatientId(null)}
                  >
                    {t("backToDoctorList")}
                  </Button>
                </Card>
              ) : (
                <form onSubmit={handleApproveVisit} className="space-y-6">
                  {/* القياسات الحيوية */}
                  <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                      {t("vitalsMeasuredBySecretary")}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                        <div className={isRTL ? "text-right" : "text-left"}>
                          <span className="text-slate-400 text-xs font-bold block">{t("weight")}</span>
                          <span className="text-lg font-black text-slate-900">
                            {latestVisit?.weightKg ? `${latestVisit.weightKg} ${t("kg")}` : "--"}
                          </span>
                        </div>
                        <Scale className="w-6 h-6 text-clinic-600 opacity-80" />
                      </div>

                      <div className="p-4 bg-rose-50/60 rounded-2xl border border-rose-200 flex items-center justify-between">
                        <div className={isRTL ? "text-right" : "text-left"}>
                          <span className="text-rose-500 text-xs font-bold block">{t("temperature")}</span>
                          <span className="text-lg font-black text-rose-700">
                            {latestVisit?.temperatureC ? `${latestVisit.temperatureC} °C` : "--"}
                          </span>
                        </div>
                        <Thermometer className="w-6 h-6 text-rose-600 opacity-80" />
                      </div>

                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                        <div className={isRTL ? "text-right" : "text-left"}>
                          <span className="text-slate-400 text-xs font-bold block">{t("height")}</span>
                          <span className="text-lg font-black text-slate-900">
                            {latestVisit?.heightCm ? `${latestVisit.heightCm} ${t("cm")}` : "--"}
                          </span>
                        </div>
                        <Ruler className="w-6 h-6 text-clinic-600 opacity-80" />
                      </div>
                    </div>
                  </div>

                  {/* حقول الفحص السريري والتشخيص */}
                  <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                        <Stethoscope className="w-5 h-5 text-clinic-600" />
                        <span>{t("clinicalDocTitle")}</span>
                      </h3>
                      <span className="text-xs font-bold text-clinic-700 bg-clinic-50 px-3 py-1 rounded-xl">
                        {t("todayVisitBadge")} {language === "ar" ? formatArabicDate(new Date()) : new Date().toLocaleDateString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Textarea
                        label={t("symptomsLabel")}
                        value={symptoms}
                        onChange={(e) => setSymptoms(e.target.value)}
                        className="text-sm font-semibold min-h-[100px]"
                      />
                      <Textarea
                        label={t("clinicalExamLabel")}
                        value={clinicalExam}
                        onChange={(e) => setClinicalExam(e.target.value)}
                        className="text-sm font-semibold min-h-[100px]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Input
                        label={t("finalDiagnosisLabel")}
                        required
                        value={diagnosisText}
                        onChange={(e) => setDiagnosisText(e.target.value)}
                        className="font-black text-slate-900 text-base h-13 border-2 focus:border-clinic-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Textarea
                        label={t("recommendationsLabel")}
                        value={recommendations}
                        onChange={(e) => setRecommendations(e.target.value)}
                        className="text-sm font-semibold min-h-[90px]"
                      />
                      <Textarea
                        label={t("doctorNotesLabel")}
                        value={doctorNotes}
                        onChange={(e) => setDoctorNotes(e.target.value)}
                        className="text-sm font-semibold min-h-[90px]"
                      />
                    </div>

                    <div className="flex items-center justify-end pt-3 border-t border-slate-100">
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        variant="primary"
                        size="lg"
                        className="font-black px-10 h-14 text-base shadow-sm"
                      >
                        <FileCheck className="w-5 h-5 ml-2" />
                        <span>{isSubmitting ? t("approvingBtn") : t("approveVisitBtn")}</span>
                      </Button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* التبويب 2: صور التحاليل والوصفات */}
          {activeTab === "visit_photos" && (
            <div className="space-y-6">
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-amber-600" />
                    <span>{t("photosArchiveTitle")}</span>
                  </h3>
                  <span className="text-xs font-bold text-slate-500">
                    {t("totalVisits")} {activePatient.visits.length}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {t("photosArchiveDesc")}
                </p>
              </div>

              {activePatient.visits.length === 0 ? (
                <Card className="text-center py-10 text-xs text-slate-400">
                  {t("noVisitsOrPhotos")}
                </Card>
              ) : (
                <div className="space-y-6">
                  {activePatient.visits.map((visit, index) => {
                    const hasPhotos =
                      (visit.labPhotos && visit.labPhotos.length > 0) || visit.prescriptionPhoto;

                    return (
                      <div
                        key={visit.id}
                        className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4"
                      >
                        {/* ترويسة الزيارة */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center font-bold">
                              <Calendar className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-extrabold text-slate-900 text-base">
                                  {t("visitDay")}: {language === "ar" ? formatArabicDate(visit.date) : visit.date}
                                </h4>
                                {index === 0 && (
                                  <span className="text-[10px] font-bold bg-clinic-100 text-clinic-800 px-2.5 py-0.5 rounded-full">
                                    {t("latestVisitText")}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                                {visit.weightKg && <span>{t("weight")}: <strong>{visit.weightKg} {t("kg")}</strong></span>}
                                {visit.temperatureC && <span>{t("temperature")}: <strong>{visit.temperatureC} °C</strong></span>}
                                {visit.heightCm && <span>{t("height")}: <strong>{visit.heightCm} {t("cm")}</strong></span>}
                              </div>
                            </div>
                          </div>

                          {visit.diagnosisText && (
                            <div className="text-xs bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 self-start sm:self-center">
                              <span className="font-bold text-slate-500">{t("doctorDiagnosisTitle")} </span>
                              <span className="font-black text-slate-900">{visit.diagnosisText}</span>
                            </div>
                          )}
                        </div>

                        {/* شبكة الصور */}
                        {!hasPhotos ? (
                          <p className="text-xs text-slate-400 py-3 text-center">
                            {t("noVisitsOrPhotos")}
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* صور التحاليل */}
                            <div className="space-y-2">
                              <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <FlaskConical className="w-4 h-4 text-amber-600" />
                                <span>{t("attachedLabTestsCount")} ({visit.labPhotos?.length || 0}):</span>
                              </h5>

                              {!visit.labPhotos || visit.labPhotos.length === 0 ? (
                                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center text-xs text-slate-400">
                                  {t("noLabsForThisVisit")}
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-3">
                                  {visit.labPhotos.map((photo) => (
                                    <div
                                      key={photo.id}
                                      onClick={() => setPreviewPhoto(photo)}
                                      className="group relative bg-slate-50 border border-slate-200 rounded-2xl p-2 cursor-pointer hover:border-amber-500 hover:shadow-md transition-all text-right"
                                    >
                                      <div className="w-full h-32 rounded-xl bg-slate-200 overflow-hidden relative mb-1.5">
                                        <img
                                          src={photo.imageUrl}
                                          alt={photo.title}
                                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                        />
                                        <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                          <Eye className="w-5 h-5" />
                                        </div>
                                      </div>
                                      <h6 className="font-bold text-slate-900 text-xs truncate">{photo.title}</h6>
                                      <span className="text-[10px] text-slate-400 block mt-0.5">{photo.notes || photo.date}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* صورة الوصفة */}
                            <div className="space-y-2">
                              <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <Pill className="w-4 h-4 text-clinic-600" />
                                <span>{t("rxPhotoTitle")}:</span>
                              </h5>

                              {!visit.prescriptionPhoto ? (
                                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center text-xs text-slate-400">
                                  {t("noRxForThisVisit")}
                                </div>
                              ) : (
                                <div
                                  onClick={() => visit.prescriptionPhoto && setPreviewPhoto(visit.prescriptionPhoto)}
                                  className="group relative bg-slate-50 border border-slate-200 rounded-2xl p-2 cursor-pointer hover:border-clinic-500 hover:shadow-md transition-all text-right"
                                >
                                  <div className="w-full h-32 rounded-xl bg-slate-200 overflow-hidden relative mb-1.5">
                                    <img
                                      src={visit.prescriptionPhoto.imageUrl}
                                      alt={visit.prescriptionPhoto.title}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                    />
                                    <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                      <Eye className="w-5 h-5" />
                                    </div>
                                  </div>
                                  <h6 className="font-bold text-slate-900 text-xs truncate">
                                    {visit.prescriptionPhoto.title}
                                  </h6>
                                  <span className="text-[10px] text-slate-400 block mt-0.5">
                                    {visit.prescriptionPhoto.notes || visit.prescriptionPhoto.date}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* التبويب 3: سجل الزيارات السابقة */}
          {activeTab === "history" && (
            <div className="space-y-4">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <History className="w-5 h-5 text-teal-600" />
                <span>{t("tabHistory")}</span>
              </h3>

              {activePatient.visits.map((v) => (
                <Card key={v.id} className="p-6 bg-white border-slate-200 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                      <Calendar className="w-4 h-4 text-clinic-600" />
                      <span>{t("visitDay")}: {language === "ar" ? formatArabicDate(v.date) : v.date}</span>
                    </div>

                    {v.prescriptionPhoto && (
                      <button
                        onClick={() => v.prescriptionPhoto && setPreviewPhoto(v.prescriptionPhoto)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-clinic-50 text-clinic-800 text-xs font-bold border border-clinic-200 hover:bg-clinic-100"
                      >
                        <Pill className="w-3.5 h-3.5 text-clinic-600" />
                        <span>{t("viewRxPhotoBtn")}</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl text-center text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px] font-bold">{t("weight")}</span>
                      <span className="font-black text-slate-900">{v.weightKg ? `${v.weightKg} ${t("kg")}` : "--"}</span>
                    </div>
                    <div>
                      <span className="text-rose-500 block text-[10px] font-bold">{t("temperature")}</span>
                      <span className="font-black text-rose-700">{v.temperatureC ? `${v.temperatureC} °C` : "--"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] font-bold">{t("height")}</span>
                      <span className="font-black text-slate-900">{v.heightCm ? `${v.heightCm} ${t("cm")}` : "--"}</span>
                    </div>
                  </div>

                  {v.diagnosisText && (
                    <div className="text-xs space-y-2">
                      <div className="p-3 bg-clinic-50 rounded-xl border border-clinic-100">
                        <span className="font-bold text-clinic-900 block mb-0.5">{t("doctorDiagnosisTitle")}</span>
                        <p className="font-extrabold text-slate-900">{v.diagnosisText}</p>
                      </div>
                      {v.clinicalExamination && (
                        <p className="text-slate-600">
                          <strong>{t("clinicalExamLabel")}: </strong> {v.clinicalExamination}
                        </p>
                      )}
                      {v.recommendations && (
                        <p className="text-slate-500">
                          <strong>{t("recommendationsLabel")}: </strong> {v.recommendations}
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* نافذة المعاينة والتكبير للصور الطبية */}
      <Modal
        isOpen={!!previewPhoto}
        onClose={() => setPreviewPhoto(null)}
        title={previewPhoto?.title || t("preview")}
        description={previewPhoto ? `${previewPhoto.date}` : ""}
        maxWidth="xl"
      >
        <div className="space-y-4 text-center">
          <div className="w-full max-h-[70vh] rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center p-2">
            <img
              src={previewPhoto?.imageUrl}
              alt={previewPhoto?.title}
              className="max-h-[60vh] max-w-full object-contain rounded-xl"
            />
          </div>
          {previewPhoto?.notes && (
            <p className="text-xs font-semibold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
              {previewPhoto.notes}
            </p>
          )}
          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={() => setPreviewPhoto(null)}>
              {t("close")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

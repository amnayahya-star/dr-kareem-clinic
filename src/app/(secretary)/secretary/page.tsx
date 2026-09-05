"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { MOCK_PATIENT_FILES, PatientFile, VisitRecord, MedicalPhoto } from "@/lib/mock-data/patients";
import {
  fetchPatients,
  fetchDeletedPatients,
  softDeletePatient,
  restorePatient,
  permanentDeletePatient,
  calculateRemainingDays,
} from "@/services/patientService";
import { attachPrescriptionPhoto, addExtraLabPhotoToVisit } from "@/services/visitService";
import {
  ClinicNotification,
  subscribeToClinicNotifications,
  getClinicNotifications,
  markNotificationSnapped,
  playNotificationChime,
  notifySecretarySavedVisit,
} from "@/services/notificationService";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";
import { calculateArabicAge, formatArabicDate, normalizeArabicText } from "@/lib/utils";
import {
  UserPlus,
  Search,
  FilePlus2,
  Camera,
  Calendar,
  Phone,
  AlertTriangle,
  FlaskConical,
  Pill,
  History,
  Eye,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronUp,
  Users,
  ArrowRight,
  User,
  ChevronLeft,
  Plus,
  CalendarDays,
  Bell,
  BellRing,
  Sparkles,
  Trash2,
  RotateCcw,
  Clock,
  Archive,
  ShieldAlert,
} from "lucide-react";

export default function SecretaryPureWorkflowPage() {
  const { language, t, isRTL } = useLanguage();
  const [patients, setPatients] = useState<PatientFile[]>(MOCK_PATIENT_FILES);
  const [deletedPatients, setDeletedPatients] = useState<PatientFile[]>([]);
  const [activeTabMode, setActiveTabMode] = useState<"active" | "recycle_bin">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Real-time notifications for Doctor Approvals
  const [activeAlert, setActiveAlert] = useState<ClinicNotification | null>(null);
  const [pendingNotifications, setPendingNotifications] = useState<ClinicNotification[]>([]);

  // Date Filter State ('all' | 'today' | 'yesterday' | 'custom')
  const [dateFilterMode, setDateFilterMode] = useState<"all" | "today" | "yesterday" | "custom">("all");
  const [customFilterDate, setCustomFilterDate] = useState<string>("");

  // Selected Child ID (null means viewing the registered children list / day table)
  const [activePatientId, setActivePatientId] = useState<string | null>(null);

  // Expanded Visit IDs in child's file
  const [expandedVisitIds, setExpandedVisitIds] = useState<Record<string, boolean>>({});

  // Modals
  const [isSnapRxModalOpen, setIsSnapRxModalOpen] = useState(false);
  const [isAddExtraLabModalOpen, setIsAddExtraLabModalOpen] = useState(false);
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState(false);
  const [childToDelete, setChildToDelete] = useState<PatientFile | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<MedicalPhoto | null>(null);

  // Prescription Photo Upload State
  const [targetVisitId, setTargetVisitId] = useState<string>("");
  const [rxPhotoNotes, setRxPhotoNotes] = useState("");
  const [rxPhotoFile, setRxPhotoFile] = useState<File | null>(null);
  const [uploadedRxPhotoPreview, setUploadedRxPhotoPreview] = useState<string | null>(null);
  const rxFileInputRef = useRef<HTMLInputElement>(null);

  // Extra Lab Photo Upload State
  const [extraLabTitle, setExtraLabTitle] = useState("");
  const [extraLabFile, setExtraLabFile] = useState<File | null>(null);
  const [extraLabPreview, setExtraLabPreview] = useState<string | null>(null);
  const extraLabInputRef = useRef<HTMLInputElement>(null);

  // Load patients from Database and subscribe to live doctor notifications
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [activeData, deletedData] = await Promise.all([
          fetchPatients(),
          fetchDeletedPatients(),
        ]);
        if (activeData && activeData.length > 0) {
          setPatients(activeData);
        }
        setDeletedPatients(deletedData);
      } catch (err) {
        console.error("Error loading patients:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();

    // Load initial pending notifications
    setPendingNotifications(getClinicNotifications().filter((n) => !n.isSnapped));

    // Listen for Realtime alerts from the Doctor
    const unsubscribe = subscribeToClinicNotifications((notif) => {
      if (notif.type === "visit_approved_needs_rx") {
        playNotificationChime();
        setActiveAlert(notif);
        setPendingNotifications((prev) => [
          notif,
          ...prev.filter((n) => n.visitId !== notif.visitId),
        ]);
      }
    });

    const handleUpdate = () => {
      setPendingNotifications(getClinicNotifications().filter((n) => !n.isSnapped));
    };
    window.addEventListener("clinic:notification_updated", handleUpdate);

    return () => {
      unsubscribe();
      window.removeEventListener("clinic:notification_updated", handleUpdate);
    };
  }, []);

  // Today & Yesterday Strings (YYYY-MM-DD)
  const todayStr = new Date().toISOString().split("T")[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  // Toggle Visit Accordion
  const toggleVisitExpand = (visitId: string) => {
    setExpandedVisitIds((prev) => ({
      ...prev,
      [visitId]: !prev[visitId],
    }));
  };

  // Filtered Patients by Search & Selected Date
  const filteredPatientsWithVisits = useMemo(() => {
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

  // Selected Active Patient
  const activePatient = patients.find((p) => p.id === activePatientId) || null;

  // Trigger Snap Prescription from Notification
  const handleSnapFromAlert = (notif: ClinicNotification) => {
    setActivePatientId(notif.patientId);
    setTargetVisitId(notif.visitId || "");
    setUploadedRxPhotoPreview(null);
    setRxPhotoFile(null);
    setIsSnapRxModalOpen(true);
    setActiveAlert(null);
  };

  // Handler: Soft Delete Child (Move to 3-month Recycle Bin)
  const handleConfirmSoftDelete = async () => {
    if (!childToDelete) return;

    try {
      await softDeletePatient(childToDelete);
      setPatients((prev) => prev.filter((p) => p.id !== childToDelete.id));
      const updatedDeleted = await fetchDeletedPatients();
      setDeletedPatients(updatedDeleted);
      setActivePatientId(null);
      setIsDeleteConfirmModalOpen(false);
      setChildToDelete(null);
    } catch (err: any) {
      alert(`خطأ في نقل الملف للمحذوفات: ${err.message}`);
    }
  };

  // Handler: Restore Patient from Recycle Bin
  const handleRestorePatient = async (patientId: string) => {
    try {
      const restored = await restorePatient(patientId);
      if (restored) {
        setPatients([restored, ...patients]);
        setDeletedPatients((prev) => prev.filter((p) => p.id !== patientId));
      }
    } catch (err: any) {
      alert(`خطأ في استعادة الملف: ${err.message}`);
    }
  };

  // Handler: Permanent Delete Patient
  const handlePermanentDelete = async (patientId: string) => {
    if (!window.confirm(t("confirmPermanentDelete"))) return;
    try {
      await permanentDeletePatient(patientId);
      setDeletedPatients((prev) => prev.filter((p) => p.id !== patientId));
    } catch (err: any) {
      alert(`خطأ في الحذف النهائي: ${err.message}`);
    }
  };

  // Handle Real Rx File Picker
  const handleRxFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setRxPhotoFile(file);
    setUploadedRxPhotoPreview(URL.createObjectURL(file));
  };

  // Handler: Attach Prescription Photo
  const handleSaveRxPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePatient || !targetVisitId) return;

    try {
      let savedRxPhoto: MedicalPhoto;

      if (rxPhotoFile) {
        savedRxPhoto = await attachPrescriptionPhoto(
          targetVisitId,
          activePatient.id,
          rxPhotoFile,
          rxPhotoNotes
        );
      } else {
        savedRxPhoto = {
          id: `rx-photo-${Date.now()}`,
          title: language === "ar" ? `صورة وصفة الزيارة (${formatArabicDate(new Date())})` : `Prescription Photo (${new Date().toLocaleDateString()})`,
          type: "prescription",
          date: new Date().toISOString().split("T")[0],
          notes: rxPhotoNotes || (language === "ar" ? "وصفة الطبيب المعتمدة" : "Doctor Approved Prescription"),
          imageUrl: uploadedRxPhotoPreview || "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80",
        };
      }

      const updatedVisits = activePatient.visits.map((v) =>
        v.id === targetVisitId ? { ...v, prescriptionPhoto: savedRxPhoto, isCompleted: true } : v
      );

      const updatedPatient: PatientFile = {
        ...activePatient,
        visits: updatedVisits,
        allPrescriptionPhotos: [savedRxPhoto, ...activePatient.allPrescriptionPhotos],
      };

      setPatients(patients.map((p) => (p.id === activePatient.id ? updatedPatient : p)));
      markNotificationSnapped(targetVisitId);
      setPendingNotifications((prev) => prev.filter((n) => n.visitId !== targetVisitId));
      setIsSnapRxModalOpen(false);
      setRxPhotoNotes("");
      setRxPhotoFile(null);
      setUploadedRxPhotoPreview(null);
    } catch (err: any) {
      alert(language === "ar" ? `فشل حفظ صورة الوصفة: ${err.message}` : `Failed to save prescription: ${err.message}`);
    }
  };

  // Handle Extra Lab File Picker
  const handleExtraLabSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setExtraLabFile(file);
    setExtraLabPreview(URL.createObjectURL(file));
  };

  // Handler: Save Extra Lab Photo to Existing Visit
  const handleSaveExtraLabPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePatient || !targetVisitId || !extraLabFile) return;

    try {
      const newLabPhoto = await addExtraLabPhotoToVisit(
        targetVisitId,
        activePatient.id,
        extraLabFile,
        extraLabTitle
      );

      const updatedVisits = activePatient.visits.map((v) =>
        v.id === targetVisitId ? { ...v, labPhotos: [...(v.labPhotos || []), newLabPhoto] } : v
      );

      const updatedPatient: PatientFile = {
        ...activePatient,
        visits: updatedVisits,
        allLabPhotos: [newLabPhoto, ...activePatient.allLabPhotos],
      };

      setPatients(patients.map((p) => (p.id === activePatient.id ? updatedPatient : p)));
      setIsAddExtraLabModalOpen(false);
      setExtraLabTitle("");
      setExtraLabFile(null);
      setExtraLabPreview(null);
    } catch (err: any) {
      alert(language === "ar" ? `فشل إضافة صورة التحليل: ${err.message}` : `Failed to add lab photo: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* 0. Live Pop-up Alert Banner when Doctor Approves a Visit */}
      {activeAlert && (
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white p-4 sm:p-5 rounded-3xl shadow-xl border-2 border-amber-300 animate-bounce duration-1000 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30">
              <BellRing className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider bg-white text-amber-900 px-2.5 py-0.5 rounded-full">
                  {language === "ar" ? "🔔 تنبيه فوري من الطبيب" : "Doctor Approval Alert"}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black mt-1">
                {language === "ar"
                  ? `اعتمد الدكتور كشف الطفل: ${activeAlert.childName}`
                  : `Doctor Approved Visit for: ${activeAlert.childName}`}
              </h3>
              <p className="text-xs text-amber-100 mt-0.5 font-medium">
                {language === "ar"
                  ? "يرجى التقاط صورة للوصفة الورقية بعد خروج الطفل لحفظها في سجله الطبي."
                  : "Please snap and attach the paper prescription photo now."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <Button
              variant="secondary"
              size="md"
              onClick={() => handleSnapFromAlert(activeAlert)}
              className="bg-white text-amber-950 hover:bg-amber-50 font-black shadow-md gap-2 h-11 px-5"
            >
              <Camera className="w-4 h-4 text-amber-600" />
              <span>{language === "ar" ? "📸 التقاط صورة الوصفة الآن" : "Snap Prescription Now"}</span>
            </Button>
            <button
              onClick={() => setActiveAlert(null)}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              title={t("close")}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* 0.5. Persistent Pending Prescriptions Queue */}
      {pendingNotifications.length > 0 && !activePatient && activeTabMode === "active" && (
        <div className="bg-amber-50/80 border-2 border-amber-300 rounded-3xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-black text-amber-950 text-sm">
              <Sparkles className="w-5 h-5 text-amber-600" />
              <span>
                {language === "ar"
                  ? `أطفال بانتظار تصوير الوصفة (${pendingNotifications.length}):`
                  : `Children Awaiting Prescription Snap (${pendingNotifications.length}):`}
              </span>
            </div>
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-xl">
              {language === "ar" ? "يرجى تصوير الروشتات" : "Action Required"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {pendingNotifications.map((notif) => (
              <div
                key={notif.id}
                className="bg-white p-3.5 rounded-2xl border border-amber-200 shadow-xs flex items-center justify-between gap-3 hover:border-amber-400 transition-colors"
              >
                <div className="min-w-0">
                  <h4 className="font-black text-slate-900 text-xs truncate">
                    {notif.childName}
                  </h4>
                  <p className="text-[10px] text-slate-500 truncate mt-0.5">
                    {notif.diagnosisText || (language === "ar" ? "تم اعتماد الكشف" : "Visit Approved")}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="warm"
                  onClick={() => handleSnapFromAlert(notif)}
                  className="font-bold text-xs gap-1.5 shrink-0 shadow-xs"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{language === "ar" ? "تصوير" : "Snap"}</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1. Header Title & Add Patient Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#0A1E33] tracking-tight">
            شاشة الاستقبال
          </h2>
          <p className="text-xs text-[#697A8D] font-medium mt-0.5">
            إدارة المرضى والمواعيد والزيارات اليومية
          </p>
        </div>

        <Link
          href="/secretary/new-patient"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0C7A77] hover:bg-[#0A6B68] text-white font-bold text-xs sm:text-sm shadow-xs transition-all duration-150 cursor-pointer shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>إضافة طفل جديد</span>
        </Link>
      </div>

      {/* 2. Four Top Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: المرضى المسجلون */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E5EBF0] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-[#697A8D] block">المرضى المسجلون</span>
            <span className="text-2xl sm:text-3xl font-black text-[#0A1E33] block mt-1">
              {patients.length}
            </span>
            <span className="text-[10px] text-[#8DA4B8] font-medium block mt-0.5">إجمالي المرضى</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#E8F2F2] text-[#147D7A] flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 stroke-[1.8]" />
          </div>
        </div>

        {/* Card 2: مواعيد اليوم */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E5EBF0] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-[#697A8D] block">مواعيد اليوم</span>
            <span className="text-2xl sm:text-3xl font-black text-[#0A1E33] block mt-1">
              {patients.filter((p) => p.visits.some((v) => v.date === new Date().toISOString().split("T")[0])).length || 12}
            </span>
            <span className="text-[10px] text-[#8DA4B8] font-medium block mt-0.5">اليوم</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#E8F2F2] text-[#147D7A] flex items-center justify-center shrink-0">
            <Calendar className="w-6 h-6 stroke-[1.8]" />
          </div>
        </div>

        {/* Card 3: في الانتظار */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E5EBF0] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-[#697A8D] block">في الانتظار</span>
            <span className="text-2xl sm:text-3xl font-black text-[#F59E0B] block mt-1">
              {pendingNotifications.length > 0 ? pendingNotifications.length : 4}
            </span>
            <span className="text-[10px] text-[#8DA4B8] font-medium block mt-0.5">الآن</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
            <Clock className="w-6 h-6 stroke-[1.8]" />
          </div>
        </div>

        {/* Card 4: زيارات مكتملة */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E5EBF0] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-[#697A8D] block">زيارات مكتملة</span>
            <span className="text-2xl sm:text-3xl font-black text-[#0A1E33] block mt-1">
              8
            </span>
            <span className="text-[10px] text-[#8DA4B8] font-medium block mt-0.5">اليوم</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#E8F2F2] text-[#147D7A] flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6 stroke-[1.8]" />
          </div>
        </div>
      </div>

      {/* 3. Search and Filtering Bar */}
      {!activePatient && (
        <div className="bg-white rounded-2xl p-3 border border-[#E5EBF0] shadow-2xs flex flex-col md:flex-row items-center gap-2.5">
          {/* Main Search Input */}
          <div className="relative flex-1 w-full">
            <input
              type="text"
              placeholder="ابحث باسم الطفل أو رقم الملف أو رقم الهاتف"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pr-10 pl-4 rounded-xl border border-[#D7E0E5] focus:border-[#147D7A] focus:ring-2 focus:ring-[#147D7A]/15 text-xs font-bold text-[#0A1E33] placeholder:text-[#94A3B8] outline-none transition-all"
            />
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-[#94A3B8]">
              <Search className="w-4 h-4" />
            </div>
          </div>

          {/* Date Picker */}
          <div className="relative w-full md:w-44">
            <input
              type="date"
              value={customFilterDate}
              onChange={(e) => {
                setCustomFilterDate(e.target.value);
                if (e.target.value) setDateFilterMode("custom");
              }}
              className="w-full h-11 px-3 rounded-xl border border-[#D7E0E5] focus:border-[#147D7A] text-xs font-bold text-[#0A1E33] outline-none"
            />
          </div>

          {/* Status Dropdown */}
          <div className="w-full md:w-36">
            <select
              value={dateFilterMode}
              onChange={(e) => setDateFilterMode(e.target.value as any)}
              className="w-full h-11 px-3 rounded-xl border border-[#D7E0E5] focus:border-[#147D7A] text-xs font-bold text-[#0A1E33] bg-white outline-none cursor-pointer"
            >
              <option value="all">جميع الحالات</option>
              <option value="today">مواعيد اليوم</option>
              <option value="yesterday">أمس</option>
            </select>
          </div>

          {/* Search Button */}
          <button
            type="button"
            className="w-full md:w-24 h-11 bg-[#0A1E33] hover:bg-[#147D7A] text-white rounded-xl font-bold text-xs flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <span>بحث</span>
          </button>
        </div>
      )}

      {/* 4. Main Two-Column Split (Patient List on Right, Waiting Queue on Left) */}
      {!activePatient ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Main Patient List Table (8 Columns on Large Screens) */}
          <div className="lg:col-span-8 bg-white rounded-2xl p-5 border border-[#E5EBF0] shadow-2xs space-y-4">
            {/* Table Header with Tabs */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EBF0]">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#147D7A]" />
                <h3 className="text-base font-black text-[#0A1E33]">قائمة المرضى</h3>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-4 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setDateFilterMode("today")}
                  className={`pb-1 transition-colors border-b-2 ${
                    dateFilterMode === "today"
                      ? "text-[#147D7A] border-[#147D7A] font-black"
                      : "text-[#697A8D] border-transparent hover:text-[#0A1E33]"
                  }`}
                >
                  مواعيد اليوم
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilterMode("all")}
                  className={`pb-1 transition-colors border-b-2 ${
                    dateFilterMode === "all"
                      ? "text-[#147D7A] border-[#147D7A] font-black"
                      : "text-[#697A8D] border-transparent hover:text-[#0A1E33]"
                  }`}
                >
                  جميع المرضى
                </button>
                <Link
                  href="/secretary/recycle-bin"
                  className="text-[#697A8D] hover:text-[#0A1E33] transition-colors pb-1 border-b-2 border-transparent"
                >
                  الأرشيف
                </Link>
              </div>
            </div>

            {/* Patients Table */}
            {filteredPatientsWithVisits.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <CalendarDays className="w-12 h-12 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-600">{t("noChildrenFound")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E5EBF0] text-[#697A8D] font-bold">
                      <th className="pb-3 pr-2">اسم الطفل</th>
                      <th className="pb-3">رقم الملف</th>
                      <th className="pb-3">العمر</th>
                      <th className="pb-3">ولي الأمر</th>
                      <th className="pb-3">موعد الزيارة</th>
                      <th className="pb-3">الحالة</th>
                      <th className="pb-3 text-left pl-2">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F7] font-bold">
                    {filteredPatientsWithVisits.slice(0, 8).map((patient, index) => {
                      const latestV = patient.visits[0];
                      const statusBadge =
                        index === 0
                          ? { label: "بانتظار الطبيب", bg: "bg-amber-50 text-amber-700 border-amber-200" }
                          : index === 1
                          ? { label: "تم تسجيل الوصول", bg: "bg-teal-50 text-teal-700 border-teal-200" }
                          : { label: "موعد مؤكد", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" };

                      return (
                        <tr
                          key={patient.id}
                          className="hover:bg-[#F9FAFB] transition-colors"
                        >
                          <td className="py-3.5 pr-2 font-black text-[#0A1E33]">
                            {patient.fullName}
                          </td>
                          <td className="py-3.5 font-mono text-[#697A8D]">
                            {patient.fileNumber}
                          </td>
                          <td className="py-3.5 text-[#697A8D]">
                            {calculateArabicAge(patient.dateOfBirth)}
                          </td>
                          <td className="py-3.5 text-[#697A8D]">
                            {patient.guardianName}
                          </td>
                          <td className="py-3.5 font-mono text-[#697A8D]">
                            {latestV ? "10:30 ص" : "11:15 ص"}
                          </td>
                          <td className="py-3.5">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.bg}`}
                            >
                              {statusBadge.label}
                            </span>
                          </td>
                          <td className="py-3.5 text-left pl-2">
                            <button
                              type="button"
                              onClick={() => setActivePatientId(patient.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D7E0E5] hover:border-[#147D7A] text-[#0A1E33] hover:text-[#147D7A] font-bold text-xs transition-colors cursor-pointer"
                            >
                              <FilePlus2 className="w-3.5 h-3.5 text-[#147D7A]" />
                              <span>فتح الملف</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Left Waiting Queue Box (4 Columns on Large Screens) */}
          <div className="lg:col-span-4 bg-white rounded-2xl p-5 border border-[#E5EBF0] shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EBF0]">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#147D7A]" />
                <h3 className="text-base font-black text-[#0A1E33]">قائمة الانتظار</h3>
              </div>
              <span className="text-[10px] font-bold bg-[#E8F2F2] text-[#147D7A] px-2 py-0.5 rounded-full">
                3 بالانتظار
              </span>
            </div>

            {/* Queue Cards */}
            <div className="space-y-2.5">
              {/* Ticket 1 */}
              <div className="p-3.5 rounded-xl border border-[#E5EBF0] hover:border-[#147D7A] bg-[#FAFCFD] transition-all flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-xs font-black text-[#0A1E33]">طفل في الانتظار</span>
                  </div>
                  <span className="text-[10px] text-[#8DA4B8] block mt-1">منتظر منذ 12 دقيقة</span>
                </div>
                <span className="font-mono text-xs font-black text-[#147D7A] bg-[#E8F2F2] px-2 py-1 rounded-lg">
                  Q-001
                </span>
              </div>

              {/* Ticket 2 */}
              <div className="p-3.5 rounded-xl border border-[#E5EBF0] hover:border-[#147D7A] bg-[#FAFCFD] transition-all flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-xs font-black text-[#0A1E33]">طفل في الانتظار</span>
                  </div>
                  <span className="text-[10px] text-[#8DA4B8] block mt-1">منتظر منذ 7 دقائق</span>
                </div>
                <span className="font-mono text-xs font-black text-[#147D7A] bg-[#E8F2F2] px-2 py-1 rounded-lg">
                  Q-002
                </span>
              </div>

              {/* Ticket 3 */}
              <div className="p-3.5 rounded-xl border border-[#E5EBF0] hover:border-[#147D7A] bg-[#FAFCFD] transition-all flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-black text-[#0A1E33]">طفل في الانتظار</span>
                  </div>
                  <span className="text-[10px] text-[#8DA4B8] block mt-1">منتظر منذ 2 دقيقة</span>
                </div>
                <span className="font-mono text-xs font-black text-[#147D7A] bg-[#E8F2F2] px-2 py-1 rounded-lg">
                  Q-003
                </span>
              </div>
            </div>

            {/* Footer Link */}
            <div className="pt-2 border-t border-[#E5EBF0] text-center">
              <Link
                href="/secretary/new-visit"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#147D7A] hover:underline"
              >
                <span>عرض الكل</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      ) : (
        /* 4. The Opened Child File */
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setActivePatientId(null)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3.5 py-2 rounded-xl transition-colors shadow-xs"
            >
              <ArrowRight className="w-4 h-4" />
              <span>{t("backToChildrenTable")}</span>
            </button>

            {/* Soft Delete Child Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setChildToDelete(activePatient);
                setIsDeleteConfirmModalOpen(true);
              }}
              className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300 font-bold gap-1.5"
            >
              <Trash2 className="w-4 h-4 text-rose-500" />
              <span>{t("deleteChildBtn")}</span>
            </Button>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-xl shadow-sm">
                  {activePatient.fullName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                      {activePatient.fullName}
                    </h2>
                    <span className="font-mono text-xs font-bold bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg">
                      {activePatient.fileNumber}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    {t("age")}: <strong className="text-slate-800">{calculateArabicAge(activePatient.dateOfBirth)}</strong> |{" "}
                    {t("gender")}: {activePatient.gender === "male" ? t("male") : t("female")} | {t("guardian")}: {activePatient.guardianName} ({activePatient.phone})
                  </p>
                </div>
              </div>

              <Link href={`/secretary/new-visit?patientId=${activePatient.id}`}>
                <Button
                  variant="primary"
                  size="lg"
                  className="font-black gap-2 bg-clinic-600 hover:bg-clinic-700 shadow-sm shrink-0 px-6"
                >
                  <FilePlus2 className="w-5 h-5" />
                  <span>{t("addNewVisitBtn")}</span>
                </Button>
              </Link>
            </div>

            {activePatient.allergies && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-rose-900 text-xs font-bold">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <div>
                  <span className="text-rose-700 font-black">{t("allergyWarning")}: </span>
                  <span>{activePatient.allergies}</span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <History className="w-5 h-5 text-clinic-600" />
                <span>{t("visitsHistory")} ({activePatient.visits.length})</span>
              </h3>
              <span className="text-xs text-slate-400">{t("clickToExpandVisit")}</span>
            </div>

            {activePatient.visits.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">{t("noVisitsRecorded")}</p>
            ) : (
              <div className="space-y-3">
                {activePatient.visits.map((visit, index) => {
                  const isExpanded = !!expandedVisitIds[visit.id];

                  return (
                    <div
                      key={visit.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50/50 overflow-hidden transition-all"
                    >
                      <div
                        onClick={() => toggleVisitExpand(visit.id)}
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition-colors select-none"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-clinic-50 border border-clinic-200 text-clinic-700 flex items-center justify-center font-bold">
                            <Calendar className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 text-sm">
                                {t("visitDay")}: {language === "ar" ? formatArabicDate(visit.date) : visit.date}
                              </span>
                              {index === 0 && (
                                <span className="text-[10px] font-bold bg-clinic-100 text-clinic-800 px-2 py-0.5 rounded-md">
                                  {t("latestVisitBadge")}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                              {visit.weightKg && <span>{t("weight")}: {visit.weightKg} {t("kg")}</span>}
                              {visit.temperatureC && <span>{t("temperature")}: {visit.temperatureC} °C</span>}
                              <span>{visit.labPhotos?.length || 0} {t("labPhotosTitle")}</span>
                              <span>{visit.prescriptionPhoto ? `Rx ✓` : ""}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-500">
                            {isExpanded ? t("close") : t("preview")}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-5 pt-0 space-y-4 border-t border-slate-200/60 bg-white">
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-4 pb-2 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              {visit.prescriptionPhoto ? (
                                <button
                                  onClick={() => visit.prescriptionPhoto && setPreviewPhoto(visit.prescriptionPhoto)}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                >
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                  <span>{t("rxSnappedSuccess")}</span>
                                </button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="warm"
                                  onClick={() => {
                                    setTargetVisitId(visit.id);
                                    setUploadedRxPhotoPreview(null);
                                    setRxPhotoFile(null);
                                    setIsSnapRxModalOpen(true);
                                  }}
                                  className="font-bold text-xs gap-1.5 shadow-sm"
                                >
                                  <Camera className="w-4 h-4" />
                                  <span>{t("snapDoctorRx")}</span>
                                </Button>
                              )}
                            </div>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setTargetVisitId(visit.id);
                                setExtraLabFile(null);
                                setExtraLabPreview(null);
                                setExtraLabTitle("");
                                setIsAddExtraLabModalOpen(true);
                              }}
                              className="font-bold text-xs gap-1.5 border-amber-300 text-amber-900 bg-amber-50/60 hover:bg-amber-100"
                            >
                              <Plus className="w-4 h-4 text-amber-600" />
                              <span>{t("addExtraLabPhoto")}</span>
                            </Button>
                          </div>

                          {/* Vitals */}
                          <div className="grid grid-cols-3 gap-3 text-center text-xs">
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                              <span className="text-slate-400 text-[10px] block font-bold">{t("weight")}</span>
                              <span className="font-black text-slate-900 text-sm">
                                {visit.weightKg ? `${visit.weightKg} ${t("kg")}` : "--"}
                              </span>
                            </div>
                            <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200">
                              <span className="text-rose-500 text-[10px] block font-bold">{t("temperature")}</span>
                              <span className="font-black text-rose-700 text-sm">
                                {visit.temperatureC ? `${visit.temperatureC} °C` : "--"}
                              </span>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                              <span className="text-slate-400 text-[10px] block font-bold">{t("height")}</span>
                              <span className="font-black text-slate-900 text-sm">
                                {visit.heightCm ? `${visit.heightCm} ${t("cm")}` : "--"}
                              </span>
                            </div>
                          </div>

                          {/* Lab Photos */}
                          <div>
                            <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-2">
                              <FlaskConical className="w-4 h-4 text-amber-600" />
                              <span>{t("labPhotosTitle")} ({visit.labPhotos?.length || 0}):</span>
                            </h5>

                            {!visit.labPhotos || visit.labPhotos.length === 0 ? (
                              <p className="text-[11px] text-slate-400">{t("noLabPhotos")}</p>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {visit.labPhotos.map((lp) => (
                                  <div
                                    key={lp.id}
                                    onClick={() => setPreviewPhoto(lp)}
                                    className="p-2 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:border-amber-500 transition-all text-right group"
                                  >
                                    <div className="w-full h-24 rounded-lg overflow-hidden bg-slate-200 mb-1 relative">
                                      <img
                                        src={lp.imageUrl}
                                        alt={lp.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                      />
                                      <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                        <Eye className="w-5 h-5" />
                                      </div>
                                    </div>
                                    <span className="text-[11px] font-bold text-slate-800 truncate block">
                                      {lp.title}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Prescription Photo */}
                          {visit.prescriptionPhoto && (
                            <div className="pt-2 border-t border-slate-100">
                              <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-2">
                                <Pill className="w-4 h-4 text-clinic-600" />
                                <span>{t("rxPhotoTitle")}:</span>
                              </h5>
                              <div
                                onClick={() => visit.prescriptionPhoto && setPreviewPhoto(visit.prescriptionPhoto)}
                                className="inline-block p-2 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:border-clinic-500 transition-all text-right group"
                              >
                                <div className="w-44 h-28 rounded-lg overflow-hidden bg-slate-200 mb-1 relative">
                                  <img
                                    src={visit.prescriptionPhoto.imageUrl}
                                    alt={visit.prescriptionPhoto.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                  />
                                  <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                    <Eye className="w-5 h-5" />
                                  </div>
                                </div>
                                <span className="text-[11px] font-bold text-slate-800 block">
                                  {visit.prescriptionPhoto.title}
                                </span>
                              </div>
                            </div>
                          )}

                          {visit.diagnosisText && (
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                              <span className="font-bold text-clinic-900 block mb-0.5">{t("doctorDiagnosisTitle")}</span>
                              <p className="font-extrabold text-slate-900">{visit.diagnosisText}</p>
                              {visit.recommendations && (
                                <p className="text-slate-500 mt-1">{t("recommendationsTitle")} {visit.recommendations}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Confirm Soft Delete (Move to 3-month Recycle Bin) */}
      <Modal
        isOpen={isDeleteConfirmModalOpen}
        onClose={() => setIsDeleteConfirmModalOpen(false)}
        title={t("confirmDeleteModalTitle")}
        description={t("confirmDeleteModalDesc")}
        maxWidth="md"
      >
        <div className="space-y-4">
          {childToDelete && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-rose-950 font-black text-sm">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                <span>{childToDelete.fullName} ({childToDelete.fileNumber})</span>
              </div>
              <p className="text-xs text-rose-700">
                {language === "ar"
                  ? "سيتم حفظ هذا الملف في سلة المحذوفات لمدة 90 يوماً مع كافة زياراته وتحاليله، ويمكن استعادته في أي وقت."
                  : "This record will be safely stored in the recycle bin for 90 days with all its visits and lab tests, and can be restored anytime."}
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDeleteConfirmModalOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirmSoftDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              {t("confirmDeleteAction")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal 2: Snap & Attach Prescription Photo */}
      <Modal
        isOpen={isSnapRxModalOpen}
        onClose={() => setIsSnapRxModalOpen(false)}
        title={t("snapRxModalTitle")}
        description={t("snapRxModalDesc")}
        maxWidth="md"
      >
        <form onSubmit={handleSaveRxPhoto} className="space-y-4">
          <input
            ref={rxFileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleRxFileSelect}
            className="hidden"
          />

          {uploadedRxPhotoPreview ? (
            <div className="space-y-3">
              <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-slate-900 border border-slate-200">
                <img
                  src={uploadedRxPhotoPreview}
                  alt="Rx Preview"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => rxFileInputRef.current?.click()}
                  className="text-xs font-bold"
                >
                  {t("reSnapPhoto")}
                </Button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => rxFileInputRef.current?.click()}
              className="p-6 border-2 border-dashed border-clinic-400 bg-clinic-50/50 rounded-2xl text-center space-y-2 cursor-pointer hover:bg-clinic-100/50 transition-colors"
            >
              <Camera className="w-10 h-10 text-clinic-600 mx-auto" />
              <p className="text-sm font-bold text-slate-800">{t("snapRxPrompt")}</p>
            </div>
          )}

          <Input
            label={t("rxNoteOptional")}
            placeholder="e.g. Antibiotics"
            value={rxPhotoNotes}
            onChange={(e) => setRxPhotoNotes(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsSnapRxModalOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="primary" className="font-bold px-6">
              {t("saveRxPhotoBtn")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 3: Add Extra Lab Photo to Existing Visit */}
      <Modal
        isOpen={isAddExtraLabModalOpen}
        onClose={() => setIsAddExtraLabModalOpen(false)}
        title={t("addExtraLabModalTitle")}
        description={t("addExtraLabModalDesc")}
        maxWidth="md"
      >
        <form onSubmit={handleSaveExtraLabPhoto} className="space-y-4">
          <input
            ref={extraLabInputRef}
            type="file"
            accept="image/*,.pdf"
            capture="environment"
            onChange={handleExtraLabSelect}
            className="hidden"
          />

          <Input
            label={t("testNameOrType")}
            required
            placeholder="e.g. CBC, CRP, Urine..."
            value={extraLabTitle}
            onChange={(e) => setExtraLabTitle(e.target.value)}
          />

          {extraLabPreview ? (
            <div className="space-y-3">
              <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-slate-900 border border-slate-200">
                <img
                  src={extraLabPreview}
                  alt="Lab preview"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => extraLabInputRef.current?.click()}
                  className="text-xs font-bold"
                >
                  {t("reSnapPhoto")}
                </Button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => extraLabInputRef.current?.click()}
              className="p-6 border-2 border-dashed border-amber-300 bg-amber-50/50 rounded-2xl text-center space-y-2 cursor-pointer hover:bg-amber-100/50 transition-colors"
            >
              <Camera className="w-10 h-10 text-amber-600 mx-auto" />
              <p className="text-sm font-bold text-slate-800">{t("snapLabPrompt")}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsAddExtraLabModalOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={!extraLabFile} variant="primary" className="font-bold px-6 bg-amber-600 hover:bg-amber-700">
              {t("saveLabPhotoBtn")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Fullscreen Photo Preview Modal */}
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

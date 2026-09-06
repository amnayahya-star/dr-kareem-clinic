"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { MOCK_PATIENT_FILES, PatientFile, VisitRecord, MedicalPhoto } from "@/lib/mock-data/patients";
import { fetchPatients } from "@/services/patientService";
import { createVisitRecord, validateMeasurements } from "@/services/visitService";
import { notifySecretarySavedVisit } from "@/services/notificationService";
import { useLanguage } from "@/context/LanguageContext";
import { calculateArabicAge, formatArabicDate } from "@/lib/utils";
import {
  ArrowRight,
  Activity,
  Camera,
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  FilePlus2,
  Scale,
  Thermometer,
  Ruler,
  Plus,
  Eye,
  ShieldAlert,
  Wind,
  HeartPulse,
  Stethoscope,
} from "lucide-react";

function NewVisitContent() {
  const { language, t, isRTL } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdParam = searchParams.get("patientId") || "p-001";

  const [patients, setPatients] = useState<PatientFile[]>(MOCK_PATIENT_FILES);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(patientIdParam);

  // Load patients from Database
  useEffect(() => {
    async function load() {
      const data = await fetchPatients();
      if (data && data.length > 0) {
        setPatients(data);
        if (patientIdParam && data.some((p) => p.id === patientIdParam)) {
          setSelectedPatientId(patientIdParam);
        } else {
          setSelectedPatientId(data[0].id);
        }
      }
    }
    load();
  }, [patientIdParam]);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || patients[0];

  // Secretary Enters Chief Complaint and Vitals
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [temperatureC, setTemperatureC] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [oxygenSaturation, setOxygenSaturation] = useState("");
  const [bloodPressure, setBloodPressure] = useState("");
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  // Multiple Lab Photos State
  const [uploadedPhotos, setUploadedPhotos] = useState<MedicalPhoto[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [currentTestName, setCurrentTestName] = useState("");
  const [previewModalPhoto, setPreviewModalPhoto] = useState<MedicalPhoto | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Quick Common Lab Tests in Arabic & English
  const commonLabTests = language === "ar" ? [
    "تحليل دم شامل (CBC)",
    "فحص بروتين الالتهاب (CRP)",
    "فحص إدرار عام (GUE)",
    "فحص خروج / براز (GSE)",
    "أشعة سينية للصدر (Chest X-Ray)",
    "سونار بطن (Ultrasound)",
    "مسحة بلعوم (Throat Swab)",
  ] : [
    "Complete Blood Count (CBC)",
    "C-Reactive Protein (CRP)",
    "General Urine Exam (GUE)",
    "General Stool Exam (GSE)",
    "Chest X-Ray",
    "Abdominal Ultrasound",
    "Throat Swab",
  ];

  // Handle Multi-file or Camera Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newPhotosList: MedicalPhoto[] = [];
    const newFilesList: File[] = [];

    Array.from(files).forEach((file, idx) => {
      const objectUrl = URL.createObjectURL(file);
      const title =
        currentTestName.trim() ||
        (files.length > 1
          ? `${t("testNameOrType")} ${uploadedPhotos.length + idx + 1}`
          : file.name.replace(/\.[^/.]+$/, "") || "Lab Test");

      const photo: MedicalPhoto = {
        id: `lab-${Date.now()}-${idx}`,
        title: title,
        type: "lab_test",
        date: new Date().toISOString().split("T")[0],
        notes: `Uploaded (${(file.size / 1024).toFixed(0)} KB)`,
        imageUrl: objectUrl,
      };

      newPhotosList.push(photo);
      newFilesList.push(file);
    });

    setUploadedPhotos((prev) => [...prev, ...newPhotosList]);
    setUploadedFiles((prev) => [...prev, ...newFilesList]);
    setCurrentTestName("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removePhoto = (id: string, index: number) => {
    setUploadedPhotos((prev) => prev.filter((p) => p.id !== id));
    setUploadedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Submit & Save Visit
  const handleSaveVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    const mValidation = validateMeasurements({
      weightKg: weightKg ? parseFloat(weightKg) : undefined,
      heightCm: heightCm ? parseFloat(heightCm) : undefined,
      temperatureC: temperatureC ? parseFloat(temperatureC) : undefined,
      bloodPressure: bloodPressure.trim() ? bloodPressure.trim() : undefined,
      oxygenSaturation: oxygenSaturation ? parseFloat(oxygenSaturation) : undefined,
    });

    if (!mValidation.isValid) {
      setSaveError(mValidation.error || "يرجى التأكد من صحة القياسات المدخلة");
      return;
    }

    setIsSubmitting(true);

    try {
      const createdVisit = await createVisitRecord({
        patientId: selectedPatient.id,
        chiefComplaint: chiefComplaint.trim() ? chiefComplaint.trim() : undefined,
        weightKg: weightKg ? parseFloat(weightKg) : undefined,
        heightCm: heightCm ? parseFloat(heightCm) : undefined,
        temperatureC: temperatureC ? parseFloat(temperatureC) : undefined,
        bloodPressure: bloodPressure.trim() ? bloodPressure.trim() : undefined,
        oxygenSaturation: oxygenSaturation ? parseFloat(oxygenSaturation) : undefined,
        labPhotoFiles: uploadedFiles,
      });

      const updatedPatient: PatientFile = {
        ...selectedPatient,
        visits: [createdVisit, ...selectedPatient.visits],
        allLabPhotos: [...createdVisit.labPhotos, ...selectedPatient.allLabPhotos],
      };

      // إرسال إشعار فوري في نفس اللحظة لشاشة الطبيب
      notifySecretarySavedVisit({
        visitId: createdVisit.id,
        patientId: selectedPatient.id,
        childName: selectedPatient.fullName,
        weightKg: createdVisit.weightKg,
        temperatureC: createdVisit.temperatureC,
        labPhotosCount: createdVisit.labPhotos?.length || 0,
      });

      setPatients(patients.map((p) => (p.id === selectedPatient.id ? updatedPatient : p)));
      setIsSuccess(true);
    } catch (err: any) {
      setSaveError(err.message || (language === "ar" ? "فشل حفظ الزيارة" : "Failed to save visit"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/secretary"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 bg-white border border-slate-200 px-3.5 py-2 rounded-xl transition-colors shadow-xs"
        >
          <ArrowRight className="w-4 h-4" />
          <span>{t("backToReception")}</span>
        </Link>
      </div>

      {isSuccess ? (
        <Card className="text-center py-12 space-y-4 bg-white border-emerald-200 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h3 className="text-2xl font-black text-slate-900">
            {t("visitRegisteredSuccess")} ({selectedPatient.fullName})
          </h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            {t("visitRegisteredSuccessDesc")} ({uploadedPhotos.length} {t("labPhotosTitle")}).
          </p>

          <div className="flex flex-wrap justify-center gap-3 pt-4">
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                setIsSuccess(false);
                setChiefComplaint("");
                setWeightKg("");
                setHeightCm("");
                setTemperatureC("");
                setOxygenSaturation("");
                setBloodPressure("");
                setUploadedPhotos([]);
                setUploadedFiles([]);
                setSaveError(null);
              }}
              className="font-bold gap-2"
            >
              <FilePlus2 className="w-5 h-5" />
              <span>{t("addAnotherVisitBtn")}</span>
            </Button>

            <Link href="/secretary">
              <Button variant="outline" size="lg" className="font-bold">
                {t("backToChildFile")}
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <form onSubmit={handleSaveVisit} className="space-y-6">
          {saveError && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl text-xs font-bold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Header Card: Patient Information */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-xl shadow-sm">
                  {selectedPatient.fullName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                      {selectedPatient.fullName}
                    </h2>
                    <span className="font-mono text-xs font-bold bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg">
                      {selectedPatient.fileNumber}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    {t("age")}: <strong className="text-slate-800">{calculateArabicAge(selectedPatient.dateOfBirth)}</strong> |{" "}
                    {t("gender")}: {selectedPatient.gender === "male" ? t("male") : t("female")} | {t("guardian")}: {selectedPatient.guardianName} ({selectedPatient.phone})
                  </p>
                </div>
              </div>

              {/* Patient Selector */}
              <div className={`space-y-1 ${isRTL ? "text-right" : "text-left"}`}>
                <span className="text-[10px] text-slate-400 font-bold block">{t("switchChild")}</span>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold px-3 py-2 text-slate-800 outline-none focus:border-clinic-500"
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.fileNumber})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Critical Allergy Warning */}
            {selectedPatient.allergies && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-rose-900 text-xs font-bold">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <div>
                  <span className="text-rose-700 font-black">{t("allergyWarning")}: </span>
                  <span>{selectedPatient.allergies}</span>
                </div>
              </div>
            )}
          </div>

          {/* Section 1: Chief Complaint */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-clinic-600" />
              <span>{language === "ar" ? "سبب الزيارة والشكوى الرئيسية" : "Chief Complaint & Reason for Visit"}</span>
            </h3>
            <p className="text-xs text-slate-500">
              {language === "ar" ? "تسجيل الأعراض أو سبب قدوم الطفل للاستشارة (اختياري)" : "Record symptoms or reason for visit (optional)"}
            </p>
            <input
              type="text"
              placeholder={language === "ar" ? "مثال: حمى وسعال منذ يومين، فحص دوري، مغص متكرر..." : "e.g. Fever, cough, routine checkup..."}
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 outline-none focus:border-clinic-500 focus:ring-2 focus:ring-clinic-100 bg-slate-50 focus:bg-white transition-all"
            />
          </div>

          {/* Section 2: Vital Signs */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-clinic-600" />
              <span>{t("vitalsSectionTitle")}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Weight */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">{t("weightInputLabel")}</label>
                  <Scale className="w-4 h-4 text-clinic-600" />
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.05"
                    placeholder="14.5"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    className="w-full h-14 px-3 rounded-xl border border-slate-300 text-xl font-black text-slate-900 text-center outline-none focus:border-clinic-500 focus:ring-2 focus:ring-clinic-100 bg-white"
                  />
                  <span className={`absolute ${isRTL ? "left-3" : "right-3"} top-4 text-xs text-slate-400 font-bold`}>{t("kg")}</span>
                </div>
              </div>

              {/* Temperature */}
              <div className="p-5 rounded-2xl bg-rose-50/50 border border-rose-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-rose-900">{t("tempInputLabel")}</label>
                  <Thermometer className="w-4 h-4 text-rose-600" />
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    placeholder="38.5"
                    value={temperatureC}
                    onChange={(e) => setTemperatureC(e.target.value)}
                    className="w-full h-14 px-3 rounded-xl border border-rose-300 text-xl font-black text-rose-700 text-center outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 bg-white"
                  />
                  <span className={`absolute ${isRTL ? "left-3" : "right-3"} top-4 text-xs text-rose-400 font-bold`}>°C</span>
                </div>
              </div>

              {/* Height */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">{t("heightInputLabel")}</label>
                  <Ruler className="w-4 h-4 text-clinic-600" />
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    placeholder="95"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    className="w-full h-14 px-3 rounded-xl border border-slate-300 text-xl font-black text-slate-900 text-center outline-none focus:border-clinic-500 focus:ring-2 focus:ring-clinic-100 bg-white"
                  />
                  <span className={`absolute ${isRTL ? "left-3" : "right-3"} top-4 text-xs text-slate-400 font-bold`}>{t("cm")}</span>
                </div>
              </div>
            </div>

            {/* Additional Vitals: Oxygen Saturation & Blood Pressure */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {/* Oxygen Saturation */}
              <div className="p-5 rounded-2xl bg-sky-50/50 border border-sky-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-sky-900">
                    {language === "ar" ? "تشبع الأكسجين (SpO₂)" : "Oxygen Saturation (SpO₂)"}
                  </label>
                  <Wind className="w-4 h-4 text-sky-600" />
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    placeholder="98"
                    value={oxygenSaturation}
                    onChange={(e) => setOxygenSaturation(e.target.value)}
                    className="w-full h-14 px-3 rounded-xl border border-sky-300 text-xl font-black text-sky-900 text-center outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 bg-white"
                  />
                  <span className={`absolute ${isRTL ? "left-3" : "right-3"} top-4 text-xs text-sky-500 font-bold`}>%</span>
                </div>
              </div>

              {/* Blood Pressure */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    {language === "ar" ? "ضغط الدم (اختياري)" : "Blood Pressure (Optional)"}
                  </label>
                  <HeartPulse className="w-4 h-4 text-clinic-600" />
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="110/70"
                    value={bloodPressure}
                    onChange={(e) => setBloodPressure(e.target.value)}
                    className="w-full h-14 px-3 rounded-xl border border-slate-300 text-xl font-black text-slate-900 text-center outline-none focus:border-clinic-500 focus:ring-2 focus:ring-clinic-100 bg-white"
                  />
                  <span className={`absolute ${isRTL ? "left-3" : "right-3"} top-4 text-xs text-slate-400 font-bold`}>mmHg</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Multi-lab photos */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-amber-600" />
                  <span>{t("multiLabSectionTitle")}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t("multiLabSectionDesc")}
                </p>
              </div>
              <span className="text-xs font-bold text-amber-900 bg-amber-100 px-3 py-1 rounded-full self-start sm:self-center">
                ({uploadedPhotos.length}) {t("testsAttachedInSession")}
              </span>
            </div>

            {/* Quick Test Chips */}
            <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
              <label className="block text-xs font-bold text-slate-700">
                {t("chooseOrTypeName")}
              </label>
              <div className="flex flex-wrap gap-2">
                {commonLabTests.map((tName) => (
                  <button
                    key={tName}
                    type="button"
                    onClick={() => setCurrentTestName(tName)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                      currentTestName === tName
                        ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                        : "bg-white text-slate-700 border-slate-200 hover:border-amber-400"
                    }`}
                  >
                    {tName}
                  </button>
                ))}
              </div>

              <div className="pt-2 flex gap-2">
                <input
                  type="text"
                  placeholder={t("customTestPlaceholder")}
                  value={currentTestName}
                  onChange={(e) => setCurrentTestName(e.target.value)}
                  className="flex-1 h-11 px-3 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 outline-none focus:border-amber-500 bg-white"
                />
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              capture="environment"
              multiple
              onChange={handleFileChange}
              className="hidden"
              id="lab-file-input"
            />

            <div className="p-6 border-2 border-dashed border-amber-300 rounded-2xl bg-amber-50/40 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
                <Camera className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  {t("snapLabPrompt")}
                </h4>
              </div>

              <div className="flex flex-wrap justify-center gap-3 pt-1">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => fileInputRef.current?.click()}
                  className="font-bold gap-2 bg-amber-600 hover:bg-amber-700 shadow-sm"
                >
                  <Camera className="w-4 h-4" />
                  <span>{t("snapLabBtn")}</span>
                </Button>
              </div>
            </div>

            {uploadedPhotos.length > 0 && (
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-black text-slate-800">
                  {t("attachedLabsList")} ({uploadedPhotos.length}):
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {uploadedPhotos.map((photo, index) => (
                    <div
                      key={photo.id}
                      className="relative p-3 rounded-2xl border-2 border-amber-200/80 bg-amber-50/20 flex items-center gap-3 group shadow-xs"
                    >
                      <div
                        onClick={() => setPreviewModalPhoto(photo)}
                        className="w-16 h-16 rounded-xl overflow-hidden bg-slate-200 border border-slate-200 shrink-0 cursor-pointer relative group/img"
                      >
                        <img
                          src={photo.imageUrl}
                          alt={photo.title}
                          className="w-full h-full object-cover group-hover/img:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <Eye className="w-4 h-4" />
                        </div>
                      </div>

                      <div className={`flex-1 min-w-0 ${isRTL ? "text-right" : "text-left"}`}>
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md inline-block mb-1">
                          #{index + 1}
                        </span>
                        <p className="font-extrabold text-slate-900 text-xs truncate">{photo.title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{photo.notes}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id, index)}
                        className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors shrink-0"
                        title={t("delete")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="pt-2 flex justify-start">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="font-bold text-xs gap-1.5 border-dashed border-amber-400 text-amber-900 hover:bg-amber-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t("snapAnotherLabBtn")}</span>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-between pt-2">
            <Link href="/secretary">
              <Button type="button" variant="ghost">
                {t("cancel")}
              </Button>
            </Link>

            <Button
              type="submit"
              disabled={isSubmitting}
              variant="primary"
              size="lg"
              className="font-black px-10 h-14 text-base shadow-sm"
            >
              <CheckCircle2 className="w-5 h-5 ml-2" />
              <span>{isSubmitting ? t("approvingBtn") : t("saveVisitAndSendToDoctor")}</span>
            </Button>
          </div>
        </form>
      )}

      {/* Fullscreen Photo Preview Modal */}
      <Modal
        isOpen={!!previewModalPhoto}
        onClose={() => setPreviewModalPhoto(null)}
        title={previewModalPhoto?.title || t("preview")}
        description={previewModalPhoto ? `${previewModalPhoto.date}` : ""}
        maxWidth="xl"
      >
        <div className="space-y-4 text-center">
          <div className="w-full max-h-[70vh] rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center p-2">
            <img
              src={previewModalPhoto?.imageUrl}
              alt={previewModalPhoto?.title}
              className="max-h-[60vh] max-w-full object-contain rounded-xl"
            />
          </div>
          {previewModalPhoto?.notes && (
            <p className="text-xs font-semibold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
              {previewModalPhoto.notes}
            </p>
          )}
          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={() => setPreviewModalPhoto(null)}>
              {t("close")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function NewVisitDedicatedPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm font-bold text-slate-400">Loading...</div>}>
      <NewVisitContent />
    </Suspense>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { fetchPatients } from "@/services/patientService";
import { saveDoctorDiagnosis, validateFollowUpDate } from "@/services/visitService";
import { fetchPrescriptionByVisitId } from "@/services/prescriptionService";
import { ElectronicPrescriptionSection } from "@/components/prescriptions/ElectronicPrescriptionSection";
import { calculateArabicAge, formatArabicDate } from "@/lib/utils";
import { PatientFile, VisitRecord } from "@/lib/mock-data/patients";
import { Prescription } from "@/types/database";
import { useLanguage } from "@/context/LanguageContext";
import {
  ArrowRight,
  Stethoscope,
  Pill,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Printer,
  Scale,
  Thermometer,
  Ruler,
  ShieldAlert,
} from "lucide-react";

export default function MedicalExaminationPage() {
  const params = useParams();
  const router = useRouter();
  const visitId = params.visitId as string;
  const { language, t, isRTL } = useLanguage();

  const [patient, setPatient] = useState<PatientFile | null>(null);
  const [visit, setVisit] = useState<VisitRecord | null>(null);
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Diagnosis State
  const [symptoms, setSymptoms] = useState("");
  const [history, setHistory] = useState("");
  const [examination, setExamination] = useState("");
  const [diagnosisText, setDiagnosisText] = useState("");
  const [doctorNotes, setDoctorNotes] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  const [isSubmittingDiagnosis, setIsSubmittingDiagnosis] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const [diagnosisSuccess, setDiagnosisSuccess] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const patients = await fetchPatients();
        let foundPatient: PatientFile | null = null;
        let foundVisit: VisitRecord | null = null;

        for (const p of patients) {
          const v = p.visits.find((visitItem) => visitItem.id === visitId);
          if (v) {
            foundPatient = p;
            foundVisit = v;
            break;
          }
        }

        if (!foundPatient || !foundVisit) {
          if (isCurrent) setLoadError(language === "ar" ? "لم يتم العثور على سجل الزيارة" : "Visit not found");
          return;
        }

        if (isCurrent) {
          setPatient(foundPatient);
          setVisit(foundVisit);
          setSymptoms(foundVisit.symptoms || "");
          setHistory(foundVisit.presentIllnessHistory || "");
          setExamination(foundVisit.clinicalExamination || "");
          setDiagnosisText(foundVisit.diagnosisText || "");
          setDoctorNotes(foundVisit.doctorNotes || "");
          setRecommendations(foundVisit.recommendations || "");
          setFollowUpDate(foundVisit.followUpDate || "");
        }

        // Fetch prescription
        const rx = await fetchPrescriptionByVisitId(visitId);
        if (isCurrent && rx) {
          setPrescription(rx);
        }
      } catch (err: any) {
        if (isCurrent) setLoadError(err.message || "حدث خطأ أثناء تحميل بيانات الزيارة");
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    load();
    return () => {
      isCurrent = false;
    };
  }, [visitId, language]);

  const handleSaveDiagnosis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient || !visit) return;

    if (!diagnosisText.trim()) {
      setDiagnosisError(language === "ar" ? "التشخيص النهائي مطلوب لاعتماد الزيارة" : "Final diagnosis is required");
      return;
    }

    const followUpCheck = validateFollowUpDate(followUpDate);
    if (!followUpCheck.isValid) {
      setDiagnosisError(followUpCheck.error || "تاريخ المراجعة غير صحيح");
      return;
    }

    setDiagnosisError(null);
    setIsSubmittingDiagnosis(true);

    try {
      await saveDoctorDiagnosis({
        visitId: visit.id,
        patientId: patient.id,
        symptoms: symptoms.trim() || undefined,
        presentIllnessHistory: history.trim() || undefined,
        clinicalExamination: examination.trim() || undefined,
        diagnosisText: diagnosisText.trim(),
        recommendations: recommendations.trim() || undefined,
        doctorNotes: doctorNotes.trim() || undefined,
        followUpDate: followUpDate || undefined,
      });

      setDiagnosisSuccess(true);
      setVisit((prev) =>
        prev
          ? {
              ...prev,
              status: "completed",
              isCompleted: true,
              symptoms,
              presentIllnessHistory: history,
              clinicalExamination: examination,
              diagnosisText: diagnosisText.trim(),
              recommendations,
              doctorNotes,
              followUpDate,
            }
          : prev
      );
    } catch (err: any) {
      setDiagnosisError(err.message || (language === "ar" ? "فشل حفظ التشخيص" : "Failed to save diagnosis"));
    } finally {
      setIsSubmittingDiagnosis(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-3">
        <div className="w-10 h-10 border-4 border-clinic-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-600">
          {language === "ar" ? "جاري تحميل جلسة الفحص والتشخيص..." : "Loading examination session..."}
        </p>
      </div>
    );
  }

  if (loadError || !patient || !visit) {
    return (
      <div className="p-8 text-center space-y-4 max-w-xl mx-auto">
        <div className="p-5 bg-rose-50 border border-rose-200 rounded-3xl text-rose-900 space-y-2">
          <ShieldAlert className="w-8 h-8 text-rose-600 mx-auto" />
          <h3 className="font-black text-sm">{loadError || (language === "ar" ? "تعذر فتح الجلسة" : "Session not found")}</h3>
        </div>
        <Link href="/doctor">
          <Button variant="primary">{language === "ar" ? "العودة للوحة الطبيب" : "Back to Doctor Dashboard"}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/doctor"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>{language === "ar" ? "العودة للوحة تحكم الطبيب" : "Back to Doctor Dashboard"}</span>
        </Link>

        <div className="flex items-center gap-2">
          {visit.status === "completed" ? (
            <Badge variant="success" size="sm" className="font-bold">
              {language === "ar" ? "زيارة مكتملة ومعتمدة" : "Completed Visit"}
            </Badge>
          ) : (
            <Badge variant="info" size="sm" className="font-bold">
              {language === "ar" ? "جلسة فحص نشطة" : "Active Session"}
            </Badge>
          )}
        </div>
      </div>

      {/* Patient Summary Header Card */}
      <Card className="border-2 border-clinic-500/80 bg-white p-5 sm:p-6 shadow-sm rounded-3xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-clinic-100 text-clinic-800 flex items-center justify-center font-black text-xl shadow-inner">
              {patient.fullName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900">{patient.fullName}</h2>
                <span className="font-mono text-xs font-bold bg-clinic-100 text-clinic-800 px-2.5 py-1 rounded-lg">
                  {patient.fileNumber}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                {t("age")}: <strong className="text-slate-800">{calculateArabicAge(patient.dateOfBirth)}</strong> |{" "}
                {t("gender")}: {patient.gender === "male" ? t("male") : t("female")} | {t("guardian")}: {patient.guardianName} ({patient.phone})
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-500 font-bold bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <span>{t("visitDay")}: </span>
            <strong className="text-slate-900 font-black">{formatArabicDate(visit.date)}</strong>
          </div>
        </div>

        {/* Allergy Warning */}
        {patient.allergies && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{t("allergyWarning")}: {patient.allergies}</span>
          </div>
        )}

        {/* Measurements summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div className={isRTL ? "text-right" : "text-left"}>
              <span className="text-slate-400 text-[10px] font-bold block">{t("weight")}</span>
              <span className="text-base font-black text-slate-900">
                {visit.weightKg ? `${visit.weightKg} ${t("kg")}` : "--"}
              </span>
            </div>
            <Scale className="w-5 h-5 text-clinic-600 opacity-70" />
          </div>

          <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200 flex items-center justify-between">
            <div className={isRTL ? "text-right" : "text-left"}>
              <span className="text-rose-500 text-[10px] font-bold block">{t("temperature")}</span>
              <span className="text-base font-black text-rose-700">
                {visit.temperatureC ? `${visit.temperatureC} °C` : "--"}
              </span>
            </div>
            <Thermometer className="w-5 h-5 text-rose-600 opacity-70" />
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div className={isRTL ? "text-right" : "text-left"}>
              <span className="text-slate-400 text-[10px] font-bold block">{t("height")}</span>
              <span className="text-base font-black text-slate-900">
                {visit.heightCm ? `${visit.heightCm} ${t("cm")}` : "--"}
              </span>
            </div>
            <Ruler className="w-5 h-5 text-clinic-600 opacity-70" />
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div className={isRTL ? "text-right" : "text-left"}>
              <span className="text-slate-400 text-[10px] font-bold block">ضغط الدم</span>
              <span className="text-base font-black text-slate-900">
                {visit.bloodPressure || "--"}
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-slate-400">BP</span>
          </div>
        </div>
      </Card>

      {/* Section 1: Clinical Examination & Diagnosis Form */}
      <Card className="p-6 bg-white border border-slate-200 shadow-sm rounded-3xl space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <CardTitle className="flex items-center gap-2 text-base text-clinic-800">
            <Stethoscope className="w-5 h-5 text-clinic-600" />
            <span>{t("clinicalDocTitle")}</span>
          </CardTitle>
          {diagnosisSuccess && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>تم حفظ التشخيص بنجاح</span>
            </span>
          )}
        </div>

        {diagnosisError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-bold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{diagnosisError}</span>
          </div>
        )}

        <form onSubmit={handleSaveDiagnosis} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Textarea
              label={t("symptomsLabel")}
              placeholder={language === "ar" ? "أدخل شكوى وأعراض الطفل..." : "Enter symptoms..."}
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              className="text-xs min-h-[85px]"
            />

            <Textarea
              label={language === "ar" ? "التاريخ المرضي الحالي (HPI)" : "History of Present Illness"}
              placeholder={language === "ar" ? "تاريخ بداية الأعراض والتطور..." : "Onset, duration, progression..."}
              value={history}
              onChange={(e) => setHistory(e.target.value)}
              className="text-xs min-h-[85px]"
            />
          </div>

          <Textarea
            label={t("clinicalExamLabel")}
            placeholder={language === "ar" ? "نتائج فحص البلعوم، الصدر، الأذن، البطن..." : "Chest, throat, abdomen findings..."}
            value={examination}
            onChange={(e) => setExamination(e.target.value)}
            className="text-xs min-h-[85px]"
          />

          <Input
            label={t("finalDiagnosisLabel")}
            required
            placeholder={language === "ar" ? "مثال: التهاب القصبات الحاد (Acute Bronchitis)" : "e.g. Acute Bronchitis"}
            value={diagnosisText}
            onChange={(e) => setDiagnosisText(e.target.value)}
            className="font-bold text-slate-900 text-sm h-12"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Textarea
              label={t("recommendationsLabel")}
              placeholder={language === "ar" ? "الراحة، السوائل، حمية خاصة..." : "Recommendations..."}
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              className="text-xs min-h-[85px]"
            />

            <div className="space-y-3">
              <Textarea
                label={t("doctorNotesLabel")}
                placeholder={language === "ar" ? "ملاحظات طبية خاصة للمتابعة..." : "Doctor notes..."}
                value={doctorNotes}
                onChange={(e) => setDoctorNotes(e.target.value)}
                className="text-xs min-h-[60px]"
              />

              <Input
                label={language === "ar" ? "موعد المراجعة القادمة (اختياري)" : "Follow-up Date (Optional)"}
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmittingDiagnosis}
              className="font-black px-8 h-12 gap-2"
            >
              <FileCheck className="w-4 h-4" />
              <span>{isSubmittingDiagnosis ? "جاري الحفظ..." : "حفظ واعتماد التشخيص الطبي"}</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* Section 2: Electronic Prescription Builder & Manager */}
      <ElectronicPrescriptionSection
        visitId={visit.id}
        patientId={patient.id}
        initialPrescription={prescription}
        onPrescriptionChanged={(newRx) => setPrescription(newRx)}
      />
    </div>
  );
}

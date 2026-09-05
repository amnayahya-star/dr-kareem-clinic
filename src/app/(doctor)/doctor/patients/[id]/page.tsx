"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { MOCK_PATIENT_FILES, PatientFile } from "@/lib/mock-data/patients";
import { fetchPatientById, updatePatientRecord, UpdatePatientInput } from "@/services/patientService";
import {
  calculateArabicAge,
  formatArabicDate,
  formatArabicTime,
  displayOrFallback,
  getPatientFirstVisitDate,
  isValidEmail,
  isValidPositiveNumber,
} from "@/lib/utils";
import {
  ArrowRight,
  User,
  Phone,
  MapPin,
  AlertTriangle,
  Calendar,
  Clock,
  FileText,
  Activity,
  Stethoscope,
  Pill,
  Heart,
  Baby,
  Building2,
  Scale,
  Ruler,
  Mail,
  Edit,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

const RELATIONSHIP_PRESETS = [
  "الأب",
  "الأم",
  "الجد",
  "الجدة",
  "الأخ",
  "الأخت",
  "وصي قانوني",
  "أخرى",
];

export default function PatientMedicalFilePage() {
  const params = useParams();
  const patientId = params.id as string;

  const [patient, setPatient] = useState<PatientFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  // Edit Form Inputs
  const [editFullName, setEditFullName] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editGender, setEditGender] = useState<"male" | "female">("male");
  const [editBloodType, setEditBloodType] = useState("");
  const [editBirthPlace, setEditBirthPlace] = useState("");
  const [editBirthWeightKg, setEditBirthWeightKg] = useState("");
  const [editBirthLengthCm, setEditBirthLengthCm] = useState("");
  const [editMedicalHistory, setEditMedicalHistory] = useState("");
  const [editDrugAllergies, setEditDrugAllergies] = useState("");
  const [editFoodAllergies, setEditFoodAllergies] = useState("");
  const [editOtherAllergies, setEditOtherAllergies] = useState("");
  const [editLegacyAllergies, setEditLegacyAllergies] = useState("");
  const [editChronicDiseases, setEditChronicDiseases] = useState("");
  const [editPastSurgeries, setEditPastSurgeries] = useState("");
  const [editMedicalNotes, setEditMedicalNotes] = useState("");
  const [editGuardianName, setEditGuardianName] = useState("");
  const [editRelationship, setEditRelationship] = useState("الأب");
  const [editCustomRelationship, setEditCustomRelationship] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editSecondaryPhone, setEditSecondaryPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");

  // Load patient file
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data = await fetchPatientById(patientId);
        if (data) {
          setPatient(data);
          populateEditForm(data);
        } else {
          // Fallback to first mock patient
          const fallback = MOCK_PATIENT_FILES[0];
          setPatient(fallback);
          populateEditForm(fallback);
        }
      } catch (err: any) {
        setLoadError(err.message || "حدث خطأ أثناء تحميل ملف الطفل");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [patientId]);

  const populateEditForm = (data: PatientFile) => {
    setEditFullName(data.fullName || "");
    setEditBirthDate(data.dateOfBirth || "");
    setEditGender(data.gender || "male");
    setEditBloodType(data.bloodType || "");
    setEditBirthPlace(data.birthPlace || "");
    setEditBirthWeightKg(data.birthWeightKg !== undefined ? String(data.birthWeightKg) : "");
    setEditBirthLengthCm(data.birthLengthCm !== undefined ? String(data.birthLengthCm) : "");
    setEditMedicalHistory(data.medicalHistory || "");
    setEditDrugAllergies(data.drugAllergies || "");
    setEditFoodAllergies(data.foodAllergies || "");
    setEditOtherAllergies(data.otherAllergies || "");
    setEditLegacyAllergies(data.allergies || "");
    setEditChronicDiseases(data.chronicDiseases || "");
    setEditPastSurgeries(data.pastSurgeries || "");
    setEditMedicalNotes(data.medicalNotes || "");
    setEditGuardianName(data.guardianName || "");

    if (RELATIONSHIP_PRESETS.includes(data.relationship)) {
      setEditRelationship(data.relationship);
      setEditCustomRelationship("");
    } else {
      setEditRelationship("أخرى");
      setEditCustomRelationship(data.relationship || "");
    }

    setEditPhone(data.phone || "");
    setEditSecondaryPhone(data.secondaryPhone || "");
    setEditEmail(data.email || "");
    setEditAddress(data.address || "");
  };

  const handleOpenEditModal = () => {
    if (patient) {
      populateEditForm(patient);
      setUpdateError(null);
      setUpdateSuccess(false);
      setIsEditModalOpen(true);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;

    setUpdateError(null);

    // Basic Validations
    if (!editFullName.trim()) {
      setUpdateError("اسم الطفل الكامل مطلوب");
      return;
    }
    if (!editBirthDate) {
      setUpdateError("تاريخ الميلاد مطلوب");
      return;
    }
    if (!editGuardianName.trim()) {
      setUpdateError("اسم ولي الأمر مطلوب");
      return;
    }
    if (!editPhone.trim()) {
      setUpdateError("رقم الهاتف الأساسي لولي الأمر مطلوب");
      return;
    }
    if (editRelationship === "أخرى" && !editCustomRelationship.trim()) {
      setUpdateError("يرجى كتابة صلة القرابة المخصصة");
      return;
    }
    if (editBirthWeightKg && !isValidPositiveNumber(editBirthWeightKg)) {
      setUpdateError("الوزن عند الولادة يجب أن يكون رقماً موجباً أكبر من الصفر");
      return;
    }
    if (editBirthLengthCm && !isValidPositiveNumber(editBirthLengthCm)) {
      setUpdateError("الطول عند الولادة يجب أن يكون رقماً موجباً أكبر من الصفر");
      return;
    }
    if (editEmail && editEmail.trim() && !isValidEmail(editEmail)) {
      setUpdateError("صيغة البريد الإلكتروني غير صحيحة");
      return;
    }

    setIsUpdating(true);

    try {
      const finalRelationship = editRelationship === "أخرى" ? editCustomRelationship.trim() : editRelationship;

      const updatePayload: UpdatePatientInput = {
        fullName: editFullName.trim(),
        dateOfBirth: editBirthDate,
        gender: editGender,
        bloodType: editBloodType || null as any,
        birthPlace: editBirthPlace.trim() || null as any,
        birthWeightKg: editBirthWeightKg ? parseFloat(editBirthWeightKg) : null as any,
        birthLengthCm: editBirthLengthCm ? parseFloat(editBirthLengthCm) : null as any,
        medicalHistory: editMedicalHistory.trim() || null as any,
        drugAllergies: editDrugAllergies.trim() || null as any,
        foodAllergies: editFoodAllergies.trim() || null as any,
        otherAllergies: editOtherAllergies.trim() || null as any,
        allergies: editLegacyAllergies.trim() || null as any,
        chronicDiseases: editChronicDiseases.trim() || null as any,
        pastSurgeries: editPastSurgeries.trim() || null as any,
        medicalNotes: editMedicalNotes.trim() || null as any,
        guardianName: editGuardianName.trim(),
        relationship: finalRelationship,
        phone: editPhone.trim(),
        secondaryPhone: editSecondaryPhone.trim() || null as any,
        email: editEmail.trim() || null as any,
        address: editAddress.trim() || null as any,
      };

      const updated = await updatePatientRecord(patient.id, updatePayload);
      setPatient(updated);
      setUpdateSuccess(true);
      setTimeout(() => {
        setIsEditModalOpen(false);
        setUpdateSuccess(false);
      }, 1200);
    } catch (err: any) {
      setUpdateError(err.message || "فشل تحديث بيانات الملف الطبي");
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-3">
        <div className="w-10 h-10 border-4 border-clinic-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-600">جاري تحميل ملف الطفل الطبي...</p>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-base text-slate-700 font-bold">لم يتم العثور على ملف الطفل المطلوب.</p>
        <Link href="/doctor/patients">
          <Button variant="primary">العودة لسجل الأطفال</Button>
        </Link>
      </div>
    );
  }

  const firstVisitString = getPatientFirstVisitDate(patient.visits);
  const hasAnyAllergy =
    Boolean(patient.drugAllergies) ||
    Boolean(patient.foodAllergies) ||
    Boolean(patient.otherAllergies) ||
    Boolean(patient.allergies);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link
          href="/doctor/patients"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لقائمة ملفات الأطفال</span>
        </Link>

        {/* Edit Profile Button */}
        <Button
          onClick={handleOpenEditModal}
          variant="primary"
          size="md"
          className="font-bold gap-2 shadow-xs bg-clinic-700 hover:bg-clinic-800 self-start sm:self-auto"
        >
          <Edit className="w-4 h-4" />
          <span>تعديل بيانات الملف الطبي</span>
        </Button>
      </div>

      {/* 1. Main Child Identity Card */}
      <Card className="border-2 border-clinic-100 bg-white p-6 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-clinic-100 text-clinic-700 flex items-center justify-center font-black text-2xl shadow-inner shrink-0">
              {patient.fullName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-2xl font-black text-slate-900">{patient.fullName}</h2>
                <span className="font-mono text-xs font-bold bg-clinic-50 text-clinic-700 px-2.5 py-1 rounded-lg border border-clinic-200">
                  {patient.fileNumber}
                </span>
                <Badge variant="info" size="sm">
                  ملف نشط
                </Badge>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                تاريخ الميلاد: <strong className="text-slate-800">{formatArabicDate(patient.dateOfBirth)}</strong> |{" "}
                الجنس: {patient.gender === "male" ? "ذكر" : "أنثى"} | فصيلة الدم:{" "}
                <strong className="text-slate-800">{displayOrFallback(patient.bloodType)}</strong>
              </p>
            </div>
          </div>

          {/* Age & First Visit Pill */}
          <div className="flex flex-col sm:items-end gap-1 text-xs">
            <div className="bg-clinic-50 px-3 py-1.5 rounded-xl border border-clinic-100">
              <span className="text-slate-500 font-bold">العمر الحالي: </span>
              <strong className="text-clinic-900 font-black">{calculateArabicAge(patient.dateOfBirth)}</strong>
            </div>
            <div className="text-[11px] text-slate-500 font-medium pt-0.5">
              <span>تاريخ أول زيارة: </span>
              <strong className="text-slate-800">{firstVisitString}</strong>
            </div>
          </div>
        </div>

        {/* Critical Allergies Visual Highlighting */}
        {hasAnyAllergy && (
          <div className="p-4 bg-rose-50 border-2 border-rose-200 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-rose-950 font-black text-sm">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>تنبيه الحساسية المسجلة للطفل</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
              {patient.drugAllergies && (
                <div className="p-2.5 bg-white rounded-xl border border-rose-200 text-rose-900">
                  <span className="font-bold block text-rose-700">حساسية الأدوية:</span>
                  <span className="font-semibold">{patient.drugAllergies}</span>
                </div>
              )}
              {patient.foodAllergies && (
                <div className="p-2.5 bg-white rounded-xl border border-rose-200 text-rose-900">
                  <span className="font-bold block text-rose-700">حساسية الطعام:</span>
                  <span className="font-semibold">{patient.foodAllergies}</span>
                </div>
              )}
              {patient.otherAllergies && (
                <div className="p-2.5 bg-white rounded-xl border border-rose-200 text-rose-900">
                  <span className="font-bold block text-rose-700">حساسيات أخرى:</span>
                  <span className="font-semibold">{patient.otherAllergies}</span>
                </div>
              )}
              {patient.allergies && (
                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-900">
                  <span className="font-bold block text-amber-800">حساسية سابقة مسجلة (سجل موروث):</span>
                  <span className="font-semibold">{patient.allergies}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. Structured Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card A: بيانات الولادة */}
          <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 font-black text-slate-800 text-sm pb-1 border-b border-slate-200">
              <Baby className="w-4 h-4 text-clinic-600" />
              <span>بيانات الولادة</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-2 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-400 block text-[10px] font-bold">مكان الولادة</span>
                <span className="font-bold text-slate-800 truncate block mt-0.5">
                  {displayOrFallback(patient.birthPlace)}
                </span>
              </div>
              <div className="p-2 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-400 block text-[10px] font-bold">الوزن عند الولادة</span>
                <span className="font-bold text-slate-800 block mt-0.5">
                  {patient.birthWeightKg ? `${patient.birthWeightKg} كغم` : "غير مسجل"}
                </span>
              </div>
              <div className="p-2 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-400 block text-[10px] font-bold">الطول عند الولادة</span>
                <span className="font-bold text-slate-800 block mt-0.5">
                  {patient.birthLengthCm ? `${patient.birthLengthCm} سم` : "غير مسجل"}
                </span>
              </div>
            </div>
          </div>

          {/* Card B: بيانات ولي الأمر */}
          <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 font-black text-slate-800 text-sm pb-1 border-b border-slate-200">
              <Phone className="w-4 h-4 text-clinic-600" />
              <span>بيانات ولي الأمر والاتصال</span>
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">ولي الأمر:</span>
                <span className="font-bold text-slate-900">
                  {patient.guardianName} ({patient.relationship})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">الهاتف الأساسي:</span>
                <span className="font-mono font-bold text-slate-800">{patient.phone}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">هاتف إضافي:</span>
                <span className="font-mono text-slate-700">{displayOrFallback(patient.secondaryPhone)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">البريد الإلكتروني:</span>
                <span className="font-mono text-slate-700">{displayOrFallback(patient.email)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">عنوان السكن:</span>
                <span className="text-slate-800">{displayOrFallback(patient.address)}</span>
              </div>
            </div>
          </div>

          {/* Card C: التاريخ الطبي العام والمزمن */}
          <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-black text-slate-800 text-sm pb-1 border-b border-slate-200">
              <FileText className="w-4 h-4 text-clinic-600" />
              <span>التاريخ الطبي والأمراض</span>
            </div>
            <div className="space-y-1.5 pt-1">
              <div>
                <span className="text-slate-500 font-bold block">التاريخ الطبي العام:</span>
                <p className="text-slate-800 font-medium mt-0.5">{displayOrFallback(patient.medicalHistory)}</p>
              </div>
              <div className="pt-1">
                <span className="text-slate-500 font-bold block">الأمراض المزمنة:</span>
                <p className="text-slate-800 font-medium mt-0.5">{displayOrFallback(patient.chronicDiseases)}</p>
              </div>
            </div>
          </div>

          {/* Card D: العمليات والملاحظات */}
          <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-black text-slate-800 text-sm pb-1 border-b border-slate-200">
              <Heart className="w-4 h-4 text-clinic-600" />
              <span>العمليات والملاحظات السريرية</span>
            </div>
            <div className="space-y-1.5 pt-1">
              <div>
                <span className="text-slate-500 font-bold block">العمليات الجراحية السابقة:</span>
                <p className="text-slate-800 font-medium mt-0.5">{displayOrFallback(patient.pastSurgeries)}</p>
              </div>
              <div className="pt-1">
                <span className="text-slate-500 font-bold block">ملاحظات طبية خاصة:</span>
                <p className="text-slate-800 font-medium mt-0.5">{displayOrFallback(patient.medicalNotes)}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 3. Visits History Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-clinic-600" />
            <span>سجل الزيارات والفحوصات السابقة</span>
          </h3>
          <span className="text-xs font-bold text-slate-500">
            عدد الزيارات: {patient.visits.length}
          </span>
        </div>

        {patient.visits.length === 0 ? (
          <Card className="text-center py-10 text-slate-400 text-xs font-medium bg-white">
            لا توجد زيارات سابقة مسجلة لهذا الطفل.
          </Card>
        ) : (
          patient.visits.map((visit) => (
            <Card key={visit.id} className="border border-slate-200 bg-white space-y-4 p-5 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-clinic-600" />
                  <span className="text-sm font-bold text-slate-800">
                    زيارة يوم: {formatArabicDate(visit.date)}
                  </span>
                </div>
                <Badge variant={visit.isCompleted ? "success" : "warning"}>
                  {visit.isCompleted ? "زيارة مكتملة ومعتمدة" : "قيد المتابعة"}
                </Badge>
              </div>

              {/* Vitals */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl text-center text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block font-bold">الوزن</span>
                  <span className="font-bold text-slate-800">{visit.weightKg ? `${visit.weightKg} كغم` : "--"}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-bold">الطول</span>
                  <span className="font-bold text-slate-800">{visit.heightCm ? `${visit.heightCm} سم` : "--"}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-bold">درجة الحرارة</span>
                  <span className="font-bold text-slate-800">{visit.temperatureC ? `${visit.temperatureC} °C` : "--"}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-bold">ضغط الدم</span>
                  <span className="font-bold text-slate-800">{visit.bloodPressure || "--"}</span>
                </div>
              </div>

              {/* Diagnosis details */}
              {visit.diagnosisText && (
                <div className="space-y-2 text-xs">
                  <div className="p-3 bg-clinic-50/60 rounded-xl border border-clinic-100">
                    <span className="font-bold text-clinic-900 block mb-0.5">التشخيص الطبي:</span>
                    <p className="font-extrabold text-slate-900 text-sm">{visit.diagnosisText}</p>
                  </div>
                  {visit.recommendations && (
                    <p className="text-slate-600">
                      <strong>التوصيات: </strong> {visit.recommendations}
                    </p>
                  )}
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      {/* 4. Edit Profile Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="تعديل بيانات ملف الطفل وولي الأمر"
        description="تحديث البيانات مع ضمان حفظ التعديلات على نفس السجل المرتبط"
        maxWidth="lg"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4 max-h-[75vh] overflow-y-auto px-1">
          {updateError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-bold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{updateError}</span>
            </div>
          )}

          {updateSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>تم حفظ وتحديث بيانات الملف الطبي بنجاح!</span>
            </div>
          )}

          {/* 1. بيانات الطفل */}
          <div className="space-y-3 pb-3 border-b border-slate-100">
            <h4 className="text-xs font-black text-clinic-800 flex items-center gap-1.5">
              <User className="w-4 h-4 text-clinic-600" />
              <span>البيانات الأساسية للطفل</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="الاسم الكامل للطفل"
                required
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
              />
              <Input
                label="تاريخ الميلاد"
                type="date"
                required
                value={editBirthDate}
                onChange={(e) => setEditBirthDate(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-right">
                <label className="block text-xs font-semibold text-slate-700">الجنس</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditGender("male")}
                    className={`py-2 rounded-xl text-xs font-bold border ${
                      editGender === "male"
                        ? "bg-clinic-50 border-clinic-500 text-clinic-800 font-black"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    ذكر
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditGender("female")}
                    className={`py-2 rounded-xl text-xs font-bold border ${
                      editGender === "female"
                        ? "bg-rose-50 border-rose-400 text-rose-800 font-black"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    أنثى
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 text-right">
                <label className="block text-xs font-semibold text-slate-700">فصيلة الدم</label>
                <select
                  className="block w-full rounded-xl border border-slate-200 bg-white text-slate-800 text-xs h-10 px-3 focus:outline-none focus:ring-2 focus:ring-clinic-500"
                  value={editBloodType}
                  onChange={(e) => setEditBloodType(e.target.value)}
                >
                  <option value="">غير معروفة</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>
            </div>
          </div>

          {/* 2. بيانات الولادة */}
          <div className="space-y-3 pb-3 border-b border-slate-100">
            <h4 className="text-xs font-black text-clinic-800 flex items-center gap-1.5">
              <Baby className="w-4 h-4 text-clinic-600" />
              <span>بيانات الولادة (اختيارية)</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="مكان الولادة"
                placeholder="المستشفى / المدينة"
                value={editBirthPlace}
                onChange={(e) => setEditBirthPlace(e.target.value)}
              />
              <Input
                label="الوزن عند الولادة (كغم)"
                type="number"
                step="0.01"
                placeholder="مثال: 3.2"
                value={editBirthWeightKg}
                onChange={(e) => setEditBirthWeightKg(e.target.value)}
              />
              <Input
                label="الطول عند الولادة (سم)"
                type="number"
                step="0.1"
                placeholder="مثال: 50.0"
                value={editBirthLengthCm}
                onChange={(e) => setEditBirthLengthCm(e.target.value)}
              />
            </div>
          </div>

          {/* 3. التاريخ الطبي والحساسيات */}
          <div className="space-y-3 pb-3 border-b border-slate-100">
            <h4 className="text-xs font-black text-amber-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>التاريخ الطبي والحساسيات المفصلة</span>
            </h4>

            <Textarea
              label="التاريخ الطبي العام"
              placeholder="تاريخ الولادة والتطور والنمو..."
              value={editMedicalHistory}
              onChange={(e) => setEditMedicalHistory(e.target.value)}
              className="text-xs min-h-[60px]"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-rose-50/50 rounded-2xl border border-rose-200">
              <Input
                label="حساسية الأدوية"
                placeholder="البنسلين..."
                value={editDrugAllergies}
                onChange={(e) => setEditDrugAllergies(e.target.value)}
              />
              <Input
                label="حساسية الطعام"
                placeholder="الفول السوداني..."
                value={editFoodAllergies}
                onChange={(e) => setEditFoodAllergies(e.target.value)}
              />
              <Input
                label="حساسيات أخرى"
                placeholder="الغبار..."
                value={editOtherAllergies}
                onChange={(e) => setEditOtherAllergies(e.target.value)}
              />
            </div>

            {Boolean(editLegacyAllergies || patient?.allergies) && (
              <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200">
                <Input
                  label="الحساسية السابقة المسجلة (سجل موروث غير مصنف)"
                  placeholder="حساسية مسجلة سابقاً..."
                  value={editLegacyAllergies}
                  onChange={(e) => setEditLegacyAllergies(e.target.value)}
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="الأمراض المزمنة"
                placeholder="ربو..."
                value={editChronicDiseases}
                onChange={(e) => setEditChronicDiseases(e.target.value)}
              />
              <Input
                label="العمليات السابقة"
                placeholder="عمليات..."
                value={editPastSurgeries}
                onChange={(e) => setEditPastSurgeries(e.target.value)}
              />
              <Input
                label="ملاحظات خاصة"
                placeholder="ملاحظات..."
                value={editMedicalNotes}
                onChange={(e) => setEditMedicalNotes(e.target.value)}
              />
            </div>
          </div>

          {/* 4. بيانات ولي الأمر */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-clinic-800 flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-clinic-600" />
              <span>بيانات ولي الأمر والاتصال</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="اسم ولي الأمر"
                required
                value={editGuardianName}
                onChange={(e) => setEditGuardianName(e.target.value)}
              />

              <div className="space-y-1.5 text-right">
                <label className="block text-xs font-semibold text-slate-700">
                  صلة القرابة <span className="text-rose-500 mr-1">*</span>
                </label>
                <select
                  className="block w-full rounded-xl border border-slate-200 bg-white text-slate-800 text-xs h-10 px-3 focus:outline-none focus:ring-2 focus:ring-clinic-500 font-bold"
                  value={editRelationship}
                  onChange={(e) => setEditRelationship(e.target.value)}
                >
                  {RELATIONSHIP_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </select>
              </div>

              {editRelationship === "أخرى" ? (
                <Input
                  label="صلة القرابة المخصصة"
                  required
                  placeholder="مثال: الخال"
                  value={editCustomRelationship}
                  onChange={(e) => setEditCustomRelationship(e.target.value)}
                />
              ) : (
                <Input
                  label="رقم الهاتف الأساسي"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              )}
            </div>

            {editRelationship === "أخرى" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="رقم الهاتف الأساسي"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
                <Input
                  label="رقم هاتف إضافي"
                  value={editSecondaryPhone}
                  onChange={(e) => setEditSecondaryPhone(e.target.value)}
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {editRelationship !== "أخرى" && (
                <Input
                  label="رقم هاتف إضافي"
                  value={editSecondaryPhone}
                  onChange={(e) => setEditSecondaryPhone(e.target.value)}
                />
              )}
              <Input
                label="البريد الإلكتروني (اختياري)"
                type="email"
                placeholder="parent@example.com"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
              <Input
                label="عنوان السكن"
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              disabled={isUpdating}
              onClick={() => setIsEditModalOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={isUpdating}
              variant="primary"
              className="font-bold px-6"
            >
              {isUpdating ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

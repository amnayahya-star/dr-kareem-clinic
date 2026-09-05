"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { createPatientRecord } from "@/services/patientService";
import { notifySecretarySavedVisit } from "@/services/notificationService";
import { calculateArabicAge, isValidEmail, isValidPositiveNumber } from "@/lib/utils";
import {
  ArrowRight,
  UserPlus,
  Phone,
  Baby,
  AlertTriangle,
  Heart,
  User,
  CheckCircle2,
  FileText,
  Mail,
  MapPin,
  Scale,
  Ruler,
  Building2,
  ShieldAlert,
  Syringe,
  ShieldCheck,
} from "lucide-react";
import { VaccinationStatus } from "@/types/database";

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

export default function NewPatientRegistrationPage() {
  // 1. البيانات الأساسية للطفل
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [bloodType, setBloodType] = useState("");

  // 2. بيانات الولادة
  const [birthPlace, setBirthPlace] = useState("");
  const [birthWeightKg, setBirthWeightKg] = useState("");
  const [birthLengthCm, setBirthLengthCm] = useState("");

  // 3. التاريخ الطبي والحساسيات
  const [medicalHistory, setMedicalHistory] = useState("");
  const [drugAllergies, setDrugAllergies] = useState("");
  const [foodAllergies, setFoodAllergies] = useState("");
  const [otherAllergies, setOtherAllergies] = useState("");
  const [chronicDiseases, setChronicDiseases] = useState("");
  const [pastSurgeries, setPastSurgeries] = useState("");
  const [medicalNotes, setMedicalNotes] = useState("");

  // 4. سجل التطعيمات (اختياري)
  const [vaccinationStatus, setVaccinationStatus] = useState<VaccinationStatus | "">("");
  const [lastVaccineName, setLastVaccineName] = useState("");
  const [lastVaccineDate, setLastVaccineDate] = useState("");
  const [postVaccinationReactions, setPostVaccinationReactions] = useState("");
  const [vaccinationNotes, setVaccinationNotes] = useState("");

  // 5. بيانات ولي الأمر
  const [guardianName, setGuardianName] = useState("");
  const [relationshipType, setRelationshipType] = useState("الأب");
  const [customRelationship, setCustomRelationship] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [secondaryPhone, setSecondaryPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  // Form State
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSuccess, setIsSuccess] = useState(false);
  const [createdPatientFileNumber, setCreatedPatientFileNumber] = useState("");
  const [createdPatientId, setCreatedPatientId] = useState("");
  const [vaccinationWarning, setVaccinationWarning] = useState<string | null>(null);

  const calculatedAge = birthDate ? calculateArabicAge(birthDate) : "";

  // Validate form before submission
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!fullName.trim()) {
      errors.fullName = "يرجى إدخال الاسم الكامل للطفل";
    }

    if (!birthDate) {
      errors.birthDate = "يرجى تحديد تاريخ ميلاد الطفل";
    }

    if (!guardianName.trim()) {
      errors.guardianName = "يرجى إدخال اسم ولي الأمر";
    }

    if (relationshipType === "أخرى" && !customRelationship.trim()) {
      errors.customRelationship = "يرجى تحديد صلة القرابة المخصصة";
    }

    if (!primaryPhone.trim()) {
      errors.primaryPhone = "يرجى إدخال رقم الهاتف الأساسي لولي الأمر";
    }

    if (birthWeightKg && !isValidPositiveNumber(birthWeightKg)) {
      errors.birthWeightKg = "الوزن عند الولادة يجب أن يكون رقماً موجباً أكبر من الصفر";
    }

    if (birthLengthCm && !isValidPositiveNumber(birthLengthCm)) {
      errors.birthLengthCm = "الطول عند الولادة يجب أن يكون رقماً موجباً أكبر من الصفر";
    }

    if (lastVaccineDate && vaccinationStatus !== "not_vaccinated") {
      const vDate = new Date(lastVaccineDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (isNaN(vDate.getTime()) || vDate.getTime() > today.getTime()) {
        errors.lastVaccineDate = "تاريخ آخر تطعيم لا يمكن أن يكون في المستقبل";
      }
    }

    if (email && email.trim() && !isValidEmail(email)) {
      errors.email = "صيغة البريد الإلكتروني غير صحيحة (مثال: name@example.com)";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setVaccinationWarning(null);

    if (!validateForm()) {
      setFormError("يرجى تصحيح الأخطاء الموضحة في النموذج قبل الحفظ.");
      return;
    }

    setIsLoading(true);

    try {
      const actualRelationship = relationshipType === "أخرى" ? customRelationship.trim() : relationshipType;

      const createdChild = await createPatientRecord({
        fullName: fullName.trim(),
        dateOfBirth: birthDate,
        gender,
        bloodType: bloodType || undefined,
        birthPlace: birthPlace.trim() || undefined,
        birthWeightKg: birthWeightKg ? parseFloat(birthWeightKg) : undefined,
        birthLengthCm: birthLengthCm ? parseFloat(birthLengthCm) : undefined,
        medicalHistory: medicalHistory.trim() || undefined,
        drugAllergies: drugAllergies.trim() || undefined,
        foodAllergies: foodAllergies.trim() || undefined,
        otherAllergies: otherAllergies.trim() || undefined,
        allergies: undefined,
        chronicDiseases: chronicDiseases.trim() || undefined,
        pastSurgeries: pastSurgeries.trim() || undefined,
        medicalNotes: medicalNotes.trim() || undefined,
        vaccinationStatus: vaccinationStatus || undefined,
        lastVaccineName: vaccinationStatus === "not_vaccinated" ? undefined : lastVaccineName.trim() || undefined,
        lastVaccineDate: vaccinationStatus === "not_vaccinated" ? undefined : lastVaccineDate.trim() || undefined,
        postVaccinationReactions: postVaccinationReactions.trim() || undefined,
        vaccinationNotes: vaccinationNotes.trim() || undefined,
        guardianName: guardianName.trim(),
        relationship: actualRelationship,
        phone: primaryPhone.trim(),
        secondaryPhone: secondaryPhone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
      });

      // إرسال إشعار فوري للطبيب بقدوم طفل جديد
      notifySecretarySavedVisit({
        patientId: createdChild.id,
        childName: createdChild.fullName,
      });

      setCreatedPatientFileNumber(createdChild.fileNumber);
      setCreatedPatientId(createdChild.id);
      if (createdChild.vaccinationSaveWarning) {
        setVaccinationWarning(createdChild.vaccinationSaveWarning);
      }
      setIsSuccess(true);
    } catch (err: any) {
      setFormError(err.message || "حدث خطأ غير متوقع أثناء حفظ ملف الطفل");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Top Header Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/secretary"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 bg-white border border-slate-200 px-3.5 py-2 rounded-xl transition-colors shadow-xs"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لشاشة الاستقبال</span>
        </Link>
      </div>

      <div>
        <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <UserPlus className="w-7 h-7 text-clinic-600" />
          <span>تسجيل طفل جديد في العيادة</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          إنشاء السجل الطبي والإداري الشامل للطفل وولي الأمر وتوليد رقم الملف الطبي
        </p>
      </div>

      {isSuccess ? (
        <Card className="text-center py-12 space-y-4 bg-white border-emerald-200 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h3 className="text-2xl font-black text-slate-900">تم تسجيل ملف الطفل بنجاح</h3>
          <p className="text-base text-slate-700">
            اسم الطفل: <strong className="text-slate-900">{fullName}</strong>
          </p>
          <div className="inline-block bg-clinic-50 border border-clinic-200 text-clinic-800 font-mono text-lg font-black px-5 py-2.5 rounded-2xl shadow-xs">
            رقم الملف: {createdPatientFileNumber}
          </div>

          {vaccinationWarning && (
            <div className="max-w-xl mx-auto p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs font-bold flex items-center gap-2 text-right">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>
                تنبيه: تم إنشاء ملف الطفل وولي الأمر بنجاح، ولكن تعذر حفظ بيانات التطعيم ({vaccinationWarning}). يمكنك إضافتها لاحقاً من ملف الطفل.
              </span>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3 pt-6">
            <Link href={`/secretary/new-visit?patientId=${createdPatientId}`}>
              <Button variant="primary" size="lg" className="font-bold gap-2">
                <FileText className="w-5 h-5" />
                <span>فتح زيارة وتسجيل قياسات الآن</span>
              </Button>
            </Link>
            <Link href="/secretary">
              <Button variant="outline" size="lg" className="font-bold">
                العودة لقائمة الأطفال
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Form Error Banner */}
          {formError && (
            <div className="p-4 bg-rose-50 border-2 border-rose-200 text-rose-900 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-xs">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* 1. البيانات الأساسية للطفل */}
          <Card className="space-y-4 bg-white border-slate-200 shadow-xs">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base text-clinic-800 flex items-center gap-2 font-black">
                <User className="w-5 h-5 text-clinic-600" />
                <span>1. البيانات الأساسية للطفل</span>
              </CardTitle>
            </CardHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Input
                  label="الاسم الكامل للطفل (ثلاثي أو رباعي)"
                  required
                  placeholder="مثال: يوسف أحمد عبد الله"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (fieldErrors.fullName) {
                      setFieldErrors({ ...fieldErrors, fullName: "" });
                    }
                  }}
                  className={fieldErrors.fullName ? "border-rose-500" : ""}
                />
                {fieldErrors.fullName && (
                  <p className="text-[11px] font-bold text-rose-600">{fieldErrors.fullName}</p>
                )}
              </div>

              <div className="space-y-1">
                <Input
                  label="تاريخ الميلاد"
                  type="date"
                  required
                  value={birthDate}
                  onChange={(e) => {
                    setBirthDate(e.target.value);
                    if (fieldErrors.birthDate) {
                      setFieldErrors({ ...fieldErrors, birthDate: "" });
                    }
                  }}
                  className={fieldErrors.birthDate ? "border-rose-500" : ""}
                />
                {calculatedAge ? (
                  <p className="text-xs text-clinic-700 font-bold mt-1">
                    العمر المحسوب: {calculatedAge}
                  </p>
                ) : fieldErrors.birthDate ? (
                  <p className="text-[11px] font-bold text-rose-600">{fieldErrors.birthDate}</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 text-right">
                <label className="block text-sm font-semibold text-slate-700">
                  الجنس <span className="text-rose-500 mr-1">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setGender("male")}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                      gender === "male"
                        ? "bg-clinic-50 border-clinic-500 text-clinic-800 font-black shadow-2xs"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    ذكر
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender("female")}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                      gender === "female"
                        ? "bg-rose-50 border-rose-400 text-rose-800 font-black shadow-2xs"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    أنثى
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 text-right">
                <label className="block text-sm font-semibold text-slate-700">فصيلة الدم (اختياري)</label>
                <select
                  className="block w-full rounded-xl border border-slate-200 bg-white text-slate-800 text-sm h-11 px-3 focus:outline-none focus:ring-2 focus:ring-clinic-500"
                  value={bloodType}
                  onChange={(e) => setBloodType(e.target.value)}
                >
                  <option value="">غير معروفة حالياً</option>
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
          </Card>

          {/* 2. بيانات الولادة */}
          <Card className="space-y-4 bg-white border-slate-200 shadow-xs">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base text-clinic-800 flex items-center gap-2 font-black">
                <Baby className="w-5 h-5 text-clinic-600" />
                <span>2. بيانات الولادة (اختيارية)</span>
              </CardTitle>
            </CardHeader>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Input
                  label="مكان الولادة"
                  placeholder="المستشفى أو المدينة (مثال: بغداد)"
                  value={birthPlace}
                  onChange={(e) => setBirthPlace(e.target.value)}
                  rightIcon={<Building2 className="w-4 h-4 text-slate-400" />}
                />
              </div>

              <div className="space-y-1">
                <Input
                  label="الوزن عند الولادة (كغم)"
                  type="number"
                  step="0.01"
                  placeholder="مثال: 3.2"
                  value={birthWeightKg}
                  onChange={(e) => {
                    setBirthWeightKg(e.target.value);
                    if (fieldErrors.birthWeightKg) {
                      setFieldErrors({ ...fieldErrors, birthWeightKg: "" });
                    }
                  }}
                  rightIcon={<Scale className="w-4 h-4 text-slate-400" />}
                  className={fieldErrors.birthWeightKg ? "border-rose-500" : ""}
                />
                {fieldErrors.birthWeightKg && (
                  <p className="text-[11px] font-bold text-rose-600">{fieldErrors.birthWeightKg}</p>
                )}
              </div>

              <div className="space-y-1">
                <Input
                  label="الطول عند الولادة (سم)"
                  type="number"
                  step="0.1"
                  placeholder="مثال: 50.0"
                  value={birthLengthCm}
                  onChange={(e) => {
                    setBirthLengthCm(e.target.value);
                    if (fieldErrors.birthLengthCm) {
                      setFieldErrors({ ...fieldErrors, birthLengthCm: "" });
                    }
                  }}
                  rightIcon={<Ruler className="w-4 h-4 text-slate-400" />}
                  className={fieldErrors.birthLengthCm ? "border-rose-500" : ""}
                />
                {fieldErrors.birthLengthCm && (
                  <p className="text-[11px] font-bold text-rose-600">{fieldErrors.birthLengthCm}</p>
                )}
              </div>
            </div>
          </Card>

          {/* 3. التاريخ الطبي والحساسيات */}
          <Card className="space-y-4 bg-white border-amber-200/80 shadow-xs">
            <CardHeader className="pb-3 border-b border-amber-100 bg-amber-50/40 rounded-t-2xl">
              <CardTitle className="text-base text-amber-900 flex items-center gap-2 font-black">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span>3. التاريخ الطبي والحساسيات (اختيارية ومفصلة)</span>
              </CardTitle>
            </CardHeader>

            <div className="space-y-4">
              <Textarea
                label="التاريخ الطبي العام"
                placeholder="تفاصيل الحمل والولادة، التطور والنمو، ملاحظات الرضاعة والتغذية..."
                value={medicalHistory}
                onChange={(e) => setMedicalHistory(e.target.value)}
                className="min-h-[75px]"
              />

              {/* الحساسيات المفصلة */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-rose-50/50 rounded-2xl border border-rose-200/80">
                <Input
                  label="حساسية الأدوية"
                  placeholder="مثال: البنسلين، السلفا..."
                  value={drugAllergies}
                  onChange={(e) => setDrugAllergies(e.target.value)}
                />
                <Input
                  label="حساسية الطعام"
                  placeholder="مثال: الفول السوداني، البيض، الحليب..."
                  value={foodAllergies}
                  onChange={(e) => setFoodAllergies(e.target.value)}
                />
                <Input
                  label="حساسيات أخرى"
                  placeholder="مثال: الغبار، الحشرات، الربيع..."
                  value={otherAllergies}
                  onChange={(e) => setOtherAllergies(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="الأمراض المزمنة"
                  placeholder="مثال: ربو أطفال، سكري أطفال..."
                  value={chronicDiseases}
                  onChange={(e) => setChronicDiseases(e.target.value)}
                />
                <Input
                  label="العمليات الجراحية السابقة"
                  placeholder="مثال: استئصال اللوزتين (2025)..."
                  value={pastSurgeries}
                  onChange={(e) => setPastSurgeries(e.target.value)}
                />
                <Input
                  label="ملاحظات طبية خاصة"
                  placeholder="ملاحظات هامة للعيادة..."
                  value={medicalNotes}
                  onChange={(e) => setMedicalNotes(e.target.value)}
                />
              </div>
            </div>
          </Card>

          {/* 4. سجل وحالة التطعيمات (اختياري) */}
          <Card className="space-y-4 bg-white border-slate-200 shadow-xs">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-clinic-800 flex items-center gap-2 font-black">
                  <Syringe className="w-5 h-5 text-clinic-600" />
                  <span>4. سجل وحالة التطعيمات (اختياري)</span>
                </CardTitle>
                <span className="text-xs text-slate-400 font-medium">غير إلزامي للتسجيل</span>
              </div>
            </CardHeader>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5 text-right">
                <label className="block text-sm font-semibold text-slate-700">
                  حالة التطعيم
                </label>
                <select
                  className="block w-full rounded-xl border border-slate-200 bg-white text-slate-800 text-sm h-11 px-3 focus:outline-none focus:ring-2 focus:ring-clinic-500 font-bold"
                  value={vaccinationStatus}
                  onChange={(e) => {
                    const val = e.target.value as VaccinationStatus | "";
                    setVaccinationStatus(val);
                    if (val === "not_vaccinated") {
                      setLastVaccineName("");
                      setLastVaccineDate("");
                      if (fieldErrors.lastVaccineDate) {
                        const nextErrors = { ...fieldErrors };
                        delete nextErrors.lastVaccineDate;
                        setFieldErrors(nextErrors);
                      }
                    }
                  }}
                >
                  <option value="">-- غير مسجلة حالياً --</option>
                  <option value="complete">كامل التلقيح (مستكمل لكافة الجرعات)</option>
                  <option value="incomplete">غير كامل التلقيح (متأخر أو ناقص الجرعات)</option>
                  <option value="not_vaccinated">لم يُلقّح (لم يتلق أي لقاح)</option>
                </select>
              </div>

              {vaccinationStatus !== "not_vaccinated" && (
                <>
                  <Input
                    label="اسم آخر لقاح تم أخذه (اختياري)"
                    placeholder="مثال: الحصبة MMR، اللقاح السداسي..."
                    value={lastVaccineName}
                    onChange={(e) => setLastVaccineName(e.target.value)}
                  />

                  <div className="space-y-1">
                    <Input
                      label="تاريخ آخر تطعيم (اختياري)"
                      type="date"
                      value={lastVaccineDate}
                      onChange={(e) => {
                        setLastVaccineDate(e.target.value);
                        if (fieldErrors.lastVaccineDate) {
                          setFieldErrors({ ...fieldErrors, lastVaccineDate: "" });
                        }
                      }}
                      className={fieldErrors.lastVaccineDate ? "border-rose-500" : ""}
                    />
                    {fieldErrors.lastVaccineDate && (
                      <p className="text-[11px] font-bold text-rose-600">{fieldErrors.lastVaccineDate}</p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <Input
                label="تفاعلات أو أعراض جانبية بعد اللقاحات (اختياري)"
                placeholder="مثال: حمى طفيفة، حساسية، تورم موضعي..."
                value={postVaccinationReactions}
                onChange={(e) => setPostVaccinationReactions(e.target.value)}
              />

              <Input
                label="ملاحظات وتوصيات التطعيم (اختياري)"
                placeholder="مثال: يحتاج جرعة منشطة لشلل الأطفال الشهر القادم..."
                value={vaccinationNotes}
                onChange={(e) => setVaccinationNotes(e.target.value)}
              />
            </div>
          </Card>

          {/* 5. بيانات ولي الأمر */}
          <Card className="space-y-4 bg-white border-slate-200 shadow-xs">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base text-clinic-800 flex items-center gap-2 font-black">
                <Phone className="w-5 h-5 text-clinic-600" />
                <span>5. بيانات ولي الأمر والاتصال</span>
              </CardTitle>
            </CardHeader>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Input
                  label="اسم ولي الأمر"
                  required
                  placeholder="مثال: أحمد عبد الله"
                  value={guardianName}
                  onChange={(e) => {
                    setGuardianName(e.target.value);
                    if (fieldErrors.guardianName) {
                      setFieldErrors({ ...fieldErrors, guardianName: "" });
                    }
                  }}
                  className={fieldErrors.guardianName ? "border-rose-500" : ""}
                />
                {fieldErrors.guardianName && (
                  <p className="text-[11px] font-bold text-rose-600">{fieldErrors.guardianName}</p>
                )}
              </div>

              <div className="space-y-1.5 text-right">
                <label className="block text-sm font-semibold text-slate-700">
                  صلة القرابة <span className="text-rose-500 mr-1">*</span>
                </label>
                <select
                  className="block w-full rounded-xl border border-slate-200 bg-white text-slate-800 text-sm h-11 px-3 focus:outline-none focus:ring-2 focus:ring-clinic-500 font-bold"
                  value={relationshipType}
                  onChange={(e) => setRelationshipType(e.target.value)}
                >
                  {RELATIONSHIP_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </select>
              </div>

              {relationshipType === "أخرى" ? (
                <div className="space-y-1">
                  <Input
                    label="اكتب صلة القرابة"
                    required
                    placeholder="مثال: العمة، الخال، الجار..."
                    value={customRelationship}
                    onChange={(e) => setCustomRelationship(e.target.value)}
                    className={fieldErrors.customRelationship ? "border-rose-500" : ""}
                  />
                  {fieldErrors.customRelationship && (
                    <p className="text-[11px] font-bold text-rose-600">{fieldErrors.customRelationship}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <Input
                    label="رقم الهاتف الأساسي"
                    required
                    placeholder="0770XXXXXXX"
                    value={primaryPhone}
                    onChange={(e) => {
                      setPrimaryPhone(e.target.value);
                      if (fieldErrors.primaryPhone) {
                        setFieldErrors({ ...fieldErrors, primaryPhone: "" });
                      }
                    }}
                    className={fieldErrors.primaryPhone ? "border-rose-500" : ""}
                  />
                  {fieldErrors.primaryPhone && (
                    <p className="text-[11px] font-bold text-rose-600">{fieldErrors.primaryPhone}</p>
                  )}
                </div>
              )}
            </div>

            {relationshipType === "أخرى" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Input
                    label="رقم الهاتف الأساسي"
                    required
                    placeholder="0770XXXXXXX"
                    value={primaryPhone}
                    onChange={(e) => {
                      setPrimaryPhone(e.target.value);
                      if (fieldErrors.primaryPhone) {
                        setFieldErrors({ ...fieldErrors, primaryPhone: "" });
                      }
                    }}
                    className={fieldErrors.primaryPhone ? "border-rose-500" : ""}
                  />
                  {fieldErrors.primaryPhone && (
                    <p className="text-[11px] font-bold text-rose-600">{fieldErrors.primaryPhone}</p>
                  )}
                </div>
                <Input
                  label="رقم هاتف إضافي (اختياري)"
                  placeholder="0780XXXXXXX"
                  value={secondaryPhone}
                  onChange={(e) => setSecondaryPhone(e.target.value)}
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {relationshipType !== "أخرى" && (
                <Input
                  label="رقم هاتف إضافي (اختياري)"
                  placeholder="0780XXXXXXX"
                  value={secondaryPhone}
                  onChange={(e) => setSecondaryPhone(e.target.value)}
                />
              )}

              <div className="space-y-1">
                <Input
                  label="البريد الإلكتروني (اختياري)"
                  type="email"
                  placeholder="parent@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) {
                      setFieldErrors({ ...fieldErrors, email: "" });
                    }
                  }}
                  rightIcon={<Mail className="w-4 h-4 text-slate-400" />}
                  className={fieldErrors.email ? "border-rose-500" : ""}
                />
                {fieldErrors.email && (
                  <p className="text-[11px] font-bold text-rose-600">{fieldErrors.email}</p>
                )}
              </div>

              <div className="space-y-1">
                <Input
                  label="عنوان السكن (اختياري)"
                  placeholder="المحافظة - المنطقة - أقرب نقطة دالة"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rightIcon={<MapPin className="w-4 h-4 text-slate-400" />}
                />
              </div>
            </div>
          </Card>

          {/* Actions Bar */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/secretary">
              <Button type="button" variant="ghost" disabled={isLoading}>
                إلغاء والعودة
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={isLoading}
              variant="primary"
              size="lg"
              className="font-extrabold px-10 h-13 shadow-sm"
            >
              {isLoading ? "جاري حفظ الملف..." : "حفظ وإنشاء ملف الطفل"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

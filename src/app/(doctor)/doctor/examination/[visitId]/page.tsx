"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { MOCK_VISITS } from "@/lib/mock-data/patients";
import { calculateArabicAge, DOSAGE_FORM_LABELS } from "@/lib/utils";
import { DosageForm } from "@/types/database";
import {
  ArrowRight,
  Stethoscope,
  Pill,
  Camera,
  CheckCircle2,
  Plus,
  Trash2,
  AlertTriangle,
  FileCheck,
  Printer,
} from "lucide-react";

interface PrescriptionItemForm {
  id: string;
  medication_name: string;
  strength: string;
  dosage_form: DosageForm;
  dose: string;
  frequency: string;
  duration: string;
  route_or_instructions: string;
  notes: string;
}

export default function MedicalExaminationPage() {
  const params = useParams();
  const router = useRouter();
  const visitId = params.visitId as string;

  const visit = MOCK_VISITS.find((v) => v.id === visitId) || MOCK_VISITS[1];
  const patient = visit.patient;

  // Diagnosis State
  const [symptoms, setSymptoms] = useState(visit.diagnosis?.symptoms || "");
  const [history, setHistory] = useState(visit.diagnosis?.present_illness_history || "");
  const [examination, setExamination] = useState(visit.diagnosis?.clinical_examination || "");
  const [diagnosisText, setDiagnosisText] = useState(visit.diagnosis?.diagnosis_text || "");
  const [doctorNotes, setDoctorNotes] = useState(visit.diagnosis?.doctor_notes || "");
  const [recommendations, setRecommendations] = useState(visit.diagnosis?.recommendations || "");
  const [followUpDate, setFollowUpDate] = useState(visit.diagnosis?.follow_up_date || "");

  // Prescription State
  const [rxType, setRxType] = useState<"digital" | "scanned" | "both">("digital");
  const [rxItems, setRxItems] = useState<PrescriptionItemForm[]>([
    {
      id: "rx-item-1",
      medication_name: "",
      strength: "",
      dosage_form: "syrup",
      dose: "",
      frequency: "3 مرات يومياً",
      duration: "5 أيام",
      route_or_instructions: "بعد الأكل",
      notes: "",
    },
  ]);
  const [generalInstructions, setGeneralInstructions] = useState(
    "يرجى الالتزام بمواعيد الجرعات ومراجعة العيادة في حال استمرار الأعراض."
  );
  const [isCompleted, setIsCompleted] = useState(false);

  const addRxItem = () => {
    setRxItems([
      ...rxItems,
      {
        id: `rx-item-${Date.now()}`,
        medication_name: "",
        strength: "",
        dosage_form: "syrup",
        dose: "",
        frequency: "3 مرات يومياً",
        duration: "5 أيام",
        route_or_instructions: "بعد الأكل",
        notes: "",
      },
    ]);
  };

  const removeRxItem = (id: string) => {
    if (rxItems.length > 1) {
      setRxItems(rxItems.filter((item) => item.id !== id));
    }
  };

  const updateRxItem = (id: string, field: keyof PrescriptionItemForm, value: string) => {
    setRxItems(
      rxItems.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleApproveVisit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsCompleted(true);
  };

  if (!patient) return null;

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/doctor"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة للوحة تحكم الطبيب</span>
        </Link>
      </div>

      {/* Patient Vital Summary Header */}
      <Card className="border-2 border-clinic-500 bg-white p-5 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900">{patient.full_name}</h2>
              <span className="font-mono text-xs font-bold bg-clinic-100 text-clinic-800 px-2 py-0.5 rounded">
                {patient.file_number}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              العمر: {calculateArabicAge(patient.date_of_birth)} | الجنس:{" "}
              {patient.gender === "male" ? "ذكر" : "أنثى"} | ولي الأمر: {patient.guardian?.full_name} ({patient.guardian?.primary_phone})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="info">جلسة فحص نشطة</Badge>
          </div>
        </div>

        {/* Patient Allergy Warning */}
        {patient.allergies && (
          <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>تحذير طبي: {patient.allergies}</span>
          </div>
        )}

        {/* Measurements Taken by Secretary */}
        {visit.measurements && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-50 p-3 rounded-xl text-center text-xs mt-3">
            <div>
              <span className="text-slate-400 text-[10px] block">الوزن</span>
              <span className="font-extrabold text-slate-800">{visit.measurements.weight_kg} كغم</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">الطول</span>
              <span className="font-extrabold text-slate-800">{visit.measurements.height_cm} سم</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">درجة الحرارة</span>
              <span className={`font-extrabold ${(visit.measurements.temperature_c || 0) >= 38 ? "text-rose-600" : "text-slate-800"}`}>
                {visit.measurements.temperature_c} °C
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">ضغط الدم</span>
              <span className="font-bold text-slate-800">{visit.measurements.blood_pressure || "--"}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">نسبة الأكسجين</span>
              <span className="font-bold text-slate-800">%{visit.measurements.oxygen_saturation || "--"}</span>
            </div>
          </div>
        )}
      </Card>

      {isCompleted ? (
        <Card className="text-center py-12 space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h3 className="text-2xl font-black text-slate-900">تم اعتماد الزيارة والوصفة الطبية بنجاح</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            أصبحت حالة الزيارة مكتملة، ويمكن لشاشة السكرتارية الآن استعراض وطباعة الوصفة المعتمدة.
          </p>
          <div className="flex justify-center gap-3 pt-4">
            <Link href={`/secretary/prescriptions/${visit.id}/print`}>
              <Button variant="outline" className="font-bold gap-2">
                <Printer className="w-4 h-4" />
                معاينة قالب الطباعة
              </Button>
            </Link>
            <Link href="/doctor">
              <Button variant="primary" className="font-bold">
                العودة لقائمة الانتظار
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <form onSubmit={handleApproveVisit} className="space-y-6">
          {/* Section 1: Clinical Examination & Diagnosis */}
          <Card className="space-y-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-clinic-800">
                <Stethoscope className="w-5 h-5 text-clinic-600" />
                <span>الفحص والتشخيص الطبي</span>
              </CardTitle>
            </CardHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Textarea
                label="الأعراض والشكوى السريرية"
                placeholder="صف الأعراض التي يشكو منها الطفل..."
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
              />

              <Textarea
                label="نتائج الفحص السريري"
                placeholder="نتائج فحص الصدر، البلعوم، الأذن، البطن..."
                value={examination}
                onChange={(e) => setExamination(e.target.value)}
              />
            </div>

            <Input
              label="التشخيص النهائي (Diagnosis)"
              required
              placeholder="مثال: التهاب الشعب الهوائية الحاد (Acute Bronchitis)"
              value={diagnosisText}
              onChange={(e) => setDiagnosisText(e.target.value)}
              className="font-bold text-slate-900"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Textarea
                label="التوصيات والتعليمات للأهل"
                placeholder="الراحة، السوائل، حمية معينة..."
                value={recommendations}
                onChange={(e) => setRecommendations(e.target.value)}
              />

              <div className="space-y-4">
                <Textarea
                  label="ملاحظات الطبيب السرية"
                  placeholder="ملاحظات سريرية خاصة بالطبيب..."
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                />
                <Input
                  label="موعد المراجعة القادمة (اختياري)"
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
              </div>
            </div>
          </Card>

          {/* Section 2: Prescription Builder */}
          <Card className="space-y-4">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base text-clinic-800">
                <Pill className="w-5 h-5 text-clinic-600" />
                <span>الوصفة الطبية (Prescription)</span>
              </CardTitle>

              {/* Toggle Digital vs Scanned */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRxType("digital")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    rxType === "digital"
                      ? "bg-clinic-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  وصفة إلكترونية
                </button>
                <button
                  type="button"
                  onClick={() => setRxType("scanned")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    rxType === "scanned"
                      ? "bg-clinic-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  وصفة مصورة
                </button>
              </div>
            </CardHeader>

            {rxType === "scanned" ? (
              <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center space-y-3 bg-slate-50">
                <Camera className="w-10 h-10 text-slate-400 mx-auto" />
                <h4 className="text-sm font-bold text-slate-700">رفع أو تصوير الوصفة الورقية</h4>
                <p className="text-xs text-slate-500">
                  يمكن التقاط صورة مباشرة أو رفع ملف الوصفة لاعتماده
                </p>
                <Button type="button" variant="outline" size="sm">
                  اختر صورة الوصفة
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {rxItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3 relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-clinic-800 bg-clinic-100 px-2.5 py-0.5 rounded-md">
                        دواء #{index + 1}
                      </span>
                      {rxItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRxItem(item.id)}
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Input
                        label="اسم الدواء العلمي أو التجاري"
                        required
                        placeholder="مثال: Amoxicillin / Paracetamol"
                        value={item.medication_name}
                        onChange={(e) => updateRxItem(item.id, "medication_name", e.target.value)}
                      />
                      <Input
                        label="التركيز"
                        placeholder="مثال: 125mg / 5ml"
                        value={item.strength}
                        onChange={(e) => updateRxItem(item.id, "strength", e.target.value)}
                      />
                      <div className="space-y-1.5 text-right">
                        <label className="block text-sm font-semibold text-slate-700">الشكل الدوائي</label>
                        <select
                          className="block w-full rounded-xl border border-slate-200 bg-white text-slate-800 text-sm h-11 px-3 focus:outline-none focus:ring-2 focus:ring-clinic-500"
                          value={item.dosage_form}
                          onChange={(e) => updateRxItem(item.id, "dosage_form", e.target.value)}
                        >
                          {Object.entries(DOSAGE_FORM_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Input
                        label="الجرعة"
                        required
                        placeholder="مثال: 5 مل أو 1 ملعقة"
                        value={item.dose}
                        onChange={(e) => updateRxItem(item.id, "dose", e.target.value)}
                      />
                      <Input
                        label="التكرار"
                        required
                        placeholder="مثال: كل 8 ساعات"
                        value={item.frequency}
                        onChange={(e) => updateRxItem(item.id, "frequency", e.target.value)}
                      />
                      <Input
                        label="مدة العلاج"
                        required
                        placeholder="مثال: 7 أيام"
                        value={item.duration}
                        onChange={(e) => updateRxItem(item.id, "duration", e.target.value)}
                      />
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addRxItem}
                  className="w-full border-dashed border-2 py-3 text-clinic-700 font-bold"
                >
                  <Plus className="w-4 h-4 ml-1" />
                  إضافة دواء آخر
                </Button>

                <Textarea
                  label="تعليمات وإرشادات عامة للوصفة"
                  value={generalInstructions}
                  onChange={(e) => setGeneralInstructions(e.target.value)}
                />
              </div>
            )}
          </Card>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Link href="/doctor">
              <Button type="button" variant="ghost">
                إلغاء والعودة
              </Button>
            </Link>
            <Button type="submit" variant="primary" size="lg" className="font-extrabold px-8">
              <FileCheck className="w-5 h-5 ml-2" />
              اعتماد الفحص والوصفة الطبية
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

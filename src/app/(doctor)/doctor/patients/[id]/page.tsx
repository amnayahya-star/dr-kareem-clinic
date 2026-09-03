"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { MOCK_PATIENTS, MOCK_VISITS } from "@/lib/mock-data/patients";
import { calculateArabicAge, formatArabicDate, formatArabicTime } from "@/lib/utils";
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
} from "lucide-react";

export default function PatientMedicalFilePage() {
  const params = useParams();
  const patientId = params.id as string;

  const patient = MOCK_PATIENTS.find((p) => p.id === patientId) || MOCK_PATIENTS[0];
  const patientVisits = MOCK_VISITS.filter((v) => v.patient_id === patient.id || v.patient?.id === patient.id);

  return (
    <div className="space-y-6">
      {/* Top navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/doctor/patients"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لقائمة ملفات الأطفال</span>
        </Link>
      </div>

      {/* Patient Main Identity Card */}
      <Card className="border-2 border-clinic-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-clinic-100 text-clinic-700 flex items-center justify-center font-black text-2xl shadow-inner">
              {patient.full_name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black text-slate-900">{patient.full_name}</h2>
                <span className="font-mono text-sm font-bold bg-clinic-50 text-clinic-700 px-2.5 py-1 rounded-lg border border-clinic-200">
                  {patient.file_number}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                تاريخ الميلاد: {formatArabicDate(patient.date_of_birth)} ({calculateArabicAge(patient.date_of_birth)}) |{" "}
                الجنس: {patient.gender === "male" ? "ذكر" : "أنثى"} | فصيلة الدم: {patient.blood_type || "غير محددة"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="info" size="md">
              ملف نشط
            </Badge>
          </div>
        </div>

        {/* Critical Medical Alerts */}
        {patient.allergies && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-900 text-xs font-bold">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-black text-rose-700">تنبيه الحساسية الدوائية / الغذائية:</div>
              <div>{patient.allergies}</div>
            </div>
          </div>
        )}

        {patient.chronic_diseases && (
          <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-900 text-xs font-bold">
            <Heart className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-black text-amber-700">الأمراض المزمنة المسجلة:</div>
              <div>{patient.chronic_diseases}</div>
            </div>
          </div>
        )}

        {/* Guardian & Background Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-4 border-t border-slate-100 text-xs">
          <div className="bg-slate-50 p-3 rounded-xl space-y-1">
            <span className="text-slate-400 font-bold block">ولي الأمر والاتصال:</span>
            <p className="font-bold text-slate-800">
              {patient.guardian?.full_name} ({patient.guardian?.relationship})
            </p>
            <p className="font-mono text-slate-600">{patient.guardian?.primary_phone}</p>
            {patient.guardian?.secondary_phone && (
              <p className="font-mono text-slate-500">{patient.guardian.secondary_phone}</p>
            )}
          </div>

          <div className="bg-slate-50 p-3 rounded-xl space-y-1">
            <span className="text-slate-400 font-bold block">العنوان والسكن:</span>
            <p className="text-slate-800 font-medium">{patient.guardian?.address || "لم يسجل عنوان محدد"}</p>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl space-y-1">
            <span className="text-slate-400 font-bold block">العمليات والملاحظات الطبية:</span>
            <p className="text-slate-800 font-medium">العمليات: {patient.past_surgeries || "لا توجد"}</p>
            <p className="text-slate-600 mt-1">{patient.medical_notes || "لا توجد ملاحظات إضافية"}</p>
          </div>
        </div>
      </Card>

      {/* Visits & Medical History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-clinic-600" />
            <span>سجل الزيارات والفحوصات السابقة</span>
          </h3>
          <span className="text-xs font-bold text-slate-500">
            عدد الزيارات: {patientVisits.length}
          </span>
        </div>

        {patientVisits.length === 0 ? (
          <Card className="text-center py-10 text-slate-400 text-xs font-medium">
            لا توجد زيارات سابقة مسجلة لهذا الطفل.
          </Card>
        ) : (
          patientVisits.map((visit) => (
            <Card key={visit.id} className="border border-slate-200/90 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-clinic-600" />
                  <span className="text-sm font-bold text-slate-800">
                    زيارة يوم: {formatArabicDate(visit.visit_date)} ({formatArabicTime(visit.visit_date)})
                  </span>
                </div>
                <Badge variant={visit.status === "completed" ? "success" : "warning"}>
                  {visit.status === "completed" ? "زيارة مكتملة ومعتمدة" : "قيد المتابعة"}
                </Badge>
              </div>

              {/* Vitals */}
              {visit.measurements && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-50 p-3 rounded-xl text-center text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] block">الوزن</span>
                    <span className="font-bold text-slate-800">{visit.measurements.weight_kg} كغم</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">الطول</span>
                    <span className="font-bold text-slate-800">{visit.measurements.height_cm} سم</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">درجة الحرارة</span>
                    <span className="font-bold text-slate-800">{visit.measurements.temperature_c} °C</span>
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

              {/* Diagnosis details */}
              {visit.diagnosis && (
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-clinic-50/50 rounded-xl border border-clinic-100">
                    <span className="font-bold text-clinic-900 block mb-1">التشخيص الطبي:</span>
                    <p className="font-extrabold text-slate-900 text-sm">{visit.diagnosis.diagnosis_text}</p>
                  </div>

                  {visit.diagnosis.clinical_examination && (
                    <div>
                      <span className="font-bold text-slate-700 block">نتائج الفحص السريري:</span>
                      <p className="text-slate-600 mt-0.5">{visit.diagnosis.clinical_examination}</p>
                    </div>
                  )}

                  {visit.diagnosis.recommendations && (
                    <div>
                      <span className="font-bold text-slate-700 block">التوصيات والتعليمات:</span>
                      <p className="text-slate-600 mt-0.5">{visit.diagnosis.recommendations}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Prescription Items */}
              {visit.prescription && visit.prescription.items && visit.prescription.items.length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-700 mb-2">
                    <Pill className="w-4 h-4 text-clinic-600" />
                    <span>الأدوية الموصوفة ({visit.prescription.items.length}):</span>
                  </div>

                  <div className="space-y-2">
                    {visit.prescription.items.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-2.5 bg-slate-50 rounded-xl text-xs flex items-center justify-between border border-slate-100"
                      >
                        <div>
                          <span className="font-bold text-slate-900">{idx + 1}. {item.medication_name}</span>
                          <span className="text-slate-500 font-mono mr-2">({item.strength})</span>
                        </div>
                        <div className="text-slate-600 font-medium">
                          <span>{item.dose}</span> | <span>{item.frequency}</span> | <span>{item.duration}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

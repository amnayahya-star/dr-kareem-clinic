"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { MOCK_VISITS } from "@/lib/mock-data/patients";
import { calculateArabicAge, formatArabicDate, DOSAGE_FORM_LABELS } from "@/lib/utils";
import { Printer, ArrowRight, Activity } from "lucide-react";

export default function PrescriptionPrintPage() {
  const params = useParams();
  const visitId = params.visitId as string;

  const visit = MOCK_VISITS.find((v) => v.id === visitId) || MOCK_VISITS[0];
  const patient = visit.patient;
  const prescription = visit.prescription;

  const handlePrint = () => {
    window.print();
  };

  if (!patient || !prescription) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-base text-slate-600">لم يتم العثور على وصفة طبية لهذه الزيارة.</p>
        <Link href="/secretary">
          <Button variant="primary">العودة للوحة السكرتير</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Action Bar (Hidden during Print) */}
      <div className="no-print flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm max-w-3xl mx-auto">
        <Link
          href="/secretary"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لشاشات السكرتير</span>
        </Link>

        <Button onClick={handlePrint} variant="primary" className="font-extrabold gap-2">
          <Printer className="w-4 h-4" />
          <span>طباعة الوصفة الطبية (Print / PDF)</span>
        </Button>
      </div>

      {/* Official Medical Prescription Print Document (A5 styled) */}
      <div className="print-area bg-white max-w-2xl mx-auto border-2 border-slate-300 rounded-2xl p-8 shadow-md text-slate-900 font-sans print:border-none print:shadow-none print:p-0">
        {/* Header */}
        <div className="flex items-center justify-between pb-6 border-b-2 border-slate-800">
          <div className="text-right">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">
              عيادة الدكتور عبد الكريم عليوي
            </h1>
            <h2 className="text-sm font-bold text-clinic-800 mt-1">
              الدكتور عبد الكريم عليوي
            </h2>
            <p className="text-xs font-semibold text-slate-600">
              بورد طب الأطفال وحديثي الولادة
            </p>
          </div>

          <div className="w-14 h-14 rounded-2xl border-2 border-slate-800 flex items-center justify-center text-slate-800 font-black text-xl">
            Rx
          </div>
        </div>

        {/* Patient & Visit Metadata Info */}
        <div className="grid grid-cols-2 gap-4 py-4 border-b border-slate-200 text-xs">
          <div>
            <span className="font-bold text-slate-500">اسم الطفل: </span>
            <span className="font-black text-slate-900 text-sm">{patient.full_name}</span>
          </div>
          <div className="text-left">
            <span className="font-bold text-slate-500">رقم الملف: </span>
            <span className="font-mono font-bold text-slate-900">{patient.file_number}</span>
          </div>
          <div>
            <span className="font-bold text-slate-500">العمر: </span>
            <span className="font-bold text-slate-800">{calculateArabicAge(patient.date_of_birth)}</span>
          </div>
          <div className="text-left">
            <span className="font-bold text-slate-500">تاريخ الزيارة: </span>
            <span className="font-bold text-slate-800">{formatArabicDate(visit.visit_date)}</span>
          </div>
        </div>

        {/* Prescription Medications List */}
        <div className="py-6 min-h-[350px]">
          <div className="text-base font-black text-slate-900 mb-4 pb-1 border-b border-slate-200 flex items-center justify-between">
            <span>العلاج والوصفة الطبية (Rx)</span>
          </div>

          <div className="space-y-4">
            {prescription.items?.map((item, idx) => (
              <div key={item.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-baseline justify-between mb-1">
                  <div className="font-black text-sm text-slate-900">
                    <span>{idx + 1}. {item.medication_name}</span>
                    {item.strength && <span className="text-xs font-mono text-slate-600 mr-2">({item.strength})</span>}
                  </div>
                  <span className="text-xs font-bold text-clinic-800">
                    {DOSAGE_FORM_LABELS[item.dosage_form]}
                  </span>
                </div>

                <div className="text-xs text-slate-700 font-medium space-x-3 rtl:space-x-reverse">
                  <span>الجرعة: <strong className="font-bold text-slate-900">{item.dose}</strong></span>
                  <span>|</span>
                  <span>التكرار: <strong className="font-bold text-slate-900">{item.frequency}</strong></span>
                  <span>|</span>
                  <span>المدة: <strong className="font-bold text-slate-900">{item.duration}</strong></span>
                </div>

                {item.route_or_instructions && (
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    طريقة الاستخدام: {item.route_or_instructions}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* General Instructions */}
          {prescription.general_instructions && (
            <div className="mt-6 p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs">
              <span className="font-bold text-slate-800 block mb-0.5">تعليمات عامة:</span>
              <p className="text-slate-600 leading-relaxed">{prescription.general_instructions}</p>
            </div>
          )}
        </div>

        {/* Footer & Signature Stamp Area */}
        <div className="pt-8 border-t-2 border-slate-800 flex items-end justify-between text-xs">
          <div className="space-y-1 text-slate-500">
            <p className="font-semibold">تمنياتنا للطفل بالشفاء العاجل وموفور الصحة والعافية</p>
            <p className="text-[10px]">تم إنشاء هذه الوصفة واعتمادها إلكترونياً من عيادة د. عبد الكريم عليوي</p>
          </div>

          <div className="text-center min-w-[160px]">
            <div className="h-14 border-b border-dashed border-slate-400 mb-1 flex items-center justify-center text-slate-300 text-xs">
              (توقيع / ختم الطبيب)
            </div>
            <span className="font-bold text-slate-800 block">د. عبد الكريم عليوي</span>
            <span className="text-[10px] text-slate-500 block">بورد طب الأطفال وحديثي الولادة</span>
          </div>
        </div>
      </div>
    </div>
  );
}

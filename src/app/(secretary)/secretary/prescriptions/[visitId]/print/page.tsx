"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { fetchPrescriptionByVisitId } from "@/services/prescriptionService";
import { fetchPatients } from "@/services/patientService";
import { PatientFile, VisitRecord } from "@/lib/mock-data/patients";
import { Prescription } from "@/types/database";
import { calculateArabicAge, formatArabicDate, DOSAGE_FORM_LABELS } from "@/lib/utils";
import { Printer, ArrowRight, Ban, Stethoscope } from "lucide-react";

export default function PrescriptionPrintPage() {
  const params = useParams();
  const router = useRouter();
  const visitId = params.visitId as string;

  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [patient, setPatient] = useState<PatientFile | null>(null);
  const [visit, setVisit] = useState<VisitRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPrescriptionData() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        // 1. Fetch prescription for this visit (RLS blocks drafts from secretary)
        const rx = await fetchPrescriptionByVisitId(visitId);

        if (!rx || rx.status !== "issued") {
          if (isMounted) {
            setPrescription(null);
            setErrorMessage("هذه الوصفة غير متاحة للطباعة");
          }
          return;
        }

        // 2. Fetch patients to find associated patient and visit metadata
        const patients = await fetchPatients();

        let matchedPatient: PatientFile | null = null;
        let matchedVisit: VisitRecord | null = null;

        for (const p of patients) {
          const v = p.visits.find((visitItem) => visitItem.id === visitId);
          if (v) {
            matchedPatient = p;
            matchedVisit = v;
            break;
          }
        }

        // If patient wasn't found by visitId directly, try by rx.patient_id
        if (!matchedPatient && rx) {
          matchedPatient = patients.find((p) => p.id === rx.patient_id) || null;
          if (matchedPatient) {
            matchedVisit = matchedPatient.visits.find((v) => v.id === visitId) || null;
          }
        }

        if (isMounted) {
          setPrescription(rx);
          setPatient(matchedPatient);
          setVisit(matchedVisit);
        }
      } catch (err: any) {
        if (isMounted) {
          setPrescription(null);
          setErrorMessage("هذه الوصفة غير متاحة للطباعة");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    if (visitId) {
      loadPrescriptionData();
    }
  }, [visitId]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-3">
        <div className="w-10 h-10 border-4 border-clinic-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-600">جاري تحميل وتجهيز الوصفة الطبية للطباعة...</p>
      </div>
    );
  }

  // Fail-closed gate: if no issued prescription or missing patient, NEVER render clinical details
  if (errorMessage || !prescription || prescription.status !== "issued" || !patient) {
    return (
      <div className="p-8 text-center space-y-4 max-w-lg mx-auto">
        <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl text-slate-900 space-y-2 shadow-xs">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-500">
            <Ban className="w-6 h-6" />
          </div>
          <h3 className="font-black text-base">هذه الوصفة غير متاحة للطباعة</h3>
          <p className="text-xs text-slate-600">
            لا يمكن طباعة الوصفة الطبية إلا بعد اعتمادها وإصدارها رسمياً من قبل الطبيب المعالج.
          </p>
        </div>
        <Link href="/secretary">
          <Button variant="primary" className="font-bold">
            العودة لشاشة الاستقبال
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Action Bar (Hidden during Print) */}
      <div className="no-print flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm max-w-3xl mx-auto">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>الرجوع للخلف</span>
        </button>

        <div className="flex items-center gap-3">
          <Button
            onClick={handlePrint}
            variant="primary"
            className="font-extrabold gap-2 bg-clinic-700 hover:bg-clinic-800 shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة الوصفة الطبية (Print / PDF)</span>
          </Button>
        </div>
      </div>

      {/* Official Medical Prescription Print Document (A5 styled) */}
      <div className="print-area bg-white max-w-2xl mx-auto border-2 border-slate-300 rounded-3xl p-8 shadow-md text-slate-900 font-sans print:border-none print:shadow-none print:p-0 print:m-0">
        {/* Header with Doctor branding */}
        <div className="flex items-center justify-between pb-6 border-b-2 border-slate-800">
          <div className="text-right space-y-1">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">
              عيادة الدكتور عبد الكريم عليوي
            </h1>
            <h2 className="text-sm font-bold text-clinic-800">
              د. عبد الكريم عليوي - اختصاصي طب الأطفال والرضع
            </h2>
            <p className="text-xs font-semibold text-slate-600">
              بورد طب الأطفال وحديثي الولادة • زميل الكلية الملكية البريطانية
            </p>
          </div>

          <div className="w-16 h-16 rounded-2xl border-2 border-slate-900 flex flex-col items-center justify-center text-slate-900 font-black shadow-inner">
            <span className="text-2xl font-serif leading-none">℞</span>
            <span className="text-[9px] font-mono tracking-tighter">CLINIC</span>
          </div>
        </div>

        {/* Patient & Visit Metadata Info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-b border-slate-200 text-xs">
          <div>
            <span className="font-bold text-slate-500 block text-[10px]">اسم الطفل:</span>
            <span className="font-black text-slate-900 text-sm">{patient.fullName}</span>
          </div>
          <div>
            <span className="font-bold text-slate-500 block text-[10px]">رقم الملف:</span>
            <span className="font-mono font-bold text-slate-900">{patient.fileNumber}</span>
          </div>
          <div>
            <span className="font-bold text-slate-500 block text-[10px]">العمر / الجنس:</span>
            <span className="font-bold text-slate-800">
              {calculateArabicAge(patient.dateOfBirth)} ({patient.gender === "male" ? "ذكر" : "أنثى"})
            </span>
          </div>
          <div className="text-left">
            <span className="font-bold text-slate-500 block text-[10px]">تاريخ الزيارة:</span>
            <span className="font-bold text-slate-800">
              {formatArabicDate(visit?.date || prescription.issued_at || new Date().toISOString())}
            </span>
          </div>
        </div>

        {/* Child Vitals & Allergies Highlights */}
        {(visit?.weightKg || patient.allergies || patient.drugAllergies) && (
          <div className="grid grid-cols-2 gap-3 py-2.5 border-b border-slate-100 text-xs">
            {visit?.weightKg && (
              <div>
                <span className="font-bold text-slate-500">الوزن الحالي: </span>
                <strong className="font-black text-slate-900">{visit.weightKg} كغم</strong>
              </div>
            )}
            {(patient.drugAllergies || patient.allergies) && (
              <div className="text-left text-rose-700 font-bold">
                <span>تنبيه الحساسية: </span>
                <span>{patient.drugAllergies || patient.allergies}</span>
              </div>
            )}
          </div>
        )}

        {/* Prescription Medications List */}
        <div className="py-6 min-h-[320px]">
          <div className="text-base font-black text-slate-900 mb-4 pb-1 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-clinic-700" />
              <span>العلاج والوصفة الطبية (Rx)</span>
            </div>
            {prescription.items && (
              <span className="text-xs font-bold text-slate-500">
                عدد الأدوية: {prescription.items.length}
              </span>
            )}
          </div>

          <div className="space-y-4">
            {(!prescription.items || prescription.items.length === 0) ? (
              <p className="text-xs text-slate-400 py-6 text-center">لا توجد أدوية مدرجة في هذه الوصفة.</p>
            ) : (
              prescription.items.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 print:bg-transparent print:border-slate-300"
                >
                  <div className="flex items-baseline justify-between mb-1.5 flex-wrap gap-1">
                    <div className="font-black text-sm text-slate-900">
                      <span>{idx + 1}. {item.medication_name}</span>
                      {item.strength && (
                        <span className="text-xs font-mono text-slate-600 mr-2">
                          ({item.strength})
                        </span>
                      )}
                      {item.active_ingredient && (
                        <span className="text-[11px] text-slate-500 font-normal mr-2">
                          [{item.active_ingredient}]
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-clinic-800 bg-clinic-50 px-2 py-0.5 rounded-lg border border-clinic-200 print:border-none print:bg-transparent">
                      {DOSAGE_FORM_LABELS[item.dosage_form] || item.dosage_form}
                    </span>
                  </div>

                  <div className="text-xs text-slate-800 font-medium flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>
                      الجرعة: <strong className="font-bold text-slate-950">{item.dose}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      التكرار: <strong className="font-bold text-slate-950">{item.frequency}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      المدة: <strong className="font-bold text-slate-950">{item.duration}</strong>
                    </span>
                    {item.quantity && (
                      <>
                        <span>•</span>
                        <span>
                          الكمية: <strong className="font-bold text-slate-950">{item.quantity}</strong>
                        </span>
                      </>
                    )}
                  </div>

                  {(item.route || item.instructions || item.route_or_instructions) && (
                    <p className="text-[11px] text-slate-600 mt-1.5 font-medium border-t border-slate-200/60 pt-1">
                      {item.route && <span className="font-bold">طريقة الإعطاء: {item.route} | </span>}
                      <span>طريقة الاستخدام والتعليمات: {item.instructions || item.route_or_instructions}</span>
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* General Instructions */}
          {prescription.general_instructions && (
            <div className="mt-6 p-4 rounded-2xl border border-slate-200 bg-slate-50 text-xs space-y-1 print:bg-transparent">
              <span className="font-black text-slate-900 block">تعليمات وإرشادات الطبيب العامة:</span>
              <p className="text-slate-700 leading-relaxed font-medium">
                {prescription.general_instructions}
              </p>
            </div>
          )}
        </div>

        {/* Footer & Doctor Signature / Stamp Area */}
        <div className="pt-6 border-t-2 border-slate-800 flex items-end justify-between text-xs">
          <div className="space-y-1 text-slate-500 max-w-xs">
            <p className="font-bold text-slate-700">تمنياتنا للطفل بالشفاء العاجل والصحة التامة</p>
            <p className="text-[10px] leading-tight text-slate-400">
              وصفة طبية إلكترونية صادرة ومعتمدة رقمياً من عيادة د. عبد الكريم عليوي.
            </p>
            {prescription.issued_at && (
              <p className="text-[10px] font-mono text-slate-400">
                تاريخ الاعتماد: {new Date(prescription.issued_at).toLocaleString("ar-IQ")}
              </p>
            )}
          </div>

          <div className="text-center min-w-[170px]">
            <div className="h-14 border-b border-dashed border-slate-400 mb-1.5 flex items-center justify-center text-slate-300 text-[11px] font-bold">
              (ختم وتوقيع الطبيب)
            </div>
            <span className="font-black text-slate-900 block text-xs">الدكتور عبد الكريم عليوي</span>
            <span className="text-[10px] text-slate-500 block">بورد طب الأطفال وحديثي الولادة</span>
          </div>
        </div>
      </div>
    </div>
  );
}

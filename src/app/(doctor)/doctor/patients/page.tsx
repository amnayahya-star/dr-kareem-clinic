"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PatientFile } from "@/lib/mock-data/patients";
import { fetchPatients } from "@/services/patientService";
import { calculateArabicAge, normalizeArabicText } from "@/lib/utils";
import { Search, Users, AlertTriangle, Phone, FileText, ArrowLeft, Loader2, ShieldAlert } from "lucide-react";

export default function DoctorPatientsListPage() {
  const [patients, setPatients] = useState<PatientFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPatientsData() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const data = await fetchPatients();
        if (isMounted) {
          setPatients(data || []);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("Error loading doctor patients archive:", err);
          setLoadError(err.message || "فشل تحميل بيانات الأطفال من السيرفر");
          setPatients([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadPatientsData();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredPatients = useMemo(() => {
    if (!searchQuery.trim()) return patients;
    const normalizedQuery = normalizeArabicText(searchQuery);

    return patients.filter((patient) => {
      const matchName = normalizeArabicText(patient.fullName).includes(normalizedQuery);
      const matchFileNumber = patient.fileNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchPhone =
        patient.phone?.includes(searchQuery) ||
        patient.secondaryPhone?.includes(searchQuery);
      const matchGuardian = patient.guardianName
        ? normalizeArabicText(patient.guardianName).includes(normalizedQuery)
        : false;

      return matchName || matchFileNumber || matchPhone || matchGuardian;
    });
  }, [patients, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900">سجل ملفات الأطفال</h2>
          <p className="text-xs text-slate-500 mt-1">
            البحث في السجلات الطبية بالاسم، رقم الملف، أو هاتف ولي الأمر
          </p>
        </div>
      </div>

      {loadError && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs font-bold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Search Bar */}
      <Card className="p-4 bg-white">
        <Input
          placeholder="ابحث باسم الطفل، رقم الملف (مثال: P-1001)، أو رقم هاتف ولي الأمر..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          rightIcon={<Search className="w-5 h-5 text-clinic-600" />}
          className="text-base h-12"
        />
      </Card>

      {/* Patients Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1 font-semibold">
          <span>نتائج البحث: {filteredPatients.length} طفل</span>
        </div>

        {isLoading ? (
          <Card className="text-center py-16 text-slate-500 bg-white">
            <Loader2 className="w-8 h-8 mx-auto text-clinic-600 animate-spin mb-3" />
            <p className="text-sm font-bold text-slate-800">جاري تحميل سجلات الأطفال من قاعدة البيانات...</p>
          </Card>
        ) : filteredPatients.length === 0 ? (
          <Card className="text-center py-12 text-slate-500 bg-white">
            <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="text-base font-bold text-slate-700">لم يتم العثور على أطفال يطابقون البحث</p>
            <p className="text-xs text-slate-400 mt-1">تأكد من كتابة الاسم أو رقم الهاتف بصورة صحيحة</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPatients.map((patient) => {
              const hasAllergies = !!patient.allergies || !!patient.drugAllergies || !!patient.foodAllergies;
              const hasChronic = !!patient.chronicDiseases;

              return (
                <Card
                  key={patient.id}
                  hoverEffect
                  className="border border-slate-200/90 flex flex-col justify-between bg-white"
                >
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-slate-900">{patient.fullName}</h3>
                          <span className="text-xs font-mono font-bold bg-clinic-50 text-clinic-700 px-2 py-0.5 rounded border border-clinic-200">
                            {patient.fileNumber}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          العمر: {calculateArabicAge(patient.dateOfBirth)} ({patient.gender === "male" ? "ذكر" : "أنثى"})
                        </p>
                      </div>

                      {patient.bloodType && (
                        <Badge variant="outline" size="sm">
                          فصيلة: {patient.bloodType}
                        </Badge>
                      )}
                    </div>

                    {/* Allergies / Chronic Warnings */}
                    {(hasAllergies || hasChronic) && (
                      <div className="space-y-1.5 my-3">
                        {hasAllergies && (
                          <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-bold flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span className="truncate">
                              {patient.drugAllergies || patient.allergies || "توجد حساسية مسجلة"}
                            </span>
                          </div>
                        )}
                        {hasChronic && (
                          <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-bold flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span className="truncate">{patient.chronicDiseases}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Guardian Info */}
                    <div className="text-xs text-slate-600 space-y-1 mt-3 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">ولي الأمر:</span>
                        <span className="font-semibold text-slate-800">
                          {patient.guardianName} ({patient.relationship})
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">رقم الهاتف:</span>
                        <span className="font-mono text-slate-700 font-semibold flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {patient.phone}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-end">
                    <Link href={`/doctor/patients/${patient.id}`}>
                      <Button size="sm" variant="outline" className="font-bold gap-1 text-clinic-700 hover:bg-clinic-50">
                        <FileText className="w-4 h-4" />
                        <span>الملف الطبي والتطعيمات</span>
                        <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

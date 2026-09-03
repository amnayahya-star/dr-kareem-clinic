"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { calculateArabicAge } from "@/lib/utils";
import { ArrowRight, UserPlus, Phone, MapPin, AlertTriangle, Heart, User, CheckCircle2 } from "lucide-react";

export default function NewPatientRegistrationPage() {
  const router = useRouter();

  // Child Info State
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [bloodType, setBloodType] = useState("");
  const [allergies, setAllergies] = useState("");
  const [chronicDiseases, setChronicDiseases] = useState("");
  const [pastSurgeries, setPastSurgeries] = useState("");
  const [medicalNotes, setMedicalNotes] = useState("");

  // Guardian Info State
  const [guardianName, setGuardianName] = useState("");
  const [relationship, setRelationship] = useState("الأب");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [secondaryPhone, setSecondaryPhone] = useState("");
  const [address, setAddress] = useState("");

  const [isSuccess, setIsSuccess] = useState(false);
  const [createdFileNumber, setCreatedFileNumber] = useState("");

  const calculatedAge = birthDate ? calculateArabicAge(birthDate) : "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newFileNo = `P-${Math.floor(1000 + Math.random() * 9000)}`;
    setCreatedFileNumber(newFileNo);
    setIsSuccess(true);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/secretary"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة للوحة السكرتير</span>
        </Link>
      </div>

      <div>
        <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <UserPlus className="w-7 h-7 text-clinic-600" />
          <span>تسجيل طفل جديد في العيادة</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          إنشاء ملف طبي وإداري جديد للطفل وتوليد رقم ملف تلقائي
        </p>
      </div>

      {isSuccess ? (
        <Card className="text-center py-12 space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h3 className="text-2xl font-black text-slate-900">تم تسجيل الطفل بنجاح</h3>
          <p className="text-base text-slate-600">
            اسم الطفل: <span className="font-bold text-slate-900">{fullName}</span>
          </p>
          <div className="inline-block bg-clinic-50 border border-clinic-200 text-clinic-800 font-mono text-lg font-black px-4 py-2 rounded-xl">
            رقم الملف: {createdFileNumber}
          </div>

          <div className="flex justify-center gap-3 pt-6">
            <Link href="/secretary/new-visit">
              <Button variant="primary" size="lg" className="font-bold">
                فتح زيارة لهذا الطفل الآن
              </Button>
            </Link>
            <Link href="/secretary">
              <Button variant="outline" size="lg" className="font-bold">
                العودة للوحة الاستقبال
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Child Basic Info */}
          <Card className="space-y-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-clinic-800 flex items-center gap-2">
                <User className="w-5 h-5 text-clinic-600" />
                <span>البيانات الأساسية للطفل</span>
              </CardTitle>
            </CardHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="الاسم الكامل للطفل (ثلاثي أو رباعي)"
                required
                placeholder="مثال: يوسف أحمد عبد الله"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />

              <div>
                <Input
                  label="تاريخ الميلاد"
                  type="date"
                  required
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
                {calculatedAge && (
                  <p className="text-xs text-clinic-700 font-bold mt-1">
                    العمر المحسوب: {calculatedAge}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 text-right">
                <label className="block text-sm font-semibold text-slate-700">الجنس</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setGender("male")}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                      gender === "male"
                        ? "bg-clinic-50 border-clinic-500 text-clinic-800"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    ذكر
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender("female")}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                      gender === "female"
                        ? "bg-rose-50 border-rose-400 text-rose-800"
                        : "border-slate-200 text-slate-600"
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

          {/* Section 2: Critical Medical Alerts */}
          <Card className="space-y-4 border-amber-200/80 bg-amber-50/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span>المعلومات الطبية الحرجة والتنبيهات</span>
              </CardTitle>
            </CardHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="الحساسية (خاصة حساسية الأدوية والبنسلين)"
                placeholder="مثال: حساسية بنسلين، حساسية فول سوداني..."
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
              />

              <Input
                label="الأمراض المزمنة (إن وجدت)"
                placeholder="مثال: ربو أطفال، سكري أطفال، ثلاسيميا..."
                value={chronicDiseases}
                onChange={(e) => setChronicDiseases(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="العمليات الجراحية السابقة"
                placeholder="مثال: استئصال لوزتين (2025)..."
                value={pastSurgeries}
                onChange={(e) => setPastSurgeries(e.target.value)}
              />
              <Input
                label="ملاحظات طبية خاصة"
                placeholder="ولادة قيصرية/مبكرة، الخ..."
                value={medicalNotes}
                onChange={(e) => setMedicalNotes(e.target.value)}
              />
            </div>
          </Card>

          {/* Section 3: Guardian & Contact Info */}
          <Card className="space-y-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-clinic-800 flex items-center gap-2">
                <Phone className="w-5 h-5 text-clinic-600" />
                <span>بيانات ولي الأمر والاتصال</span>
              </CardTitle>
            </CardHeader>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="اسم ولي الأمر"
                required
                placeholder="مثال: أحمد عبد الله"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
              />

              <div className="space-y-1.5 text-right">
                <label className="block text-sm font-semibold text-slate-700">صلة القرابة</label>
                <select
                  className="block w-full rounded-xl border border-slate-200 bg-white text-slate-800 text-sm h-11 px-3 focus:outline-none focus:ring-2 focus:ring-clinic-500"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                >
                  <option value="الأب">الأب</option>
                  <option value="الأم">الأم</option>
                  <option value="الجد / الجدة">الجد / الجدة</option>
                  <option value="العم / الخال">العم / الخال</option>
                  <option value="ولي أمر قانوني">ولي أمر قانوني</option>
                </select>
              </div>

              <Input
                label="رقم الهاتف الأساسي"
                required
                placeholder="0770XXXXXXX"
                value={primaryPhone}
                onChange={(e) => setPrimaryPhone(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="رقم هاتف إضافي (اختياري)"
                placeholder="0780XXXXXXX"
                value={secondaryPhone}
                onChange={(e) => setSecondaryPhone(e.target.value)}
              />

              <Input
                label="العنوان والسكن"
                placeholder="المحافظة - المنطقة - أقرب نقطة دالة"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/secretary">
              <Button type="button" variant="ghost">
                إلغاء
              </Button>
            </Link>
            <Button type="submit" variant="primary" size="lg" className="font-extrabold px-8">
              حفظ وإنشاء ملف الطفل
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

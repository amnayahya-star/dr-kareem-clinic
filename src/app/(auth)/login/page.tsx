"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { Stethoscope, UserCheck, Lock, Phone, ShieldAlert, KeyRound } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState<"doctor" | "secretary">("doctor");
  const [phoneOrUser, setPhoneOrUser] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await login(selectedRole, phoneOrUser, password);

      if (selectedRole === "doctor") {
        router.replace("/doctor");
      } else {
        router.replace("/secretary");
      }
    } catch (err: any) {
      setError(err.message || "اسم المستخدم أو كلمة المرور غير صحيحة");
      setIsLoading(false);
    }
  };

  return (
    <Card className="shadow-xl border-slate-200/90 p-6 sm:p-8">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-slate-900">
          {language === "ar" ? "تسجيل الدخول المحمي للعيادة" : "Secure Clinic Login"}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          {language === "ar"
            ? "أدخل رقم الهاتف وكلمة المرور المعتمدة للدخول"
            : "Enter authorized phone number and password"}
        </p>
      </div>

      {error && (
        <Alert variant="danger" className="mb-4 text-xs font-bold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </Alert>
      )}

      {/* Role Switcher */}
      <div className="grid grid-cols-2 gap-3 mb-5 p-1.5 bg-slate-100/80 rounded-2xl">
        <button
          type="button"
          onClick={() => {
            setSelectedRole("doctor");
            setError(null);
            setPhoneOrUser("");
            setPassword("");
          }}
          className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-black transition-all ${
            selectedRole === "doctor"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Stethoscope className="w-4 h-4 text-clinic-400" />
          <span>{language === "ar" ? "حساب الطبيب" : "Doctor Account"}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedRole("secretary");
            setError(null);
            setPhoneOrUser("");
            setPassword("");
          }}
          className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-black transition-all ${
            selectedRole === "secretary"
              ? "bg-teal-700 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <UserCheck className="w-4 h-4 text-teal-300" />
          <span>{language === "ar" ? "حساب السكرتير" : "Receptionist Account"}</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={language === "ar" ? "رقم هاتف الحساب (اليوزر)" : "Account Phone Number"}
          type="text"
          required
          placeholder={
            selectedRole === "doctor" ? "07801021470 أو +964 780 102 1470" : "07719215504 أو +964 771 921 5504"
          }
          value={phoneOrUser}
          onChange={(e) => setPhoneOrUser(e.target.value)}
          rightIcon={<Phone className="w-4 h-4" />}
        />

        <Input
          label={language === "ar" ? "كلمة المرور (الباسورد)" : "Password"}
          type="password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          rightIcon={<Lock className="w-4 h-4" />}
        />

        <div className="flex items-center justify-between text-xs pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-slate-600 select-none">
            <input
              type="checkbox"
              defaultChecked
              className="rounded border-slate-300 text-clinic-600 focus:ring-clinic-500"
            />
            <span>{language === "ar" ? "تذكرني على هذا الجهاز" : "Remember me"}</span>
          </label>
        </div>

        <Button
          type="submit"
          className="w-full mt-2 font-black h-12 text-base"
          size="lg"
          isLoading={isLoading}
        >
          {selectedRole === "doctor"
            ? language === "ar"
              ? "التحقق والدخول لشاشة الطبيب"
              : "Verify & Enter Doctor Portal"
            : language === "ar"
            ? "التحقق والدخول لشاشة الاستقبال"
            : "Verify & Enter Reception Portal"}
        </Button>
      </form>

      {/* Official Credentials Hint Box */}
      <div className="mt-5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1.5">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <KeyRound className="w-3.5 h-3.5 text-clinic-600" />
          <span>{language === "ar" ? "بيانات الدخول الرسمية المعتمدة:" : "Official Clinic Credentials:"}</span>
        </div>
        <div className="space-y-1 font-medium">
          <p>
            🩺 <strong>{language === "ar" ? "حساب الطبيب:" : "Doctor:"}</strong>{" "}
            <span className="font-mono text-slate-900 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">07801021470</span>
            {" | "}
            <span>{language === "ar" ? "الباسورد:" : "Pass:"}</span>{" "}
            <span className="font-mono text-slate-900 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">dr.Kareem@97al</span>
          </p>
          <p>
            👤 <strong>{language === "ar" ? "حساب السكرتير:" : "Secretary:"}</strong>{" "}
            <span className="font-mono text-slate-900 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">07719215504</span>
            {" | "}
            <span>{language === "ar" ? "الباسورد:" : "Pass:"}</span>{" "}
            <span className="font-mono text-slate-900 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">Husain@97al</span>
          </p>
        </div>
      </div>
    </Card>
  );
}

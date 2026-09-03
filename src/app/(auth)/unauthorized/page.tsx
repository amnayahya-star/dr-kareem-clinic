"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { ShieldAlert, ArrowRight, ArrowLeft, LogOut } from "lucide-react";

export default function UnauthorizedPage() {
  const { language, isRTL } = useLanguage();
  const { user, logout } = useAuth();

  const userPortalPath = user?.role === "doctor" ? "/doctor" : user?.role === "secretary" ? "/secretary" : "/login";

  return (
    <Card className="shadow-xl border-slate-200/90 p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 mx-auto flex items-center justify-center mb-4">
        <ShieldAlert className="w-8 h-8" />
      </div>

      <h2 className="text-xl font-black text-slate-900 mb-2">
        {language === "ar" ? "غير مصرح لك بالدخول لهذه الشاشة" : "Access Restricted"}
      </h2>
      <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed mb-6">
        {language === "ar"
          ? "هذه الشاشة مخصصة لدور محدد في النظام. لا يمكن للسكرتير الدخول لشاشات الطبيب، ولا يمكن للطبيب الدخول لشاشات السكرتير حفاظاً على خصوصية ودقة العمليات."
          : "This portal is restricted to authorized personnel only. Receptionists cannot access Doctor tools, and Doctors cannot access Reception tools."}
      </p>

      <div className="space-y-2.5">
        {user ? (
          <Link href={userPortalPath} className="block">
            <Button variant="primary" className="w-full font-bold">
              {user.role === "doctor"
                ? language === "ar" ? "العودة لشاشة الطبيب المخصصة لك" : "Return to Doctor Portal"
                : language === "ar" ? "العودة لشاشة الاستقبال المخصصة لك" : "Return to Reception Portal"}
            </Button>
          </Link>
        ) : (
          <Link href="/login" className="block">
            <Button variant="primary" className="w-full font-bold">
              {language === "ar" ? "تسجيل الدخول" : "Login"}
            </Button>
          </Link>
        )}

        <button
          onClick={logout}
          type="button"
          className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors border border-slate-200"
        >
          {language === "ar" ? "تسجيل الخروج والتبديل لحساب آخر" : "Logout and switch account"}
        </button>
      </div>
    </Card>
  );
}

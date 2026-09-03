"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { Languages } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { language, toggleLanguage, t, isRTL } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-clinic-50/40 to-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 relative">
      {/* Top Language Toggle */}
      <div className="absolute top-4 sm:top-6 right-4 sm:right-6">
        <button
          onClick={toggleLanguage}
          type="button"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-white hover:bg-clinic-50 text-slate-700 hover:text-clinic-700 border border-slate-200 transition-all shadow-xs"
          title={language === "ar" ? "Switch to English" : "التحويل للغة العربية"}
        >
          <Languages className="w-4 h-4 text-clinic-600" />
          <span>{language === "ar" ? "English" : "عربي"}</span>
        </button>
      </div>

      <div className="w-full max-w-md">
        {/* Logo & Doctor Portrait Header */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-3.5 group">
            <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-clinic-500 shadow-md bg-slate-800 shrink-0">
              <img
                src="/dr-kareem.jpg"
                alt="الدكتور عبد الكريم عليوي"
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform"
              />
            </div>
            <div className={isRTL ? "text-right" : "text-left"}>
              <h1 className="text-lg font-black text-slate-900 leading-tight">
                {t("clinicName")}
              </h1>
              <p className="text-xs text-clinic-700 font-bold mt-0.5">
                {t("boardCert")}
              </p>
              <p className="text-[10px] text-slate-500 font-semibold">
                {t("royalCollegeFellow")}
              </p>
            </div>
          </Link>
        </div>

        {/* Auth Content Card */}
        {children}

        {/* Footer */}
        <div className="text-center mt-6 text-xs text-slate-500 space-y-1">
          <div>
            {language === "ar"
              ? `جميع الحقوق محفوظة © ${new Date().getFullYear()} عيادة الدكتور عبد الكريم عليوي`
              : `All Rights Reserved © ${new Date().getFullYear()} Dr. Kareem Clinic`}
          </div>
          <div className="text-[11px] font-extrabold text-clinic-700">
            {language === "ar"
              ? "تم التصميم والتطوير بواسطة فريق Trimindesai"
              : "Designed & Developed by Trimindesai Team"}
          </div>
        </div>
      </div>
    </div>
  );
}

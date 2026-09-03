"use client";

import React from "react";
import Link from "next/link";
import { UserRole } from "@/types/database";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { Stethoscope, UserCheck, LogOut, Languages } from "lucide-react";

interface HeaderProps {
  role?: UserRole;
  userName?: string;
}

export const Header: React.FC<HeaderProps> = ({
  role = "doctor",
}) => {
  const { language, toggleLanguage, t } = useLanguage();
  const { user, logout } = useAuth();

  const currentRole = user?.role || role;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-6 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        {/* Brand & Doctor Credentials */}
        <Link href={currentRole === "doctor" ? "/doctor" : "/secretary"} className="flex items-center gap-2.5 sm:gap-3 group min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl overflow-hidden border-2 border-clinic-500 shadow-sm shrink-0 bg-slate-100">
            <img
              src="/dr-kareem.jpg"
              alt="الدكتور عبد الكريم عليوي"
              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-base font-black text-slate-900 tracking-tight truncate">
              {t("clinicName")}
            </h1>
            <p className="text-[10px] sm:text-[11px] text-clinic-700 font-bold leading-tight truncate">
              {t("doctorCredentials")}
            </p>
          </div>
        </Link>

        {/* User Identity, Language Switcher & Secure Logout */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Current Logged In Account Badge */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800">
            {currentRole === "doctor" ? (
              <>
                <Stethoscope className="w-4 h-4 text-clinic-600" />
                <span>{language === "ar" ? "حساب الطبيب (د. عبد الكريم)" : "Doctor Account"}</span>
              </>
            ) : (
              <>
                <UserCheck className="w-4 h-4 text-teal-600" />
                <span>{language === "ar" ? "حساب الاستقبال (السكرتير)" : "Receptionist Account"}</span>
              </>
            )}
          </div>

          {/* Language Switcher Button (🌐 عربي / English) */}
          <button
            onClick={toggleLanguage}
            type="button"
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black bg-slate-100 hover:bg-clinic-50 text-slate-700 hover:text-clinic-700 border border-slate-200 transition-all shadow-xs"
            title={language === "ar" ? "Switch to English" : "التحويل للغة العربية"}
          >
            <Languages className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-clinic-600" />
            <span className="text-xs">{language === "ar" ? "English" : "عربي"}</span>
          </button>

          {/* Secure Logout Button */}
          <button
            onClick={logout}
            type="button"
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors shadow-xs"
            title={t("logout")}
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">{t("logout")}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

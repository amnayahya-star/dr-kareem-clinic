"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { Sparkles, ShieldCheck } from "lucide-react";

export const Footer: React.FC = () => {
  const { language } = useLanguage();

  return (
    <footer className="w-full py-4 px-4 border-t border-slate-200/60 bg-white/50 backdrop-blur-xs text-center text-xs text-slate-500 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-600">
          <ShieldCheck className="w-4 h-4 text-clinic-600" />
          <span>
            {language === "ar"
              ? `جميع الحقوق محفوظة © ${new Date().getFullYear()} عيادة الدكتور عبد الكريم عليوي`
              : `All Rights Reserved © ${new Date().getFullYear()} Dr. Kareem Clinic`}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200 shadow-2xs">
          <Sparkles className="w-3.5 h-3.5 text-clinic-600" />
          <span>
            {language === "ar"
              ? "تم التصميم والتطوير بواسطة فريق Trimindesai"
              : "Designed & Developed by Trimindesai Team"}
          </span>
        </div>
      </div>
    </footer>
  );
};

"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";

export const Footer: React.FC = () => {
  const { language } = useLanguage();

  return (
    <footer className="w-full py-4 px-4 border-t border-slate-200/60 bg-white/50 backdrop-blur-xs text-center text-xs text-slate-500 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="font-bold text-slate-600">
          {language === "ar"
            ? `جميع الحقوق محفوظة © ${new Date().getFullYear()} عيادة الدكتور عبد الكريم عليوي`
            : `All Rights Reserved © ${new Date().getFullYear()} Dr. Kareem Clinic`}
        </div>

        <div className="text-[11px] font-bold text-slate-500">
          {language === "ar"
            ? "تصميم وتطوير: فريق Trimindesai"
            : "Designed & Developed by Trimindesai Team"}
        </div>
      </div>
    </footer>
  );
};

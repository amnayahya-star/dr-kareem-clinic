"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";

export const Footer: React.FC = () => {
  const { language } = useLanguage();

  return (
    <footer className="w-full py-4 px-4 border-t border-slate-200/60 bg-white/60 backdrop-blur-xs text-center text-xs mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="font-black text-slate-800 text-xs sm:text-sm">
          {language === "ar"
            ? "تصميم وتطوير: فريق Trimindesai"
            : "Designed & Developed by: Trimindesai Team"}
        </div>

        <div className="text-xs font-bold text-slate-600">
          {language === "ar"
            ? "جميع الحقوق محفوظة لفريق Trimindesai © 2026"
            : "All Rights Reserved to Trimindesai Team © 2026"}
        </div>
      </div>
    </footer>
  );
};

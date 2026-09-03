"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRole } from "@/types/database";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { Bell, Calendar, ChevronLeft, ShieldCheck } from "lucide-react";
import { formatArabicDate } from "@/lib/utils";

interface HeaderProps {
  role?: UserRole;
  userName?: string;
}

export const Header: React.FC<HeaderProps> = ({ role = "doctor" }) => {
  const pathname = usePathname();
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();

  const currentRole = user?.role || role;

  // Compute Breadcrumb
  const getBreadcrumb = () => {
    if (currentRole === "doctor") {
      if (pathname.includes("/patients")) return "شاشة الطبيب / أرشيف الأطفال";
      if (pathname.includes("/examination")) return "شاشة الطبيب / الكشف السريري والتشخيص";
      if (pathname.includes("/audit-logs")) return "شاشة الطبيب / سجل العمليات";
      return "الطبيب / لوحة الكشف والمتابعة";
    } else {
      if (pathname.includes("/new-patient")) return "الاستقبال / تسجيل طفل جديد";
      if (pathname.includes("/new-visit")) return "الاستقبال / فتح زيارة وقياسات";
      if (pathname.includes("/recycle-bin")) return "الاستقبال / سلة المحذوفات (3 أشهر)";
      return "الاستقبال / لوحة التحكم";
    }
  };

  const todayDateString = formatArabicDate(new Date());

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#E5EBF0] px-4 sm:px-8 py-3.5 flex items-center justify-between">
      {/* Right Side: Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs font-bold text-[#697A8D]">
        <span className="hover:text-[#0A1E33] transition-colors">{getBreadcrumb()}</span>
      </div>

      {/* Left Side: Live Date & Notifications */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Date Display */}
        <div className="flex items-center gap-1.5 text-xs font-bold text-[#0A1E33] bg-[#F4F7F9] px-3 py-1.5 rounded-xl border border-[#E5EBF0]">
          <Calendar className="w-3.5 h-3.5 text-[#147D7A]" />
          <span>{todayDateString}</span>
        </div>

        {/* Live Notification Indicator */}
        <div className="relative p-2 rounded-xl bg-[#F4F7F9] hover:bg-[#E5EBF0] text-[#0A1E33] transition-colors cursor-pointer border border-[#E5EBF0]">
          <Bell className="w-4 h-4 text-[#147D7A]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#0C9A96] animate-pulse" />
        </div>
      </div>
    </header>
  );
};

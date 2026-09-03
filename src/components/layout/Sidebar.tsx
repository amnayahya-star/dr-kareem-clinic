"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/database";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard,
  UserPlus,
  FilePlus2,
  Users,
  Stethoscope,
  ClipboardList,
  Trash2,
  LogOut,
  Globe,
  UserCircle,
} from "lucide-react";

interface SidebarProps {
  role: UserRole;
}

export const Sidebar: React.FC<SidebarProps> = ({ role }) => {
  const pathname = usePathname();
  const { language, toggleLanguage, t, isRTL } = useLanguage();
  const { user, logout } = useAuth();

  const doctorLinks = [
    { href: "/doctor", label: "لوحة الكشف السريري", icon: Stethoscope },
    { href: "/doctor/patients", label: "أرشيف ملفات الأطفال", icon: Users },
    { href: "/doctor/audit-logs", label: "سجل العمليات", icon: ClipboardList },
  ];

  const secretaryLinks = [
    { href: "/secretary", label: "لوحة الاستقبال", icon: LayoutDashboard },
    { href: "/secretary/new-patient", label: "إضافة طفل جديد", icon: UserPlus },
    { href: "/secretary/new-visit", label: "فتح زيارة", icon: FilePlus2 },
    { href: "/secretary", label: "قائمة المرضى", icon: Users },
    { href: "/secretary/recycle-bin", label: "سلة المهملات (3 أشهر)", icon: Trash2 },
  ];

  const links = role === "doctor" ? doctorLinks : secretaryLinks;

  return (
    <aside
      className={cn(
        "w-64 bg-[#061524] text-white min-h-[calc(100vh-65px)] p-4 flex flex-col justify-between hidden lg:flex shrink-0 select-none shadow-xl border-slate-800",
        isRTL ? "border-l" : "border-r"
      )}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="space-y-6">
        {/* Clinic Brand & Logo */}
        <div className="flex items-center gap-3 pt-2 pb-2">
          <div className="shrink-0">
            <svg
              width="42"
              height="42"
              viewBox="0 0 48 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M24 3.5L42.5 13.8V34.2L24 44.5L5.5 34.2V13.8L24 3.5Z"
                stroke="#FFFFFF"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M5.5 24H15.5L19.5 14.5L24.5 34.5L29.5 18L33.5 24H42.5"
                stroke="#0C9A96"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black text-white leading-tight truncate">
              عيادة د. عبد الكريم عليوي
            </h1>
            <p className="text-[10px] font-bold text-[#0C9A96] mt-0.5 truncate">
              بورد طب الأطفال وحديثي الولادة
            </p>
          </div>
        </div>

        {/* User Account Badge */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-[#0B2138] border border-[#13304E] text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <UserCircle className="w-6 h-6 text-[#0C9A96] shrink-0" />
            <div className="min-w-0">
              <span className="font-extrabold text-white text-xs block truncate">
                {role === "doctor" ? "د. عبد الكريم عليوي" : "حساب الاستقبال"}
              </span>
              <span className="text-[10px] text-[#8DA4B8] block">
                {role === "doctor" ? "طبيب أطفال متخصص" : "سكرتارية العيادة"}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="space-y-1.5 pt-1">
          {links.map((item, idx) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href === "/secretary" && idx === 0 && pathname === "/secretary");

            return (
              <Link
                key={`${item.href}-${idx}`}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all duration-150",
                  isActive
                    ? "bg-[#0C7A77] text-white shadow-sm font-black"
                    : "text-[#94A9BE] hover:bg-[#0B2138] hover:text-white"
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 transition-colors shrink-0",
                    isActive ? "text-white" : "text-[#8DA4B8]"
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer: Language Switcher & Logout */}
      <div className="pt-4 border-t border-[#13304E] space-y-2 text-xs font-bold">
        {/* Language Switch */}
        <button
          type="button"
          onClick={toggleLanguage}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[#94A9BE] hover:bg-[#0B2138] hover:text-white transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Globe className="w-4 h-4 text-[#0C9A96]" />
            <span>{language === "ar" ? "English" : "اللغة العربية"}</span>
          </div>
          <span className="text-[10px] font-mono uppercase bg-[#13304E] px-1.5 py-0.5 rounded text-[#8DA4B8]">
            {language === "ar" ? "EN" : "AR"}
          </span>
        </button>

        {/* Logout Button */}
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4 text-rose-500" />
          <span>تسجيل الخروج</span>
        </button>

        {/* Trimindesai Credits */}
        <div className="pt-2 text-center text-[9px] text-[#697A8D] font-medium">
          Design by <span className="text-[#0C9A96] font-bold">Trimindesai</span>
        </div>
      </div>
    </aside>
  );
};

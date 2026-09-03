"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/database";
import { useLanguage } from "@/context/LanguageContext";
import {
  Users,
  UserPlus,
  Clock,
  FilePlus2,
  Stethoscope,
  ClipboardList,
} from "lucide-react";

interface SidebarProps {
  role: UserRole;
}

export const Sidebar: React.FC<SidebarProps> = ({ role }) => {
  const pathname = usePathname();
  const { t, isRTL } = useLanguage();

  const doctorLinks = [
    { href: "/doctor", label: t("navDoctorWorkstation"), icon: Stethoscope },
    { href: "/doctor/patients", label: t("navChildrenArchive"), icon: Users },
    { href: "/doctor/audit-logs", label: t("navAuditLogs"), icon: ClipboardList },
  ];

  const secretaryLinks = [
    { href: "/secretary", label: t("navReceptionBoard"), icon: Clock },
    { href: "/secretary/new-patient", label: t("navAddNewChild"), icon: UserPlus },
    { href: "/secretary/new-visit", label: t("navNewVisitVitals"), icon: FilePlus2 },
  ];

  const links = role === "doctor" ? doctorLinks : secretaryLinks;

  return (
    <aside className={cn(
      "w-56 bg-white min-h-[calc(100vh-57px)] p-3.5 flex flex-col justify-between hidden lg:flex border-slate-200/70",
      isRTL ? "border-l" : "border-r"
    )}>
      <div className="space-y-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3">
          {role === "doctor" ? t("sidebarMedicalMenu") : t("sidebarReceptionMenu")}
        </p>
        <nav className="space-y-1">
          {links.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-150",
                  isActive
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 transition-colors",
                    isActive ? "text-clinic-400" : "text-slate-400"
                  )}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[10px] text-slate-400 text-center leading-relaxed">
        {t("sidebarFooterTitle")}
        <br />
        <span className="font-bold text-slate-700">{t("sidebarFooterSubtitle")}</span>
      </div>
    </aside>
  );
};

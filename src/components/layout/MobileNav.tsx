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

interface MobileNavProps {
  role: UserRole;
}

export const MobileNav: React.FC<MobileNavProps> = ({ role }) => {
  const pathname = usePathname();
  const { t } = useLanguage();

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
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 px-3 py-2 pb-safe shadow-lg">
      <nav className="flex items-center justify-around max-w-md mx-auto">
        {links.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl text-[11px] font-bold transition-all",
                isActive
                  ? "text-clinic-600 bg-clinic-50 font-black"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <Icon
                className={cn(
                  "w-5 h-5 transition-colors",
                  isActive ? "text-clinic-600" : "text-slate-400"
                )}
              />
              <span className="truncate max-w-[80px]">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

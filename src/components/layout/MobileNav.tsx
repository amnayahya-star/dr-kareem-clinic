"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/database";
import { useLanguage } from "@/context/LanguageContext";
import {
  LayoutDashboard,
  UserPlus,
  FilePlus2,
  Users,
  Stethoscope,
  ClipboardList,
  Trash2,
} from "lucide-react";

interface MobileNavProps {
  role: UserRole;
}

export const MobileNav: React.FC<MobileNavProps> = ({ role }) => {
  const pathname = usePathname();
  const { t } = useLanguage();

  const doctorLinks = [
    { href: "/doctor", label: "الكشف", icon: Stethoscope },
    { href: "/doctor/patients", label: "الأطفال", icon: Users },
    { href: "/doctor/audit-logs", label: "العمليات", icon: ClipboardList },
  ];

  const secretaryLinks = [
    { href: "/secretary", label: "الاستقبال", icon: LayoutDashboard },
    { href: "/secretary/new-patient", label: "طفل جديد", icon: UserPlus },
    { href: "/secretary/new-visit", label: "فتح زيارة", icon: FilePlus2 },
    { href: "/secretary/recycle-bin", label: "المحذوفات", icon: Trash2 },
  ];

  const links = role === "doctor" ? doctorLinks : secretaryLinks;

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#061524]/95 backdrop-blur-lg border-t border-slate-800 px-3 py-2 pb-safe shadow-2xl">
      <nav className="flex items-center justify-around max-w-md mx-auto">
        {links.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all",
                isActive
                  ? "text-[#0C9A96] bg-[#0B2138] font-black"
                  : "text-[#8DA4B8] hover:text-white"
              )}
            >
              <Icon
                className={cn(
                  "w-5 h-5 transition-colors",
                  isActive ? "text-[#0C9A96]" : "text-[#8DA4B8]"
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

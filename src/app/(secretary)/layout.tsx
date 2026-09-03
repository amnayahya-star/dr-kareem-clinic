import React from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function SecretaryLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRole="secretary">
      <div className="min-h-screen bg-slate-50 flex flex-col pb-16 lg:pb-0">
        <Header role="secretary" userName="موظف الاستقبال والسكرتارية" />
        <div className="flex-1 flex">
          <Sidebar role="secretary" />
          <main className="flex-1 p-3.5 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
            {children}
          </main>
        </div>
        <MobileNav role="secretary" />
      </div>
    </RoleGuard>
  );
}

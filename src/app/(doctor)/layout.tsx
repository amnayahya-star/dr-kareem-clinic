import React from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Footer } from "@/components/layout/Footer";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRole="doctor">
      <div className="min-h-screen bg-slate-50 flex flex-col pb-16 lg:pb-0">
        <Header role="doctor" userName="د. عبد الكريم عليوي" />
        <div className="flex-1 flex">
          <Sidebar role="doctor" />
          <main className="flex-1 p-3.5 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
            {children}
          </main>
        </div>
        <Footer />
        <MobileNav role="doctor" />
      </div>
    </RoleGuard>
  );
}

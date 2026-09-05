"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types/database";

interface RoleGuardProps {
  allowedRole: UserRole;
  children: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ allowedRole, children }) => {
  const router = useRouter();
  const { user, role, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }

    if (role !== allowedRole) {
      router.replace("/unauthorized");
      return;
    }
  }, [user, role, isAuthenticated, isLoading, allowedRole, router]);

  if (isLoading || !isAuthenticated || role !== allowedRole) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 space-y-4">
        <div className="w-12 h-12 border-4 border-clinic-600 border-t-transparent rounded-full animate-spin" />
        <div className="text-center space-y-1">
          <p className="text-sm font-black text-slate-800">جاري التحقق من صلاحيات الحساب والتحويل...</p>
          <p className="text-xs text-slate-400">Verifying security permissions...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

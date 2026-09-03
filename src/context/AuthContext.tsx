"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserRole } from "@/types/database";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (role: UserRole, email?: string, password?: string) => Promise<boolean>;
  logout: () => void;
}

// دالة لتنظيف وتوحيد أرقام الهواتف وأسماء المستخدمين للمقارنة السليمة
function normalizeLoginInput(input: string): string {
  return input
    .replace(/\s+/g, "") // حذف المسافات
    .replace(/-/g, "") // حذف الشارطات
    .toLowerCase();
}

// بيانات الاعتماد الرسمية والمحمية الخاصة بعيادة د. عبد الكريم عليوي
export const CLINIC_CREDENTIALS = {
  doctor: {
    validUsernames: [
      "+964 780 102 1470",
      "+9647801021470",
      "07801021470",
      "7801021470",
      "doctor",
      "doctor@dr-kareem.com",
    ],
    validPasswords: ["dr.Kareem@97al", "drkareem2026", "KareemDoctor2026!"],
    name: "د. عبد الكريم عليوي",
    role: "doctor" as UserRole,
  },
  secretary: {
    validUsernames: [
      "+964 771 921 5504",
      "+9647719215504",
      "07719215504",
      "7719215504",
      "secretary",
      "secretary@dr-kareem.com",
    ],
    validPasswords: ["Husain@97al", "sec2026", "Secretary2026!"],
    name: "موظف الاستقبال والسكرتارية",
    role: "secretary" as UserRole,
  },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize session from localStorage
  useEffect(() => {
    try {
      const savedUserStr = typeof window !== "undefined" ? localStorage.getItem("dr_kareem_user") : null;
      if (savedUserStr) {
        const savedUser = JSON.parse(savedUserStr);
        setUser(savedUser);
      }
    } catch (e) {
      console.error("Error reading saved user session:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Strict Login Function
  const login = async (selectedRole: UserRole, inputEmail?: string, inputPassword?: string): Promise<boolean> => {
    const rawUser = (inputEmail || "").trim();
    const rawPass = (inputPassword || "").trim();

    if (!rawUser || !rawPass) {
      throw new Error("يرجى إدخال رقم الهاتف / اسم المستخدم وكلمة المرور");
    }

    const normalizedUser = normalizeLoginInput(rawUser);
    const creds = CLINIC_CREDENTIALS[selectedRole];

    const isUsernameValid = creds.validUsernames.some(
      (u) => normalizeLoginInput(u) === normalizedUser
    );
    const isPasswordValid = creds.validPasswords.includes(rawPass);

    if (!isUsernameValid || !isPasswordValid) {
      throw new Error(
        selectedRole === "doctor"
          ? "بيانات حساب الطبيب غير صحيحة! يرجى إدخال رقم هاتف الطبيب وكلمة المرور المعتمدة."
          : "بيانات حساب السكرتير غير صحيحة! يرجى إدخال رقم هاتف السكرتير وكلمة المرور المعتمدة."
      );
    }

    const newUser: AuthUser = {
      id: selectedRole === "doctor" ? "doc-001" : "sec-001",
      email: rawUser,
      name: creds.name,
      role: selectedRole,
    };

    setUser(newUser);
    if (typeof window !== "undefined") {
      localStorage.setItem("dr_kareem_user", JSON.stringify(newUser));
      document.cookie = `dr_kareem_role=${newUser.role}; path=/; max-age=86400; SameSite=Lax`;
    }

    return true;
  };

  const logout = () => {
    setUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("dr_kareem_user");
      document.cookie = "dr_kareem_role=; path=/; max-age=0";
    }
    router.push("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

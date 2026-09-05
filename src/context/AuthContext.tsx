"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { UserRole } from "@/types/database";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  AuthUser,
  authenticateUser,
  fetchAndVerifyProfile,
  getCurrentSessionUser,
  signOutUser,
} from "@/services/authService";

export type { AuthUser };

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  login: (selectedRole: UserRole, email?: string, password?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // تحديث واستعادة الجلسة الحالية
  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    setAuthError(null);

    try {
      const verifiedUser = await getCurrentSessionUser();
      setUser(verifiedUser);
    } catch (err: any) {
      console.warn("Session verification warning:", err.message);
      setAuthError(err.message || "تعذر التحقق من الجلسة");
      setUser(null);
      await signOutUser().catch(() => {});
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();

    if (!isSupabaseConfigured()) return;

    const supabase = createClient();
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        try {
          const verifiedUser = await fetchAndVerifyProfile(
            supabase,
            session.user.id,
            session.user.email || ""
          );
          setUser(verifiedUser);
        } catch (err: any) {
          console.error("Auth state change verification failed:", err.message);
          setAuthError(err.message || "فشل التحقق من الحساب");
          setUser(null);
          await signOutUser(supabase).catch(() => {});
        } finally {
          setIsLoading(false);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshSession]);

  // تسجيل الدخول عبر خدمة المصادقة
  const login = async (
    selectedRole: UserRole,
    inputEmail?: string,
    inputPassword?: string
  ): Promise<boolean> => {
    setAuthError(null);
    const email = (inputEmail || "").trim();
    const password = inputPassword || "";

    if (!email || password.length === 0) {
      throw new Error("يرجى إدخال البريد الإلكتروني وكلمة المرور");
    }

    const verifiedUser = await authenticateUser(
      null,
      selectedRole,
      email,
      password
    );

    setUser(verifiedUser);
    return true;
  };

  // تسجيل الخروج
  const logout = async () => {
    try {
      await signOutUser();
    } catch (e) {
      console.error("Error during signOut:", e);
    } finally {
      setUser(null);
      setAuthError(null);
      if (typeof window !== "undefined") {
        document.cookie = "dr_kareem_role=; path=/; max-age=0";
      }
      router.push("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        isAuthenticated: !!user,
        isLoading,
        authError,
        login,
        logout,
        refreshSession,
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

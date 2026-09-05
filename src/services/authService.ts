import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { UserRole } from "@/types/database";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

/**
 * دالة التحقق وتطهير مسار التوجيه بعد تسجيل الدخول
 * تمنع هجمات Open Redirect وتضمن تطابق المسار مع دور المستخدم
 */
export function getSafeRedirectPath(
  redirectTo: string | null | undefined,
  role: UserRole
): string {
  const defaultPath = role === "doctor" ? "/doctor" : "/secretary";

  if (!redirectTo || typeof redirectTo !== "string") {
    return defaultPath;
  }

  const trimmed = redirectTo.trim();

  // منع الروابط الخارجية أو الروابط التي تبدأ بـ // أو تحتوي على بروتوكول
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.includes("://") ||
    trimmed.startsWith("javascript:")
  ) {
    return defaultPath;
  }

  // السماح فقط بالمسارات التابعة للدور المصرح به
  if (role === "doctor") {
    if (trimmed === "/doctor" || trimmed.startsWith("/doctor/")) {
      return trimmed;
    }
    return "/doctor";
  }

  if (role === "secretary") {
    if (trimmed === "/secretary" || trimmed.startsWith("/secretary/")) {
      return trimmed;
    }
    return "/secretary";
  }

  return defaultPath;
}

/**
 * جلب والتحقق من ملف المستخدم الصادر من جدول profiles حصراً
 */
export async function fetchAndVerifyProfile(
  supabaseClient: any,
  userId: string,
  userEmail: string
): Promise<AuthUser> {
  const client = supabaseClient || createClient();
  if (!client) {
    throw new Error("تعذر الاتصال بخدمة المصادقة");
  }

  const { data: profile, error } = await client
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user profile:", error.message);
    throw new Error("تعذر جلب ملف تعريف المستخدم");
  }

  if (!profile) {
    throw new Error("لم يتم العثور على ملف تعريف مرتبط بهذا الحساب");
  }

  if (!profile.is_active) {
    throw new Error("هذا الحساب معطل، يرجى مراجعة إدارة النظام");
  }

  if (profile.role !== "doctor" && profile.role !== "secretary") {
    throw new Error("الدور المحدد للحساب غير صالح");
  }

  return {
    id: profile.id,
    email: userEmail,
    name:
      profile.full_name ||
      (profile.role === "doctor" ? "د. عبد الكريم عليوي" : "موظف الاستقبال"),
    role: profile.role as UserRole,
  };
}

/**
 * تسجيل الدخول والتحقق الأمني الشامل
 * لا يُجرى أي trim على كلمة المرور إطلاقاً
 */
export async function authenticateUser(
  supabaseClient: any,
  selectedRole: UserRole,
  inputEmail?: string,
  inputPassword?: string
): Promise<AuthUser> {
  const email = (inputEmail || "").trim();
  const password = inputPassword || "";

  if (!email || password.length === 0) {
    throw new Error("يرجى إدخال البريد الإلكتروني وكلمة المرور");
  }

  const client = supabaseClient || createClient();
  if (!client) {
    throw new Error("خدمة الاتصال بقاعدة البيانات غير متوفرة");
  }

  const { data: authData, error: authError } =
    await client.auth.signInWithPassword({
      email,
      password,
    });

  if (authError || !authData?.user) {
    throw new Error("تعذر تسجيل الدخول. تحقق من بيانات الحساب.");
  }

  try {
    const verifiedUser = await fetchAndVerifyProfile(
      client,
      authData.user.id,
      authData.user.email || email
    );

    if (verifiedUser.role !== selectedRole) {
      await client.auth.signOut();
      throw new Error(
        "تعذر تسجيل الدخول. نوع الحساب المحدد لا يتطابق مع صلاحيات هذا المستخدم."
      );
    }

    return verifiedUser;
  } catch (err: any) {
    try {
      await client.auth.signOut();
    } catch (_) {}
    throw err;
  }
}

/**
 * جلب المستخدم المصادق عليه للجلسة الحالية
 */
export async function getCurrentSessionUser(
  supabaseClient?: any
): Promise<AuthUser | null> {
  if (!supabaseClient && !isSupabaseConfigured()) {
    return null;
  }

  const client = supabaseClient || createClient();
  if (!client) return null;

  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError || !session?.user) {
    return null;
  }

  return await fetchAndVerifyProfile(
    client,
    session.user.id,
    session.user.email || ""
  );
}

/**
 * تسجيل الخروج
 */
export async function signOutUser(supabaseClient?: any): Promise<void> {
  const client = supabaseClient || createClient();
  if (client) {
    await client.auth.signOut();
  }
}

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { DosageForm, VisitStatus, AttachmentType } from "@/types/database";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * دالة لحساب عمر الطفل بدقة باللغة العربية (سنوات، أشهر، أيام)
 */
export function calculateArabicAge(birthDateString: string): string {
  if (!birthDateString) return "";
  
  const birthDate = new Date(birthDateString);
  const today = new Date();
  
  if (isNaN(birthDate.getTime()) || birthDate.getTime() > today.getTime()) return "";

  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  let days = today.getDate() - birthDate.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    days += prevMonth.getDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts: string[] = [];

  if (years > 0) {
    if (years === 1) parts.push("سنة واحدة");
    else if (years === 2) parts.push("سنتان");
    else if (years >= 3 && years <= 10) parts.push(`${years} سنوات`);
    else parts.push(`${years} سنة`);
  }

  if (months > 0) {
    if (months === 1) parts.push("شهر واحد");
    else if (months === 2) parts.push("شهران");
    else if (months >= 3 && months <= 10) parts.push(`${months} أشهر`);
    else parts.push(`${months} شهر`);
  }

  if (years === 0 && days > 0) {
    if (days === 1) parts.push("يوم واحد");
    else if (days === 2) parts.push("يومان");
    else if (days >= 3 && days <= 10) parts.push(`${days} أيام`);
    else parts.push(`${days} يوماً`);
  }

  return parts.length > 0 ? parts.join(" و ") : "حديث الولادة (اليوم)";
}

/**
 * تسوية النصوص العربية للبحث الذكي وتجاوز اختلافات الهمزات والتاء المربوطة
 */
export function normalizeArabicText(text: string): string {
  if (!text) return "";
  return text
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F]/g, "") // إزالة حركات التشكيل
    .replace(/\s+/g, " ");
}

/**
 * تنسيق التاريخ والوقت باللغة العربية
 */
export function formatArabicDate(dateString: string | Date): string {
  if (!dateString) return "";
  const date = typeof dateString === "string" ? new Date(dateString) : dateString;
  if (isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ar-IQ", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatArabicTime(dateString: string | Date): string {
  if (!dateString) return "";
  const date = typeof dateString === "string" ? new Date(dateString) : dateString;
  if (isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ar-IQ", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * التحقق من صحة صيغة البريد الإلكتروني (عند كتابته اختيارياً)
 */
export function isValidEmail(email: string): boolean {
  if (!email || !email.trim()) return true; // اختياري
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * التحقق من أن القيمة رقم موجب منطقي
 */
export function isValidPositiveNumber(val: number | string | null | undefined): boolean {
  if (val === null || val === undefined || val === "") return true; // اختياري
  const num = typeof val === "number" ? val : parseFloat(val);
  return !isNaN(num) && num > 0;
}

/**
 * إرجاع نص بديل «غير مسجل» في حال كانت القيمة فارغة أو معدومة
 */
export function displayOrFallback(value: string | number | null | undefined, fallback: string = "غير مسجل"): string {
  if (value === null || value === undefined || String(value).trim() === "") {
    return fallback;
  }
  return String(value);
}

/**
 * اشتقاق تاريخ أول زيارة للطفل من أقدم سجل في الزيارات
 */
export function getPatientFirstVisitDate(visits?: { date?: string; visit_date?: string }[]): string {
  if (!visits || visits.length === 0) {
    return "لا توجد زيارة مسجلة";
  }

  // فرز الزيارات تصاعدياً للحصول على أقدم زيارة
  const dates = visits
    .map((v) => v.date || v.visit_date)
    .filter((d): d is string => Boolean(d))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  if (dates.length === 0) return "لا توجد زيارة مسجلة";
  return formatArabicDate(dates[0]);
}

/**
 * أسماء الأشكال الدوائية بالعربية
 */
export const DOSAGE_FORM_LABELS: Record<DosageForm, string> = {
  syrup: "شراب (Syrup)",
  tablets: "أقراص (Tablets)",
  capsules: "كبسولات (Capsules)",
  drops: "قطرات (Drops)",
  injections: "حقن (Injections)",
  ointment_cream: "مرهم / كريم (Cream/Ointment)",
  suppository: "تحاميل (Suppository)",
  inhaler_spray: "بخاخ / استنشاق (Inhaler/Spray)",
  other: "غير ذلك",
};

/**
 * أسماء حالات الزيارة مع الألوان المناسبة
 */
export const VISIT_STATUS_CONFIG: Record<
  VisitStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  draft: {
    label: "مسودة",
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-300",
  },
  waiting: {
    label: "بانتظار الطبيب",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-300",
  },
  in_progress: {
    label: "قيد الفحص",
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-300",
  },
  completed: {
    label: "مكتملة",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-300",
  },
  cancelled: {
    label: "ملغاة",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-300",
  },
};

/**
 * تسميات المرفقات الطبية
 */
export const ATTACHMENT_TYPE_LABELS: Record<AttachmentType, string> = {
  lab_test: "تحليل مختبري",
  xray_imaging: "أشعة وسونار",
  medical_report: "تقرير طبي",
  previous_prescription: "وصفة سابقة",
  current_visit_prescription: "وصفة الزيارة الحالية",
  other_document: "مستند آخر",
};

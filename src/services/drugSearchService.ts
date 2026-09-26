/**
 * خدمة البحث في قاعدة بيانات الأدوية وكتالوج العيادة
 * Drug Search Service & Electronic Prescription Catalog Integration
 */

import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { DosageForm } from "@/types/database";

export interface DrugSearchResult {
  product_id: string;
  source_identifier: string | null;
  display_name: string;
  generic_name: string;
  brand_name: string | null;
  dosage_form: string;
  route: string | null;
  active_ingredient: string | null;
  strength: string | null;
}

export interface StrengthFormatInput {
  numeratorValue?: number | string | null;
  numeratorUnit?: string | null;
  denominatorValue?: number | string | null;
  denominatorUnit?: string | null;
}

/**
 * تحويل الشكل الدوائي من قاعدة البيانات إلى الأنواع المعتمدة في النظام DosageForm
 * 
 * - SYRUP أو SOLUTION أو SUSPENSION أو POWDER, FOR SUSPENSION → syrup
 * - TABLET بجميع أنواعها → tablets
 * - CAPSULE → capsules
 * - DROP → drops
 * - INJECTION أو INJECTABLE → injections
 * - CREAM أو OINTMENT أو GEL أو LOTION → ointment_cream
 * - SUPPOSITORY → suppository
 * - AEROSOL أو INHALER أو SPRAY → inhaler_spray
 * - غير ذلك → other
 */
export function mapDosageFormToFormType(rawForm?: string | null): DosageForm {
  if (!rawForm) return "other";
  const upper = rawForm.trim().toUpperCase();

  // SYRUP أو SOLUTION أو SUSPENSION أو POWDER, FOR SUSPENSION → syrup
  if (
    upper.includes("SYRUP") ||
    upper.includes("SOLUTION") ||
    upper.includes("SUSPENSION") ||
    upper.includes("POWDER, FOR SUSPENSION")
  ) {
    return "syrup";
  }

  // TABLET بجميع أنواعها → tablets
  if (upper.includes("TABLET")) {
    return "tablets";
  }

  // CAPSULE → capsules
  if (upper.includes("CAPSULE")) {
    return "capsules";
  }

  // DROP → drops
  if (upper.includes("DROP")) {
    return "drops";
  }

  // INJECTION أو INJECTABLE → injections
  if (upper.includes("INJECTION") || upper.includes("INJECTABLE")) {
    return "injections";
  }

  // CREAM أو OINTMENT أو GEL أو LOTION → ointment_cream
  if (
    upper.includes("CREAM") ||
    upper.includes("OINTMENT") ||
    upper.includes("GEL") ||
    upper.includes("LOTION")
  ) {
    return "ointment_cream";
  }

  // SUPPOSITORY → suppository
  if (upper.includes("SUPPOSITORY")) {
    return "suppository";
  }

  // AEROSOL أو INHALER أو SPRAY → inhaler_spray
  if (
    upper.includes("AEROSOL") ||
    upper.includes("INHALER") ||
    upper.includes("SPRAY")
  ) {
    return "inhaler_spray";
  }

  // غير ذلك → other
  return "other";
}

export interface RouteOption {
  value: string;
  labelAr: string;
  labelEn: string;
}

export const ROUTE_OPTIONS: RouteOption[] = [
  { value: "oral", labelAr: "فموي (Oral)", labelEn: "Oral (PO)" },
  { value: "iv", labelAr: "وريدي (IV)", labelEn: "Intravenous (IV)" },
  { value: "im", labelAr: "عضلي (IM)", labelEn: "Intramuscular (IM)" },
  { value: "topical", labelAr: "موضعي (Topical)", labelEn: "Topical" },
  { value: "inhalation", labelAr: "استنشاق (Inhalation)", labelEn: "Inhalation" },
  { value: "rectal", labelAr: "شرجي (Rectal)", labelEn: "Rectal" },
  { value: "nasal", labelAr: "أنفي (Nasal)", labelEn: "Nasal" },
  { value: "ophthalmic", labelAr: "قطرة عين (Ophthalmic)", labelEn: "Eye Drops" },
  { value: "otic", labelAr: "قطرة أذن (Otic)", labelEn: "Ear Drops" },
];

/**
 * الحصول على تسمية طريق الاستخدام المعروضة للمستخدم
 */
export function getRouteLabel(route?: string | null, language: "ar" | "en" = "ar"): string {
  if (!route) return "";
  const standard = mapRouteToStandardRoute(route);
  const found = ROUTE_OPTIONS.find((opt) => opt.value === (standard || route));
  if (found) {
    return language === "ar" ? found.labelAr : found.labelEn;
  }
  return route;
}

/**
 * تحويل طريق استخدام الدواء route إلى القيمة القياسية المتوافقة مع ROUTE_OPTIONS
 *
 * - ORAL → oral
 * - TOPICAL أو CUTANEOUS → topical
 * - RESPIRATORY (INHALATION) أو INHALATION → inhalation
 * - RECTAL → rectal
 * - NASAL → nasal
 * - OPHTHALMIC → ophthalmic
 * - OTIC → otic
 * - INTRAVENOUS / IV → iv
 * - INTRAMUSCULAR / IM → im
 *
 * يتحمل:
 * - الأحرف الكبيرة والصغيرة (Case-insensitive)
 * - الفراغات الزائدة
 * - القيم المركبة (مثل "RESPIRATORY (INHALATION)" أو "ORAL; TOPICAL")
 * - المصفوفات (مثل ["ORAL"]) إن كانت قادمة من المصدر
 * - عدم اختلاق قيمة إذا كان الطريق غير معروف؛ عندها يبقى الحقل فارغاً ("")
 */
export function mapRouteToStandardRoute(rawRoute?: unknown): string {
  if (!rawRoute) return "";

  let inputStr = "";
  if (Array.isArray(rawRoute)) {
    inputStr = rawRoute.filter(Boolean).map(String).join(" ");
  } else if (typeof rawRoute === "string") {
    inputStr = rawRoute;
  } else {
    inputStr = String(rawRoute);
  }

  const trimmed = inputStr.trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();

  // 1. الفموي: ORAL
  if (upper.includes("ORAL") || upper.includes("فم")) return "oral";

  // 2. الاستنشاق: RESPIRATORY (INHALATION) أو INHALATION
  if (upper.includes("RESPIRATORY") || upper.includes("INHALATION") || upper.includes("استنشاق")) return "inhalation";

  // 3. الموضعي: TOPICAL أو CUTANEOUS
  if (upper.includes("TOPICAL") || upper.includes("CUTANEOUS") || upper.includes("موضع")) return "topical";

  // 4. الشرجي: RECTAL
  if (upper.includes("RECTAL") || upper.includes("شرج")) return "rectal";

  // 5. الأنفي: NASAL
  if (upper.includes("NASAL") || upper.includes("أنف") || upper.includes("انف")) return "nasal";

  // 6. العيني: OPHTHALMIC
  if (upper.includes("OPHTHALMIC") || upper.includes("عين") || upper.includes("EYE")) return "ophthalmic";

  // 7. الأذني: OTIC
  if (upper.includes("OTIC") || upper.includes("أذن") || upper.includes("اذن") || upper.includes("EAR")) return "otic";

  // 8. الحقن الوريدي: INTRAVENOUS أو IV
  if (upper.includes("INTRAVENOUS") || /\bIV\b/.test(upper) || upper.includes("وريد")) return "iv";

  // 9. الحقن العضلي: INTRAMUSCULAR أو IM
  if (upper.includes("INTRAMUSCULAR") || /\bIM\b/.test(upper) || upper.includes("عضل")) return "im";

  // عدم اختلاق قيمة إذا كان الطريق غير معروف؛ عندها يبقى الحقل فارغاً
  return "";
}

/**
 * تنسيق تركيز الدواء من قيم البسط والمقام مع الحفاظ على الدقة التامة
 * دون تقريب مضر أو تحويل الكسور العشرية الصغيرة إلى صفر
 */
export function formatDrugStrength(
  input: StrengthFormatInput | string | null | undefined
): string {
  if (!input) return "";
  if (typeof input === "string") return input.trim();

  const {
    numeratorValue,
    numeratorUnit,
    denominatorValue,
    denominatorUnit,
  } = input;

  if (numeratorValue === null || numeratorValue === undefined || numeratorValue === "") {
    return "";
  }

  const numStr = String(numeratorValue).trim();
  const numUnit = (numeratorUnit || "").trim();
  const formattedNum = numUnit ? `${numStr} ${numUnit}` : numStr;

  if (denominatorValue !== null && denominatorValue !== undefined && denominatorValue !== "") {
    const denStr = String(denominatorValue).trim();
    const denUnit = (denominatorUnit || "").trim();

    // إذا كان المقام 1 بدون وحدة صريحة أو وحدة جرعة عامة
    if (denStr === "1" && (!denUnit || denUnit === "1" || denUnit.toLowerCase() === "dose")) {
      return formattedNum;
    }

    if (denStr === "1" && denUnit) {
      return `${formattedNum} / ${denUnit}`;
    }

    if (denUnit) {
      return `${formattedNum} / ${denStr} ${denUnit}`;
    }

    return `${formattedNum} / ${denStr}`;
  }

  return formattedNum;
}

// قائمة أدوية تجريبية للعمل في وضع العرض المحلي أو عدم الاتصال
const MOCK_DRUG_CATALOG: DrugSearchResult[] = [
  {
    product_id: "00000000-0000-0000-0000-000000000101",
    source_identifier: "0069-4200-01",
    display_name: "Amoxicillin 500 MG Oral Capsule",
    generic_name: "Amoxicillin",
    brand_name: "Amoxil",
    dosage_form: "CAPSULE",
    route: "ORAL",
    active_ingredient: "Amoxicillin",
    strength: "500 mg",
  },
  {
    product_id: "00000000-0000-0000-0000-000000000102",
    source_identifier: "0069-4200-02",
    display_name: "Amoxicillin 250 MG / 5 ML Oral Suspension",
    generic_name: "Amoxicillin",
    brand_name: "Amoxil",
    dosage_form: "SUSPENSION",
    route: "ORAL",
    active_ingredient: "Amoxicillin",
    strength: "250 mg / 5 mL",
  },
  {
    product_id: "00000000-0000-0000-0000-000000000103",
    source_identifier: "0045-0501-10",
    display_name: "Paracetamol 500 MG Tablet",
    generic_name: "Acetaminophen",
    brand_name: "Panadol",
    dosage_form: "TABLET",
    route: "ORAL",
    active_ingredient: "Acetaminophen",
    strength: "500 mg",
  },
  {
    product_id: "00000000-0000-0000-0000-000000000104",
    source_identifier: "0045-0501-20",
    display_name: "Paracetamol 120 MG / 5 ML Syrup",
    generic_name: "Acetaminophen",
    brand_name: "Cetal",
    dosage_form: "SYRUP",
    route: "ORAL",
    active_ingredient: "Acetaminophen",
    strength: "120 mg / 5 mL",
  },
  {
    product_id: "00000000-0000-0000-0000-000000000105",
    source_identifier: "0078-0110-05",
    display_name: "Ibuprofen 100 MG / 5 ML Oral Suspension",
    generic_name: "Ibuprofen",
    brand_name: "Brufen",
    dosage_form: "SUSPENSION",
    route: "ORAL",
    active_ingredient: "Ibuprofen",
    strength: "100 mg / 5 mL",
  },
  {
    product_id: "00000000-0000-0000-0000-000000000106",
    source_identifier: "0078-0110-20",
    display_name: "Augmentin 457 MG / 5 ML Oral Suspension",
    generic_name: "Amoxicillin / Clavulanate Potassium",
    brand_name: "Augmentin",
    dosage_form: "SUSPENSION",
    route: "ORAL",
    active_ingredient: "Amoxicillin + Clavulanate Potassium",
    strength: "400 mg + 57 mg / 5 mL",
  },
  {
    product_id: "00000000-0000-0000-0000-000000000107",
    source_identifier: "0078-0110-30",
    display_name: "Cefotaxime 500 MG Injection",
    generic_name: "Cefotaxime Sodium",
    brand_name: "Claforan",
    dosage_form: "INJECTION",
    route: "INTRAVENOUS",
    active_ingredient: "Cefotaxime Sodium",
    strength: "500 mg",
  },
  {
    product_id: "00000000-0000-0000-0000-000000000108",
    source_identifier: "0078-0110-40",
    display_name: "Salbutamol 100 MCG Inhaler",
    generic_name: "Albuterol Sulfate",
    brand_name: "Ventolin",
    dosage_form: "AEROSOL",
    route: "RESPIRATORY",
    active_ingredient: "Albuterol Sulfate",
    strength: "100 mcg",
  },
];

/**
 * البحث في قاعدة بيانات الأدوية عبر استدعاء دالة RPC الآمنة
 * - لا يستدعي الدالة إلا الطبيب المصادق
 * - يرفض ويعيد مصفوفة فارغة للنصوص الأقل من حرفين
 * - الحد الأقصى للنتائج 20 والافتراضي 10
 * - لا يستخدم service role key إطلاقاً
 */
export async function searchDrugProducts(
  query: string,
  limit: number = 10
): Promise<DrugSearchResult[]> {
  const trimmed = (query || "").trim();

  // رفض الاستعلامات الأقل من حرفين فورياً دون إجراء اتصال بالشبكة
  if (trimmed.length < 2) {
    return [];
  }

  const safeLimit = Math.min(Math.max(1, limit || 10), 20);
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    // وضع عدم الاتصال / العرض التجريبي
    const qLower = trimmed.toLowerCase();
    const matched = MOCK_DRUG_CATALOG.filter(
      (d) =>
        d.display_name.toLowerCase().includes(qLower) ||
        d.generic_name.toLowerCase().includes(qLower) ||
        (d.brand_name && d.brand_name.toLowerCase().includes(qLower)) ||
        (d.active_ingredient && d.active_ingredient.toLowerCase().includes(qLower))
    );

    // ترتيب المحاكاة: مطابقة تامة أولاً، ثم بداية النص، ثم جزئية
    return matched
      .sort((a, b) => {
        const aExact = a.display_name.toLowerCase() === qLower ? 1 : a.display_name.toLowerCase().startsWith(qLower) ? 2 : 3;
        const bExact = b.display_name.toLowerCase() === qLower ? 1 : b.display_name.toLowerCase().startsWith(qLower) ? 2 : 3;
        if (aExact !== bExact) return aExact - bExact;
        return a.display_name.localeCompare(b.display_name);
      })
      .slice(0, safeLimit);
  }

  // استدعاء دالة RPC الآمنة بصلاحيات الطبيب المصادق
  const { data, error } = await supabase.rpc("search_drug_products", {
    p_query: trimmed,
    p_limit: safeLimit,
  });

  if (error) {
    throw new Error(`فشل البحث في قاعدة بيانات الأدوية: ${error.message || "حدث خطأ غير متوقع"}`);
  }

  return (data || []) as DrugSearchResult[];
}

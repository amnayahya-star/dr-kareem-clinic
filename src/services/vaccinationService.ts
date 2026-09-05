import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { PatientVaccinationProfile, VaccinationStatus } from "@/types/database";
import { MOCK_PATIENT_FILES, MOCK_PATIENTS } from "@/lib/mock-data/patients";

export interface SaveVaccinationProfileInput {
  patientId: string;
  vaccinationStatus?: VaccinationStatus | null;
  lastVaccineName?: string | null;
  lastVaccineDate?: string | null;
  postVaccinationReactions?: string | null;
  vaccinationNotes?: string | null;
}

export interface VaccinationStatusConfig {
  value: VaccinationStatus;
  label: string;
  badgeVariant: "danger" | "warning" | "success" | "default";
  badgeClass: string;
  dotClass: string;
  description: string;
}

export const VACCINATION_STATUS_CONFIG: Record<VaccinationStatus, VaccinationStatusConfig> = {
  not_vaccinated: {
    value: "not_vaccinated",
    label: "لم يُلقّح",
    badgeVariant: "danger",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    dotClass: "bg-red-500",
    description: "الطفل لم يتلق أي جرعة لقاح حتى الآن",
  },
  incomplete: {
    value: "incomplete",
    label: "غير كامل التلقيح",
    badgeVariant: "warning",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    dotClass: "bg-amber-500",
    description: "الطفل متأخر عن جدول اللقاحات أو لم يستكمل الجرعات المطلوبة",
  },
  complete: {
    value: "complete",
    label: "كامل التلقيح",
    badgeVariant: "success",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
    description: "الطفل مستكمل لجميع اللقاحات المقررة لعمره بدقة",
  },
};

export const UNRECORDED_VACCINATION_CONFIG = {
  label: "حالة التطعيم غير مسجلة",
  badgeVariant: "default" as const,
  badgeClass: "bg-muted text-muted-foreground border-border",
  dotClass: "bg-muted-foreground",
  emptyText: "لم تُسجل معلومات التطعيم لهذا الطفل",
};

/**
 * التحقق من صحة بيانات التطعيم
 */
export function validateVaccinationData(
  data: Partial<SaveVaccinationProfileInput>
): { isValid: boolean; error?: string; errors: { field: string; message: string }[] } {
  const errors: { field: string; message: string }[] = [];

  // التحقق من صحة حالة التطعيم إن وجدت
  if (
    data.vaccinationStatus !== undefined &&
    data.vaccinationStatus !== null &&
    (data.vaccinationStatus as string) !== ""
  ) {
    const validStatuses: VaccinationStatus[] = ["not_vaccinated", "incomplete", "complete"];
    if (!validStatuses.includes(data.vaccinationStatus as VaccinationStatus)) {
      errors.push({
        field: "vaccinationStatus",
        message: "حالة التطعيم المختارة غير صالحة",
      });
    }
  }

  // التحقق من أن تاريخ آخر تطعيم ليس في المستقبل
  if (data.lastVaccineDate !== undefined && data.lastVaccineDate !== null && data.lastVaccineDate !== "") {
    const vaccineDate = new Date(data.lastVaccineDate);
    const today = new Date();
    // تقريب إلى نهاية اليوم لتجنب فروق التوقيت
    today.setHours(23, 59, 59, 999);

    if (isNaN(vaccineDate.getTime())) {
      errors.push({
        field: "lastVaccineDate",
        message: "تاريخ آخر تطعيم غير صالح",
      });
    } else if (vaccineDate.getTime() > today.getTime()) {
      errors.push({
        field: "lastVaccineDate",
        message: "تاريخ آخر تطعيم لا يمكن أن يكون في المستقبل",
      });
    }
  }

  return {
    isValid: errors.length === 0,
    error: errors.length > 0 ? errors[0].message : undefined,
    errors,
  };
}

/**
 * معالجة وتطهير مدخلات التطعيم (تفريغ تاريخ واسم اللقاح إذا كانت الحالة لم يلقح)
 */
export function sanitizeVaccinationInput(input: SaveVaccinationProfileInput): SaveVaccinationProfileInput {
  const status = input.vaccinationStatus || null;
  const isNotVaccinated = status === "not_vaccinated";

  return {
    patientId: input.patientId,
    vaccinationStatus: status,
    lastVaccineName: isNotVaccinated ? null : (input.lastVaccineName?.trim() || null),
    lastVaccineDate: isNotVaccinated ? null : (input.lastVaccineDate?.trim() || null),
    postVaccinationReactions: input.postVaccinationReactions?.trim() || null,
    vaccinationNotes: input.vaccinationNotes?.trim() || null,
  };
}

/**
 * جلب سجل التطعيمات لطفل محدد
 */
export async function fetchVaccinationProfile(
  patientId: string
): Promise<PatientVaccinationProfile | null> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    // In-memory Mock fallback
    const mockFile = MOCK_PATIENT_FILES.find((p) => p.id === patientId);
    if (!mockFile || (!mockFile.vaccinationStatus && !mockFile.lastVaccineName && !mockFile.vaccinationNotes)) {
      return null;
    }

    return {
      id: `vac-${mockFile.id}`,
      patient_id: mockFile.id,
      vaccination_status: mockFile.vaccinationStatus || null,
      last_vaccine_name: mockFile.lastVaccineName || null,
      last_vaccine_date: mockFile.lastVaccineDate || null,
      post_vaccination_reactions: mockFile.postVaccinationReactions || null,
      vaccination_notes: mockFile.vaccinationNotes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  try {
    const { data, error } = await supabase
      .from("patient_vaccination_profiles")
      .select("*")
      .eq("patient_id", patientId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching vaccination profile from Supabase:", error);
      throw new Error(`فشل جلب سجل التطعيمات من قاعدة البيانات: ${error.message}`);
    }

    return data as PatientVaccinationProfile | null;
  } catch (err: any) {
    console.error("fetchVaccinationProfile exception:", err);
    throw err;
  }
}

/**
 * حفظ أو تحديث سجل التطعيمات للطفل (Upsert آمن يمنع التكرار)
 */
export async function saveVaccinationProfile(
  input: SaveVaccinationProfileInput
): Promise<PatientVaccinationProfile> {
  const validation = validateVaccinationData(input);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const sanitized = sanitizeVaccinationInput(input);
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    // In-memory Mock fallback
    const mockIdx = MOCK_PATIENT_FILES.findIndex((p) => p.id === sanitized.patientId);
    if (mockIdx !== -1) {
      MOCK_PATIENT_FILES[mockIdx].vaccinationStatus = sanitized.vaccinationStatus;
      MOCK_PATIENT_FILES[mockIdx].lastVaccineName = sanitized.lastVaccineName;
      MOCK_PATIENT_FILES[mockIdx].lastVaccineDate = sanitized.lastVaccineDate;
      MOCK_PATIENT_FILES[mockIdx].postVaccinationReactions = sanitized.postVaccinationReactions;
      MOCK_PATIENT_FILES[mockIdx].vaccinationNotes = sanitized.vaccinationNotes;
    }

    const legacyMock = MOCK_PATIENTS.find((p) => p.id === sanitized.patientId);
    if (legacyMock) {
      legacyMock.vaccination_profile = {
        id: `vac-${sanitized.patientId}`,
        patient_id: sanitized.patientId,
        vaccination_status: sanitized.vaccinationStatus,
        last_vaccine_name: sanitized.lastVaccineName,
        last_vaccine_date: sanitized.lastVaccineDate,
        post_vaccination_reactions: sanitized.postVaccinationReactions,
        vaccination_notes: sanitized.vaccinationNotes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    return {
      id: `vac-${sanitized.patientId}`,
      patient_id: sanitized.patientId,
      vaccination_status: sanitized.vaccinationStatus,
      last_vaccine_name: sanitized.lastVaccineName,
      last_vaccine_date: sanitized.lastVaccineDate,
      post_vaccination_reactions: sanitized.postVaccinationReactions,
      vaccination_notes: sanitized.vaccinationNotes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  // 1. تحقق من وجود سجل مسبق
  const { data: existingProfile, error: checkError } = await supabase
    .from("patient_vaccination_profiles")
    .select("id")
    .eq("patient_id", sanitized.patientId)
    .maybeSingle();

  if (checkError) {
    throw new Error(`فشل التحقق من سجل التطعيمات في قاعدة البيانات: ${checkError.message}`);
  }

  let resultData: any;

  if (existingProfile) {
    // Update existing row
    const { data, error } = await supabase
      .from("patient_vaccination_profiles")
      .update({
        vaccination_status: sanitized.vaccinationStatus,
        last_vaccine_name: sanitized.lastVaccineName,
        last_vaccine_date: sanitized.lastVaccineDate,
        post_vaccination_reactions: sanitized.postVaccinationReactions,
        vaccination_notes: sanitized.vaccinationNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingProfile.id)
      .select()
      .single();

    if (error) {
      throw new Error(`فشل تحديث سجل التطعيمات: ${error.message}`);
    }
    resultData = data;
  } else {
    // Insert new row
    const { data, error } = await supabase
      .from("patient_vaccination_profiles")
      .insert({
        patient_id: sanitized.patientId,
        vaccination_status: sanitized.vaccinationStatus,
        last_vaccine_name: sanitized.lastVaccineName,
        last_vaccine_date: sanitized.lastVaccineDate,
        post_vaccination_reactions: sanitized.postVaccinationReactions,
        vaccination_notes: sanitized.vaccinationNotes,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`فشل حفظ سجل التطعيمات: ${error.message}`);
    }
    resultData = data;
  }

  return resultData as PatientVaccinationProfile;
}

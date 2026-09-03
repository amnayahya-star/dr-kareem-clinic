import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { MOCK_PATIENT_FILES, PatientFile, VisitRecord, MedicalPhoto } from "@/lib/mock-data/patients";
import { normalizeArabicText } from "@/lib/utils";

export interface CreatePatientInput {
  fullName: string;
  dateOfBirth: string;
  gender: "male" | "female";
  bloodType?: string;
  allergies?: string;
  chronicDiseases?: string;
  guardianName: string;
  relationship?: string;
  phone: string;
  secondaryPhone?: string;
  address?: string;
}

/**
 * Fetch all patient files with live search support
 */
export async function fetchPatients(searchQuery?: string): Promise<PatientFile[]> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    // In-memory / Mock data fallback
    if (!searchQuery?.trim()) return MOCK_PATIENT_FILES;

    const q = normalizeArabicText(searchQuery);
    return MOCK_PATIENT_FILES.filter((p) => {
      const matchName = normalizeArabicText(p.fullName).includes(q);
      const matchFile = p.fileNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchPhone = p.phone.includes(searchQuery) || (p.secondaryPhone && p.secondaryPhone.includes(searchQuery));
      const matchGuardian = normalizeArabicText(p.guardianName).includes(q);
      return matchName || matchFile || matchPhone || matchGuardian;
    });
  }

  try {
    let query = supabase
      .from("patients")
      .select(`
        *,
        guardians (*),
        visits (
          *,
          measurements (*),
          diagnoses (*),
          medical_attachments (*)
        )
      `)
      .order("created_at", { ascending: false });

    if (searchQuery && searchQuery.trim()) {
      query = query.or(`full_name.ilike.%${searchQuery}%,file_number.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      console.warn("Supabase query returned empty/error, using fallback:", error?.message);
      return MOCK_PATIENT_FILES;
    }

    // Map Supabase rows to PatientFile interface
    return data.map((row: any): PatientFile => {
      const guardian = row.guardians?.[0] || {};
      const visits: VisitRecord[] = (row.visits || []).map((v: any): VisitRecord => {
        const m = v.measurements?.[0] || {};
        const d = v.diagnoses?.[0] || {};
        const attachments = v.medical_attachments || [];

        const labPhotos: MedicalPhoto[] = attachments
          .filter((att: any) => att.attachment_type === "lab_test" || att.attachment_type === "xray_imaging")
          .map((att: any) => ({
            id: att.id,
            title: att.title || att.file_name,
            type: att.attachment_type === "xray_imaging" ? "xray" : "lab_test",
            date: att.created_at?.split("T")[0] || v.visit_date?.split("T")[0],
            notes: att.notes,
            imageUrl: att.storage_path.startsWith("http")
              ? att.storage_path
              : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/medical-photos/${att.storage_path}`,
          }));

        const rxAttachment = attachments.find((att: any) => att.attachment_type === "current_visit_prescription" || att.attachment_type === "previous_prescription");
        const prescriptionPhoto: MedicalPhoto | null = rxAttachment
          ? {
              id: rxAttachment.id,
              title: rxAttachment.title || "صورة الوصفة",
              type: "prescription",
              date: rxAttachment.created_at?.split("T")[0] || v.visit_date?.split("T")[0],
              notes: rxAttachment.notes,
              imageUrl: rxAttachment.storage_path.startsWith("http")
                ? rxAttachment.storage_path
                : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/medical-photos/${rxAttachment.storage_path}`,
            }
          : null;

        return {
          id: v.id,
          patientId: row.id,
          date: v.visit_date?.split("T")[0] || new Date().toISOString().split("T")[0],
          chiefComplaint: v.chief_complaint,
          weightKg: m.weight_kg ? Number(m.weight_kg) : undefined,
          heightCm: m.height_cm ? Number(m.height_cm) : undefined,
          temperatureC: m.temperature_c ? Number(m.temperature_c) : undefined,
          bloodPressure: m.blood_pressure,
          oxygenSaturation: m.oxygen_saturation ? Number(m.oxygen_saturation) : undefined,
          diagnosisText: d.diagnosis_text,
          clinicalExamination: d.clinical_examination,
          recommendations: d.recommendations,
          doctorNotes: d.doctor_notes,
          isCompleted: v.status === "completed",
          labPhotos,
          prescriptionPhoto,
        };
      });

      const allLabPhotos: MedicalPhoto[] = visits.flatMap((v) => v.labPhotos);
      const allPrescriptionPhotos: MedicalPhoto[] = visits
        .map((v) => v.prescriptionPhoto)
        .filter((p): p is MedicalPhoto => p !== null && p !== undefined);

      return {
        id: row.id,
        fileNumber: row.file_number,
        fullName: row.full_name,
        dateOfBirth: row.date_of_birth,
        gender: row.gender,
        bloodType: row.blood_type,
        allergies: row.allergies,
        chronicDiseases: row.chronic_diseases,
        pastSurgeries: row.past_surgeries,
        guardianName: guardian.full_name || "ولي الأمر",
        relationship: guardian.relationship || "الأب",
        phone: guardian.primary_phone || "",
        secondaryPhone: guardian.secondary_phone,
        address: guardian.address,
        createdAt: row.created_at?.split("T")[0] || new Date().toISOString().split("T")[0],
        visits,
        allLabPhotos,
        allPrescriptionPhotos,
      };
    });
  } catch (err) {
    console.error("Error fetching patients from Supabase:", err);
    return MOCK_PATIENT_FILES;
  }
}

/**
 * Register a new child in the database
 */
export async function createPatientRecord(input: CreatePatientInput): Promise<PatientFile> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    // Local In-Memory Fallback
    const newId = `p-${Date.now()}`;
    const newFileNo = `P-${Math.floor(1000 + Math.random() * 9000)}`;
    const newChild: PatientFile = {
      id: newId,
      fileNumber: newFileNo,
      fullName: input.fullName,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      bloodType: input.bloodType,
      allergies: input.allergies,
      chronicDiseases: input.chronicDiseases,
      guardianName: input.guardianName,
      relationship: input.relationship || "الأب",
      phone: input.phone,
      secondaryPhone: input.secondaryPhone,
      address: input.address,
      createdAt: new Date().toISOString().split("T")[0],
      visits: [],
      allLabPhotos: [],
      allPrescriptionPhotos: [],
    };
    return newChild;
  }

  // Generate unique file number (e.g. P-1004, P-1005...) based on count/random
  const generatedFileNumber = `P-${Math.floor(2000 + Math.random() * 8000)}`;

  // 1. Insert Patient
  const { data: patientData, error: patientError } = await supabase
    .from("patients")
    .insert({
      file_number: generatedFileNumber,
      full_name: input.fullName,
      date_of_birth: input.dateOfBirth,
      gender: input.gender,
      blood_type: input.bloodType,
      allergies: input.allergies,
      chronic_diseases: input.chronicDiseases,
    })
    .select()
    .single();

  if (patientError) {
    throw new Error(`فشل إنشاء ملف الطفل: ${patientError.message}`);
  }

  // 2. Insert Guardian
  const { error: guardianError } = await supabase
    .from("guardians")
    .insert({
      patient_id: patientData.id,
      full_name: input.guardianName,
      relationship: input.relationship || "الأب",
      primary_phone: input.phone,
      secondary_phone: input.secondaryPhone,
      address: input.address,
    });

  if (guardianError) {
    console.warn("Guardian insert error:", guardianError.message);
  }

  return {
    id: patientData.id,
    fileNumber: patientData.file_number,
    fullName: patientData.full_name,
    dateOfBirth: patientData.date_of_birth,
    gender: patientData.gender,
    bloodType: patientData.blood_type,
    allergies: patientData.allergies,
    chronicDiseases: patientData.chronic_diseases,
    guardianName: input.guardianName,
    relationship: input.relationship || "الأب",
    phone: input.phone,
    secondaryPhone: input.secondaryPhone,
    address: input.address,
    createdAt: patientData.created_at?.split("T")[0] || new Date().toISOString().split("T")[0],
    visits: [],
    allLabPhotos: [],
    allPrescriptionPhotos: [],
  };
}

const DELETED_STORAGE_KEY = "dr_kareem_deleted_patients";
const RETENTION_DAYS = 90; // مدة الاحتفاظ 3 أشهر (90 يوماً)

/**
 * حساب الأيام المتبقية حتى الحذف النهائي للطفل
 */
export function calculateRemainingDays(deletedAt?: string): number {
  if (!deletedAt) return RETENTION_DAYS;
  const deletedTime = new Date(deletedAt).getTime();
  const elapsedDays = Math.floor((Date.now() - deletedTime) / (1000 * 60 * 60 * 24));
  return Math.max(0, RETENTION_DAYS - elapsedDays);
}

/**
 * جلب سجل الأطفال المحذوفين مؤقتاً مع تصفية من انتهت مهلتهم (أكثر من 90 يوماً)
 */
export async function fetchDeletedPatients(): Promise<PatientFile[]> {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY);
    const list: PatientFile[] = raw ? JSON.parse(raw) : [];

    // تصفية وحذف من تجاوز 90 يوماً تلقائياً
    const validList: PatientFile[] = [];
    let hasExpired = false;

    for (const patient of list) {
      const remaining = calculateRemainingDays(patient.deletedAt);
      if (remaining > 0) {
        validList.push(patient);
      } else {
        hasExpired = true; // تم حذفه نهائياً لمرور 3 أشهر
      }
    }

    if (hasExpired) {
      localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(validList));
    }

    return validList;
  } catch {
    return [];
  }
}

/**
 * نقل ملف الطفل إلى سلة المحذوفات (مؤقت لمدة 3 أشهر)
 */
export async function softDeletePatient(patient: PatientFile): Promise<void> {
  if (typeof window === "undefined") return;

  const deletedRecord: PatientFile = {
    ...patient,
    deletedAt: new Date().toISOString(),
  };

  const currentDeleted = await fetchDeletedPatients();
  const updated = [deletedRecord, ...currentDeleted.filter((p) => p.id !== patient.id)];
  localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(updated));

  // إذا كان متصلاً بـ Supabase
  const supabase = createClient();
  if (supabase && isSupabaseConfigured()) {
    try {
      await supabase
        .from("patients")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", patient.id);
    } catch (e) {
      console.warn("Supabase soft delete update error:", e);
    }
  }
}

/**
 * استعادة ملف الطفل من سلة المحذوفات إلى السجل النشط
 */
export async function restorePatient(patientId: string): Promise<PatientFile | null> {
  if (typeof window === "undefined") return null;

  const deletedList = await fetchDeletedPatients();
  const target = deletedList.find((p) => p.id === patientId);
  if (!target) return null;

  // إزالة deletedAt
  const restored: PatientFile = {
    ...target,
    deletedAt: undefined,
  };

  const updatedDeleted = deletedList.filter((p) => p.id !== patientId);
  localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(updatedDeleted));

  return restored;
}

/**
 * حذف نهائي وفوري لملف الطفل
 */
export async function permanentDeletePatient(patientId: string): Promise<void> {
  if (typeof window === "undefined") return;

  const deletedList = await fetchDeletedPatients();
  const updatedDeleted = deletedList.filter((p) => p.id !== patientId);
  localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(updatedDeleted));

  const supabase = createClient();
  if (supabase && isSupabaseConfigured()) {
    try {
      await supabase.from("patients").delete().eq("id", patientId);
    } catch (e) {
      console.warn("Supabase permanent delete error:", e);
    }
  }
}

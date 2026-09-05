import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { MOCK_PATIENT_FILES, PatientFile, VisitRecord, MedicalPhoto } from "@/lib/mock-data/patients";
import { normalizeArabicText, isValidEmail, isValidPositiveNumber } from "@/lib/utils";

export interface CreatePatientInput {
  fullName: string;
  dateOfBirth: string;
  gender: "male" | "female";
  bloodType?: string;
  birthPlace?: string;
  birthWeightKg?: number;
  birthLengthCm?: number;
  medicalHistory?: string;
  drugAllergies?: string;
  foodAllergies?: string;
  otherAllergies?: string;
  allergies?: string;
  chronicDiseases?: string;
  pastSurgeries?: string;
  medicalNotes?: string;
  guardianName: string;
  relationship?: string;
  phone: string;
  secondaryPhone?: string;
  email?: string;
  address?: string;
}

export interface UpdatePatientInput {
  fullName?: string;
  dateOfBirth?: string;
  gender?: "male" | "female";
  bloodType?: string;
  birthPlace?: string;
  birthWeightKg?: number;
  birthLengthCm?: number;
  medicalHistory?: string;
  drugAllergies?: string;
  foodAllergies?: string;
  otherAllergies?: string;
  allergies?: string;
  chronicDiseases?: string;
  pastSurgeries?: string;
  medicalNotes?: string;
  guardianName?: string;
  relationship?: string;
  phone?: string;
  secondaryPhone?: string;
  email?: string;
  address?: string;
}

/**
 * دالة للتحقق من صحة مدخلات الطفل وولي الأمر
 */
export function validatePatientData(data: Partial<CreatePatientInput> & {
  guardianPhone?: string;
  guardianEmail?: string;
  guardianRelationship?: string;
}): { isValid: boolean; error?: string; errors: { field: string; message: string }[] } {
  const errors: { field: string; message: string }[] = [];

  if (data.fullName !== undefined && !data.fullName.trim()) {
    errors.push({ field: "fullName", message: "اسم الطفل الكامل مطلوب" });
  }

  if (data.dateOfBirth !== undefined) {
    if (!data.dateOfBirth) {
      errors.push({ field: "dateOfBirth", message: "تاريخ ميلاد الطفل مطلوب" });
    } else {
      const birthDate = new Date(data.dateOfBirth);
      const today = new Date();
      if (isNaN(birthDate.getTime()) || birthDate.getTime() > today.getTime()) {
        errors.push({ field: "dateOfBirth", message: "تاريخ ميلاد الطفل غير صحيح أو في المستقبل" });
      }
    }
  }

  const gName = data.guardianName;
  if (gName !== undefined && !gName.trim()) {
    errors.push({ field: "guardianName", message: "اسم ولي الأمر مطلوب" });
  }

  const phone = data.phone || data.guardianPhone;
  if (data.phone !== undefined || data.guardianPhone !== undefined) {
    if (!phone || !phone.trim()) {
      errors.push({ field: "phone", message: "رقم الهاتف الأساسي مطلوب" });
    }
  }

  const relationship = data.relationship || data.guardianRelationship;
  if (data.relationship !== undefined || data.guardianRelationship !== undefined) {
    if (!relationship || !relationship.trim()) {
      errors.push({ field: "relationship", message: "صلة القرابة مطلوبة" });
    }
  }

  // التحقق من الوزن عند الولادة (يجب ألا يكون سالباً أو صفراً)
  if (data.birthWeightKg !== undefined && data.birthWeightKg !== null && String(data.birthWeightKg).trim() !== "") {
    const w = Number(data.birthWeightKg);
    if (isNaN(w) || w <= 0) {
      errors.push({ field: "birthWeightKg", message: "الوزن عند الولادة يجب أن يكون رقماً موجباً أكبر من الصفر" });
    } else if (w > 25) {
      errors.push({ field: "birthWeightKg", message: "الوزن عند الولادة غير منطقي (يجب أن يكون أقل من 25 كغم)" });
    }
  }

  // التحقق من الطول عند الولادة (يجب ألا يكون سالباً أو صفراً)
  if (data.birthLengthCm !== undefined && data.birthLengthCm !== null && String(data.birthLengthCm).trim() !== "") {
    const l = Number(data.birthLengthCm);
    if (isNaN(l) || l <= 0) {
      errors.push({ field: "birthLengthCm", message: "الطول عند الولادة يجب أن يكون رقماً موجباً أكبر من الصفر" });
    } else if (l > 120) {
      errors.push({ field: "birthLengthCm", message: "الطول عند الولادة غير منطقي (يجب أن يكون أقل من 120 سم)" });
    }
  }

  // التحقق من البريد الإلكتروني عند كتابته
  const email = data.email || data.guardianEmail;
  if (email && email.trim() && !isValidEmail(email)) {
    errors.push({ field: "guardianEmail", message: "صيغة البريد الإلكتروني غير صحيحة" });
  }

  return {
    isValid: errors.length === 0,
    error: errors.length > 0 ? errors[0].message : undefined,
    errors,
  };
}

/**
 * تحويل صفوف Supabase إلى كائن PatientFile مع دعم كافة الحقول الجديدة
 */
function mapSupabaseRowToPatientFile(row: any): PatientFile {
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

    const rxAttachment = attachments.find(
      (att: any) =>
        att.attachment_type === "current_visit_prescription" ||
        att.attachment_type === "previous_prescription"
    );
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
    bloodType: row.blood_type || undefined,
    birthPlace: row.birth_place || undefined,
    birthWeightKg: row.birth_weight_kg ? Number(row.birth_weight_kg) : undefined,
    birthLengthCm: row.birth_length_cm ? Number(row.birth_length_cm) : undefined,
    medicalHistory: row.medical_history || undefined,
    drugAllergies: row.drug_allergies || undefined,
    foodAllergies: row.food_allergies || undefined,
    otherAllergies: row.other_allergies || undefined,
    allergies: row.allergies || undefined,
    chronicDiseases: row.chronic_diseases || undefined,
    pastSurgeries: row.past_surgeries || undefined,
    medicalNotes: row.medical_notes || undefined,
    guardianName: guardian.full_name || "ولي الأمر",
    relationship: guardian.relationship || "الأب",
    phone: guardian.primary_phone || "",
    secondaryPhone: guardian.secondary_phone || undefined,
    email: guardian.email || undefined,
    address: guardian.address || undefined,
    createdAt: row.created_at?.split("T")[0] || new Date().toISOString().split("T")[0],
    visits,
    allLabPhotos,
    allPrescriptionPhotos,
  };
}

/**
 * جلب جميع ملفات الأطفال مع دعم البحث اللحظي
 */
export async function fetchPatients(searchQuery?: string): Promise<PatientFile[]> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    if (!searchQuery?.trim()) return MOCK_PATIENT_FILES;

    const q = normalizeArabicText(searchQuery);
    return MOCK_PATIENT_FILES.filter((p) => {
      const matchName = normalizeArabicText(p.fullName).includes(q);
      const matchFile = p.fileNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchPhone =
        p.phone.includes(searchQuery) || (p.secondaryPhone && p.secondaryPhone.includes(searchQuery));
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
      return MOCK_PATIENT_FILES;
    }

    return data.map(mapSupabaseRowToPatientFile);
  } catch (err) {
    console.error("Error fetching patients from Supabase:", err);
    return MOCK_PATIENT_FILES;
  }
}

/**
 * جلب ملف طفل واحد بواسطة المعرف الفريد
 */
export async function fetchPatientById(patientId: string): Promise<PatientFile | null> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const found = MOCK_PATIENT_FILES.find((p) => p.id === patientId);
    return found || null;
  }

  try {
    const { data, error } = await supabase
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
      .eq("id", patientId)
      .single();

    if (error || !data) {
      const found = MOCK_PATIENT_FILES.find((p) => p.id === patientId);
      return found || null;
    }

    return mapSupabaseRowToPatientFile(data);
  } catch (err) {
    console.error("Error fetching patient by id:", err);
    const found = MOCK_PATIENT_FILES.find((p) => p.id === patientId);
    return found || null;
  }
}

/**
 * تسجيل طفل جديد في العيادة مع حفظ بيانات الولادة والتاريخ الطبي وولي الأمر
 */
export async function createPatientRecord(input: CreatePatientInput): Promise<PatientFile> {
  const validation = validatePatientData(input);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const supabase = createClient();

  // معالجة الأرقام الاختيارية بحيث لا تتحول إلى صفر
  const parsedWeight =
    input.birthWeightKg !== undefined && input.birthWeightKg !== null && String(input.birthWeightKg).trim() !== ""
      ? Number(input.birthWeightKg)
      : null;

  const parsedLength =
    input.birthLengthCm !== undefined && input.birthLengthCm !== null && String(input.birthLengthCm).trim() !== ""
      ? Number(input.birthLengthCm)
      : null;

  if (!supabase || !isSupabaseConfigured()) {
    // In-memory fallback
    const newId = `p-${Date.now()}`;
    const newFileNo = `P-${Math.floor(1000 + Math.random() * 9000)}`;
    const newChild: PatientFile = {
      id: newId,
      fileNumber: newFileNo,
      fullName: input.fullName.trim(),
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      bloodType: input.bloodType || undefined,
      birthPlace: input.birthPlace?.trim() || undefined,
      birthWeightKg: parsedWeight !== null ? parsedWeight : undefined,
      birthLengthCm: parsedLength !== null ? parsedLength : undefined,
      medicalHistory: input.medicalHistory?.trim() || undefined,
      drugAllergies: input.drugAllergies?.trim() || undefined,
      foodAllergies: input.foodAllergies?.trim() || undefined,
      otherAllergies: input.otherAllergies?.trim() || undefined,
      allergies: input.allergies?.trim() || undefined,
      chronicDiseases: input.chronicDiseases?.trim() || undefined,
      pastSurgeries: input.pastSurgeries?.trim() || undefined,
      medicalNotes: input.medicalNotes?.trim() || undefined,
      guardianName: input.guardianName.trim(),
      relationship: input.relationship?.trim() || "الأب",
      phone: input.phone.trim(),
      secondaryPhone: input.secondaryPhone?.trim() || undefined,
      email: input.email?.trim() || undefined,
      address: input.address?.trim() || undefined,
      createdAt: new Date().toISOString().split("T")[0],
      visits: [],
      allLabPhotos: [],
      allPrescriptionPhotos: [],
    };
    MOCK_PATIENT_FILES.unshift(newChild);
    return newChild;
  }

  const generatedFileNumber = `P-${Math.floor(2000 + Math.random() * 8000)}`;

  // 1. إدراج سجل الطفل في جدول patients
  const { data: patientData, error: patientError } = await supabase
    .from("patients")
    .insert({
      file_number: generatedFileNumber,
      full_name: input.fullName.trim(),
      date_of_birth: input.dateOfBirth,
      gender: input.gender,
      blood_type: input.bloodType || null,
      birth_place: input.birthPlace?.trim() || null,
      birth_weight_kg: parsedWeight,
      birth_length_cm: parsedLength,
      medical_history: input.medicalHistory?.trim() || null,
      drug_allergies: input.drugAllergies?.trim() || null,
      food_allergies: input.foodAllergies?.trim() || null,
      other_allergies: input.otherAllergies?.trim() || null,
      allergies: input.allergies?.trim() || null,
      chronic_diseases: input.chronicDiseases?.trim() || null,
      past_surgeries: input.pastSurgeries?.trim() || null,
      medical_notes: input.medicalNotes?.trim() || null,
    })
    .select()
    .single();

  if (patientError) {
    throw new Error(`فشل إنشاء ملف الطفل: ${patientError.message}`);
  }

  // 2. إدراج ولي الأمر في جدول guardians
  const { error: guardianError } = await supabase.from("guardians").insert({
    patient_id: patientData.id,
    full_name: input.guardianName.trim(),
    relationship: input.relationship?.trim() || "الأب",
    primary_phone: input.phone.trim(),
    secondary_phone: input.secondaryPhone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
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
    bloodType: patientData.blood_type || undefined,
    birthPlace: patientData.birth_place || undefined,
    birthWeightKg: patientData.birth_weight_kg ? Number(patientData.birth_weight_kg) : undefined,
    birthLengthCm: patientData.birth_length_cm ? Number(patientData.birth_length_cm) : undefined,
    medicalHistory: patientData.medical_history || undefined,
    drugAllergies: patientData.drug_allergies || undefined,
    foodAllergies: patientData.food_allergies || undefined,
    otherAllergies: patientData.other_allergies || undefined,
    allergies: patientData.allergies || undefined,
    chronicDiseases: patientData.chronic_diseases || undefined,
    pastSurgeries: patientData.past_surgeries || undefined,
    medicalNotes: patientData.medical_notes || undefined,
    guardianName: input.guardianName.trim(),
    relationship: input.relationship?.trim() || "الأب",
    phone: input.phone.trim(),
    secondaryPhone: input.secondaryPhone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    address: input.address?.trim() || undefined,
    createdAt: patientData.created_at?.split("T")[0] || new Date().toISOString().split("T")[0],
    visits: [],
    allLabPhotos: [],
    allPrescriptionPhotos: [],
  };
}

/**
 * تعديل وتحديث ملف الطفل وبيانات ولي الأمر القائم
 * يضمن تحديث سجل ولي الأمر نفسه دون إنشاء سجلات مكررة
 */
export async function updatePatientRecord(patientId: string, input: UpdatePatientInput): Promise<PatientFile> {
  const validation = validatePatientData(input);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const supabase = createClient();

  const parsedWeight =
    input.birthWeightKg !== undefined
      ? input.birthWeightKg !== null && String(input.birthWeightKg).trim() !== ""
        ? Number(input.birthWeightKg)
        : null
      : undefined;

  const parsedLength =
    input.birthLengthCm !== undefined
      ? input.birthLengthCm !== null && String(input.birthLengthCm).trim() !== ""
        ? Number(input.birthLengthCm)
        : null
      : undefined;

  if (!supabase || !isSupabaseConfigured()) {
    const existing = MOCK_PATIENT_FILES.find((p) => p.id === patientId);
    if (!existing) {
      throw new Error("لم يتم العثور على ملف الطفل لتعديله");
    }

    const updated: PatientFile = {
      ...existing,
      fullName: input.fullName !== undefined ? input.fullName.trim() : existing.fullName,
      dateOfBirth: input.dateOfBirth !== undefined ? input.dateOfBirth : existing.dateOfBirth,
      gender: input.gender !== undefined ? input.gender : existing.gender,
      bloodType: input.bloodType !== undefined ? input.bloodType || undefined : existing.bloodType,
      birthPlace: input.birthPlace !== undefined ? input.birthPlace?.trim() || undefined : existing.birthPlace,
      birthWeightKg: parsedWeight !== undefined ? (parsedWeight !== null ? parsedWeight : undefined) : existing.birthWeightKg,
      birthLengthCm: parsedLength !== undefined ? (parsedLength !== null ? parsedLength : undefined) : existing.birthLengthCm,
      medicalHistory: input.medicalHistory !== undefined ? input.medicalHistory?.trim() || undefined : existing.medicalHistory,
      drugAllergies: input.drugAllergies !== undefined ? input.drugAllergies?.trim() || undefined : existing.drugAllergies,
      foodAllergies: input.foodAllergies !== undefined ? input.foodAllergies?.trim() || undefined : existing.foodAllergies,
      otherAllergies: input.otherAllergies !== undefined ? input.otherAllergies?.trim() || undefined : existing.otherAllergies,
      allergies: input.allergies !== undefined ? input.allergies?.trim() || undefined : existing.allergies,
      chronicDiseases: input.chronicDiseases !== undefined ? input.chronicDiseases?.trim() || undefined : existing.chronicDiseases,
      pastSurgeries: input.pastSurgeries !== undefined ? input.pastSurgeries?.trim() || undefined : existing.pastSurgeries,
      medicalNotes: input.medicalNotes !== undefined ? input.medicalNotes?.trim() || undefined : existing.medicalNotes,
      guardianName: input.guardianName !== undefined ? input.guardianName.trim() : existing.guardianName,
      relationship: input.relationship !== undefined ? input.relationship.trim() : existing.relationship,
      phone: input.phone !== undefined ? input.phone.trim() : existing.phone,
      secondaryPhone: input.secondaryPhone !== undefined ? input.secondaryPhone?.trim() || undefined : existing.secondaryPhone,
      email: input.email !== undefined ? input.email?.trim() || undefined : existing.email,
      address: input.address !== undefined ? input.address?.trim() || undefined : existing.address,
    };

    const idx = MOCK_PATIENT_FILES.findIndex((p) => p.id === patientId);
    if (idx !== -1) {
      MOCK_PATIENT_FILES[idx] = updated;
    }

    return updated;
  }

  // 1. بناء حقول التحديث لجدول patients
  const patientUpdates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (input.fullName !== undefined) patientUpdates.full_name = input.fullName.trim();
  if (input.dateOfBirth !== undefined) patientUpdates.date_of_birth = input.dateOfBirth;
  if (input.gender !== undefined) patientUpdates.gender = input.gender;
  if (input.bloodType !== undefined) patientUpdates.blood_type = input.bloodType || null;
  if (input.birthPlace !== undefined) patientUpdates.birth_place = input.birthPlace?.trim() || null;
  if (parsedWeight !== undefined) patientUpdates.birth_weight_kg = parsedWeight;
  if (parsedLength !== undefined) patientUpdates.birth_length_cm = parsedLength;
  if (input.medicalHistory !== undefined) patientUpdates.medical_history = input.medicalHistory?.trim() || null;
  if (input.drugAllergies !== undefined) patientUpdates.drug_allergies = input.drugAllergies?.trim() || null;
  if (input.foodAllergies !== undefined) patientUpdates.food_allergies = input.foodAllergies?.trim() || null;
  if (input.otherAllergies !== undefined) patientUpdates.other_allergies = input.otherAllergies?.trim() || null;
  if (input.allergies !== undefined) patientUpdates.allergies = input.allergies?.trim() || null;
  if (input.chronicDiseases !== undefined) patientUpdates.chronic_diseases = input.chronicDiseases?.trim() || null;
  if (input.pastSurgeries !== undefined) patientUpdates.past_surgeries = input.pastSurgeries?.trim() || null;
  if (input.medicalNotes !== undefined) patientUpdates.medical_notes = input.medicalNotes?.trim() || null;

  const { error: patientUpdateError } = await supabase
    .from("patients")
    .update(patientUpdates)
    .eq("id", patientId);

  if (patientUpdateError) {
    throw new Error(`فشل تحديث ملف الطفل: ${patientUpdateError.message}`);
  }

  // 2. تحديث سجل ولي الأمر المرتبط بدون تكرار
  if (
    input.guardianName !== undefined ||
    input.relationship !== undefined ||
    input.phone !== undefined ||
    input.secondaryPhone !== undefined ||
    input.email !== undefined ||
    input.address !== undefined
  ) {
    const guardianUpdates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (input.guardianName !== undefined) guardianUpdates.full_name = input.guardianName.trim();
    if (input.relationship !== undefined) guardianUpdates.relationship = input.relationship.trim();
    if (input.phone !== undefined) guardianUpdates.primary_phone = input.phone.trim();
    if (input.secondaryPhone !== undefined) guardianUpdates.secondary_phone = input.secondaryPhone?.trim() || null;
    if (input.email !== undefined) guardianUpdates.email = input.email?.trim() || null;
    if (input.address !== undefined) guardianUpdates.address = input.address?.trim() || null;

    // فحص ما إذا كان هناك ولي أمر مرتبط بالفعل
    const { data: existingGuardian } = await supabase
      .from("guardians")
      .select("id")
      .eq("patient_id", patientId)
      .limit(1)
      .maybeSingle();

    if (existingGuardian) {
      await supabase.from("guardians").update(guardianUpdates).eq("id", existingGuardian.id);
    } else {
      await supabase.from("guardians").insert({
        patient_id: patientId,
        full_name: input.guardianName?.trim() || "ولي الأمر",
        relationship: input.relationship?.trim() || "الأب",
        primary_phone: input.phone?.trim() || "",
        secondary_phone: input.secondaryPhone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
      });
    }
  }

  const refreshed = await fetchPatientById(patientId);
  if (!refreshed) {
    throw new Error("حدث خطأ أثناء جلب الملف المحدث");
  }
  return refreshed;
}

const DELETED_STORAGE_KEY = "dr_kareem_deleted_patients";
const RETENTION_DAYS = 90; // مدة الاحتفاظ 3 أشهر (90 يوماً)

export function calculateRemainingDays(deletedAt?: string): number {
  if (!deletedAt) return RETENTION_DAYS;
  const deletedTime = new Date(deletedAt).getTime();
  const elapsedDays = Math.floor((Date.now() - deletedTime) / (1000 * 60 * 60 * 24));
  return Math.max(0, RETENTION_DAYS - elapsedDays);
}

export async function fetchDeletedPatients(): Promise<PatientFile[]> {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY);
    const list: PatientFile[] = raw ? JSON.parse(raw) : [];

    const validList: PatientFile[] = [];
    let hasExpired = false;

    for (const patient of list) {
      const remaining = calculateRemainingDays(patient.deletedAt);
      if (remaining > 0) {
        validList.push(patient);
      } else {
        hasExpired = true;
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

export async function softDeletePatient(patient: PatientFile): Promise<void> {
  if (typeof window === "undefined") return;

  const deletedRecord: PatientFile = {
    ...patient,
    deletedAt: new Date().toISOString(),
  };

  const currentDeleted = await fetchDeletedPatients();
  const updated = [deletedRecord, ...currentDeleted.filter((p) => p.id !== patient.id)];
  localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(updated));

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

export async function restorePatient(patientId: string): Promise<PatientFile | null> {
  if (typeof window === "undefined") return null;

  const deletedList = await fetchDeletedPatients();
  const target = deletedList.find((p) => p.id === patientId);
  if (!target) return null;

  const restored: PatientFile = {
    ...target,
    deletedAt: undefined,
  };

  const updatedDeleted = deletedList.filter((p) => p.id !== patientId);
  localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(updatedDeleted));

  return restored;
}

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

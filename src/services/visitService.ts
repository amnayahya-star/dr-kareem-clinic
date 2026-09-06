import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { VisitRecord, MedicalPhoto } from "@/lib/mock-data/patients";
import { uploadMedicalPhoto } from "./storageService";

export interface MeasurementValidationInput {
  weightKg?: number | string | null;
  heightCm?: number | string | null;
  temperatureC?: number | string | null;
  bloodPressure?: string | null;
  oxygenSaturation?: number | string | null;
}

export interface MeasurementValidationResult {
  isValid: boolean;
  errors: { field: string; message: string }[];
  error?: string;
}

/**
 * Reusable validator for clinical measurements & vital signs
 */
export function validateMeasurements(input: MeasurementValidationInput): MeasurementValidationResult {
  const errors: { field: string; message: string }[] = [];

  // 1. Weight: Optional, if entered must be between 0.3kg and 250kg
  if (input.weightKg !== undefined && input.weightKg !== null && String(input.weightKg).trim() !== "") {
    const w = Number(input.weightKg);
    if (isNaN(w) || w <= 0) {
      errors.push({ field: "weightKg", message: "الوزن يجب أن يكون رقماً موجباً أكبر من الصفر" });
    } else if (w < 0.3 || w > 250) {
      errors.push({ field: "weightKg", message: "قيمة الوزن غير منطقية طبياً (يجب أن تكون بين 0.3 و 250 كغم)" });
    }
  }

  // 2. Height: Optional, if entered must be between 20cm and 250cm
  if (input.heightCm !== undefined && input.heightCm !== null && String(input.heightCm).trim() !== "") {
    const h = Number(input.heightCm);
    if (isNaN(h) || h <= 0) {
      errors.push({ field: "heightCm", message: "الطول يجب أن يكون رقماً موجباً أكبر من الصفر" });
    } else if (h < 20 || h > 250) {
      errors.push({ field: "heightCm", message: "قيمة الطول غير منطقية طبياً (يجب أن تكون بين 20 و 250 سم)" });
    }
  }

  // 3. Temperature: Optional, if entered must be between 30°C and 45°C
  if (input.temperatureC !== undefined && input.temperatureC !== null && String(input.temperatureC).trim() !== "") {
    const t = Number(input.temperatureC);
    if (isNaN(t) || t <= 0) {
      errors.push({ field: "temperatureC", message: "درجة الحرارة يجب أن تكون رقماً موجباً" });
    } else if (t < 30.0 || t > 45.0) {
      errors.push({ field: "temperatureC", message: "درجة الحرارة غير منطقية طبياً (يجب أن تكون بين 30.0 و 45.0 درجة مئوية)" });
    }
  }

  // 4. Oxygen Saturation: Optional, if entered must be between 0% and 100%
  if (input.oxygenSaturation !== undefined && input.oxygenSaturation !== null && String(input.oxygenSaturation).trim() !== "") {
    const ox = Number(input.oxygenSaturation);
    if (isNaN(ox) || ox < 0 || ox > 100) {
      errors.push({ field: "oxygenSaturation", message: "نسبة الأكسجين يجب أن تكون نسبة مئوية بين 0% و 100%" });
    }
  }

  // 5. Blood Pressure: Optional format check (e.g. 120/80 or 90/60)
  if (input.bloodPressure !== undefined && input.bloodPressure !== null && input.bloodPressure.trim() !== "") {
    const bpTrimmed = input.bloodPressure.trim();
    const bpMatch = bpTrimmed.match(/^(\d{2,3})\s*[\/\-]\s*(\d{2,3})$/);
    if (!bpMatch) {
      errors.push({ field: "bloodPressure", message: "صيغة ضغط الدم غير صحيحة، يرجى كتابتها بصيغة (مثال: 120/80)" });
    } else {
      const systolic = Number(bpMatch[1]);
      const diastolic = Number(bpMatch[2]);
      if (systolic < 40 || systolic > 260 || diastolic < 20 || diastolic > 160 || systolic <= diastolic) {
        errors.push({ field: "bloodPressure", message: "قيم ضغط الدم غير منطقية (الانقباضي يجب أن يكون أكبر من الانبساطي)" });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    error: errors.length > 0 ? errors[0].message : undefined,
  };
}

/**
 * Validates follow-up date (cannot be in the past)
 */
export function validateFollowUpDate(dateStr?: string | null): { isValid: boolean; error?: string } {
  if (!dateStr || !dateStr.trim()) {
    return { isValid: true };
  }

  const selectedDate = new Date(dateStr);
  if (isNaN(selectedDate.getTime())) {
    return { isValid: false, error: "تاريخ المراجعة غير صحيح" };
  }

  // Compare date only with today (midnight)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  selectedDate.setHours(0, 0, 0, 0);

  if (selectedDate.getTime() < today.getTime()) {
    return { isValid: false, error: "تاريخ المراجعة القادمة لا يمكن أن يكون في الماضي" };
  }

  return { isValid: true };
}

/**
 * Helper to safely select the active visit (draft, waiting, in_progress)
 */
export function getActiveVisit(visits?: VisitRecord[]): VisitRecord | null {
  if (!visits || visits.length === 0) return null;
  return visits.find((v) => v.status === "waiting" || v.status === "in_progress" || v.status === "draft") || null;
}

export interface CreateVisitInput {
  patientId: string;
  weightKg?: number;
  heightCm?: number;
  temperatureC?: number;
  bloodPressure?: string;
  oxygenSaturation?: number;
  chiefComplaint?: string;
  labPhotoFiles?: File[];
  secretaryId?: string;
}

export interface SaveDiagnosisInput {
  visitId: string;
  patientId: string;
  symptoms?: string;
  presentIllnessHistory?: string;
  clinicalExamination?: string;
  diagnosisText: string;
  recommendations?: string;
  doctorNotes?: string;
  followUpDate?: string;
  doctorId?: string;
}

/**
 * Create a new visit with vital signs and attached lab test photos
 */
export async function createVisitRecord(input: CreateVisitInput): Promise<VisitRecord> {
  // 1. Validate measurements
  const validation = validateMeasurements(input);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    // Local In-Memory Fallback
    const newId = `v-${Date.now()}`;
    const labPhotos: MedicalPhoto[] = (input.labPhotoFiles || []).map((file, idx) => ({
      id: `lab-${Date.now()}-${idx}`,
      title: file.name.replace(/\.[^/.]+$/, "") || `تحليل مختبري ${idx + 1}`,
      type: "lab_test",
      date: new Date().toISOString().split("T")[0],
      notes: `تم الرفع (${(file.size / 1024).toFixed(0)} KB)`,
      imageUrl: URL.createObjectURL(file),
    }));

    return {
      id: newId,
      patientId: input.patientId,
      date: new Date().toISOString().split("T")[0],
      status: "waiting",
      chiefComplaint: input.chiefComplaint || "كشف ومراجعة",
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      temperatureC: input.temperatureC,
      bloodPressure: input.bloodPressure,
      oxygenSaturation: input.oxygenSaturation,
      isCompleted: false,
      labPhotos,
      prescriptionPhoto: null,
    };
  }

  // Retrieve authenticated user ID for secretary_id audit tracking
  let authenticatedUserId: string | null = input.secretaryId || null;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) {
    throw new Error("غير مصرح: يجب تسجيل الدخول لإنشاء زيارة");
  }
  authenticatedUserId = authData.user.id;

  const visitDateStr = new Date().toISOString().split("T")[0];

  // Execute atomic transactional RPC function exclusively
  const { data: rpcVisitId, error: rpcError } = await supabase.rpc(
    "create_visit_with_measurements",
    {
      p_patient_id: input.patientId,
      p_chief_complaint: input.chiefComplaint || null,
      p_weight_kg: input.weightKg !== undefined ? input.weightKg : null,
      p_height_cm: input.heightCm !== undefined ? input.heightCm : null,
      p_temperature_c: input.temperatureC !== undefined ? input.temperatureC : null,
      p_blood_pressure: input.bloodPressure || null,
      p_oxygen_saturation: input.oxygenSaturation !== undefined ? input.oxygenSaturation : null,
    }
  );

  if (rpcError || !rpcVisitId) {
    throw new Error(rpcError?.message || "فشل إنشاء الزيارة");
  }

  const visitId = rpcVisitId;

  // Upload and attach multiple lab photos if present
  const uploadedLabPhotos: MedicalPhoto[] = [];
  if (input.labPhotoFiles && input.labPhotoFiles.length > 0) {
    for (let i = 0; i < input.labPhotoFiles.length; i++) {
      const file = input.labPhotoFiles[i];
      try {
        const uploadResult = await uploadMedicalPhoto(file, "lab_tests", input.patientId);

        const { data: attData } = await supabase
          .from("medical_attachments")
          .insert({
            patient_id: input.patientId,
            visit_id: visitId,
            attachment_type: "lab_test",
            title: file.name.replace(/\.[^/.]+$/, "") || `تحليل مختبري ${i + 1}`,
            storage_path: uploadResult.path,
            file_name: file.name,
            file_type: file.type || "image/jpeg",
            file_size_bytes: file.size,
            uploaded_by: authenticatedUserId,
          })
          .select()
          .single();

        uploadedLabPhotos.push({
          id: attData?.id || `lab-${Date.now()}-${i}`,
          title: file.name.replace(/\.[^/.]+$/, "") || `تحليل مختبري ${i + 1}`,
          type: "lab_test",
          date: new Date().toISOString().split("T")[0],
          notes: `تم الرفع (${(file.size / 1024).toFixed(0)} KB)`,
          imageUrl: uploadResult.url,
        });
      } catch (err) {
        console.error("Error uploading lab photo to Supabase:", err);
      }
    }
  }

  return {
    id: visitId,
    patientId: input.patientId,
    date: visitDateStr,
    status: "waiting",
    chiefComplaint: input.chiefComplaint,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    temperatureC: input.temperatureC,
    bloodPressure: input.bloodPressure,
    oxygenSaturation: input.oxygenSaturation,
    secretaryId: authenticatedUserId || undefined,
    isCompleted: false,
    labPhotos: uploadedLabPhotos,
    prescriptionPhoto: null,
  };
}

/**
 * Add an extra lab photo directly to an existing visit
 */
export async function addExtraLabPhotoToVisit(
  visitId: string,
  patientId: string,
  file: File,
  customTitle?: string
): Promise<MedicalPhoto> {
  const uploadResult = await uploadMedicalPhoto(file, "lab_tests", patientId);
  const supabase = createClient();
  const title = customTitle || file.name.replace(/\.[^/.]+$/, "") || "تحليل مختبري إضافي";

  let authenticatedUserId: string | null = null;
  if (supabase && isSupabaseConfigured()) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      authenticatedUserId = authData?.user?.id || null;
    } catch (e) {
      // silent
    }

    const { data: attData } = await supabase
      .from("medical_attachments")
      .insert({
        patient_id: patientId,
        visit_id: visitId,
        attachment_type: "lab_test",
        title: title,
        storage_path: uploadResult.path,
        file_name: file.name,
        file_type: file.type || "image/jpeg",
        file_size_bytes: file.size,
        uploaded_by: authenticatedUserId,
      })
      .select()
      .single();

    return {
      id: attData?.id || `lab-${Date.now()}`,
      title: title,
      type: "lab_test",
      date: new Date().toISOString().split("T")[0],
      notes: `تم الرفع (${(file.size / 1024).toFixed(0)} KB)`,
      imageUrl: uploadResult.url,
    };
  }

  return {
    id: `lab-${Date.now()}`,
    title: title,
    type: "lab_test",
    date: new Date().toISOString().split("T")[0],
    notes: `تم الرفع (${(file.size / 1024).toFixed(0)} KB)`,
    imageUrl: uploadResult.url,
  };
}

/**
 * Save doctor clinical examination, diagnosis, and complete visit atomically
 */
export async function saveDoctorDiagnosis(input: SaveDiagnosisInput): Promise<void> {
  if (!input.diagnosisText || !input.diagnosisText.trim()) {
    throw new Error("التشخيص النهائي مطلوب لاعتماد الزيارة");
  }

  const followUpValidation = validateFollowUpDate(input.followUpDate);
  if (!followUpValidation.isValid) {
    throw new Error(followUpValidation.error);
  }

  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    // Local In-Memory Mock Fallback for offline/demo mode
    return;
  }

  // Retrieve authenticated doctor ID
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) {
    throw new Error("غير مصرح: يجب تسجيل الدخول لاعتماد التشخيص");
  }

  // Execute atomic transactional RPC function exclusively
  const { error: rpcError } = await supabase.rpc(
    "finalize_doctor_diagnosis",
    {
      p_visit_id: input.visitId,
      p_patient_id: input.patientId,
      p_symptoms: input.symptoms || null,
      p_present_illness_history: input.presentIllnessHistory || null,
      p_clinical_examination: input.clinicalExamination || null,
      p_diagnosis_text: input.diagnosisText.trim(),
      p_recommendations: input.recommendations || null,
      p_doctor_notes: input.doctorNotes || null,
      p_follow_up_date: input.followUpDate || null,
    }
  );

  if (rpcError) {
    throw new Error(rpcError.message || "فشل اعتماد التشخيص الطبي");
  }
}

/**
 * Upload and attach prescription photo taken by secretary after doctor visit
 */
export async function attachPrescriptionPhoto(
  visitId: string,
  patientId: string,
  file: File,
  notes?: string
): Promise<MedicalPhoto> {
  const uploadResult = await uploadMedicalPhoto(file, "prescriptions", patientId);
  const supabase = createClient();

  let authenticatedUserId: string | null = null;
  if (supabase && isSupabaseConfigured()) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      authenticatedUserId = authData?.user?.id || null;
    } catch (e) {
      // silent
    }

    const { data: attData } = await supabase
      .from("medical_attachments")
      .insert({
        patient_id: patientId,
        visit_id: visitId,
        attachment_type: "current_visit_prescription",
        title: "صورة وصفة الطبيب",
        notes: notes || "وصفة معتمدة",
        storage_path: uploadResult.path,
        file_name: file.name,
        file_type: file.type || "image/jpeg",
        file_size_bytes: file.size,
        uploaded_by: authenticatedUserId,
      })
      .select()
      .single();

    return {
      id: attData?.id || `rx-${Date.now()}`,
      title: "صورة وصفة الطبيب",
      type: "prescription",
      date: new Date().toISOString().split("T")[0],
      notes: notes || "وصفة معتمدة",
      imageUrl: uploadResult.url,
    };
  }

  return {
    id: `rx-${Date.now()}`,
    title: "صورة وصفة الطبيب",
    type: "prescription",
    date: new Date().toISOString().split("T")[0],
    notes: notes || "وصفة معتمدة",
    imageUrl: uploadResult.url,
  };
}


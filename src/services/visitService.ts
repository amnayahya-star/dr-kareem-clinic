import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { VisitRecord, MedicalPhoto } from "@/lib/mock-data/patients";
import { uploadMedicalPhoto, STORAGE_BUCKET_NAME } from "./storageService";

export interface CreateVisitInput {
  patientId: string;
  weightKg?: number;
  heightCm?: number;
  temperatureC?: number;
  bloodPressure?: string;
  oxygenSaturation?: number;
  chiefComplaint?: string;
  labPhotoFiles?: File[];
}

export interface SaveDiagnosisInput {
  visitId: string;
  patientId: string;
  symptoms?: string;
  clinicalExamination?: string;
  diagnosisText: string;
  recommendations?: string;
  doctorNotes?: string;
}

/**
 * Create a new visit with vital signs and attached lab test photos
 */
export async function createVisitRecord(input: CreateVisitInput): Promise<VisitRecord> {
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

  // 1. Insert Visit row
  const { data: visitData, error: visitError } = await supabase
    .from("visits")
    .insert({
      patient_id: input.patientId,
      status: "waiting",
      chief_complaint: input.chiefComplaint,
    })
    .select()
    .single();

  if (visitError) {
    throw new Error(`فشل إنشاء الزيارة: ${visitError.message}`);
  }

  // 2. Insert Measurements
  const { error: measurementsError } = await supabase
    .from("measurements")
    .insert({
      visit_id: visitData.id,
      patient_id: input.patientId,
      weight_kg: input.weightKg,
      height_cm: input.heightCm,
      temperature_c: input.temperatureC,
      blood_pressure: input.bloodPressure,
      oxygen_saturation: input.oxygenSaturation,
    });

  if (measurementsError) {
    console.warn("Measurements insert error:", measurementsError.message);
  }

  // 3. Upload and attach multiple lab photos if present
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
            visit_id: visitData.id,
            attachment_type: "lab_test",
            title: file.name.replace(/\.[^/.]+$/, "") || `تحليل مختبري ${i + 1}`,
            storage_path: uploadResult.path,
            file_name: file.name,
            file_type: file.type || "image/jpeg",
            file_size_bytes: file.size,
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
    id: visitData.id,
    patientId: input.patientId,
    date: visitData.visit_date?.split("T")[0] || new Date().toISOString().split("T")[0],
    chiefComplaint: input.chiefComplaint,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    temperatureC: input.temperatureC,
    bloodPressure: input.bloodPressure,
    oxygenSaturation: input.oxygenSaturation,
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

  if (supabase && isSupabaseConfigured()) {
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
 * Save doctor clinical examination, diagnosis, and complete visit
 */
export async function saveDoctorDiagnosis(input: SaveDiagnosisInput): Promise<void> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    return;
  }

  // 1. Upsert Diagnosis with onConflict on visit_id
  const { error: diagError } = await supabase
    .from("diagnoses")
    .upsert(
      {
        visit_id: input.visitId,
        patient_id: input.patientId,
        symptoms: input.symptoms,
        clinical_examination: input.clinicalExamination,
        diagnosis_text: input.diagnosisText,
        recommendations: input.recommendations,
        doctor_notes: input.doctorNotes,
      },
      { onConflict: "visit_id" }
    );

  if (diagError) {
    throw new Error(`فشل حفظ التشخيص: ${diagError.message}`);
  }

  // 2. Mark Visit as Completed
  await supabase
    .from("visits")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.visitId);
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

  if (supabase && isSupabaseConfigured()) {
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

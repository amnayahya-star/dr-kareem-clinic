import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export const STORAGE_BUCKET_NAME = "medical-photos";

export interface UploadPhotoResult {
  url: string;
  path: string;
  sizeBytes: number;
}

/**
 * Upload a medical photo (lab test, prescription, xray) to Supabase Storage
 */
export async function uploadMedicalPhoto(
  file: File,
  folder: "lab_tests" | "prescriptions" | "xrays" = "lab_tests",
  patientId?: string
): Promise<UploadPhotoResult> {
  const supabase = createClient();

  // If Supabase is not configured or offline, use local object URL fallback
  if (!supabase || !isSupabaseConfigured()) {
    const localUrl = URL.createObjectURL(file);
    return {
      url: localUrl,
      path: `local/${file.name}`,
      sizeBytes: file.size,
    };
  }

  const timestamp = Date.now();
  const fileExt = file.name.split(".").pop() || "jpg";
  const cleanPatientId = patientId || "general";
  const filePath = `${folder}/${cleanPatientId}/${timestamp}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET_NAME)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.warn("Storage upload warning, falling back to local preview:", error.message);
    return {
      url: URL.createObjectURL(file),
      path: filePath,
      sizeBytes: file.size,
    };
  }

  const { data: publicUrlData } = supabase.storage
    .from(STORAGE_BUCKET_NAME)
    .getPublicUrl(filePath);

  return {
    url: publicUrlData.publicUrl,
    path: filePath,
    sizeBytes: file.size,
  };
}

import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export const STORAGE_BUCKET_NAME = "medical-photos";

export interface UploadPhotoResult {
  url: string;
  path: string;
  sizeBytes: number;
}

/**
 * Generate an authenticated signed URL for a private medical photo
 */
export async function getSignedPhotoUrl(
  storagePath: string,
  expiresInSeconds: number = 3600
): Promise<string | null> {
  if (!storagePath) return null;

  // If path is a blob or inline data preview URL
  if (storagePath.startsWith("blob:") || storagePath.startsWith("data:")) {
    return storagePath;
  }

  // Extract relative storage path if a legacy public URL was passed
  let cleanPath = storagePath;
  if (cleanPath.includes("/medical-photos/")) {
    cleanPath = cleanPath.split("/medical-photos/")[1] || cleanPath;
  } else if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
    // External generic URL (e.g. placeholder images)
    return cleanPath;
  }

  const supabase = createClient();
  if (!supabase || !isSupabaseConfigured()) {
    return null;
  }

  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .createSignedUrl(cleanPath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      console.warn("Failed to generate signed URL for path:", cleanPath, error?.message);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error("Error generating signed photo URL:", err);
    return null;
  }
}

/**
 * Upload a medical photo (lab test, prescription, xray) to Supabase Storage
 * and return an authenticated signed URL and object path
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

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET_NAME)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.warn("Storage upload warning, falling back to local preview:", uploadError.message);
    return {
      url: URL.createObjectURL(file),
      path: filePath,
      sizeBytes: file.size,
    };
  }

  // Create an authenticated signed URL for private bucket viewing
  const signedUrl = await getSignedPhotoUrl(filePath, 3600);

  return {
    url: signedUrl || filePath,
    path: filePath,
    sizeBytes: file.size,
  };
}

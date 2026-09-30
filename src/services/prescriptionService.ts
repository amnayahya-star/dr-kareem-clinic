import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  Prescription,
  PrescriptionItem,
  PrescriptionStatus,
  DosageForm,
  CanonicalDosageForm,
  CANONICAL_DOSAGE_FORMS,
  DrugLabel,
} from "@/types/database";
import { MOCK_VISITS } from "@/lib/mock-data/patients";

/**
 * التحقق من صحة الشكل الدوائي ومواءمته مع قيم enum قاعدة البيانات الصارمة (public.dosage_form_type)
 * يمنع تماماً إرسال أي قيمة غير صالحة مثل "ointment_cream" إلى PostgreSQL
 */
export function normalizeAndValidateDosageForm(rawForm?: string | null): CanonicalDosageForm {
  if (!rawForm || typeof rawForm !== "string") return "other";
  const trimmed = rawForm.trim().toLowerCase();

  // Canonical exact match:
  if ((CANONICAL_DOSAGE_FORMS as readonly string[]).includes(trimmed)) {
    return trimmed as CanonicalDosageForm;
  }

  // Legacy mappings:
  if (trimmed === "tablets") return "tablet";
  if (trimmed === "capsules") return "capsule";
  if (trimmed === "injections") return "injection";
  if (trimmed === "ointment_cream") return "cream";
  if (trimmed === "inhaler_spray") return "inhaler";
  if (trimmed === "drop") return "drops";

  // Keyword matching:
  if (trimmed.includes("cream")) return "cream";
  if (trimmed.includes("ointment")) return "ointment";
  if (trimmed.includes("tablet")) return "tablet";
  if (trimmed.includes("capsule")) return "capsule";
  if (trimmed.includes("syrup")) return "syrup";
  if (trimmed.includes("suspension")) return "suspension";
  if (trimmed.includes("drop")) return "drops";
  if (trimmed.includes("suppository")) return "suppository";
  if (trimmed.includes("inject")) return "injection";
  if (trimmed.includes("spray")) return "spray";
  if (trimmed.includes("inhal")) return "inhaler";
  if (trimmed.includes("sachet")) return "sachet";

  return "other";
}

export interface PrescriptionItemInput {
  id?: string;
  catalog_product_id?: string | null;
  is_custom_medication?: boolean;
  medication_name: string;
  active_ingredient?: string | null;
  strength?: string | null;
  dosage_form?: DosageForm | null;
  dose?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  quantity?: string | null;
  instructions?: string | null;
  display_order?: number;
}

export interface CreatePrescriptionInput {
  visit_id: string;
  patient_id: string;
  diagnosis_id?: string | null;
  general_instructions?: string | null;
  items?: PrescriptionItemInput[];
}

export interface UpdatePrescriptionInput {
  general_instructions?: string | null;
  diagnosis_id?: string | null;
}

export interface AddPrescriptionItemInput {
  prescription_id: string;
  catalog_product_id?: string | null;
  is_custom_medication?: boolean;
  medication_name: string;
  active_ingredient?: string | null;
  strength?: string | null;
  dosage_form?: DosageForm | null;
  dose?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  quantity?: string | null;
  instructions?: string | null;
  display_order?: number;
}

export interface UpdatePrescriptionItemInput {
  catalog_product_id?: string | null;
  is_custom_medication?: boolean;
  medication_name?: string;
  active_ingredient?: string | null;
  strength?: string | null;
  dosage_form?: DosageForm;
  dose?: string | null;
  route?: string | null;
  frequency?: string;
  duration?: string;
  quantity?: string | null;
  instructions?: string | null;
  display_order?: number;
}

export interface SavePrescriptionWithItemsInput {
  prescription_id?: string;
  visit_id: string;
  patient_id: string;
  diagnosis_id?: string | null;
  general_instructions?: string | null;
  items: PrescriptionItemInput[];
  action: "draft" | "issue";
}

// Validation Helpers
export function validatePrescriptionItemInput(item: Partial<PrescriptionItemInput>): { isValid: boolean; error?: string } {
  if (!item.medication_name || !item.medication_name.trim()) {
    return { isValid: false, error: "اسم الدواء مطلوب ولا يمكن تركه فارغاً" };
  }
  if (item.dose !== undefined && item.dose !== null && !item.dose.trim()) {
    return { isValid: false, error: "الجرعة مطلوبة" };
  }
  if (item.frequency !== undefined && item.frequency !== null && !item.frequency.trim()) {
    return { isValid: false, error: "تكرار الجرعة مطلوب" };
  }
  if (item.duration !== undefined && item.duration !== null && !item.duration.trim()) {
    return { isValid: false, error: "مدة العلاج مطلوبة" };
  }
  return { isValid: true };
}

export function validatePrescriptionForIssuing(items: PrescriptionItemInput[]): { isValid: boolean; error?: string } {
  if (!items || items.length === 0) {
    return { isValid: false, error: "لا يمكن إصدار وصفة طبية فارغة. يرجى إضافة دواء واحد على الأقل" };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.medication_name || !item.medication_name.trim()) {
      return { isValid: false, error: `البند رقم ${i + 1}: اسم الدواء مطلوب` };
    }
    if (!item.dosage_form) {
      return { isValid: false, error: `البند رقم ${i + 1} (${item.medication_name}): الشكل الدوائي مطلوب` };
    }
    if (!item.frequency || !item.frequency.trim()) {
      return { isValid: false, error: `البند رقم ${i + 1} (${item.medication_name}): تكرار الجرعة مطلوب` };
    }
    if (!item.duration || !item.duration.trim()) {
      return { isValid: false, error: `البند رقم ${i + 1} (${item.medication_name}): مدة العلاج مطلوبة` };
    }
  }

  return { isValid: true };
}

/**
 * التحقق من أن جميع الأشكال الدوائية في قائمة البنود صالحة ومتوافقة مع enum قاعدة البيانات
 */
export function validatePrescriptionDosageForms(items: PrescriptionItemInput[]): { isValid: boolean; error?: string } {
  if (!items || items.length === 0) return { isValid: true };
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.dosage_form) {
      const normalized = normalizeAndValidateDosageForm(item.dosage_form);
      if (!(CANONICAL_DOSAGE_FORMS as readonly string[]).includes(normalized)) {
        return {
          isValid: false,
          error: `البند رقم ${i + 1} (${item.medication_name || "بدون اسم"}): الشكل الدوائي "${item.dosage_form}" غير صالح لقاعدة البيانات`,
        };
      }
    }
  }
  return { isValid: true };
}

// In-Memory Mock Store for Offline/Demo Mode
const IN_MEMORY_PRESCRIPTIONS: Map<string, Prescription> = new Map();

// Initialize in-memory store from MOCK_VISITS
if (MOCK_VISITS[0]?.prescription) {
  IN_MEMORY_PRESCRIPTIONS.set(MOCK_VISITS[0].prescription.id, {
    ...MOCK_VISITS[0].prescription,
    status: (MOCK_VISITS[0].prescription.status as PrescriptionStatus) || "issued",
  });
}

/**
 * Resets in-memory prescriptions store for testing purposes
 */
export function _resetInMemoryPrescriptions(): void {
  IN_MEMORY_PRESCRIPTIONS.clear();
  if (MOCK_VISITS[0]?.prescription) {
    IN_MEMORY_PRESCRIPTIONS.set(MOCK_VISITS[0].prescription.id, {
      ...MOCK_VISITS[0].prescription,
      status: (MOCK_VISITS[0].prescription.status as PrescriptionStatus) || "issued",
    });
  }
}

function mapSupabasePrescriptionRow(row: any): Prescription {
  const items: PrescriptionItem[] = (row.prescription_items || [])
    .map((item: any) => ({
      id: item.id,
      prescription_id: item.prescription_id,
      catalog_product_id: item.catalog_product_id || null,
      is_custom_medication: item.is_custom_medication !== undefined ? item.is_custom_medication : (item.catalog_product_id ? false : true),
      medication_name: item.medication_name,
      active_ingredient: item.active_ingredient || null,
      strength: item.strength || null,
      dosage_form: item.dosage_form || null,
      dose: item.dose || null,
      route: item.route || null,
      frequency: item.frequency || null,
      duration: item.duration || null,
      quantity: item.quantity || null,
      instructions: item.instructions || null,
      display_order: item.display_order ?? item.sort_order ?? 0,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }))
    .sort((a: PrescriptionItem, b: PrescriptionItem) => a.display_order - b.display_order);

  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const doctorName = profile?.full_name || undefined;

  return {
    id: row.id,
    visit_id: row.visit_id,
    patient_id: row.patient_id,
    diagnosis_id: row.diagnosis_id || null,
    prescribed_by: row.prescribed_by || row.doctor_id || null,
    status: (row.status as PrescriptionStatus) || (row.is_approved ? "issued" : "draft"),
    revision_number: row.revision_number ? Number(row.revision_number) : 1,
    original_prescription_id: row.original_prescription_id || null,
    replaces_prescription_id: row.replaces_prescription_id || null,
    superseded_at: row.superseded_at || null,
    superseded_by: row.superseded_by || null,
    revision_reason: row.revision_reason || null,
    general_instructions: row.general_instructions || null,
    issued_at: row.issued_at || row.approved_at || null,
    cancellation_reason: row.cancellation_reason || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    items,
    doctor_name: doctorName,
  };
}

/**
 * 1. Create a new prescription draft
 */
export async function createPrescription(input: CreatePrescriptionInput): Promise<Prescription> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const rxId = `rx-${Date.now()}`;
    const items: PrescriptionItem[] = (input.items || []).map((it, idx) => ({
      id: it.id || `rxi-${Date.now()}-${idx}`,
      prescription_id: rxId,
      catalog_product_id: it.catalog_product_id || null,
      is_custom_medication: it.is_custom_medication !== undefined ? it.is_custom_medication : (it.catalog_product_id ? false : true),
      medication_name: it.medication_name.trim(),
      active_ingredient: it.active_ingredient?.trim() || null,
      strength: it.strength?.trim() || null,
      dosage_form: it.dosage_form ? normalizeAndValidateDosageForm(it.dosage_form) : ("other" as any),
      dose: it.dose?.trim() || null,
      route: it.route?.trim() || null,
      frequency: it.frequency ? it.frequency.trim() : null as any,
      duration: it.duration ? it.duration.trim() : null as any,
      quantity: it.quantity?.trim() || null,
      instructions: it.instructions?.trim() || null,
      display_order: it.display_order ?? idx + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const newRx: Prescription = {
      id: rxId,
      visit_id: input.visit_id,
      patient_id: input.patient_id,
      diagnosis_id: input.diagnosis_id || null,
      status: "draft",
      general_instructions: input.general_instructions?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items,
    };
    IN_MEMORY_PRESCRIPTIONS.set(rxId, newRx);
    return newRx;
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) {
    throw new Error("غير مصرح: يجب تسجيل الدخول لإنشاء الوصفة الطبية");
  }

  // Use atomic save_electronic_prescription RPC function
  const { data: rpcRxId, error: rpcError } = await supabase.rpc("save_electronic_prescription", {
    p_visit_id: input.visit_id,
    p_patient_id: input.patient_id,
    p_diagnosis_id: input.diagnosis_id || null,
    p_general_instructions: input.general_instructions?.trim() || null,
    p_items: (input.items || []).map((it, idx) => ({
      catalog_product_id: it.catalog_product_id || null,
      is_custom_medication: it.is_custom_medication !== undefined ? it.is_custom_medication : (it.catalog_product_id ? false : true),
      medication_name: it.medication_name.trim(),
      active_ingredient: it.active_ingredient?.trim() || null,
      strength: it.strength?.trim() || null,
      dosage_form: it.dosage_form ? normalizeAndValidateDosageForm(it.dosage_form) : null,
      dose: it.dose?.trim() || null,
      route: it.route?.trim() || null,
      frequency: it.frequency ? it.frequency.trim() : null,
      duration: it.duration ? it.duration.trim() : null,
      quantity: it.quantity?.trim() || null,
      instructions: it.instructions?.trim() || null,
      display_order: it.display_order ?? idx + 1,
    })),
    p_action: "draft",
  });

  if (rpcError || !rpcRxId) {
    throw new Error(rpcError?.message || "فشل إنشاء الوصفة الطبية في قاعدة البيانات");
  }

  const created = await fetchPrescriptionByVisitId(input.visit_id);
  if (!created) {
    throw new Error("حدث خطأ أثناء استرجاع بيانات الوصفة المنشأة");
  }
  return created;
}

/**
 * 2. Update prescription header metadata (instructions / diagnosis)
 */
export async function updatePrescription(
  prescriptionId: string,
  input: UpdatePrescriptionInput
): Promise<Prescription> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const existing = IN_MEMORY_PRESCRIPTIONS.get(prescriptionId);
    if (!existing) {
      throw new Error("لم يتم العثور على الوصفة الطبية");
    }
    if (existing.status !== "draft") {
      throw new Error("لا يمكن تعديل الوصفة الطبية بعد إصدارها أو إلغائها");
    }

    const updated: Prescription = {
      ...existing,
      general_instructions:
        input.general_instructions !== undefined
          ? input.general_instructions?.trim() || null
          : existing.general_instructions,
      diagnosis_id:
        input.diagnosis_id !== undefined ? input.diagnosis_id || null : existing.diagnosis_id,
      updated_at: new Date().toISOString(),
    };
    IN_MEMORY_PRESCRIPTIONS.set(prescriptionId, updated);
    return updated;
  }

  const { error } = await supabase
    .from("prescriptions")
    .update({
      general_instructions: input.general_instructions?.trim() || null,
      diagnosis_id: input.diagnosis_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", prescriptionId);

  if (error) {
    throw new Error(`فشل تحديث الوصفة الطبية: ${error.message}`);
  }

  const { data: updatedData, error: fetchErr } = await supabase
    .from("prescriptions")
    .select(`
      *,
      profiles:prescribed_by (full_name),
      prescription_items (*)
    `)
    .eq("id", prescriptionId)
    .single();

  if (fetchErr || !updatedData) {
    throw new Error("حدث خطأ أثناء جلب الوصفة المحدثة");
  }

  return mapSupabasePrescriptionRow(updatedData);
}

/**
 * 3. Add a single medication item to a draft prescription
 */
export async function addPrescriptionItem(input: AddPrescriptionItemInput): Promise<PrescriptionItem> {
  const validation = validatePrescriptionItemInput(input);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const rx = IN_MEMORY_PRESCRIPTIONS.get(input.prescription_id);
    if (!rx) {
      throw new Error("لم يتم العثور على الوصفة الطبية");
    }
    if (rx.status !== "draft") {
      throw new Error("لا يمكن إضافة أدوية لوصفة تم إصدارها أو إلغاؤها");
    }

    const newItem: PrescriptionItem = {
      id: `rxi-${Date.now()}`,
      prescription_id: input.prescription_id,
      catalog_product_id: input.catalog_product_id || null,
      is_custom_medication: input.is_custom_medication !== undefined ? input.is_custom_medication : (input.catalog_product_id ? false : true),
      medication_name: input.medication_name.trim(),
      active_ingredient: input.active_ingredient?.trim() || null,
      strength: input.strength?.trim() || null,
      dosage_form: input.dosage_form ? normalizeAndValidateDosageForm(input.dosage_form) : ("other" as any),
      dose: input.dose?.trim() || null,
      route: input.route?.trim() || null,
      frequency: input.frequency ? input.frequency.trim() : null as any,
      duration: input.duration ? input.duration.trim() : null as any,
      quantity: input.quantity?.trim() || null,
      instructions: input.instructions?.trim() || null,
      display_order: input.display_order ?? (rx.items?.length || 0) + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    rx.items = [...(rx.items || []), newItem];
    rx.updated_at = new Date().toISOString();
    return newItem;
  }

  const { data, error } = await supabase
    .from("prescription_items")
    .insert({
      prescription_id: input.prescription_id,
      catalog_product_id: input.catalog_product_id || null,
      is_custom_medication: input.is_custom_medication !== undefined ? input.is_custom_medication : (input.catalog_product_id ? false : true),
      medication_name: input.medication_name.trim(),
      active_ingredient: input.active_ingredient?.trim() || null,
      strength: input.strength?.trim() || null,
      dosage_form: input.dosage_form ? normalizeAndValidateDosageForm(input.dosage_form) : null,
      dose: input.dose?.trim() || null,
      route: input.route?.trim() || null,
      frequency: input.frequency ? input.frequency.trim() : null,
      duration: input.duration ? input.duration.trim() : null,
      quantity: input.quantity?.trim() || null,
      instructions: input.instructions?.trim() || null,
      display_order: input.display_order ?? 0,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`فشل إضافة الدواء: ${error?.message || "خطأ غير معروف"}`);
  }

  return {
    id: data.id,
    prescription_id: data.prescription_id,
    catalog_product_id: data.catalog_product_id || null,
    is_custom_medication: data.is_custom_medication ?? (data.catalog_product_id ? false : true),
    medication_name: data.medication_name,
    active_ingredient: data.active_ingredient || null,
    strength: data.strength || null,
    dosage_form: data.dosage_form,
    dose: data.dose || null,
    route: data.route || null,
    frequency: data.frequency,
    duration: data.duration,
    quantity: data.quantity || null,
    instructions: data.instructions || null,
    display_order: data.display_order,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/**
 * 4. Update an existing medication item in a draft prescription
 */
export async function updatePrescriptionItem(
  itemId: string,
  input: UpdatePrescriptionItemInput
): Promise<PrescriptionItem> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const allRx = Array.from(IN_MEMORY_PRESCRIPTIONS.values());
    for (const rx of allRx) {
      const idx = (rx.items || []).findIndex((it: PrescriptionItem) => it.id === itemId);
      if (idx !== -1) {
        if (rx.status !== "draft") {
          throw new Error("لا يمكن تعديل بنود وصفة تم إصدارها أو إلغاؤها");
        }
        const existing = rx.items![idx];
        const updatedItem: PrescriptionItem = {
          ...existing,
          catalog_product_id: input.catalog_product_id !== undefined ? input.catalog_product_id : existing.catalog_product_id,
          is_custom_medication: input.is_custom_medication !== undefined ? input.is_custom_medication : existing.is_custom_medication,
          medication_name: input.medication_name !== undefined ? input.medication_name.trim() : existing.medication_name,
          active_ingredient: input.active_ingredient !== undefined ? input.active_ingredient?.trim() || null : existing.active_ingredient,
          strength: input.strength !== undefined ? input.strength?.trim() || null : existing.strength,
          dosage_form: input.dosage_form !== undefined ? (input.dosage_form ? normalizeAndValidateDosageForm(input.dosage_form) : ("other" as any)) : existing.dosage_form,
          dose: input.dose !== undefined ? input.dose?.trim() || null : existing.dose,
          route: input.route !== undefined ? input.route?.trim() || null : existing.route,
          frequency: input.frequency !== undefined ? input.frequency.trim() : existing.frequency,
          duration: input.duration !== undefined ? input.duration.trim() : existing.duration,
          quantity: input.quantity !== undefined ? input.quantity?.trim() || null : existing.quantity,
          instructions: input.instructions !== undefined ? input.instructions?.trim() || null : existing.instructions,
          display_order: input.display_order !== undefined ? input.display_order : existing.display_order,
          updated_at: new Date().toISOString(),
        };
        rx.items![idx] = updatedItem;
        rx.updated_at = new Date().toISOString();
        return updatedItem;
      }
    }
    throw new Error("لم يتم العثور على بند الدواء لتعديله");
  }

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (input.catalog_product_id !== undefined) updates.catalog_product_id = input.catalog_product_id || null;
  if (input.is_custom_medication !== undefined) updates.is_custom_medication = input.is_custom_medication;
  if (input.medication_name !== undefined) updates.medication_name = input.medication_name.trim();
  if (input.active_ingredient !== undefined) updates.active_ingredient = input.active_ingredient?.trim() || null;
  if (input.strength !== undefined) updates.strength = input.strength?.trim() || null;
  if (input.dosage_form !== undefined) updates.dosage_form = input.dosage_form ? normalizeAndValidateDosageForm(input.dosage_form) : null;
  if (input.dose !== undefined) updates.dose = input.dose?.trim() || null;
  if (input.route !== undefined) updates.route = input.route?.trim() || null;
  if (input.frequency !== undefined) updates.frequency = input.frequency.trim();
  if (input.duration !== undefined) updates.duration = input.duration.trim();
  if (input.quantity !== undefined) updates.quantity = input.quantity?.trim() || null;
  if (input.instructions !== undefined) updates.instructions = input.instructions?.trim() || null;
  if (input.display_order !== undefined) updates.display_order = input.display_order;

  const { data, error } = await supabase
    .from("prescription_items")
    .update(updates)
    .eq("id", itemId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`فشل تعديل الدواء: ${error?.message || "خطأ غير معروف"}`);
  }

  return {
    id: data.id,
    prescription_id: data.prescription_id,
    catalog_product_id: data.catalog_product_id || null,
    is_custom_medication: data.is_custom_medication ?? (data.catalog_product_id ? false : true),
    medication_name: data.medication_name,
    active_ingredient: data.active_ingredient || null,
    strength: data.strength || null,
    dosage_form: data.dosage_form,
    dose: data.dose || null,
    route: data.route || null,
    frequency: data.frequency,
    duration: data.duration,
    quantity: data.quantity || null,
    instructions: data.instructions || null,
    display_order: data.display_order,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/**
 * 5. Remove a medication item from a draft prescription
 */
export async function removePrescriptionItem(itemId: string): Promise<void> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const allRx = Array.from(IN_MEMORY_PRESCRIPTIONS.values());
    for (const rx of allRx) {
      const idx = (rx.items || []).findIndex((it: PrescriptionItem) => it.id === itemId);
      if (idx !== -1) {
        if (rx.status !== "draft") {
          throw new Error("لا يمكن حذف أدوية من وصفة تم إصدارها أو إلغاؤها");
        }
        rx.items!.splice(idx, 1);
        rx.updated_at = new Date().toISOString();
        return;
      }
    }
    return;
  }

  const { error } = await supabase.from("prescription_items").delete().eq("id", itemId);

  if (error) {
    throw new Error(`فشل حذف الدواء: ${error.message}`);
  }
}

export interface FetchPrescriptionOptions {
  prescriptionId?: string;
  forSecretary?: boolean;
}

/**
 * 6. Fetch prescription by visit ID (supports role-aware resolution)
 * - For doctor workstation: prioritizes active draft (for ongoing editing), then active issued, then latest revision.
 * - For secretary print page: prioritizes active issued prescription; NEVER returns a draft.
 */
export async function fetchPrescriptionByVisitId(
  visitId: string,
  prescriptionIdOrOptions?: string | FetchPrescriptionOptions
): Promise<Prescription | null> {
  const options: FetchPrescriptionOptions =
    typeof prescriptionIdOrOptions === "string"
      ? { prescriptionId: prescriptionIdOrOptions }
      : prescriptionIdOrOptions || {};

  const { prescriptionId, forSecretary } = options;

  if (prescriptionId) {
    const rx = await fetchPrescriptionById(prescriptionId);
    if (!rx) return null;
    // Security check: ensure prescription belongs to the requested visit
    if (rx.visit_id !== visitId) {
      console.warn(`Prescription ${prescriptionId} belongs to visit ${rx.visit_id}, not requested visit ${visitId}`);
      return null;
    }
    if (forSecretary && rx.status === "draft") {
      return null; // Secretary is strictly forbidden from viewing draft prescriptions
    }
    return rx;
  }

  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const allRx = Array.from(IN_MEMORY_PRESCRIPTIONS.values());
    const matched = allRx.filter((rx) => rx.visit_id === visitId);
    if (matched.length > 0) {
      if (forSecretary) {
        // Secretary must only see the active issued prescription (or superseded if historical)
        const activeIssued = matched.find((r) => r.status === "issued");
        if (activeIssued) return activeIssued;
        const superseded = matched
          .filter((r) => r.status === "superseded")
          .sort((a, b) => (b.revision_number || 1) - (a.revision_number || 1))[0];
        return superseded || null;
      }

      // Prioritize active draft (for doctor editing), then active issued, then latest revision
      const activeDraft = matched.find((r) => r.status === "draft");
      if (activeDraft) return activeDraft;
      const activeIssued = matched.find((r) => r.status === "issued");
      if (activeIssued) return activeIssued;
      const nonCancelled = matched.filter((r) => r.status !== "cancelled");
      if (nonCancelled.length > 0) {
        return nonCancelled.sort((a, b) => (b.revision_number || 1) - (a.revision_number || 1))[0];
      }
      return matched.sort((a, b) => (b.revision_number || 1) - (a.revision_number || 1))[0];
    }
    const mockVisit = MOCK_VISITS.find((v) => v.id === visitId);
    if (mockVisit?.prescription) {
      const mockStatus = (mockVisit.prescription.status as PrescriptionStatus) || "issued";
      if (forSecretary && mockStatus === "draft") {
        return null;
      }
      return {
        ...mockVisit.prescription,
        status: mockStatus,
      };
    }
    return null;
  }

  let query: any = supabase
    .from("prescriptions")
    .select(`
      *,
      profiles:prescribed_by (full_name),
      prescription_items (*)
    `)
    .eq("visit_id", visitId);

  if (typeof query.order === "function") {
    query = query.order("revision_number", { ascending: false });
  }

  let result: any;
  if (typeof query.maybeSingle === "function" && typeof query.order !== "function") {
    result = await query.maybeSingle();
  } else {
    result = await query;
  }

  const { data, error } = result || {};

  if (error) {
    throw new Error(`فشل جلب الوصفة الطبية: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) return null;

  if (forSecretary) {
    // Secretary only accesses issued prescription (or historical superseded)
    const activeIssued = rows.find((r: any) => r.status === "issued");
    if (activeIssued) return mapSupabasePrescriptionRow(activeIssued);

    const superseded = rows.find((r: any) => r.status === "superseded");
    if (superseded) return mapSupabasePrescriptionRow(superseded);

    return null;
  }

  // Doctor workstation: prioritize active draft, then issued, then latest non-cancelled row
  const activeDraft = rows.find((r: any) => r.status === "draft");
  if (activeDraft) return mapSupabasePrescriptionRow(activeDraft);

  const activeIssued = rows.find((r: any) => r.status === "issued");
  if (activeIssued) return mapSupabasePrescriptionRow(activeIssued);

  const nonCancelled = rows.filter((r: any) => r.status !== "cancelled");
  if (nonCancelled.length > 0) {
    return mapSupabasePrescriptionRow(nonCancelled[0]);
  }

  return mapSupabasePrescriptionRow(rows[0]);
}

/**
 * 6.1 Fetch prescription by prescription ID
 */
export async function fetchPrescriptionById(prescriptionId: string): Promise<Prescription | null> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const rx = IN_MEMORY_PRESCRIPTIONS.get(prescriptionId);
    return rx || null;
  }

  const { data, error } = await supabase
    .from("prescriptions")
    .select(`
      *,
      profiles:prescribed_by (full_name),
      prescription_items (*)
    `)
    .eq("id", prescriptionId)
    .maybeSingle();

  if (error) {
    throw new Error(`فشل جلب الوصفة الطبية: ${error.message}`);
  }

  if (!data) return null;
  return mapSupabasePrescriptionRow(data);
}

/**
 * 6.2 Fetch all revisions for a specific visit
 */
export async function fetchPrescriptionRevisions(visitId: string): Promise<Prescription[]> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const allRx = Array.from(IN_MEMORY_PRESCRIPTIONS.values());
    const matched = allRx.filter((rx) => rx.visit_id === visitId);
    return matched.sort((a, b) => (a.revision_number || 1) - (b.revision_number || 1));
  }

  const { data, error } = await supabase
    .from("prescriptions")
    .select(`
      *,
      profiles:prescribed_by (full_name),
      prescription_items (*)
    `)
    .eq("visit_id", visitId)
    .order("revision_number", { ascending: true });

  if (error) {
    throw new Error(`فشل جلب سجل نسخ الوصفة: ${error.message}`);
  }

  if (!data) return [];
  return data.map(mapSupabasePrescriptionRow);
}

/**
 * 6.3 Create a new prescription revision from an issued prescription
 */
export async function createPrescriptionRevision(prescriptionId: string, reason: string): Promise<Prescription> {
  const cleanReason = reason?.trim() || "";
  if (cleanReason.length < 3) {
    throw new Error("سبب التعديل إلزامي ويجب ألا يقل عن 3 أحرف");
  }

  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const existing = IN_MEMORY_PRESCRIPTIONS.get(prescriptionId);
    if (!existing) {
      throw new Error("لم يتم العثور على الوصفة الطبية الأصلية");
    }
    if (existing.status !== "issued") {
      throw new Error("لا يمكن تعديل إلا وصفة طبية صادرة ومعتمدة");
    }

    const allRx = Array.from(IN_MEMORY_PRESCRIPTIONS.values());
    const existingDraft = allRx.find((rx) => rx.visit_id === existing.visit_id && rx.status === "draft");
    if (existingDraft) {
      throw new Error("توجد مسودة مراجعة نشطة بالفعل لهذه الوصفة. يرجى إكمالها أو حذفها قبل بدء مراجعة جديدة");
    }

    const nextRev = (existing.revision_number || 1) + 1;
    const newRxId = `rx-rev-${Date.now()}`;
    const copiedItems: PrescriptionItem[] = (existing.items || []).map((it, idx) => ({
      ...it,
      id: `rxi-rev-${Date.now()}-${idx}`,
      prescription_id: newRxId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const newRevision: Prescription = {
      ...existing,
      id: newRxId,
      status: "draft",
      revision_number: nextRev,
      original_prescription_id: existing.original_prescription_id || existing.id,
      replaces_prescription_id: existing.id,
      revision_reason: cleanReason,
      superseded_at: null,
      superseded_by: null,
      issued_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: copiedItems,
    };

    IN_MEMORY_PRESCRIPTIONS.set(newRxId, newRevision);
    return newRevision;
  }

  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user?.id) {
    throw new Error("غير مصرح: يجب تسجيل الدخول لإنشاء مراجعة للوصفة الطبية");
  }

  const { data: newRxId, error: rpcErr } = await supabase.rpc("create_prescription_revision", {
    p_prescription_id: prescriptionId,
    p_reason: cleanReason,
  });

  if (rpcErr || !newRxId) {
    throw new Error(rpcErr?.message || "فشل إنشاء مراجعة للوصفة الطبية");
  }

  const created = await fetchPrescriptionById(newRxId);
  if (!created) {
    throw new Error("حدث خطأ أثناء جلب مسودة المراجعة الجديدة");
  }

  return created;
}

export interface CancelPrescriptionRevisionResult {
  cancelled_prescription_id: string;
  fallback_prescription_id: string | null;
  visit_id: string;
  status: "cancelled";
}

/**
 * 6.4 Cancel a prescription revision draft (Doctor only)
 * Safely cancels a draft revision (revision_number > 1) without deleting medical records or altering the original approved prescription.
 */
export async function cancelPrescriptionRevision(
  prescriptionId: string
): Promise<CancelPrescriptionRevisionResult> {
  if (!prescriptionId || !prescriptionId.trim()) {
    throw new Error("معرف الوصفة الطبية إلزامي لإلغاء مسودة المراجعة");
  }

  const cleanRxId = prescriptionId.trim();
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const rx = IN_MEMORY_PRESCRIPTIONS.get(cleanRxId);
    if (!rx) {
      throw new Error("لم يتم العثور على الوصفة الطبية المحددة");
    }

    if (rx.status !== "draft") {
      if (rx.status === "cancelled") {
        throw new Error("الوصفة الطبية ملغاة بالفعل ولا يمكن إلغاؤها مرة أخرى");
      }
      if (rx.status === "issued") {
        throw new Error("لا يمكن إلغاء وصفة طبية معتمدة وصادرة عبر هذا الإجراء؛ هذا الإجراء مخصص لإلغاء مسودات المراجعة فقط");
      }
      if (rx.status === "superseded") {
        throw new Error("لا يمكن إلغاء وصفة طبية مستبدلة؛ سجل المراجعات التاريخي مقفل نهائياً");
      }
      throw new Error(`لا يمكن إلغاء الوصفة الطبية في حالتها الحالية (الحالة: ${rx.status})`);
    }

    if ((rx.revision_number || 1) <= 1) {
      throw new Error("لا يمكن إلغاء النسخة الأصلية للوصفة الطبية؛ هذا الإجراء مخصص لمسودات المراجعة فقط");
    }

    if (!rx.replaces_prescription_id && !rx.original_prescription_id) {
      throw new Error("لا يمكن إلغاء مسودة غير مرتبطة بوصفة سابقة معتمدة");
    }

    // Determine fallback prescription ID (the active issued prescription for the visit)
    let fallbackId: string | null = null;
    const allRx = Array.from(IN_MEMORY_PRESCRIPTIONS.values());

    if (rx.replaces_prescription_id) {
      const predecessor = IN_MEMORY_PRESCRIPTIONS.get(rx.replaces_prescription_id);
      if (predecessor && predecessor.status === "issued") {
        fallbackId = predecessor.id;
      }
    }

    if (!fallbackId) {
      const issuedRx = allRx.find((r) => r.visit_id === rx.visit_id && r.status === "issued");
      if (issuedRx) {
        fallbackId = issuedRx.id;
      }
    }

    if (!fallbackId) {
      fallbackId = rx.replaces_prescription_id || rx.original_prescription_id || null;
    }

    // Update draft to cancelled status without deleting items
    rx.status = "cancelled";
    rx.cancellation_reason = rx.cancellation_reason || "إلغاء مسودة المراجعة من قبل الطبيب";
    rx.updated_at = new Date().toISOString();
    IN_MEMORY_PRESCRIPTIONS.set(cleanRxId, rx);

    return {
      cancelled_prescription_id: rx.id,
      fallback_prescription_id: fallbackId,
      visit_id: rx.visit_id,
      status: "cancelled",
    };
  }

  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user?.id) {
    throw new Error("غير مصرح: يجب تسجيل الدخول لإلغاء مسودة المراجعة");
  }

  const { data, error: rpcErr } = await supabase.rpc("cancel_prescription_revision", {
    p_prescription_id: cleanRxId,
  });

  if (rpcErr) {
    throw new Error(rpcErr.message || "فشل إلغاء مسودة المراجعة في قاعدة البيانات");
  }

  if (!data) {
    throw new Error("لم يتم استلام استجابة صالحة بعد إلغاء مسودة المراجعة");
  }

  return data as CancelPrescriptionRevisionResult;
}

/**
 * 7. Fetch all prescriptions for a specific patient
 */
export async function fetchPatientPrescriptions(patientId: string): Promise<Prescription[]> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const results: Prescription[] = [];
    const allRx = Array.from(IN_MEMORY_PRESCRIPTIONS.values());
    for (const rx of allRx) {
      if (rx.patient_id === patientId) {
        results.push(rx);
      }
    }
    return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const { data, error } = await supabase
    .from("prescriptions")
    .select(`
      *,
      profiles:prescribed_by (full_name),
      prescription_items (*)
    `)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`فشل جلب سجل وصفات المريض: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  return data.map(mapSupabasePrescriptionRow);
}

/**
 * 8. Issue and finalize an electronic prescription
 */
export async function issuePrescription(prescriptionId: string): Promise<Prescription> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const rx = IN_MEMORY_PRESCRIPTIONS.get(prescriptionId);
    if (!rx) {
      throw new Error("لم يتم العثور على الوصفة الطبية");
    }
    const validation = validatePrescriptionForIssuing(rx.items || []);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    rx.status = "issued";
    rx.issued_at = new Date().toISOString();
    rx.updated_at = new Date().toISOString();
    return rx;
  }

  // Fetch current prescription and verify items exist
  const { data: currentRx, error: fetchErr } = await supabase
    .from("prescriptions")
    .select(`*, prescription_items (*)`)
    .eq("id", prescriptionId)
    .single();

  if (fetchErr || !currentRx) {
    throw new Error("لم يتم العثور على الوصفة الطبية");
  }

  const validation = validatePrescriptionForIssuing(currentRx.prescription_items || []);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const { error: updateErr } = await supabase
    .from("prescriptions")
    .update({
      status: "issued",
      issued_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", prescriptionId);

  if (updateErr) {
    throw new Error(`فشل إصدار الوصفة الطبية: ${updateErr.message}`);
  }

  const { data: updated, error: refreshErr } = await supabase
    .from("prescriptions")
    .select(`
      *,
      profiles:prescribed_by (full_name),
      prescription_items (*)
    `)
    .eq("id", prescriptionId)
    .single();

  if (refreshErr || !updated) {
    throw new Error("حدث خطأ أثناء جلب الوصفة الصادرة");
  }

  return mapSupabasePrescriptionRow(updated);
}

/**
 * 9. Cancel an issued or draft prescription (Doctor only)
 */
export async function cancelPrescription(prescriptionId: string, reason?: string): Promise<Prescription> {
  if (!reason || !reason.trim()) {
    throw new Error("سبب الإلغاء مطلوب لإلغاء الوصفة الطبية");
  }

  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const rx = IN_MEMORY_PRESCRIPTIONS.get(prescriptionId);
    if (!rx) {
      throw new Error("لم يتم العثور على الوصفة الطبية لإلغائها");
    }
    rx.status = "cancelled";
    rx.cancellation_reason = reason.trim();
    rx.updated_at = new Date().toISOString();
    return rx;
  }

  // Execute cancel RPC
  const { error: rpcErr } = await supabase.rpc("cancel_electronic_prescription", {
    p_prescription_id: prescriptionId,
    p_reason: reason?.trim() || null,
  });

  if (rpcErr) {
    throw new Error(`فشل إلغاء الوصفة الطبية: ${rpcErr.message}`);
  }

  const { data: updated, error: refreshErr } = await supabase
    .from("prescriptions")
    .select(`
      *,
      profiles:prescribed_by (full_name),
      prescription_items (*)
    `)
    .eq("id", prescriptionId)
    .single();

  if (refreshErr || !updated) {
    throw new Error("حدث خطأ أثناء جلب الوصفة بعد الإلغاء");
  }

  return mapSupabasePrescriptionRow(updated);
}

/**
 * 10. Atomic Helper: Save and Issue/Draft Prescription with full Items list
 */
export async function savePrescriptionWithItems(input: SavePrescriptionWithItemsInput): Promise<Prescription> {
  if (input.action === "issue") {
    const validation = validatePrescriptionForIssuing(input.items);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }
  }

  // Pre-RPC validation: ensure any provided dosage forms are valid and canonical
  const formValidation = validatePrescriptionDosageForms(input.items);
  if (!formValidation.isValid) {
    throw new Error(formValidation.error);
  }

  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    let targetRx: Prescription | undefined;
    const allRx = Array.from(IN_MEMORY_PRESCRIPTIONS.values());

    if (input.prescription_id) {
      targetRx = IN_MEMORY_PRESCRIPTIONS.get(input.prescription_id);
      if (targetRx && (targetRx.status === "issued" || targetRx.status === "superseded" || targetRx.status === "cancelled")) {
        throw new Error(`لا يمكن حفظ أو تعديل وصفة طبية في حالتها الحالية (الحالة: ${targetRx.status})`);
      }
    } else {
      // Find active draft for visit
      targetRx = allRx.find((rx) => rx.visit_id === input.visit_id && rx.status === "draft");
      if (!targetRx) {
        // If no draft exists, check if an issued prescription already exists for this visit
        const hasIssued = allRx.some((rx) => rx.visit_id === input.visit_id && rx.status === "issued");
        if (hasIssued) {
          throw new Error("توجد وصفة طبية معتمدة مسبقاً لهذه الزيارة. لتعديلها يرجى استخدام خيار تعديل الوصفة لإنشاء مراجعة جديدة");
        }
      }
    }

    const rxId = targetRx?.id || `rx-${Date.now()}`;
    const items: PrescriptionItem[] = input.items.map((it, idx) => ({
      id: it.id || `rxi-${Date.now()}-${idx}`,
      prescription_id: rxId,
      catalog_product_id: it.catalog_product_id || null,
      is_custom_medication: it.is_custom_medication !== undefined ? it.is_custom_medication : (it.catalog_product_id ? false : true),
      medication_name: it.medication_name.trim(),
      active_ingredient: it.active_ingredient?.trim() || null,
      strength: it.strength?.trim() || null,
      dosage_form: it.dosage_form ? normalizeAndValidateDosageForm(it.dosage_form) : ("other" as any),
      dose: it.dose?.trim() || null,
      route: it.route?.trim() || null,
      frequency: it.frequency ? it.frequency.trim() : null as any,
      duration: it.duration ? it.duration.trim() : null as any,
      quantity: it.quantity?.trim() || null,
      instructions: it.instructions?.trim() || null,
      display_order: it.display_order ?? idx + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    if (input.action === "issue" && targetRx?.replaces_prescription_id) {
      // Mark predecessor as superseded in mock store
      const pred = IN_MEMORY_PRESCRIPTIONS.get(targetRx.replaces_prescription_id);
      if (pred) {
        pred.status = "superseded";
        pred.superseded_at = new Date().toISOString();
        pred.superseded_by = rxId;
        pred.updated_at = new Date().toISOString();
        IN_MEMORY_PRESCRIPTIONS.set(pred.id, pred);
      }
    }

    const savedRx: Prescription = {
      id: rxId,
      visit_id: input.visit_id,
      patient_id: input.patient_id,
      diagnosis_id: input.diagnosis_id || null,
      status: input.action === "issue" ? "issued" : "draft",
      revision_number: targetRx?.revision_number || 1,
      original_prescription_id: targetRx?.original_prescription_id || null,
      replaces_prescription_id: targetRx?.replaces_prescription_id || null,
      revision_reason: targetRx?.revision_reason || null,
      superseded_at: null,
      superseded_by: null,
      issued_at: input.action === "issue" ? new Date().toISOString() : null,
      general_instructions: input.general_instructions?.trim() || null,
      created_at: targetRx?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items,
    };

    IN_MEMORY_PRESCRIPTIONS.set(rxId, savedRx);
    return savedRx;
  }

  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user?.id) {
    throw new Error("غير مصرح: يجب تسجيل الدخول لإنشاء أو إصدار الوصفة الطبية");
  }

  const { data: rpcRxId, error: rpcErr } = await supabase.rpc("save_electronic_prescription", {
    p_visit_id: input.visit_id,
    p_patient_id: input.patient_id,
    p_diagnosis_id: input.diagnosis_id || null,
    p_general_instructions: input.general_instructions?.trim() || null,
    p_items: input.items.map((it, idx) => ({
      catalog_product_id: it.catalog_product_id || null,
      is_custom_medication: it.is_custom_medication !== undefined ? it.is_custom_medication : (it.catalog_product_id ? false : true),
      medication_name: it.medication_name.trim(),
      active_ingredient: it.active_ingredient?.trim() || null,
      strength: it.strength?.trim() || null,
      dosage_form: it.dosage_form ? normalizeAndValidateDosageForm(it.dosage_form) : null,
      dose: it.dose?.trim() || null,
      route: it.route?.trim() || null,
      frequency: it.frequency ? it.frequency.trim() : null,
      duration: it.duration ? it.duration.trim() : null,
      quantity: it.quantity?.trim() || null,
      instructions: it.instructions?.trim() || null,
      display_order: it.display_order ?? idx + 1,
    })),
    p_action: input.action,
    p_prescription_id: input.prescription_id || null,
  });

  if (rpcErr || !rpcRxId) {
    throw new Error(rpcErr?.message || "فشل حفظ الوصفة الطبية في قاعدة البيانات");
  }

  const refreshed = await fetchPrescriptionByVisitId(input.visit_id, rpcRxId);
  if (!refreshed) {
    throw new Error("حدث خطأ أثناء جلب الوصفة الطبية بعد الحفظ");
  }
  return refreshed;
}

// Backward compatible aliases and convenience helpers
export const validatePrescriptionItem = (item: Partial<PrescriptionItemInput>): { isValid: boolean; error?: string; errors: string[] } => {
  const res = validatePrescriptionItemInput(item);
  return {
    isValid: res.isValid,
    error: res.error,
    errors: res.error ? [res.error] : [],
  };
};

export async function createPrescriptionDraft(visitId: string, patientId: string): Promise<Prescription> {
  return createPrescription({ visit_id: visitId, patient_id: patientId });
}

export const fetchPrescriptionsByPatientId = fetchPatientPrescriptions;

/**
 * Fetches the official openFDA Drug Label for a given product ID (read-only for doctors).
 */
export async function fetchDrugLabelByProductId(productId: string): Promise<DrugLabel | null> {
  if (!productId || typeof productId !== 'string') return null;
  const supabase = createClient();
  if (!supabase || !isSupabaseConfigured()) {
    return null;
  }
  const { data, error } = await supabase
    .from('drug_labels')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching drug label by product ID:', error.message);
    return null;
  }
  return data as DrugLabel | null;
}




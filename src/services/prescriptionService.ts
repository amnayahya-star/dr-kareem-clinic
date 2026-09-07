import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { Prescription, PrescriptionItem, PrescriptionStatus, DosageForm } from "@/types/database";
import { MOCK_VISITS } from "@/lib/mock-data/patients";

export interface PrescriptionItemInput {
  id?: string;
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

// In-Memory Mock Store for Offline/Demo Mode
const IN_MEMORY_PRESCRIPTIONS: Map<string, Prescription> = new Map();

// Initialize in-memory store from MOCK_VISITS
if (MOCK_VISITS[0]?.prescription) {
  IN_MEMORY_PRESCRIPTIONS.set(MOCK_VISITS[0].prescription.id, {
    ...MOCK_VISITS[0].prescription,
    status: (MOCK_VISITS[0].prescription.status as PrescriptionStatus) || "issued",
  });
}

function mapSupabasePrescriptionRow(row: any): Prescription {
  const items: PrescriptionItem[] = (row.prescription_items || [])
    .map((item: any) => ({
      id: item.id,
      prescription_id: item.prescription_id,
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
      medication_name: it.medication_name.trim(),
      active_ingredient: it.active_ingredient?.trim() || null,
      strength: it.strength?.trim() || null,
      dosage_form: it.dosage_form || null as any,
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
      medication_name: it.medication_name.trim(),
      active_ingredient: it.active_ingredient?.trim() || null,
      strength: it.strength?.trim() || null,
      dosage_form: it.dosage_form || null,
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
      medication_name: input.medication_name.trim(),
      active_ingredient: input.active_ingredient?.trim() || null,
      strength: input.strength?.trim() || null,
      dosage_form: input.dosage_form || null as any,
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
      medication_name: input.medication_name.trim(),
      active_ingredient: input.active_ingredient?.trim() || null,
      strength: input.strength?.trim() || null,
      dosage_form: input.dosage_form || null,
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
          medication_name: input.medication_name !== undefined ? input.medication_name.trim() : existing.medication_name,
          active_ingredient: input.active_ingredient !== undefined ? input.active_ingredient?.trim() || null : existing.active_ingredient,
          strength: input.strength !== undefined ? input.strength?.trim() || null : existing.strength,
          dosage_form: input.dosage_form !== undefined ? input.dosage_form : existing.dosage_form,
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
  if (input.medication_name !== undefined) updates.medication_name = input.medication_name.trim();
  if (input.active_ingredient !== undefined) updates.active_ingredient = input.active_ingredient?.trim() || null;
  if (input.strength !== undefined) updates.strength = input.strength?.trim() || null;
  if (input.dosage_form !== undefined) updates.dosage_form = input.dosage_form;
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

/**
 * 6. Fetch prescription by visit ID
 */
export async function fetchPrescriptionByVisitId(visitId: string): Promise<Prescription | null> {
  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    const allRx = Array.from(IN_MEMORY_PRESCRIPTIONS.values());
    for (const rx of allRx) {
      if (rx.visit_id === visitId) {
        return rx;
      }
    }
    const mockVisit = MOCK_VISITS.find((v) => v.id === visitId);
    if (mockVisit?.prescription) {
      return {
        ...mockVisit.prescription,
        status: (mockVisit.prescription.status as PrescriptionStatus) || "issued",
      };
    }
    return null;
  }

  const { data, error } = await supabase
    .from("prescriptions")
    .select(`
      *,
      profiles:prescribed_by (full_name),
      prescription_items (*)
    `)
    .eq("visit_id", visitId)
    .maybeSingle();

  if (error) {
    throw new Error(`فشل جلب الوصفة الطبية: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapSupabasePrescriptionRow(data);
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

  const supabase = createClient();

  if (!supabase || !isSupabaseConfigured()) {
    let targetRx: Prescription | undefined;
    const allRx = Array.from(IN_MEMORY_PRESCRIPTIONS.values());
    for (const rx of allRx) {
      if (rx.visit_id === input.visit_id) {
        targetRx = rx;
        break;
      }
    }

    const rxId = targetRx?.id || `rx-${Date.now()}`;
    const items: PrescriptionItem[] = input.items.map((it, idx) => ({
      id: it.id || `rxi-${Date.now()}-${idx}`,
      prescription_id: rxId,
      medication_name: it.medication_name.trim(),
      active_ingredient: it.active_ingredient?.trim() || null,
      strength: it.strength?.trim() || null,
      dosage_form: it.dosage_form || null as any,
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

    const savedRx: Prescription = {
      id: rxId,
      visit_id: input.visit_id,
      patient_id: input.patient_id,
      diagnosis_id: input.diagnosis_id || null,
      status: input.action === "issue" ? "issued" : "draft",
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
      medication_name: it.medication_name.trim(),
      active_ingredient: it.active_ingredient?.trim() || null,
      strength: it.strength?.trim() || null,
      dosage_form: it.dosage_form || null,
      dose: it.dose?.trim() || null,
      route: it.route?.trim() || null,
      frequency: it.frequency ? it.frequency.trim() : null,
      duration: it.duration ? it.duration.trim() : null,
      quantity: it.quantity?.trim() || null,
      instructions: it.instructions?.trim() || null,
      display_order: it.display_order ?? idx + 1,
    })),
    p_action: input.action,
  });

  if (rpcErr || !rpcRxId) {
    throw new Error(rpcErr?.message || "فشل حفظ الوصفة الطبية في قاعدة البيانات");
  }

  const refreshed = await fetchPrescriptionByVisitId(input.visit_id);
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




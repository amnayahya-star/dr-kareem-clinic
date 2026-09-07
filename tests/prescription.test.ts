import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validatePrescriptionItem,
  createPrescriptionDraft,
  addPrescriptionItem,
  updatePrescriptionItem,
  removePrescriptionItem,
  issuePrescription,
  cancelPrescription,
  fetchPrescriptionByVisitId,
  fetchPrescriptionsByPatientId,
  savePrescriptionWithItems,
} from '../src/services/prescriptionService';
import { PrescriptionItem, PrescriptionStatus } from '../src/types/database';
import fs from 'fs';
import path from 'path';

// Mock Supabase client
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();
const mockIsSupabaseConfigured = vi.fn().mockReturnValue(true);

const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();

vi.mock('../src/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
    rpc: mockRpc,
    from: mockFrom,
  }),
  isSupabaseConfigured: () => mockIsSupabaseConfigured(),
}));

describe('Electronic Prescription Service (نظام الوصفة الطبية الإلكترونية)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'doctor-user-777' } },
      error: null,
    });
    const sampleRx = {
      id: 'rx-mock-1',
      visit_id: 'v-100',
      patient_id: 'p-100',
      status: 'issued',
      prescription_items: [
        { id: 'i-1', medication_name: 'Amoxicillin', dosage_form: 'syrup', dose: '5ml', frequency: '3x', duration: '5d' },
      ],
    };
    mockSingle.mockResolvedValue({ data: sampleRx, error: null });
    mockMaybeSingle.mockResolvedValue({ data: sampleRx, error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle, maybeSingle: mockMaybeSingle, select: mockSelect, update: mockUpdate });
    mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle, maybeSingle: mockMaybeSingle });
    mockFrom.mockReturnValue({ select: mockSelect, insert: vi.fn(), update: mockUpdate, delete: vi.fn(), eq: mockEq });
  });

  describe('Prescription Item Validation (validatePrescriptionItem)', () => {
    it('accepts valid prescription item with all required clinical fields', () => {
      const validItem: Partial<PrescriptionItem> = {
        medication_name: 'Amoxicillin Syrup',
        dosage_form: 'syrup',
        dose: '5 ml',
        frequency: '3 times daily (كل 8 ساعات)',
        duration: '7 days (لمدة 7 أيام)',
        strength: '250mg/5ml',
        route: 'Oral (فموي)',
        instructions: 'After meals (بعد الطعام)',
      };

      const result = validatePrescriptionItem(validItem);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('rejects item if medication name is missing or empty', () => {
      const item: Partial<PrescriptionItem> = {
        medication_name: '   ',
        dosage_form: 'syrup',
        dose: '5 ml',
        frequency: 'كل 8 ساعات',
        duration: '5 أيام',
      };

      const result = validatePrescriptionItem(item);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('اسم الدواء مطلوب');
    });

    it('rejects item if dose is missing', () => {
      const item: Partial<PrescriptionItem> = {
        medication_name: 'Paracetamol',
        dosage_form: 'drops',
        dose: '',
        frequency: 'عند اللزوم',
        duration: '3 أيام',
      };

      const result = validatePrescriptionItem(item);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('الجرعة مطلوبة');
    });

    it('rejects item if frequency is missing', () => {
      const item: Partial<PrescriptionItem> = {
        medication_name: 'Ibuprofen',
        dosage_form: 'syrup',
        dose: '5 ml',
        frequency: '',
        duration: '3 أيام',
      };

      const result = validatePrescriptionItem(item);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('تكرار الجرعة مطلوب');
    });

    it('rejects item if duration is missing', () => {
      const item: Partial<PrescriptionItem> = {
        medication_name: 'Cefixime',
        dosage_form: 'syrup',
        dose: '4 ml',
        frequency: 'مرة واحدة يومياً',
        duration: '',
      };

      const result = validatePrescriptionItem(item);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('مدة العلاج مطلوبة');
    });
  });

  describe('Draft Prescription Lifecycle & Save (savePrescriptionWithItems)', () => {
    it('succeeds in saving a draft with 0 items (حفظ مسودة بلا أدوية ينجح)', async () => {
      mockRpc.mockResolvedValueOnce({
        data: 'rx-draft-empty',
        error: null,
      });
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'rx-draft-empty',
          visit_id: 'visit-100',
          patient_id: 'patient-200',
          status: 'draft',
          general_instructions: 'ملاحظات أولية للمتابعة',
          prescription_items: [],
        },
        error: null,
      });

      const saved = await savePrescriptionWithItems({
        visit_id: 'visit-100',
        patient_id: 'patient-200',
        action: 'draft',
        general_instructions: 'ملاحظات أولية للمتابعة',
        items: [],
      });

      expect(saved.id).toBe('rx-draft-empty');
      expect(saved.status).toBe('draft');
      expect(saved.items).toHaveLength(0);
      expect(mockRpc).toHaveBeenCalledWith('save_electronic_prescription', expect.objectContaining({
        p_visit_id: 'visit-100',
        p_patient_id: 'patient-200',
        p_action: 'draft',
        p_items: [],
      }));
    });

    it('succeeds in saving a draft with an incomplete item (حفظ مسودة ببند ناقص ينجح)', async () => {
      mockRpc.mockResolvedValueOnce({
        data: 'rx-draft-incomplete',
        error: null,
      });
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'rx-draft-incomplete',
          visit_id: 'visit-100',
          patient_id: 'patient-200',
          status: 'draft',
          prescription_items: [
            { id: 'item-inc-1', medication_name: 'Paracetamol', dosage_form: null, frequency: null, duration: null },
          ],
        },
        error: null,
      });

      const incompleteItems: any[] = [
        {
          medication_name: 'Paracetamol',
          dosage_form: undefined,
          frequency: '',
          duration: '',
        },
      ];

      const saved = await savePrescriptionWithItems({
        visit_id: 'visit-100',
        patient_id: 'patient-200',
        action: 'draft',
        items: incompleteItems,
      });

      expect(saved.id).toBe('rx-draft-incomplete');
      expect(saved.status).toBe('draft');
      expect(mockRpc).toHaveBeenCalledWith('save_electronic_prescription', expect.objectContaining({
        p_action: 'draft',
        p_items: [
          expect.objectContaining({
            medication_name: 'Paracetamol',
            dosage_form: null,
            frequency: null,
            duration: null,
          }),
        ],
      }));
    });

    it('fails to issue a prescription with 0 items (إصدار وصفة بلا أدوية يفشل)', async () => {
      await expect(
        savePrescriptionWithItems({
          visit_id: 'visit-100',
          patient_id: 'patient-200',
          action: 'issue',
          items: [],
        })
      ).rejects.toThrow('لا يمكن إصدار وصفة طبية فارغة');
    });

    it('fails to issue a prescription with incomplete item (إصدار وصفة ببند ناقص يفشل)', async () => {
      const incompleteItems: any[] = [
        {
          medication_name: 'Amoxicillin',
          dosage_form: undefined, // missing dosage form
          frequency: '3 times daily',
          duration: '5 days',
        },
      ];

      await expect(
        savePrescriptionWithItems({
          visit_id: 'visit-100',
          patient_id: 'patient-200',
          action: 'issue',
          items: incompleteItems,
        })
      ).rejects.toThrow('الشكل الدوائي مطلوب');
    });

    it('completes the draft items and successfully issues it (إكمال المسودة ثم إصدارها ينجح)', async () => {
      mockRpc.mockResolvedValueOnce({
        data: 'rx-issued-complete',
        error: null,
      });
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'rx-issued-complete',
          visit_id: 'visit-100',
          patient_id: 'patient-200',
          status: 'issued',
          issued_at: new Date().toISOString(),
          prescription_items: [
            {
              id: 'i-1',
              medication_name: 'Amoxicillin',
              dosage_form: 'syrup',
              dose: '5 ml',
              frequency: '3 times daily',
              duration: '7 days',
            },
          ],
        },
        error: null,
      });

      const completeItems: any[] = [
        {
          medication_name: 'Amoxicillin',
          dosage_form: 'syrup',
          dose: '5 ml',
          frequency: '3 times daily',
          duration: '7 days',
          display_order: 1,
        },
      ];

      const issued = await savePrescriptionWithItems({
        visit_id: 'visit-100',
        patient_id: 'patient-200',
        action: 'issue',
        items: completeItems,
      });

      expect(issued.id).toBe('rx-issued-complete');
      expect(issued.status).toBe('issued');
      expect(issued.items![0].medication_name).toBe('Amoxicillin');
      expect(mockRpc).toHaveBeenCalledWith('save_electronic_prescription', expect.objectContaining({
        p_action: 'issue',
      }));
    });

    it('surfaces authentication error if user is unauthenticated in Supabase mode', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: new Error('User session not found'),
      });

      await expect(
        savePrescriptionWithItems({
          visit_id: 'visit-100',
          patient_id: 'patient-200',
          action: 'draft',
          items: [],
        })
      ).rejects.toThrow('يجب تسجيل الدخول');
    });
  });

  describe('Issuing & Locking Electronic Prescriptions (issuePrescription)', () => {
    it('prevents issuing an empty prescription', async () => {
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'rx-empty-1',
          status: 'draft',
          prescription_items: [],
        },
        error: null,
      });

      await expect(issuePrescription('rx-empty-1')).rejects.toThrow('لا يمكن إصدار وصفة طبية فارغة');
    });

    it('issues prescription and locks it against modifications', async () => {
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'rx-valid-1',
          status: 'draft',
          prescription_items: [
            { id: 'item-1', medication_name: 'Amoxicillin', dosage_form: 'syrup', dose: '5 ml', frequency: '3x', duration: '5d' },
          ],
        },
        error: null,
      });
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'rx-valid-1',
          status: 'issued',
          issued_at: new Date().toISOString(),
          prescription_items: [
            { id: 'item-1', medication_name: 'Amoxicillin', dosage_form: 'syrup', dose: '5 ml', frequency: '3x', duration: '5d' },
          ],
        },
        error: null,
      });

      const issued = await issuePrescription('rx-valid-1');
      expect(issued.status).toBe('issued');
    });
  });

  describe('Cancellation of Electronic Prescriptions (cancelPrescription)', () => {
    it('requires a non-empty cancellation reason', async () => {
      await expect(cancelPrescription('rx-1', '')).rejects.toThrow('سبب الإلغاء مطلوب');
      await expect(cancelPrescription('rx-1', '   ')).rejects.toThrow('سبب الإلغاء مطلوب');
    });

    it('calls cancel_electronic_prescription RPC with reason and doctor ID', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'rx-1',
          status: 'cancelled',
          cancellation_reason: 'تم تعديل الجرعة وتغيير المضاد الحيوي',
          prescription_items: [],
        },
        error: null,
      });

      const cancelled = await cancelPrescription('rx-1', 'تم تعديل الجرعة وتغيير المضاد الحيوي');
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancellation_reason).toContain('تعديل الجرعة');
      expect(mockRpc).toHaveBeenCalledWith('cancel_electronic_prescription', expect.objectContaining({
        p_prescription_id: 'rx-1',
        p_reason: 'تم تعديل الجرعة وتغيير المضاد الحيوي',
      }));
    });
  });

  describe('In-Memory Offline Mode (when Supabase is NOT configured)', () => {
    beforeEach(() => {
      mockIsSupabaseConfigured.mockReturnValue(false);
    });

    it('creates and manages draft prescriptions in offline memory store', async () => {
      const draft = await createPrescriptionDraft('v-offline-1', 'p-offline-1');
      expect(draft.status).toBe('draft');
      expect(draft.visit_id).toBe('v-offline-1');
      expect(draft.patient_id).toBe('p-offline-1');

      // Add item
      const item = await addPrescriptionItem({
        prescription_id: draft.id,
        medication_name: 'Paracetamol Syrup',
        dosage_form: 'syrup',
        dose: '5 ml',
        frequency: 'كل 6 ساعات عند اللزوم',
        duration: '3 أيام',
      });
      expect(item.medication_name).toBe('Paracetamol Syrup');

      // Fetch
      const fetched = await fetchPrescriptionByVisitId('v-offline-1');
      expect(fetched).not.toBeNull();
      expect(fetched?.items).toHaveLength(1);

      // Issue prescription
      const issued = await issuePrescription(draft.id);
      expect(issued.status).toBe('issued');
      expect(issued.issued_at).toBeDefined();

      // Ensure modifications on issued prescription are rejected
      await expect(
        addPrescriptionItem({
          prescription_id: draft.id,
          medication_name: 'Extra Drug',
          dosage_form: 'drops',
          dose: '2 drops',
          frequency: 'daily',
          duration: '3 days',
        })
      ).rejects.toThrow('لا يمكن إضافة أدوية');

      // Cancel issued prescription
      const cancelled = await cancelPrescription(draft.id, 'تم تغيير الخطة العلاجية');
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancellation_reason).toBe('تم تغيير الخطة العلاجية');
    });
  });

  describe('Database Migration 00007 Contract & SQL Safety Verification', () => {
    it('verifies migration 00007 safely adds all electronic prescription columns and constraints idempotently', () => {
      const migrationPath = path.resolve(__dirname, '../supabase/migrations/00007_electronic_prescription_system.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Check transaction wrapper
      expect(sql).toContain('BEGIN;');
      expect(sql).toContain('COMMIT;');

      // Verify NO DROP TABLE is used
      expect(sql).not.toContain('DROP TABLE');

      // Verify enums use to_regtype
      expect(sql).toContain("to_regtype('public.prescription_status_type')");
      expect(sql).toContain("to_regtype('public.dosage_form_type')");

      // Verify NO clinical default values are injected
      expect(sql).not.toContain("DEFAULT '3 مرات يومياً'");
      expect(sql).not.toContain("DEFAULT '5 أيام'");
      expect(sql).not.toContain("DEFAULT 'syrup'");

      // Verify ON DELETE RESTRICT for doctor references
      expect(sql).toContain("REFERENCES public.profiles(id) ON DELETE RESTRICT");

      // Check required prescription status enum & columns
      expect(sql).toContain('prescription_status_type');
      expect(sql).toContain('status');
      expect(sql).toContain('prescribed_by');
      expect(sql).toContain('issued_at');
      expect(sql).toContain('diagnosis_id');
      expect(sql).toContain('cancellation_reason');
      expect(sql).toContain('general_instructions');

      // Check required prescription_items columns
      expect(sql).toContain('active_ingredient');
      expect(sql).toContain('route');
      expect(sql).toContain('instructions');
      expect(sql).toContain('quantity');
      expect(sql).toContain('display_order');

      // Check unique partial index for single active electronic prescription per visit
      expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_prescriptions_unique_visit');
      expect(sql).toContain('ON public.prescriptions (visit_id)');

      // Check immutability & validation triggers
      expect(sql).toContain('prevent_modification_of_issued_prescription');
      expect(sql).toContain('validate_prescription_issuance');
      expect(sql).toContain('CREATE TRIGGER trg_validate_prescription_issuance');

      // Check atomic RPC functions
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.save_electronic_prescription');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.cancel_electronic_prescription');

      // Check RLS policies
      expect(sql).toContain('Staff view prescriptions policy');
      expect(sql).toContain('Doctor can insert prescriptions');
      expect(sql).toContain('Staff view prescription items policy');
    });
  });
});

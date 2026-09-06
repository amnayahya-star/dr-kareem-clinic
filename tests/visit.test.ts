import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateMeasurements,
  validateFollowUpDate,
  getActiveVisit,
  createVisitRecord,
  saveDoctorDiagnosis,
} from '../src/services/visitService';
import { getSignedPhotoUrl } from '../src/services/storageService';
import { VisitRecord } from '../src/lib/mock-data/patients';

// Mock Supabase client
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockStorageFrom = vi.fn();
const mockGetUser = vi.fn();
const mockIsSupabaseConfigured = vi.fn().mockReturnValue(true);

vi.mock('../src/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
    rpc: mockRpc,
    from: mockFrom,
    storage: {
      from: mockStorageFrom,
    },
  }),
  isSupabaseConfigured: () => mockIsSupabaseConfigured(),
}));

describe('Visit & Clinical Examination Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'doctor-user-123' } },
      error: null,
    });
  });

  describe('Active Visit Selection (getActiveVisit)', () => {
    it('selects active visit with status "waiting"', () => {
      const visits: VisitRecord[] = [
        { id: 'v-comp', patientId: 'p1', date: '2026-08-01', status: 'completed', isCompleted: true, labPhotos: [] },
        { id: 'v-wait', patientId: 'p1', date: '2026-09-06', status: 'waiting', isCompleted: false, labPhotos: [] },
      ];
      const active = getActiveVisit(visits);
      expect(active).not.toBeNull();
      expect(active?.id).toBe('v-wait');
      expect(active?.status).toBe('waiting');
    });

    it('selects active visit with status "in_progress" or "draft"', () => {
      const visits: VisitRecord[] = [
        { id: 'v-prog', patientId: 'p1', date: '2026-09-06', status: 'in_progress', isCompleted: false, labPhotos: [] },
      ];
      expect(getActiveVisit(visits)?.id).toBe('v-prog');

      const draftVisits: VisitRecord[] = [
        { id: 'v-draft', patientId: 'p1', date: '2026-09-06', status: 'draft', isCompleted: false, labPhotos: [] },
      ];
      expect(getActiveVisit(draftVisits)?.id).toBe('v-draft');
    });

    it('returns null if all visits are completed or cancelled', () => {
      const visits: VisitRecord[] = [
        { id: 'v-1', patientId: 'p1', date: '2026-08-01', status: 'completed', isCompleted: true, labPhotos: [] },
        { id: 'v-2', patientId: 'p1', date: '2026-08-15', status: 'cancelled', isCompleted: false, labPhotos: [] },
      ];
      expect(getActiveVisit(visits)).toBeNull();
    });

    it('returns null if visits array is empty or undefined', () => {
      expect(getActiveVisit([])).toBeNull();
      expect(getActiveVisit(undefined)).toBeNull();
    });
  });

  describe('Measurement & Vital Signs Validation (validateMeasurements)', () => {
    it('accepts valid measurements in plausible pediatric and general ranges', () => {
      const result = validateMeasurements({
        weightKg: 12.5,
        heightCm: 85,
        temperatureC: 37.2,
        bloodPressure: '100/65',
        oxygenSaturation: 98,
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('allows empty/undefined optional measurements', () => {
      const result = validateMeasurements({
        weightKg: '',
        heightCm: undefined,
        temperatureC: null,
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects zero, negative, or extreme weights', () => {
      expect(validateMeasurements({ weightKg: 0 }).isValid).toBe(false);
      expect(validateMeasurements({ weightKg: -5 }).isValid).toBe(false);
      expect(validateMeasurements({ weightKg: 0.1 }).isValid).toBe(false); // below 0.3kg
      expect(validateMeasurements({ weightKg: 300 }).isValid).toBe(false); // above 250kg
      expect(validateMeasurements({ weightKg: 'abc' }).isValid).toBe(false);
    });

    it('rejects zero, negative, or extreme heights', () => {
      expect(validateMeasurements({ heightCm: 0 }).isValid).toBe(false);
      expect(validateMeasurements({ heightCm: -10 }).isValid).toBe(false);
      expect(validateMeasurements({ heightCm: 15 }).isValid).toBe(false); // below 20cm
      expect(validateMeasurements({ heightCm: 300 }).isValid).toBe(false); // above 250cm
    });

    it('rejects temperatures outside physiological limits (30.0 - 45.0 °C)', () => {
      expect(validateMeasurements({ temperatureC: 28.5 }).isValid).toBe(false);
      expect(validateMeasurements({ temperatureC: 46.0 }).isValid).toBe(false);
      expect(validateMeasurements({ temperatureC: -37 }).isValid).toBe(false);
      expect(validateMeasurements({ temperatureC: 38.5 }).isValid).toBe(true);
    });

    it('rejects oxygen saturation outside 0 - 100%', () => {
      expect(validateMeasurements({ oxygenSaturation: -1 }).isValid).toBe(false);
      expect(validateMeasurements({ oxygenSaturation: 105 }).isValid).toBe(false);
      expect(validateMeasurements({ oxygenSaturation: 99 }).isValid).toBe(true);
    });

    it('validates blood pressure format and systolic > diastolic', () => {
      expect(validateMeasurements({ bloodPressure: '120/80' }).isValid).toBe(true);
      expect(validateMeasurements({ bloodPressure: '90/60' }).isValid).toBe(true);
      expect(validateMeasurements({ bloodPressure: 'invalid-bp' }).isValid).toBe(false);
      expect(validateMeasurements({ bloodPressure: '80/120' }).isValid).toBe(false); // systolic <= diastolic
      expect(validateMeasurements({ bloodPressure: '80/80' }).isValid).toBe(false);
    });

    it('returns clear Arabic error messages for invalid values', () => {
      const result = validateMeasurements({ weightKg: -2 });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('الوزن');
    });
  });

  describe('Follow-up Date Validation (validateFollowUpDate)', () => {
    it('accepts valid future date or today', () => {
      const future = new Date();
      future.setDate(future.getDate() + 7);
      const futureStr = future.toISOString().split('T')[0];
      expect(validateFollowUpDate(futureStr).isValid).toBe(true);

      const todayStr = new Date().toISOString().split('T')[0];
      expect(validateFollowUpDate(todayStr).isValid).toBe(true);
    });

    it('allows empty or null follow-up date', () => {
      expect(validateFollowUpDate('').isValid).toBe(true);
      expect(validateFollowUpDate(null).isValid).toBe(true);
      expect(validateFollowUpDate(undefined).isValid).toBe(true);
    });

    it('rejects dates in the past with clear Arabic error message', () => {
      const past = new Date();
      past.setDate(past.getDate() - 5);
      const pastStr = past.toISOString().split('T')[0];
      const result = validateFollowUpDate(pastStr);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('الماضي');
    });
  });

  describe('Clinical Examination & Diagnosis Finalization (saveDoctorDiagnosis)', () => {
    it('requires non-empty diagnosis text', async () => {
      await expect(
        saveDoctorDiagnosis({
          visitId: 'v-123',
          patientId: 'p-123',
          diagnosisText: '',
        })
      ).rejects.toThrow('التشخيص النهائي مطلوب');

      await expect(
        saveDoctorDiagnosis({
          visitId: 'v-123',
          patientId: 'p-123',
          diagnosisText: '   ',
        })
      ).rejects.toThrow('التشخيص النهائي مطلوب');
    });

    it('rejects past follow-up date during diagnosis saving', async () => {
      const past = new Date();
      past.setDate(past.getDate() - 2);
      const pastStr = past.toISOString().split('T')[0];

      await expect(
        saveDoctorDiagnosis({
          visitId: 'v-123',
          patientId: 'p-123',
          diagnosisText: 'التهاب الأذن الوسطى',
          followUpDate: pastStr,
        })
      ).rejects.toThrow('الماضي');
    });

    it('calls finalize_doctor_diagnosis RPC with authenticated doctor ID and complete fields', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const followUp = futureDate.toISOString().split('T')[0];

      await saveDoctorDiagnosis({
        visitId: 'v-123',
        patientId: 'p-123',
        symptoms: 'حمى مستمرة',
        presentIllnessHistory: 'بدأت منذ يومين تدريجياً',
        clinicalExamination: 'احتقان بالبلعوم',
        diagnosisText: 'التهاب اللوزتين الحاد',
        recommendations: 'راحة وسوائل',
        doctorNotes: 'إعادة الفحص بعد 5 أيام',
        followUpDate: followUp,
      });

      expect(mockRpc).toHaveBeenCalledWith(
        'finalize_doctor_diagnosis',
        expect.objectContaining({
          p_visit_id: 'v-123',
          p_patient_id: 'p-123',
          p_symptoms: 'حمى مستمرة',
          p_present_illness_history: 'بدأت منذ يومين تدريجياً',
          p_clinical_examination: 'احتقان بالبلعوم',
          p_diagnosis_text: 'التهاب اللوزتين الحاد',
          p_recommendations: 'راحة وسوائل',
          p_doctor_notes: 'إعادة الفحص بعد 5 أيام',
          p_follow_up_date: followUp,
        })
      );
    });

    it('surfaces RPC error and performs NO direct table writes when RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'غير مصرح: اعتماد التشخيص متاح للطبيب فقط' },
      });

      await expect(
        saveDoctorDiagnosis({
          visitId: 'v-456',
          patientId: 'p-456',
          diagnosisText: 'التهاب شعبي حاد',
        })
      ).rejects.toThrow('غير مصرح: اعتماد التشخيص متاح للطبيب فقط');

      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('surfaces missing RPC error directly without table fallback', async () => {
      mockRpc.mockRejectedValueOnce(new Error('RPC finalize_doctor_diagnosis not found'));

      await expect(
        saveDoctorDiagnosis({
          visitId: 'v-456',
          patientId: 'p-456',
          diagnosisText: 'التهاب شعبي حاد',
        })
      ).rejects.toThrow('RPC finalize_doctor_diagnosis not found');

      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('Visit Creation (createVisitRecord)', () => {
    it('validates measurements before making database requests', async () => {
      await expect(
        createVisitRecord({
          patientId: 'p-1',
          weightKg: -10, // Invalid weight
        })
      ).rejects.toThrow('الوزن');
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('calls create_visit_with_measurements RPC with authenticated secretary ID and all measurement fields', async () => {
      mockRpc.mockResolvedValueOnce({ data: 'v-new-789', error: null });

      const result = await createVisitRecord({
        patientId: 'p-1',
        weightKg: 14.5,
        heightCm: 96,
        temperatureC: 37.8,
        bloodPressure: '100/60',
        oxygenSaturation: 98,
        chiefComplaint: 'كشف دوري',
      });

      expect(result.id).toBe('v-new-789');
      expect(result.status).toBe('waiting');
      expect(result.weightKg).toBe(14.5);
      expect(result.bloodPressure).toBe('100/60');
      expect(result.oxygenSaturation).toBe(98);
      expect(mockRpc).toHaveBeenCalledWith(
        'create_visit_with_measurements',
        expect.objectContaining({
          p_patient_id: 'p-1',
          p_chief_complaint: 'كشف دوري',
          p_weight_kg: 14.5,
          p_height_cm: 96,
          p_temperature_c: 37.8,
          p_blood_pressure: '100/60',
          p_oxygen_saturation: 98,
        })
      );
    });

    it('passes null for optional empty string blood pressure and undefined oxygen saturation', async () => {
      mockRpc.mockResolvedValueOnce({ data: 'v-new-790', error: null });

      await createVisitRecord({
        patientId: 'p-1',
        bloodPressure: '',
        oxygenSaturation: undefined,
      });

      expect(mockRpc).toHaveBeenCalledWith(
        'create_visit_with_measurements',
        expect.objectContaining({
          p_patient_id: 'p-1',
          p_blood_pressure: null,
          p_oxygen_saturation: null,
        })
      );
    });

    it('rejects invalid blood pressure before making database requests', async () => {
      await expect(
        createVisitRecord({
          patientId: 'p-1',
          bloodPressure: '120/130', // systolic <= diastolic
        })
      ).rejects.toThrow('ضغط الدم');
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('rejects invalid oxygen saturation before making database requests', async () => {
      await expect(
        createVisitRecord({
          patientId: 'p-1',
          oxygenSaturation: 105,
        })
      ).rejects.toThrow('الأكسجين');
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('Private Medical Attachments (getSignedPhotoUrl)', () => {
    it('generates signed URL for private storage path', async () => {
      mockStorageFrom.mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: 'https://supabase.co/storage/v1/signed/photo.jpg?token=secret' },
          error: null,
        }),
      });

      const url = await getSignedPhotoUrl('lab_tests/p-1/image-123.jpg', 3600);
      expect(url).toContain('https://supabase.co/storage/v1/signed/photo.jpg?token=secret');
    });

    it('extracts object path from legacy medical-photos public URLs and signs them', async () => {
      const mockCreateSignedUrl = vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://supabase.co/storage/v1/signed/lab_tests/p-1/image-legacy.jpg?token=secret' },
        error: null,
      });
      mockStorageFrom.mockReturnValue({
        createSignedUrl: mockCreateSignedUrl,
      });

      const legacyUrl = 'https://someproject.supabase.co/storage/v1/object/public/medical-photos/lab_tests/p-1/image-legacy.jpg';
      const url = await getSignedPhotoUrl(legacyUrl, 3600);

      expect(mockCreateSignedUrl).toHaveBeenCalledWith('lab_tests/p-1/image-legacy.jpg', 3600);
      expect(url).toContain('https://supabase.co/storage/v1/signed/lab_tests/p-1/image-legacy.jpg?token=secret');
    });

    it('preserves blob and external http URLs as-is', async () => {
      expect(await getSignedPhotoUrl('blob:http://localhost:3000/123')).toBe('blob:http://localhost:3000/123');
      expect(await getSignedPhotoUrl('https://images.unsplash.com/sample.jpg')).toBe('https://images.unsplash.com/sample.jpg');
    });

    it('returns null on storage signing error without crashing', async () => {
      mockStorageFrom.mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Object not found' },
        }),
      });

      const url = await getSignedPhotoUrl('lab_tests/missing.jpg');
      expect(url).toBeNull();
    });
  });

  describe('Security & State Enforcement', () => {
    it('rejects finalization if user is unauthenticated', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: new Error('Not authenticated'),
      });

      await expect(
        saveDoctorDiagnosis({
          visitId: 'v-123',
          patientId: 'p-123',
          diagnosisText: 'التهاب الأذن',
        })
      ).rejects.toThrow('يجب تسجيل الدخول');
    });

    it('rejects visit creation if user is unauthenticated', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: new Error('Not authenticated'),
      });

      await expect(
        createVisitRecord({
          patientId: 'p-123',
          chiefComplaint: 'فحص دوري',
        })
      ).rejects.toThrow('يجب تسجيل الدخول');
    });

    it('propagates RPC exception when finalizing a completed or cancelled visit', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'لا يمكن اعتماد الزيارة لأن حالتها الحالية لا تسمح بالتعديل (الحالة: completed)' },
      });

      await expect(
        saveDoctorDiagnosis({
          visitId: 'v-completed',
          patientId: 'p-123',
          diagnosisText: 'التهاب الأذن',
        })
      ).rejects.toThrow('لا تسمح بالتعديل');
    });
  });

  describe('Migration 00005 Schema Contract & Column Safety', () => {
    it('verifies migration 00005 adds all required diagnoses and visits columns idempotently', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const migrationPath = path.resolve(__dirname, '../supabase/migrations/00005_stabilize_visit_workflow.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Required columns for diagnoses table
      const requiredDiagnosisCols = [
        'symptoms',
        'present_illness_history',
        'clinical_examination',
        'diagnosis_text',
        'doctor_notes',
        'recommendations',
        'follow_up_date',
        'doctor_id',
      ];

      for (const col of requiredDiagnosisCols) {
        expect(sql).toContain(`ALTER TABLE public.diagnoses ADD COLUMN IF NOT EXISTS ${col}`);
      }

      // Required columns for visits table
      const requiredVisitCols = ['completed_at', 'approved_at', 'doctor_id', 'secretary_id'];
      for (const col of requiredVisitCols) {
        expect(sql).toContain(`ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS ${col}`);
      }
    });

    it('verifies migration 00005 includes idx_single_active_visit_per_patient unique partial index with all active statuses', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const migrationPath = path.resolve(__dirname, '../supabase/migrations/00005_stabilize_visit_workflow.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_visit_per_patient');
      expect(sql).toContain('ON public.visits (patient_id)');
      expect(sql).toContain("'draft'::public.visit_status_type");
      expect(sql).toContain("'waiting'::public.visit_status_type");
      expect(sql).toContain("'in_progress'::public.visit_status_type");
    });
  });

  describe('Migration 00006 Schema Contract & Hotfix Safety', () => {
    it('verifies migration 00006 safely and idempotently reconciles recorded_by column on measurements table', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const migrationPath = path.resolve(__dirname, '../supabase/migrations/00006_fix_visit_measurement_contract.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Extract executable SQL statements without comments
      const statements = sql
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('--'));

      expect(statements[0]).toBe('BEGIN;');
      expect(statements[statements.length - 1]).toBe('COMMIT;');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_visit_with_measurements');
      expect(sql).toContain('public.is_secretary()');
      expect(sql).toContain('recorded_by');
      expect(sql).toContain('v_user_id');
      expect(sql).toContain('WHEN unique_violation THEN');
      expect(sql).toContain('REVOKE ALL ON FUNCTION public.create_visit_with_measurements');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.create_visit_with_measurements');
    });
  });

  describe('Concurrent Duplicate Visit Protection', () => {
    it('surfaces clean Arabic business error when RPC rejects duplicate active visit', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'توجد زيارة نشطة بالفعل لهذا الطفل بانتظار الفحص أو قيد الإجراء' },
      });

      await expect(
        createVisitRecord({
          patientId: 'p-duplicate',
          chiefComplaint: 'فحص مكرر',
        })
      ).rejects.toThrow('توجد زيارة نشطة بالفعل لهذا الطفل بانتظار الفحص أو قيد الإجراء');
    });

    it('surfaces RPC error and performs NO direct table writes on create_visit_with_measurements failure', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'سجل الطفل غير موجود أو مؤرشف' },
      });

      await expect(
        createVisitRecord({
          patientId: 'p-missing',
          chiefComplaint: 'فحص مكرر',
        })
      ).rejects.toThrow('سجل الطفل غير موجود أو مؤرشف');

      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('surfaces missing create RPC error directly without table fallback', async () => {
      mockRpc.mockRejectedValueOnce(new Error('RPC create_visit_with_measurements not found'));

      await expect(
        createVisitRecord({
          patientId: 'p-1',
          chiefComplaint: 'فحص',
        })
      ).rejects.toThrow('RPC create_visit_with_measurements not found');

      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('Offline Mock Mode (when Supabase is NOT configured)', () => {
    it('creates local in-memory visit and does NOT invoke Supabase RPC or tables', async () => {
      mockIsSupabaseConfigured.mockReturnValue(false);

      const result = await createVisitRecord({
        patientId: 'p-local',
        chiefComplaint: 'كشف تجريبي',
        weightKg: 15,
        temperatureC: 37.0,
      });

      expect(result.id).toMatch(/^v-\d+/);
      expect(result.status).toBe('waiting');
      expect(result.weightKg).toBe(15);
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('saves doctor diagnosis in-memory without invoking Supabase RPC or tables', async () => {
      mockIsSupabaseConfigured.mockReturnValue(false);

      await expect(
        saveDoctorDiagnosis({
          visitId: 'v-local',
          patientId: 'p-local',
          diagnosisText: 'تشخيص محلي تجريبي',
        })
      ).resolves.toBeUndefined();

      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });
});

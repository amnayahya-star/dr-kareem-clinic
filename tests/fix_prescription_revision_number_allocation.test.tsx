import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

import {
  savePrescriptionWithItems,
  createPrescriptionRevision,
  cancelPrescriptionRevision,
  fetchPrescriptionByVisitId,
  fetchPrescriptionById,
  fetchPrescriptionRevisions,
  _resetInMemoryPrescriptions,
} from '../src/services/prescriptionService';
import { ElectronicPrescriptionSection } from '../src/components/prescriptions/ElectronicPrescriptionSection';
import { LanguageProvider } from '../src/context/LanguageContext';
import { Prescription } from '../src/types/database';

// Mock Supabase
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();
const mockIsSupabaseConfigured = vi.fn().mockReturnValue(false);

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

// Mock Next.js navigation
const mockBack = vi.fn();
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockPathname = '/doctor/examination/visit-rev-allocation-test';
let mockParams = { visitId: 'visit-rev-allocation-test' };
let mockSearchParamsGet = vi.fn().mockReturnValue(null);

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  usePathname: () => mockPathname,
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParamsGet(key),
  }),
}));

describe('Fix Prescription Revision Number Allocation (حل تكرار رقم مراجعة الوصفة بعد الإلغاء)', () => {
  const migration20Path = path.resolve(__dirname, '../supabase/migrations/00020_fix_prescription_revision_number_allocation.sql');
  const sqlTestPath = path.resolve(__dirname, '../supabase/tests/test_fix_prescription_revision_number_allocation.sql');
  let migration20Sql = '';

  beforeEach(() => {
    vi.clearAllMocks();
    _resetInMemoryPrescriptions();
    mockIsSupabaseConfigured.mockReturnValue(false);
    mockSearchParamsGet.mockReturnValue(null);
    if (fs.existsSync(migration20Path)) {
      migration20Sql = fs.readFileSync(migration20Path, 'utf8');
    }
  });

  // ============================================================================
  // 1. SQL Migration Contract Verification (00020)
  // ============================================================================
  describe('1. SQL Migration 00020 Contract & Concurrency Architecture', () => {
    it('migration 00020 file exists and test SQL file exists', () => {
      expect(fs.existsSync(migration20Path)).toBe(true);
      expect(fs.existsSync(sqlTestPath)).toBe(true);
    });

    it('defines public.create_prescription_revision with SECURITY DEFINER and search_path = ""', () => {
      expect(migration20Sql).toContain('FUNCTION public.create_prescription_revision');
      expect(migration20Sql).toContain('p_prescription_id UUID');
      expect(migration20Sql).toContain('p_reason TEXT');
      expect(migration20Sql).toContain('SECURITY DEFINER');
      expect(migration20Sql).toContain("SET search_path = ''");
    });

    it('enforces doctor authentication and authorization checks', () => {
      expect(migration20Sql).toContain('public.is_doctor()');
      expect(migration20Sql).toContain('auth.uid()');
      expect(migration20Sql).toContain('v_doctor_id := auth.uid()');
    });

    it('implements transactional locking (pg_advisory_xact_lock and visits FOR UPDATE) to avoid race conditions', () => {
      expect(migration20Sql).toContain('pg_advisory_xact_lock');
      expect(migration20Sql).toContain('FROM public.visits WHERE id = v_target.visit_id FOR UPDATE');
    });

    it('calculates next revision from MAX(revision_number) + 1 across all visit prescriptions instead of source row alone', () => {
      expect(migration20Sql).toContain('SELECT COALESCE(MAX(revision_number), 0) + 1');
      expect(migration20Sql).toContain('FROM public.prescriptions');
      expect(migration20Sql).toContain('WHERE visit_id = v_target.visit_id');
      // Must NOT contain the old bug: COALESCE(v_target.revision_number, 1) + 1
      expect(migration20Sql).not.toContain('COALESCE(v_target.revision_number, 1) + 1');
    });

    it('grants execute to authenticated and revokes from anon and public', () => {
      expect(migration20Sql).toContain('REVOKE ALL ON FUNCTION public.create_prescription_revision(UUID, TEXT) FROM PUBLIC, anon;');
      expect(migration20Sql).toContain('GRANT EXECUTE ON FUNCTION public.create_prescription_revision(UUID, TEXT) TO authenticated;');
    });
  });

  // ============================================================================
  // 2. In-Memory Service Logic & Sequence Verification
  // ============================================================================
  describe('2. In-Memory Service Revision Allocation Logic', () => {
    it('creates v2 -> cancels v2 -> creates v3 (NOT v2) from v1 -> cancels v3 -> creates v4', async () => {
      const visitId = 'visit-alloc-test-1';
      const patientId = 'patient-alloc-test-1';

      // Step 1: Create and issue Version 1
      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Amoxicillin 250mg Suspension',
            dosage_form: 'suspension',
            frequency: 'Every 8h',
            duration: '7 days',
          },
        ],
        action: 'issue',
      });
      expect(v1.status).toBe('issued');
      expect(v1.revision_number).toBe(1);

      // Step 2: Create Revision Draft (v2)
      const v2 = await createPrescriptionRevision(v1.id, 'أول تعديل تجريبي');
      expect(v2.status).toBe('draft');
      expect(v2.revision_number).toBe(2);
      expect(v2.replaces_prescription_id).toBe(v1.id);

      // Cannot create another revision while v2 draft is active
      await expect(createPrescriptionRevision(v1.id, 'محاولة فتح مسودة ثانية')).rejects.toThrow(
        /توجد مسودة مراجعة نشطة بالفعل/
      );

      // Step 3: Cancel v2 draft
      const cancelRes2 = await cancelPrescriptionRevision(v2.id);
      expect(cancelRes2.status).toBe('cancelled');
      const refreshedV2 = await fetchPrescriptionById(v2.id);
      expect(refreshedV2?.status).toBe('cancelled');
      expect(refreshedV2?.revision_number).toBe(2);

      // Step 4: Create new revision from v1 -> MUST be revision_number = 3
      const v3 = await createPrescriptionRevision(v1.id, 'مراجعة جديدة بعد إلغاء المراجعة السابقة');
      expect(v3.status).toBe('draft');
      expect(v3.revision_number).toBe(3);
      expect(v3.replaces_prescription_id).toBe(v1.id);
      expect(v3.items?.length).toBe(1);

      // Step 5: Cancel v3 draft
      const cancelRes3 = await cancelPrescriptionRevision(v3.id);
      expect(cancelRes3.status).toBe('cancelled');
      const refreshedV3 = await fetchPrescriptionById(v3.id);
      expect(refreshedV3?.status).toBe('cancelled');
      expect(refreshedV3?.revision_number).toBe(3);

      // Step 6: Create new revision from v1 -> MUST be revision_number = 4
      const v4 = await createPrescriptionRevision(v1.id, 'مراجعة ثالثة بعد إلغاء نسختين');
      expect(v4.status).toBe('draft');
      expect(v4.revision_number).toBe(4);
      expect(v4.replaces_prescription_id).toBe(v1.id);

      // Verify full history
      const history = await fetchPrescriptionRevisions(visitId);
      expect(history.length).toBe(4);
      // v1 issued, v2 cancelled, v3 cancelled, v4 draft
      const r1 = history.find(r => r.revision_number === 1);
      const r2 = history.find(r => r.revision_number === 2);
      const r3 = history.find(r => r.revision_number === 3);
      const r4 = history.find(r => r.revision_number === 4);

      expect(r1?.status).toBe('issued');
      expect(r2?.status).toBe('cancelled');
      expect(r3?.status).toBe('cancelled');
      expect(r4?.status).toBe('draft');
    });
  });

  // ============================================================================
  // 3. UI Component Integration Verification
  // ============================================================================
  describe('3. ElectronicPrescriptionSection UI Revision Number Display', () => {
    it('creates revision 3 when requested after revision 2 was cancelled and displays correct badge', async () => {
      const visitId = 'visit-ui-alloc-test';
      const patientId = 'patient-ui-alloc-test';

      // 1. Setup v1 issued
      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Panadol 120mg Syrup',
            dosage_form: 'syrup',
            frequency: '3 times daily',
            duration: '5 days',
          },
        ],
        action: 'issue',
      });

      // 2. Setup v2 cancelled
      const v2 = await createPrescriptionRevision(v1.id, 'مسودة أولى');
      await cancelPrescriptionRevision(v2.id);

      // 3. Render UI with v1
      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
            initialPrescription={v1}
          />
        </LanguageProvider>
      );

      // Click "تعديل الوصفة"
      const editButton = screen.getByRole('button', { name: /تعديل الوصفة/ });
      expect(editButton).toBeDefined();

      await act(async () => {
        fireEvent.click(editButton);
      });

      // The modal appears asking for revision reason
      const reasonInput = screen.getByPlaceholderText(/سبب التعديل/);
      expect(reasonInput).toBeDefined();

      await act(async () => {
        fireEvent.change(reasonInput, { target: { value: 'تعديل الجرعة بعد الإلغاء السابق' } });
      });

      const confirmBtn = screen.getByTestId('confirm-create-revision-btn');
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      // After revision creation, the UI should switch to the new draft with revision 3
      await waitFor(() => {
        const badge = screen.getByTestId('rx-revision-badge');
        expect(badge.textContent).toContain('نسخة 3');
      });

      // Verify the cancel button is available for this new revision (v3)
      expect(screen.getByTestId('cancel-revision-draft-btn')).toBeDefined();
    });
  });
});

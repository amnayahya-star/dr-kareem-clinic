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
import * as prescriptionService from '../src/services/prescriptionService';
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
let mockPathname = '/doctor/examination/visit-cancel-test';
let mockParams = { visitId: 'visit-cancel-test' };
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

describe('Prescription Revision Cancellation Workflow (إلغاء مسودة مراجعة الوصفة الطبية)', () => {
  const migration18Path = path.resolve(__dirname, '../supabase/migrations/00018_cancel_prescription_revision.sql');
  const sqlTestPath = path.resolve(__dirname, '../supabase/tests/test_cancel_prescription_revision.sql');
  let migration18Sql = '';

  beforeEach(() => {
    vi.clearAllMocks();
    _resetInMemoryPrescriptions();
    mockIsSupabaseConfigured.mockReturnValue(false);
    mockSearchParamsGet.mockReturnValue(null);
    if (fs.existsSync(migration18Path)) {
      migration18Sql = fs.readFileSync(migration18Path, 'utf8');
    }
  });

  // ============================================================================
  // 1. SQL Migration Contract Verification (00018)
  // ============================================================================
  describe('1. SQL Migration 00018 Contract & Security Architecture', () => {
    it('migration 00018 file exists and has valid name', () => {
      expect(fs.existsSync(migration18Path)).toBe(true);
      expect(fs.existsSync(sqlTestPath)).toBe(true);
    });

    it('defines public.cancel_prescription_revision with SECURITY DEFINER and search_path = ""', () => {
      expect(migration18Sql).toContain('FUNCTION public.cancel_prescription_revision');
      expect(migration18Sql).toContain('p_prescription_id UUID');
      expect(migration18Sql).toContain('SECURITY DEFINER');
      expect(migration18Sql).toContain("SET search_path = ''");
    });

    it('checks public.is_doctor() and auth.uid() authentication', () => {
      expect(migration18Sql).toContain('IF NOT public.is_doctor() THEN');
      expect(migration18Sql).toContain('v_doctor_id := auth.uid()');
      expect(migration18Sql).toContain('IF v_doctor_id IS NULL THEN');
    });

    it('locks target prescription FOR UPDATE to prevent race conditions', () => {
      expect(migration18Sql).toContain('FOR UPDATE');
      expect(migration18Sql).toContain('FROM public.prescriptions');
    });

    it('validates doctor and visit ownership', () => {
      expect(migration18Sql).toContain('v_target.doctor_id');
      expect(migration18Sql).toContain('v_target.prescribed_by');
      expect(migration18Sql).toContain('FROM public.visits');
    });

    it('strictly restricts cancellation to drafts with revision_number > 1 and linked predecessor', () => {
      expect(migration18Sql).toContain("status != 'draft'");
      expect(migration18Sql).toContain('revision_number, 1) <= 1');
      expect(migration18Sql).toContain('v_target.replaces_prescription_id IS NULL AND v_target.original_prescription_id IS NULL');
    });

    it('explicitly rejects cancelling issued, superseded, and already cancelled prescriptions', () => {
      expect(migration18Sql).toContain("v_target.status = 'cancelled'");
      expect(migration18Sql).toContain("v_target.status = 'issued'");
      expect(migration18Sql).toContain("v_target.status = 'superseded'");
    });

    it('does NOT delete records or items and updates status to cancelled with timestamp', () => {
      expect(migration18Sql).not.toContain('DELETE FROM public.prescriptions');
      expect(migration18Sql).not.toContain('DELETE FROM public.prescription_items');
      expect(migration18Sql).toContain("status = 'cancelled'::public.prescription_status_type");
      expect(migration18Sql).toContain('updated_at = NOW()');
    });

    it('does NOT modify clinic_drug_catalog or usage_count', () => {
      expect(migration18Sql).not.toContain('UPDATE public.clinic_drug_catalog');
      expect(migration18Sql).not.toContain('INSERT INTO public.clinic_drug_catalog');
    });

    it('returns JSONB with cancelled_prescription_id, fallback_prescription_id, visit_id, and status', () => {
      expect(migration18Sql).toContain('RETURNS JSONB');
      expect(migration18Sql).toContain('cancelled_prescription_id');
      expect(migration18Sql).toContain('fallback_prescription_id');
      expect(migration18Sql).toContain('visit_id');
      expect(migration18Sql).toContain("'status', 'cancelled'");
    });

    it('applies strict REVOKE/GRANT: anon is revoked, authenticated is granted', () => {
      expect(migration18Sql).toContain('REVOKE ALL ON FUNCTION public.cancel_prescription_revision(UUID) FROM PUBLIC;');
      expect(migration18Sql).toContain('REVOKE ALL ON FUNCTION public.cancel_prescription_revision(UUID) FROM anon;');
      expect(migration18Sql).toContain('GRANT EXECUTE ON FUNCTION public.cancel_prescription_revision(UUID) TO authenticated;');
    });
  });

  // ============================================================================
  // 2. Service-Level & Business Logic Tests
  // ============================================================================
  describe('2. Service Logic: cancelPrescriptionRevision', () => {
    it('doctor can cancel a revision draft (v2), fallback points to v1 issued, v1 remains intact', async () => {
      const visitId = 'visit-cancel-srv-1';
      const patientId = 'patient-cancel-srv-1';

      // 1. Issue Version 1
      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Amoxicillin 250mg',
            dosage_form: 'syrup',
            frequency: 'Every 8h',
            duration: '7 days',
          },
        ],
        action: 'issue',
      });
      expect(v1.status).toBe('issued');
      expect(v1.revision_number).toBe(1);

      // 2. Create Revision Draft (v2)
      const v2 = await createPrescriptionRevision(v1.id, 'جرعة تجريبية');
      expect(v2.status).toBe('draft');
      expect(v2.revision_number).toBe(2);
      expect(v2.replaces_prescription_id).toBe(v1.id);
      expect(v2.items?.length).toBe(1);

      // 3. Cancel Revision Draft (v2)
      const cancelResult = await cancelPrescriptionRevision(v2.id);

      expect(cancelResult.status).toBe('cancelled');
      expect(cancelResult.cancelled_prescription_id).toBe(v2.id);
      expect(cancelResult.fallback_prescription_id).toBe(v1.id);
      expect(cancelResult.visit_id).toBe(visitId);

      // 4. Verify v2 status is cancelled and items are preserved
      const refreshedV2 = await fetchPrescriptionById(v2.id);
      expect(refreshedV2?.status).toBe('cancelled');
      expect(refreshedV2?.items?.length).toBe(1);
      expect(refreshedV2?.items?.[0].medication_name).toBe('Amoxicillin 250mg');

      // 5. Verify v1 remains issued and intact
      const refreshedV1 = await fetchPrescriptionById(v1.id);
      expect(refreshedV1?.status).toBe('issued');
      expect(refreshedV1?.revision_number).toBe(1);
    });

    it('cannot cancel an issued prescription via cancelPrescriptionRevision', async () => {
      const visitId = 'visit-cancel-srv-2';
      const patientId = 'patient-cancel-srv-2';

      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Paracetamol',
            dosage_form: 'syrup',
            frequency: 'When needed',
            duration: '3 days',
          },
        ],
        action: 'issue',
      });

      await expect(cancelPrescriptionRevision(v1.id)).rejects.toThrow(
        /لا يمكن إلغاء وصفة طبية معتمدة وصادرة عبر هذا الإجراء/
      );
    });

    it('cannot cancel the original version 1 draft via cancelPrescriptionRevision', async () => {
      const visitId = 'visit-cancel-srv-3';
      const patientId = 'patient-cancel-srv-3';

      const v1Draft = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Ibuprofen',
            dosage_form: 'syrup',
            frequency: 'Every 8h',
            duration: '3 days',
          },
        ],
        action: 'draft',
      });

      await expect(cancelPrescriptionRevision(v1Draft.id)).rejects.toThrow(
        /لا يمكن إلغاء النسخة الأصلية للوصفة الطبية/
      );
    });

    it('cannot cancel an already cancelled revision twice (idempotency safety)', async () => {
      const visitId = 'visit-cancel-srv-4';
      const patientId = 'patient-cancel-srv-4';

      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [{ medication_name: 'Cefixime', dosage_form: 'syrup', frequency: 'Daily', duration: '5 days' }],
        action: 'issue',
      });

      const v2 = await createPrescriptionRevision(v1.id, 'سبب تعديل');
      await cancelPrescriptionRevision(v2.id);

      // Second attempt
      await expect(cancelPrescriptionRevision(v2.id)).rejects.toThrow(
        /الوصفة الطبية ملغاة بالفعل ولا يمكن إلغاؤها مرة أخرى/
      );
    });

    it('fetchPrescriptionByVisitId does not prioritize cancelled revision as default', async () => {
      const visitId = 'visit-cancel-srv-5';
      const patientId = 'patient-cancel-srv-5';

      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [{ medication_name: 'Amoxicillin', dosage_form: 'syrup', frequency: 'Daily', duration: '5 days' }],
        action: 'issue',
      });

      const v2 = await createPrescriptionRevision(v1.id, 'مراجعة تجريبية');
      await cancelPrescriptionRevision(v2.id);

      // Now fetch default prescription for visit
      const defaultRx = await fetchPrescriptionByVisitId(visitId);
      expect(defaultRx).not.toBeNull();
      expect(defaultRx?.id).toBe(v1.id);
      expect(defaultRx?.status).toBe('issued');
    });

    it('calls Supabase RPC with correct payload when configured', async () => {
      mockIsSupabaseConfigured.mockReturnValue(true);
      mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-user-123' } }, error: null });
      mockRpc.mockResolvedValue({
        data: {
          cancelled_prescription_id: 'rx-rev-2',
          fallback_prescription_id: 'rx-v1',
          visit_id: 'visit-test',
          status: 'cancelled',
        },
        error: null,
      });

      const result = await cancelPrescriptionRevision('rx-rev-2');

      expect(mockRpc).toHaveBeenCalledWith('cancel_prescription_revision', {
        p_prescription_id: 'rx-rev-2',
      });
      expect(result.status).toBe('cancelled');
      expect(result.fallback_prescription_id).toBe('rx-v1');
    });
  });

  // ============================================================================
  // 3. UI Component Tests (ElectronicPrescriptionSection)
  // ============================================================================
  describe('3. ElectronicPrescriptionSection UI Cancellation Workflow', () => {
    it('renders "إلغاء مسودة المراجعة" button on v2 draft only and NOT on v1 issued', async () => {
      const visitId = 'visit-ui-test-1';
      const patientId = 'patient-ui-test-1';

      // 1. Issued v1
      const v1: Prescription = {
        id: 'rx-v1-test',
        visit_id: visitId,
        patient_id: patientId,
        status: 'issued',
        revision_number: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [
          {
            id: 'item-1',
            prescription_id: 'rx-v1-test',
            medication_name: 'Paracetamol',
            dosage_form: 'syrup',
            frequency: '3 times daily',
            duration: '3 days',
            display_order: 1,
          },
        ],
      };

      const { unmount } = render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
            initialPrescription={v1}
          />
        </LanguageProvider>
      );

      // Verify button does NOT appear for v1 issued
      expect(screen.queryByTestId('cancel-revision-draft-btn')).toBeNull();
      expect(screen.queryByTestId('bottom-cancel-revision-draft-btn')).toBeNull();
      unmount();

      // 2. Draft v2 (Revision Draft)
      const v2: Prescription = {
        id: 'rx-v2-test',
        visit_id: visitId,
        patient_id: patientId,
        status: 'draft',
        revision_number: 2,
        replaces_prescription_id: 'rx-v1-test',
        original_prescription_id: 'rx-v1-test',
        revision_reason: 'تعديل جرعة',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [
          {
            id: 'item-2',
            prescription_id: 'rx-v2-test',
            medication_name: 'Paracetamol',
            dosage_form: 'syrup',
            frequency: '4 times daily',
            duration: '5 days',
            display_order: 1,
          },
        ],
      };

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
            initialPrescription={v2}
          />
        </LanguageProvider>
      );

      // Verify button DOES appear on v2 draft
      expect(screen.getByTestId('cancel-revision-draft-btn')).toBeDefined();
      expect(screen.getByTestId('bottom-cancel-revision-draft-btn')).toBeDefined();
    });

    it('clicking "إلغاء مسودة المراجعة" opens confirmation modal; clicking "رجوع" closes without cancelling', async () => {
      const visitId = 'visit-ui-test-2';
      const patientId = 'patient-ui-test-2';

      const v2: Prescription = {
        id: 'rx-v2-cancel-modal',
        visit_id: visitId,
        patient_id: patientId,
        status: 'draft',
        revision_number: 2,
        replaces_prescription_id: 'rx-v1-ref',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [
          {
            id: 'item-1',
            prescription_id: 'rx-v2-cancel-modal',
            medication_name: 'Panadol',
            dosage_form: 'syrup',
            frequency: '3 times daily',
            duration: '3 days',
            display_order: 1,
          },
        ],
      };

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
            initialPrescription={v2}
          />
        </LanguageProvider>
      );

      // Open modal
      const cancelBtn = screen.getByTestId('cancel-revision-draft-btn');
      fireEvent.click(cancelBtn);

      // Check modal content (appears in modal description and in the body alert)
      const noticeElements = screen.getAllByText(
        'سيتم إلغاء مسودة المراجعة مع الاحتفاظ بها في السجل، ولن تتغير الوصفة الأصلية المعتمدة.'
      );
      expect(noticeElements.length).toBeGreaterThanOrEqual(1);

      const backBtn = screen.getByTestId('cancel-revision-back-btn');
      expect(backBtn).toBeDefined();

      const confirmBtn = screen.getByTestId('confirm-cancel-revision-draft-btn');
      expect(confirmBtn).toBeDefined();

      // Click "رجوع"
      fireEvent.click(backBtn);

      // Modal closed, v2 draft still displayed
      await waitFor(() => {
        expect(screen.queryByTestId('confirm-cancel-revision-draft-btn')).toBeNull();
      });
    });

    it('shows unsaved changes warning in modal when draft is modified', async () => {
      const visitId = 'visit-ui-test-3';
      const patientId = 'patient-ui-test-3';

      const v2: Prescription = {
        id: 'rx-v2-dirty-test',
        visit_id: visitId,
        patient_id: patientId,
        status: 'draft',
        revision_number: 2,
        replaces_prescription_id: 'rx-v1-ref',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [
          {
            id: 'item-1',
            prescription_id: 'rx-v2-dirty-test',
            medication_name: 'Panadol',
            dosage_form: 'syrup',
            frequency: '3 times daily',
            duration: '3 days',
            display_order: 1,
          },
        ],
      };

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
            initialPrescription={v2}
          />
        </LanguageProvider>
      );

      // Type in general instructions to make it dirty
      const instructionsInput = screen.getByLabelText(/تعليمات وإرشادات عامة/);
      await act(async () => {
        fireEvent.change(instructionsInput, { target: { value: 'تعليمات إضافية جديدة' } });
      });

      // Open cancel modal
      const cancelBtn = screen.getByTestId('cancel-revision-draft-btn');
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      // Verify unsaved changes warning is rendered
      expect(screen.getByTestId('unsaved-changes-cancel-warning')).toBeDefined();
      expect(screen.getByText(/توجد تعديلات غير محفوظة في هذه المسودة/)).toBeDefined();
    });

    it('confirming cancellation calls cancelPrescriptionRevision, switches to v1, and updates URL', async () => {
      const visitId = 'visit-ui-test-4';
      const patientId = 'patient-ui-test-4';

      // Setup v1 and v2 in in-memory store
      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [{ medication_name: 'Original Medicine', dosage_form: 'syrup', frequency: 'Daily', duration: '5 days' }],
        action: 'issue',
      });

      const v2 = await createPrescriptionRevision(v1.id, 'مراجعة أولية');

      const onPrescriptionChanged = vi.fn();
      const onSelectPrescriptionId = vi.fn();

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
            initialPrescription={v2}
            onPrescriptionChanged={onPrescriptionChanged}
            onSelectPrescriptionId={onSelectPrescriptionId}
          />
        </LanguageProvider>
      );

      // Click cancel
      const cancelBtn = screen.getByTestId('cancel-revision-draft-btn');
      fireEvent.click(cancelBtn);

      // Confirm cancel
      const confirmBtn = screen.getByTestId('confirm-cancel-revision-draft-btn');
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      // Verify success alert and switch to v1
      await waitFor(() => {
        expect(screen.getByTestId('rx-success-alert')).toBeDefined();
        expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining(`prescriptionId=${v1.id}`), { scroll: false });
      });

      // Verify callback received v1
      expect(onPrescriptionChanged).toHaveBeenCalledWith(expect.objectContaining({ id: v1.id, status: 'issued' }));
      expect(onSelectPrescriptionId).toHaveBeenCalledWith(v1.id);
    });

    it('on RPC failure, keeps v2 draft open and displays clear error message', async () => {
      const visitId = 'visit-ui-test-5';
      const patientId = 'patient-ui-test-5';

      const v2: Prescription = {
        id: 'rx-v2-fail-test',
        visit_id: visitId,
        patient_id: patientId,
        status: 'draft',
        revision_number: 2,
        replaces_prescription_id: 'rx-v1-ref',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [
          {
            id: 'item-1',
            prescription_id: 'rx-v2-fail-test',
            medication_name: 'Panadol',
            dosage_form: 'syrup',
            frequency: '3 times daily',
            duration: '3 days',
            display_order: 1,
          },
        ],
      };

      vi.spyOn(prescriptionService, 'cancelPrescriptionRevision').mockRejectedValueOnce(
        new Error('تعذر إلغاء المسودة بسبب انقطاع الاتصال')
      );

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
            initialPrescription={v2}
          />
        </LanguageProvider>
      );

      fireEvent.click(screen.getByTestId('cancel-revision-draft-btn'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('confirm-cancel-revision-draft-btn'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('rx-error-alert')).toBeDefined();
        expect(screen.getByText('تعذر إلغاء المسودة بسبب انقطاع الاتصال')).toBeDefined();
      });

      // Still editing v2
      expect(screen.getByTestId('rx-revision-draft-banner')).toBeDefined();
    });

    it('viewing a cancelled revision displays cancelled banner and is strictly read-only', async () => {
      const visitId = 'visit-ui-test-6';
      const patientId = 'patient-ui-test-6';

      const cancelledRx: Prescription = {
        id: 'rx-cancelled-test',
        visit_id: visitId,
        patient_id: patientId,
        status: 'cancelled',
        revision_number: 2,
        cancellation_reason: 'تم إلغاء مسودة المراجعة من قبل الطبيب',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [
          {
            id: 'item-1',
            prescription_id: 'rx-cancelled-test',
            medication_name: 'Cancelled Drug',
            dosage_form: 'syrup',
            frequency: '3 times daily',
            duration: '3 days',
            display_order: 1,
          },
        ],
      };

      await act(async () => {
        render(
          <LanguageProvider>
            <ElectronicPrescriptionSection
              visitId={visitId}
              patientId={patientId}
              initialPrescription={cancelledRx}
            />
          </LanguageProvider>
        );
      });

      // Verify cancelled banner and readonly badge
      expect(screen.getByTestId('rx-cancelled-banner')).toBeDefined();
      expect(screen.getByTestId('rx-cancelled-readonly-badge')).toBeDefined();
      expect(screen.getByText('تم إلغاء مسودة المراجعة من قبل الطبيب')).toBeDefined();

      // No action buttons (save/issue/cancel)
      expect(screen.queryByTestId('save-draft-prescription-btn')).toBeNull();
      expect(screen.queryByTestId('issue-prescription-btn')).toBeNull();
      expect(screen.queryByTestId('cancel-revision-draft-btn')).toBeNull();
      expect(screen.queryByTestId('edit-prescription-btn')).toBeNull();
    });
  });
});

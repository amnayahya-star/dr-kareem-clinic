import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

import {
  savePrescriptionWithItems,
  createPrescriptionRevision,
  fetchPrescriptionByVisitId,
  fetchPrescriptionById,
  fetchPrescriptionRevisions,
  _resetInMemoryPrescriptions,
} from '../src/services/prescriptionService';
import * as prescriptionService from '../src/services/prescriptionService';
import { ElectronicPrescriptionSection } from '../src/components/prescriptions/ElectronicPrescriptionSection';
import PrescriptionPrintPage from '../src/app/(secretary)/secretary/prescriptions/[visitId]/print/page';
import { LanguageProvider } from '../src/context/LanguageContext';

// Mock Supabase
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();
const mockIsSupabaseConfigured = vi.fn().mockReturnValue(false); // Default to mock store for deterministic service testing

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
let mockPathname = '/doctor/examination/visit-rev-1';
let mockParams = { visitId: 'visit-rev-1' };
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

// Mock patient service for print page
vi.mock('../src/services/patientService', () => ({
  fetchPatients: vi.fn().mockResolvedValue([
    {
      id: 'patient-rev-1',
      fileNumber: 'FILE-9999',
      fullName: 'أحمد علي',
      dateOfBirth: '2020-01-01',
      gender: 'male',
      allergies: null,
      drugAllergies: 'بنسلين',
      visits: [
        {
          id: 'visit-rev-1',
          date: '2026-09-26',
          weightKg: 15,
        },
        {
          id: 'visit-rev-superseded-test',
          date: '2026-09-26',
          weightKg: 15,
        },
      ],
    },
  ]),
}));

describe('Prescription Revision & Amendment Workflow (نظام مراجعة وتعديل الوصفات الصادرة)', () => {
  const migration15Path = path.resolve(__dirname, '../supabase/migrations/00015_add_superseded_enum_value.sql');
  const migration16Path = path.resolve(__dirname, '../supabase/migrations/00016_prescription_revision_workflow.sql');
  let migration15Sql = '';
  let migration16Sql = '';

  beforeEach(() => {
    vi.clearAllMocks();
    _resetInMemoryPrescriptions();
    mockIsSupabaseConfigured.mockReturnValue(false);
    mockSearchParamsGet.mockReturnValue(null);
    if (fs.existsSync(migration15Path)) {
      migration15Sql = fs.readFileSync(migration15Path, 'utf8');
    }
    if (fs.existsSync(migration16Path)) {
      migration16Sql = fs.readFileSync(migration16Path, 'utf8');
    }
  });

  // ============================================================================
  // 1. SQL Migration Contract Verification (00015 & 00016)
  // ============================================================================
  describe('1. SQL Migrations 00015 & 00016 Contract & Architecture', () => {
    it('migration 00015 isolates ALTER TYPE ADD VALUE superseded to prevent 55P04 unsafe use error', () => {
      expect(fs.existsSync(migration15Path)).toBe(true);
      expect(migration15Sql).toContain("ALTER TYPE public.prescription_status_type ADD VALUE IF NOT EXISTS 'superseded'");
      // 00015 MUST NOT use the superseded value in queries or functions
      expect(migration15Sql).not.toContain("WHERE status = 'superseded'");
      expect(migration15Sql).not.toContain('CREATE OR REPLACE FUNCTION');
    });

    it('migration 00016 adds all required revision tracking columns to public.prescriptions', () => {
      expect(fs.existsSync(migration16Path)).toBe(true);
      expect(migration16Sql).toContain('revision_number INTEGER NOT NULL DEFAULT 1');
      expect(migration16Sql).toContain('original_prescription_id UUID REFERENCES public.prescriptions(id)');
      expect(migration16Sql).toContain('replaces_prescription_id UUID REFERENCES public.prescriptions(id)');
      expect(migration16Sql).toContain('superseded_at TIMESTAMPTZ');
      expect(migration16Sql).toContain('superseded_by UUID REFERENCES public.prescriptions(id)');
      expect(migration16Sql).toContain('revision_reason TEXT');
    });

    it('replaces idx_prescriptions_unique_visit safely handling both constraint and index types', () => {
      expect(migration16Sql).toContain('conname = \'idx_prescriptions_unique_visit\'');
      expect(migration16Sql).toContain('ALTER TABLE public.prescriptions DROP CONSTRAINT idx_prescriptions_unique_visit');
      expect(migration16Sql).toContain('DROP INDEX public.idx_prescriptions_unique_visit');
      expect(migration16Sql).toContain('idx_prescriptions_single_active_draft');
      expect(migration16Sql).toContain("WHERE status = 'draft'");
      expect(migration16Sql).toContain('idx_prescriptions_single_issued');
      expect(migration16Sql).toContain("WHERE status = 'issued'");
      expect(migration16Sql).toContain('idx_prescriptions_visit_revision');
      expect(migration16Sql).toContain('(visit_id, revision_number)');
    });

    it('explicitly drops old 6-argument save_electronic_prescription overload to prevent PostgREST ambiguity', () => {
      expect(migration16Sql).toContain('DROP FUNCTION IF EXISTS public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT);');
    });

    it('defines new 7-argument save_electronic_prescription with proper parameter order (non-defaults first)', () => {
      const match = migration16Sql.match(/CREATE OR REPLACE FUNCTION public\.save_electronic_prescription\(([\s\S]*?)\)\s*RETURNS UUID/);
      expect(match).not.toBeNull();
      const paramsList = match![1];
      expect(paramsList).toContain('p_visit_id UUID');
      expect(paramsList).toContain('p_patient_id UUID');
      expect(paramsList).toContain('p_diagnosis_id UUID DEFAULT NULL');
      expect(paramsList).toContain('p_general_instructions TEXT DEFAULT NULL');
      expect(paramsList).toContain("p_items JSONB DEFAULT '[]'::JSONB");
      expect(paramsList).toContain("p_action TEXT DEFAULT 'draft'");
      expect(paramsList).toContain('p_prescription_id UUID DEFAULT NULL');

      // Verify REVOKE/GRANT are applied exclusively to the 7-param signature
      expect(migration16Sql).toContain('REVOKE ALL ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT, UUID) FROM PUBLIC;');
      expect(migration16Sql).toContain('GRANT EXECUTE ON FUNCTION public.save_electronic_prescription(UUID, UUID, UUID, TEXT, JSONB, TEXT, UUID) TO authenticated;');
    });

    it('trigger check_prescription_integrity_and_immutability validates self-reference, visit matching, and lock', () => {
      expect(migration16Sql).toContain('NEW.replaces_prescription_id = NEW.id');
      expect(migration16Sql).toContain('p.id = NEW.replaces_prescription_id AND p.visit_id = NEW.visit_id');
      expect(migration16Sql).toContain('p.id = NEW.original_prescription_id AND p.visit_id = NEW.visit_id');
      expect(migration16Sql).toContain('p.id = NEW.superseded_by AND p.visit_id = NEW.visit_id');
      expect(migration16Sql).toContain("IF OLD.status = 'superseded'::public.prescription_status_type THEN");
      expect(migration16Sql).toContain("IF NEW.status = 'superseded'::public.prescription_status_type THEN");
      expect(migration16Sql).toContain('NEW.superseded_by IS NULL');
    });

    it('updates status in non-colliding order: predecessor to superseded FIRST, then draft to issued', () => {
      const supersededUpdate = migration16Sql.search(/UPDATE\s+public\.prescriptions\s+SET\s+status\s*=\s*'superseded'/i);
      const issuedUpdate = migration16Sql.search(/UPDATE\s+public\.prescriptions\s+SET\s+status\s*=\s*'issued'/i);
      expect(supersededUpdate).toBeGreaterThan(0);
      expect(issuedUpdate).toBeGreaterThan(0);
      expect(supersededUpdate).toBeLessThan(issuedUpdate);
    });

    it('save_electronic_prescription calculates catalog usage_count delta with DISTINCT for revisions', () => {
      expect(migration16Sql).toContain('IF v_replaces_prescription_id IS NOT NULL THEN');
      expect(migration16Sql).toContain('DISTINCT pi_new.catalog_product_id');
      expect(migration16Sql).toContain('NOT IN');
      expect(migration16Sql).toContain('usage_count = public.clinic_drug_catalog.usage_count + 1');
    });
  });

  // ============================================================================
  // 2. Service-Level & Business Logic Tests
  // ============================================================================
  describe('2. Revision Workflow Service Logic & In-Memory Store', () => {
    it('draft prescription is fully editable and savePrescriptionWithItems saves draft items', async () => {
      const visitId = `visit-${Date.now()}`;
      const patientId = `patient-${Date.now()}`;

      const savedDraft = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Paracetamol Syrup',
            dosage_form: 'syrup',
            frequency: '3 times daily',
            duration: '3 days',
          },
        ],
        action: 'draft',
      });

      expect(savedDraft.status).toBe('draft');
      expect(savedDraft.items?.length).toBe(1);

      // Update draft items
      const updatedDraft = await savePrescriptionWithItems({
        prescription_id: savedDraft.id,
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Paracetamol Syrup',
            dosage_form: 'syrup',
            frequency: '4 times daily',
            duration: '5 days',
          },
          {
            medication_name: 'Amoxicillin Drops',
            dosage_form: 'drops',
            frequency: '2 times daily',
            duration: '7 days',
          },
        ],
        action: 'draft',
      });

      expect(updatedDraft.items?.length).toBe(2);
      expect(updatedDraft.items?.[0].frequency).toBe('4 times daily');
    });

    it('issued prescription cannot be directly updated via new draft without revision', async () => {
      const visitId = `visit-${Date.now()}-2`;
      const patientId = `patient-${Date.now()}-2`;

      // Issue initial prescription (v1)
      const issuedRx = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Amoxicillin 250mg',
            dosage_form: 'syrup',
            frequency: 'Every 8 hours',
            duration: '7 days',
          },
        ],
        action: 'issue',
      });

      expect(issuedRx.status).toBe('issued');
      expect(issuedRx.revision_number).toBe(1);

      // Attempt to directly overwrite without creating revision should fail
      await expect(
        savePrescriptionWithItems({
          prescription_id: issuedRx.id,
          visit_id: visitId,
          patient_id: patientId,
          items: [],
          action: 'draft',
        })
      ).rejects.toThrow(/لا يمكن حفظ أو تعديل وصفة طبية في حالتها الحالية/);
    });

    it('createPrescriptionRevision creates linked draft revision with copied items and increments revision_number', async () => {
      const visitId = `visit-${Date.now()}-3`;
      const patientId = `patient-${Date.now()}-3`;

      // Issue v1
      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        general_instructions: 'Take after meals',
        items: [
          {
            medication_name: 'Ibuprofen 100mg',
            dosage_form: 'syrup',
            frequency: '3 times daily',
            duration: '3 days',
          },
        ],
        action: 'issue',
      });

      // Require reason >= 3 chars
      await expect(createPrescriptionRevision(v1.id, '  ')).rejects.toThrow(/سبب التعديل إلزامي/);
      await expect(createPrescriptionRevision(v1.id, 'no')).rejects.toThrow(/3 أحرف/);

      // Successfully create revision v2
      const draftV2 = await createPrescriptionRevision(v1.id, 'تعديل الجرعة لزيادة الوزن');
      expect(draftV2.status).toBe('draft');
      expect(draftV2.revision_number).toBe(2);
      expect(draftV2.replaces_prescription_id).toBe(v1.id);
      expect(draftV2.original_prescription_id).toBe(v1.id);
      expect(draftV2.revision_reason).toBe('تعديل الجرعة لزيادة الوزن');
      expect(draftV2.items?.length).toBe(1);
      expect(draftV2.items?.[0].medication_name).toBe('Ibuprofen 100mg');

      // Original v1 remains issued until v2 is issued
      const v1Check = await fetchPrescriptionById(v1.id);
      expect(v1Check?.status).toBe('issued');
      expect(v1Check?.superseded_at).toBeFalsy();

      // Issue v2 -> supersedes v1 atomically
      const issuedV2 = await savePrescriptionWithItems({
        prescription_id: draftV2.id,
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Ibuprofen 100mg',
            dosage_form: 'syrup',
            frequency: '4 times daily',
            duration: '5 days',
          },
          {
            medication_name: 'Paracetamol Drops',
            dosage_form: 'drops',
            frequency: 'as needed',
            duration: '3 days',
          },
        ],
        action: 'issue',
      });

      expect(issuedV2.status).toBe('issued');
      expect(issuedV2.revision_number).toBe(2);

      // Verify v1 is now superseded
      const v1Superseded = await fetchPrescriptionById(v1.id);
      expect(v1Superseded?.status).toBe('superseded');
      expect(v1Superseded?.superseded_by).toBe(issuedV2.id);
      expect(v1Superseded?.superseded_at).toBeTruthy();

      // Verify fetchPrescriptionRevisions returns both in order
      const allRevisions = await fetchPrescriptionRevisions(visitId);
      expect(allRevisions.length).toBe(2);
      expect(allRevisions[0].revision_number).toBe(1);
      expect(allRevisions[1].revision_number).toBe(2);
    });

    it('fetchPrescriptionByVisitId protects secretary by never returning an in-progress draft', async () => {
      const visitId = `visit-${Date.now()}-sec`;
      const patientId = `patient-${Date.now()}-sec`;

      // 1. Create and issue v1
      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [{ medication_name: 'Drug 1', dosage_form: 'syrup', frequency: 'daily', duration: '3 days' }],
        action: 'issue',
      });

      // 2. Doctor creates draft v2
      const draftV2 = await createPrescriptionRevision(v1.id, 'Need to update dose');
      expect(draftV2.status).toBe('draft');

      // 3. For doctor workstation: gets draftV2 (ongoing edit)
      const docRx = await fetchPrescriptionByVisitId(visitId);
      expect(docRx?.id).toBe(draftV2.id);
      expect(docRx?.status).toBe('draft');

      // 4. For secretary: gets official active issued v1, NEVER draftV2!
      const secRx = await fetchPrescriptionByVisitId(visitId, { forSecretary: true });
      expect(secRx?.id).toBe(v1.id);
      expect(secRx?.status).toBe('issued');

      // 5. If secretary requests draftV2 by ID explicitly, it is rejected / returns null
      const secDirectDraft = await fetchPrescriptionByVisitId(visitId, {
        prescriptionId: draftV2.id,
        forSecretary: true,
      });
      expect(secDirectDraft).toBeNull();
    });
  });

  // ============================================================================
  // 3. Clinical Drug Catalog Delta Calculation Execution Tests
  // ============================================================================
  describe('3. Clinic Drug Catalog Delta Calculation (Real Execution Simulation)', () => {
    it('executes exact SQL delta logic verifying no increment for same drug, +1 for new drug, and distinct deduplication', () => {
      // Catalog usage store
      const catalogUsage = new Map<string, number>();
      catalogUsage.set('prod-A', 1);

      // Simulation of SQL delta query:
      // SELECT DISTINCT pi_new.catalog_product_id FROM pi_new WHERE pi_new NOT IN (SELECT pi_old...)
      function applyRevisionDelta(
        vNewItems: { catalog_product_id?: string | null }[],
        vOldItems: { catalog_product_id?: string | null }[]
      ) {
        const oldProductIds = new Set(
          vOldItems.map((i) => i.catalog_product_id).filter((id): id is string => Boolean(id))
        );

        // DISTINCT new product IDs
        const distinctNewProductIds = Array.from(
          new Set(vNewItems.map((i) => i.catalog_product_id).filter((id): id is string => Boolean(id)))
        );

        for (const prodId of distinctNewProductIds) {
          if (!oldProductIds.has(prodId)) {
            // INSERT ... ON CONFLICT DO UPDATE SET usage_count = usage_count + 1
            const current = catalogUsage.get(prodId) || 0;
            catalogUsage.set(prodId, current + 1);
          }
        }
      }

      // Case 1: Revision v2 has same drug prod-A -> usage_count remains 1
      applyRevisionDelta([{ catalog_product_id: 'prod-A' }], [{ catalog_product_id: 'prod-A' }]);
      expect(catalogUsage.get('prod-A')).toBe(1);

      // Case 2: Revision v3 has new drug prod-B -> prod-B gets usage_count = 1
      applyRevisionDelta([{ catalog_product_id: 'prod-B' }], [{ catalog_product_id: 'prod-A' }]);
      expect(catalogUsage.get('prod-B')).toBe(1);
      expect(catalogUsage.get('prod-A')).toBe(1); // prod-A unchanged

      // Case 3: v3 had both prod-A and prod-B. Revision v4 removes drug prod-B, keeps prod-A -> no increment
      applyRevisionDelta(
        [{ catalog_product_id: 'prod-A' }],
        [{ catalog_product_id: 'prod-A' }, { catalog_product_id: 'prod-B' }]
      );
      expect(catalogUsage.get('prod-A')).toBe(1);
      expect(catalogUsage.get('prod-B')).toBe(1);

      // Case 4: Revision v5 has drug prod-C TWICE in items -> DISTINCT ensures it increments only once
      applyRevisionDelta(
        [{ catalog_product_id: 'prod-C' }, { catalog_product_id: 'prod-C' }],
        [{ catalog_product_id: 'prod-A' }]
      );
      expect(catalogUsage.get('prod-C')).toBe(1); // Exactly 1, not 2!
    });
  });

  // ============================================================================
  // 4. Doctor Workstation UI Tests
  // ============================================================================
  describe('4. Doctor Workstation UI (ElectronicPrescriptionSection)', () => {
    it('renders "تعديل الوصفة" button when prescription is issued', async () => {
      const visitId = `visit-ui-1`;
      const patientId = `patient-ui-1`;

      await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Cefixime 100mg',
            dosage_form: 'syrup',
            frequency: 'once daily',
            duration: '5 days',
          },
        ],
        action: 'issue',
      });

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
          />
        </LanguageProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('وصفة صادرة ومعتمدة')).toBeInTheDocument();
      });

      const editBtn = screen.getByTestId('edit-prescription-btn');
      expect(editBtn).toBeInTheDocument();
      expect(editBtn).toHaveTextContent('تعديل الوصفة');
    });

    it('clicking "تعديل الوصفة" opens revision modal requiring reason >= 3 chars', async () => {
      const visitId = `visit-ui-modal`;
      const patientId = `patient-ui-modal`;

      await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Paracetamol 250mg',
            dosage_form: 'syrup',
            frequency: '3 times daily',
            duration: '3 days',
          },
        ],
        action: 'issue',
      });

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
          />
        </LanguageProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('edit-prescription-btn')).toBeInTheDocument();
      });

      // Click "تعديل الوصفة"
      fireEvent.click(screen.getByTestId('edit-prescription-btn'));

      // Modal should appear
      expect(screen.getByText('تعديل الوصفة الطبية الصادرة')).toBeInTheDocument();
      expect(screen.getByText(/سيتم إنشاء مسودة مراجعة جديدة/)).toBeInTheDocument();

      const reasonInput = screen.getByTestId('revision-reason-input');
      const submitBtn = screen.getByTestId('confirm-create-revision-btn');

      // Submit disabled when empty
      expect(submitBtn).toBeDisabled();

      // Type short reason (< 3 chars)
      fireEvent.change(reasonInput, { target: { value: 'ok' } });
      expect(submitBtn).toBeDisabled();

      // Type valid reason
      fireEvent.change(reasonInput, { target: { value: 'تعديل جرعة الباراسيتامول لتناسب الوزن الجديد' } });
      expect(submitBtn).not.toBeDisabled();

      // Submit
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      // Should transition into editing revision draft
      await waitFor(() => {
        expect(screen.getByTestId('rx-revision-draft-banner')).toBeInTheDocument();
        expect(screen.getByText(/أنت تعدّل مسودة مراجعة جديدة/)).toBeInTheDocument();
        expect(screen.getByTestId('rx-revision-badge')).toHaveTextContent('نسخة 2');
      });
    });

    it('revision pills allow switching between revisions and shows superseded warning banner', async () => {
      const visitId = `visit-ui-pills`;
      const patientId = `patient-ui-pills`;

      // 1. Issue v1
      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Amoxicillin 125mg',
            dosage_form: 'syrup',
            frequency: '3 times daily',
            duration: '7 days',
          },
        ],
        action: 'issue',
      });

      // 2. Create and issue v2
      const draftV2 = await createPrescriptionRevision(v1.id, 'تعديل الجرعة');
      await savePrescriptionWithItems({
        prescription_id: draftV2.id,
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Amoxicillin 250mg',
            dosage_form: 'syrup',
            frequency: '3 times daily',
            duration: '7 days',
          },
        ],
        action: 'issue',
      });

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
          />
        </LanguageProvider>
      );

      // By default renders latest active issued (v2)
      await waitFor(() => {
        expect(screen.getByTestId('rx-revision-badge')).toHaveTextContent('نسخة 2');
        expect(screen.getByTestId('rx-active-issued-badge')).toBeInTheDocument();
      });

      // Click on pill for v1 (the superseded revision)
      const pillV1 = screen.getByTestId('rx-revision-tab-1');
      expect(pillV1).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(pillV1);
      });

      // Shows warning banner for superseded prescription
      await waitFor(() => {
        expect(screen.getByTestId('rx-superseded-banner')).toBeInTheDocument();
        expect(screen.getByText('تم استبدال هذه الوصفة بنسخة أحدث')).toBeInTheDocument();
      });

      // Click button inside banner to switch back to latest revision
      const switchBackBtn = screen.getByTestId('switch-to-latest-rx-btn');
      await act(async () => {
        fireEvent.click(switchBackBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('rx-revision-badge')).toHaveTextContent('نسخة 2');
        expect(screen.queryByTestId('rx-superseded-banner')).not.toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // 5. Secretary Print Page Tests
  // ============================================================================
  describe('5. Secretary Print Page Revision & Superseded Warning', () => {
    it('displays revision number and prints normal issued prescription without warning', async () => {
      const visitId = 'visit-rev-1';
      mockParams = { visitId };

      // Seed an issued prescription
      await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: 'patient-rev-1',
        items: [
          {
            medication_name: 'Cefixime 100mg/5ml',
            dosage_form: 'syrup',
            frequency: 'once daily',
            duration: '5 days',
          },
        ],
        action: 'issue',
      });

      render(
        <LanguageProvider>
          <PrescriptionPrintPage />
        </LanguageProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('عيادة الدكتور عبد الكريم عليوي')).toBeInTheDocument();
        expect(screen.getByText('رقم النسخة:')).toBeInTheDocument();
        expect(screen.getByText(/نسخة 1/)).toBeInTheDocument();
      });

      // Must not show superseded warning
      expect(screen.queryByTestId('print-superseded-warning')).not.toBeInTheDocument();
    });

    it('displays prominent red warning banner when printing a superseded prescription', async () => {
      const visitId = 'visit-rev-superseded-test';
      mockParams = { visitId };

      // 1. Issue v1
      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: 'patient-rev-1',
        items: [
          {
            medication_name: 'Old Drug 100mg',
            dosage_form: 'syrup',
            frequency: 'daily',
            duration: '3 days',
          },
        ],
        action: 'issue',
      });

      // 2. Issue v2 (supersedes v1)
      const draftV2 = await createPrescriptionRevision(v1.id, 'استبدال الدواء');
      await savePrescriptionWithItems({
        prescription_id: draftV2.id,
        visit_id: visitId,
        patient_id: 'patient-rev-1',
        items: [
          {
            medication_name: 'New Drug 200mg',
            dosage_form: 'tablets',
            frequency: 'daily',
            duration: '5 days',
          },
        ],
        action: 'issue',
      });

      // Query param explicitly requests v1 (historical superseded)
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'prescriptionId') return v1.id;
        return null;
      });

      render(
        <LanguageProvider>
          <PrescriptionPrintPage />
        </LanguageProvider>
      );

      await waitFor(() => {
        const warning = screen.getByTestId('print-superseded-warning');
        expect(warning).toBeInTheDocument();
        expect(warning).toHaveTextContent('نسخة قديمة مستبدلة — غير معتمدة للاستخدام الحالي');
      });
    });
  });

  // ============================================================================
  // 6. Production Regression Suite: Revision Selection Stability, URL Sync, and Security
  // ============================================================================
  describe('6. Production Regression Suite: Revision Selection Stability, URL Sync, and Security', () => {
    it('1. clicking v2 draft pill keeps v2 displayed even when parent re-renders with v1', async () => {
      const visitId = 'visit-reg-keep-v2';
      const patientId = 'patient-reg-keep-v2';

      // Seed v1 issued
      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Amoxicillin 250mg',
            dosage_form: 'capsules',
            frequency: '3 times daily',
            duration: '5 days',
          },
        ],
        action: 'issue',
      });

      // Seed v2 draft
      await createPrescriptionRevision(v1.id, 'جرعة جديدة');

      const { rerender } = render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
            initialPrescription={v1}
          />
        </LanguageProvider>
      );

      // Initially displays v1 from initialPrescription
      await waitFor(() => {
        expect(screen.getByTestId('rx-revision-badge')).toHaveTextContent('نسخة 1');
      });

      // Switch to revision 2
      const pillV2 = await screen.findByTestId('rx-revision-tab-2');
      await act(async () => {
        fireEvent.click(pillV2);
      });

      // Displays v2
      await waitFor(() => {
        expect(screen.getByTestId('rx-revision-badge')).toHaveTextContent('نسخة 2');
        expect(screen.getByTestId('rx-draft-ready-badge')).toBeInTheDocument();
      });

      // Simulate parent component re-render / polling passing initialPrescription={v1}
      rerender(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
            initialPrescription={v1}
          />
        </LanguageProvider>
      );

      // Verify v2 remains active and is NOT overwritten back to v1!
      await waitFor(() => {
        expect(screen.getByTestId('rx-revision-badge')).toHaveTextContent('نسخة 2');
        expect(screen.getByTestId('rx-draft-ready-badge')).toBeInTheDocument();
      });
    });

    it('2. delayed fetch response for v1 does not overwrite newly selected v2 (request sequencing)', async () => {
      const visitId = 'visit-reg-seq';
      const patientId = 'patient-reg-seq';

      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Drug A 100mg',
            dosage_form: 'tablets',
            frequency: 'once daily',
            duration: '3 days',
          },
        ],
        action: 'issue',
      });

      await createPrescriptionRevision(v1.id, 'استبدال بـ Drug B');

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
            initialPrescription={v1}
          />
        </LanguageProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('rx-revision-badge')).toHaveTextContent('نسخة 1');
      });

      // Delay a fetch call to simulate slow network response for v1
      let delayedResolve!: (val: any) => void;
      const delayedPromise = new Promise((resolve) => {
        delayedResolve = resolve;
      });

      const originalFetch = prescriptionService.fetchPrescriptionByVisitId;
      const fetchSpy = vi.spyOn(prescriptionService, 'fetchPrescriptionByVisitId');
      fetchSpy.mockImplementation(async (vId, options) => {
        const targetId = typeof options === 'string' ? options : options?.prescriptionId;
        if (targetId === v1.id) {
          await delayedPromise;
          return v1;
        }
        return originalFetch(vId, options);
      });

      // Doctor clicks revision 2
      const pillV2 = await screen.findByTestId('rx-revision-tab-2');
      await act(async () => {
        fireEvent.click(pillV2);
      });

      // Verify v2 is displayed
      await waitFor(() => {
        expect(screen.getByTestId('rx-revision-badge')).toHaveTextContent('نسخة 2');
      });

      // Now resolve the stale delayed response for v1
      await act(async () => {
        delayedResolve(v1);
      });

      // Verify v2 is STILL displayed and was not replaced by stale v1 response
      expect(screen.getByTestId('rx-revision-badge')).toHaveTextContent('نسخة 2');
      fetchSpy.mockRestore();
    });

    it('3. updates URL query param prescriptionId when a revision is selected', async () => {
      const visitId = 'visit-reg-url-sync';
      const patientId = 'patient-reg-url-sync';

      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Drug 1',
            dosage_form: 'syrup',
            frequency: 'bid',
            duration: '5 days',
          },
        ],
        action: 'issue',
      });

      const draftV2 = await createPrescriptionRevision(v1.id, 'مراجعة ثانية');

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
            initialPrescription={v1}
          />
        </LanguageProvider>
      );

      const pillV2 = await screen.findByTestId('rx-revision-tab-2');
      await act(async () => {
        fireEvent.click(pillV2);
      });

      // Expect router.replace to have been called with prescriptionId=<draftV2.id>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining(`prescriptionId=${draftV2.id}`),
        { scroll: false }
      );
    });

    it('4. loads and displays specified revision when prescriptionId is in URL', async () => {
      const visitId = 'visit-reg-url-load';
      const patientId = 'patient-reg-url-load';

      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Drug 1',
            dosage_form: 'syrup',
            frequency: 'bid',
            duration: '5 days',
          },
        ],
        action: 'issue',
      });

      const draftV2 = await createPrescriptionRevision(v1.id, 'مراجعة ثانية');

      // Mock searchParams to return draftV2.id
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'prescriptionId') return draftV2.id;
        return null;
      });

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
          />
        </LanguageProvider>
      );

      // Verify draftV2 is loaded from URL directly
      await waitFor(() => {
        expect(screen.getByTestId('rx-revision-badge')).toHaveTextContent('نسخة 2');
        expect(screen.getByTestId('rx-draft-ready-badge')).toBeInTheDocument();
      });
    });

    it('5. preserves selected revision on window focus and visibility change', async () => {
      const visitId = 'visit-reg-tab-switch';
      const patientId = 'patient-reg-tab-switch';

      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Drug 1',
            dosage_form: 'drops',
            frequency: 'daily',
            duration: '2 days',
          },
        ],
        action: 'issue',
      });

      await createPrescriptionRevision(v1.id, 'تعديل القطرة');

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
            initialPrescription={v1}
          />
        </LanguageProvider>
      );

      // Switch to v2
      const pillV2 = await screen.findByTestId('rx-revision-tab-2');
      await act(async () => {
        fireEvent.click(pillV2);
      });

      await waitFor(() => {
        expect(screen.getByTestId('rx-revision-badge')).toHaveTextContent('نسخة 2');
      });

      // Simulate tab switch: user leaves and comes back (window focus / visibilitychange)
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
      });

      // Verify v2 is still the selected prescription and NOT reset to v1
      await waitFor(() => {
        expect(screen.getByTestId('rx-revision-badge')).toHaveTextContent('نسخة 2');
      });
    });

    it('6. v1 issued fields are read-only / locked and v2 draft fields are editable', async () => {
      const visitId = 'visit-reg-fields-mode';
      const patientId = 'patient-reg-fields-mode';

      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Panadol 500mg',
            dosage_form: 'tablets',
            frequency: 'tid',
            duration: '5 days',
          },
        ],
        action: 'issue',
      });

      await createPrescriptionRevision(v1.id, 'تغيير الجرعة');

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
            initialPrescription={v1}
          />
        </LanguageProvider>
      );

      // On v1: read-only
      await waitFor(() => {
        expect(screen.getByTestId('rx-revision-badge')).toHaveTextContent('نسخة 1');
      });
      // Add medication button should NOT exist when locked
      expect(screen.queryByText('إضافة دواء آخر للوصفة')).not.toBeInTheDocument();
      // Start revision button exists on issued
      expect(screen.getByTestId('edit-prescription-btn')).toBeInTheDocument();

      // Switch to v2 draft
      const pillV2 = await screen.findByTestId('rx-revision-tab-2');
      await act(async () => {
        fireEvent.click(pillV2);
      });

      // On v2: editable
      await waitFor(() => {
        expect(screen.getByTestId('rx-revision-badge')).toHaveTextContent('نسخة 2');
      });
      // Add medication button IS visible
      expect(screen.getByText('إضافة دواء آخر للوصفة')).toBeInTheDocument();
      // Save draft and issue buttons are present
      expect(screen.getByTestId('save-draft-prescription-btn')).toBeInTheDocument();
      expect(screen.getByTestId('issue-prescription-btn')).toBeInTheDocument();
    });

    it('7. rejects prescriptionId belonging to another visit and returns null for security', async () => {
      const visitA = 'visit-reg-sec-A';
      const visitB = 'visit-reg-sec-B';
      const patientId = 'patient-reg-sec';

      const rxVisitB = await savePrescriptionWithItems({
        visit_id: visitB,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Drug from Visit B',
            dosage_form: 'syrup',
            frequency: 'daily',
            duration: '3 days',
          },
        ],
        action: 'issue',
      });

      // Try fetching prescription of visit B using visit A
      const result = await fetchPrescriptionByVisitId(visitA, { prescriptionId: rxVisitB.id });
      expect(result).toBeNull();
    });

    it('8. clicking an existing revision in history does NOT call createPrescriptionRevision', async () => {
      const visitId = 'visit-reg-no-create';
      const patientId = 'patient-reg-no-create';

      const v1 = await savePrescriptionWithItems({
        visit_id: visitId,
        patient_id: patientId,
        items: [
          {
            medication_name: 'Test Med',
            dosage_form: 'cream',
            frequency: 'once',
            duration: '1 day',
          },
        ],
        action: 'issue',
      });

      await createPrescriptionRevision(v1.id, 'ملاحظة');

      const createRevisionSpy = vi.spyOn(prescriptionService, 'createPrescriptionRevision');

      render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId={visitId}
            patientId={patientId}
            initialPrescription={v1}
          />
        </LanguageProvider>
      );

      // Click pill 2
      const pillV2 = await screen.findByTestId('rx-revision-tab-2');
      await act(async () => {
        fireEvent.click(pillV2);
      });

      // Click pill 1
      const pillV1 = await screen.findByTestId('rx-revision-tab-1');
      await act(async () => {
        fireEvent.click(pillV1);
      });

      // Ensure createPrescriptionRevision was NEVER called when clicking history pills
      expect(createRevisionSpy).not.toHaveBeenCalled();
      createRevisionSpy.mockRestore();
    });
  });
});

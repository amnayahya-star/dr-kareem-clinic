import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Button } from '../src/components/ui/Button';
import { Badge } from '../src/components/ui/Badge';
import { Alert } from '../src/components/ui/Alert';
import DoctorClinicalWorkstationPage from '../src/app/(doctor)/doctor/page';
import SecretaryPureWorkflowPage from '../src/app/(secretary)/secretary/page';
import { ElectronicPrescriptionSection } from '../src/components/prescriptions/ElectronicPrescriptionSection';
import * as prescriptionService from '../src/services/prescriptionService';
import { LanguageProvider } from '../src/context/LanguageContext';
import { PatientFile } from '../src/lib/mock-data/patients';

// Mock dependencies
const mockFetchPatients = vi.fn();
const mockFetchDeletedPatients = vi.fn().mockResolvedValue([]);
const mockSaveDoctorDiagnosis = vi.fn();

vi.mock('../src/services/patientService', () => ({
  fetchPatients: () => mockFetchPatients(),
  fetchDeletedPatients: () => mockFetchDeletedPatients(),
}));

vi.mock('../src/services/visitService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/visitService')>();
  return {
    ...actual,
    saveDoctorDiagnosis: (...args: any[]) => mockSaveDoctorDiagnosis(...args),
  };
});

vi.mock('../src/services/storageService', () => ({
  getSignedPhotoUrl: vi.fn().mockResolvedValue('https://signed.url/image.jpg'),
}));

vi.mock('../src/services/notificationService', () => ({
  notifyDoctorApprovedVisit: vi.fn(),
  subscribeToClinicNotifications: vi.fn().mockReturnValue(() => {}),
  getClinicNotifications: vi.fn().mockReturnValue([]),
  playNotificationChime: vi.fn(),
  cleanLegacyMockStorage: vi.fn(),
  isMockNotification: vi.fn().mockReturnValue(false),
  markNotificationSnapped: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('UI Base Components', () => {
  it('renders button with arabic label', () => {
    render(<Button>حفظ البيانات</Button>);
    expect(screen.getByText('حفظ البيانات')).toBeInTheDocument();
  });

  it('renders badge with warning variant', () => {
    render(<Badge variant="warning">بانتظار الطبيب</Badge>);
    const badge = screen.getByText('بانتظار الطبيب');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-amber-700');
  });

  it('renders alert with title and content', () => {
    render(
      <Alert variant="danger" title="تنبيه الحساسية">
        يوجد حساسية من البنسلين
      </Alert>
    );
    expect(screen.getByText('تنبيه الحساسية')).toBeInTheDocument();
    expect(screen.getByText('يوجد حساسية من البنسلين')).toBeInTheDocument();
  });
});

const mockPatient1: PatientFile = {
  id: 'p-test-1',
  fullName: 'أحمد علي',
  fileNumber: 'FILE-001',
  dateOfBirth: '2022-01-01',
  gender: 'male',
  guardianName: 'علي محمد',
  relationship: 'father',
  phone: '07701234567',
  address: 'بغداد',
  createdAt: '2026-01-01',
  allLabPhotos: [],
  allPrescriptionPhotos: [],
  visits: [
    {
      id: 'v-act-1',
      patientId: 'p-test-1',
      date: '2026-09-06',
      status: 'waiting',
      weightKg: 14.5,
      temperatureC: 38.2,
      isCompleted: false,
      labPhotos: [],
      symptoms: '',
      clinicalExamination: '',
      diagnosisText: '',
      recommendations: '',
      doctorNotes: '',
    },
  ],
};

const mockPatient2: PatientFile = {
  id: 'p-test-2',
  fullName: 'سارة حسن',
  fileNumber: 'FILE-002',
  dateOfBirth: '2023-05-15',
  gender: 'female',
  guardianName: 'حسن كريم',
  relationship: 'father',
  phone: '07801234567',
  address: 'البصرة',
  createdAt: '2026-02-01',
  allLabPhotos: [],
  allPrescriptionPhotos: [],
  visits: [
    {
      id: 'v-act-2',
      patientId: 'p-test-2',
      date: '2026-09-06',
      status: 'waiting',
      weightKg: 11.0,
      temperatureC: 37.0,
      isCompleted: false,
      labPhotos: [],
      symptoms: 'أعراض سابقة محفوظة لسارة',
      clinicalExamination: 'فحص سابق لسارة',
      diagnosisText: 'التهاب الأذن',
    },
  ],
};

const renderDoctorPage = () => {
  return render(
    <LanguageProvider>
      <DoctorClinicalWorkstationPage />
    </LanguageProvider>
  );
};

describe('Doctor Workstation Clinical Form State & Hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPatients.mockResolvedValue([mockPatient1, mockPatient2]);
  });

  it('preserves typed fields when switching and typing across multiple fields', async () => {
    renderDoctorPage();

    await waitFor(() => {
      expect(screen.getByText('أحمد علي')).toBeInTheDocument();
    });

    const startExamBtns = screen.getAllByText('بدء الفحص');
    fireEvent.click(startExamBtns[0]);

    await waitFor(() => {
      expect(screen.getByLabelText(/الأعراض السريرية/i)).toBeInTheDocument();
    });

    const symptomsInput = screen.getByLabelText(/الأعراض السريرية/i) as HTMLTextAreaElement;
    const examInput = screen.getByLabelText(/نتائج الفحص السريري/i) as HTMLTextAreaElement;
    const diagnosisInput = screen.getByLabelText(/التشخيص الطبي النهائي/i) as HTMLInputElement;

    // Type in Symptoms
    fireEvent.change(symptomsInput, { target: { value: 'حمى مستمرة وسعال' } });
    expect(symptomsInput.value).toBe('حمى مستمرة وسعال');

    // Type in Clinical Examination
    fireEvent.change(examInput, { target: { value: 'احتقان بالحلق وخشونة بالصدر' } });
    expect(examInput.value).toBe('احتقان بالحلق وخشونة بالصدر');
    // Verify Symptoms was NOT cleared or reset
    expect(symptomsInput.value).toBe('حمى مستمرة وسعال');

    // Type in Diagnosis
    fireEvent.change(diagnosisInput, { target: { value: 'التهاب قصبات حاد' } });
    expect(diagnosisInput.value).toBe('التهاب قصبات حاد');
    // Verify all previous fields remained intact
    expect(symptomsInput.value).toBe('حمى مستمرة وسعال');
    expect(examInput.value).toBe('احتقان بالحلق وخشونة بالصدر');
  });

  it('does not reset form values during background polling re-render for the same patient and visit', async () => {
    renderDoctorPage();

    await waitFor(() => {
      expect(screen.getByText('أحمد علي')).toBeInTheDocument();
    });

    const startExamBtns = screen.getAllByText('بدء الفحص');
    fireEvent.click(startExamBtns[0]);

    await waitFor(() => {
      expect(screen.getByLabelText(/الأعراض السريرية/i)).toBeInTheDocument();
    });

    const symptomsInput = screen.getByLabelText(/الأعراض السريرية/i) as HTMLTextAreaElement;
    const diagnosisInput = screen.getByLabelText(/التشخيص الطبي النهائي/i) as HTMLInputElement;

    fireEvent.change(symptomsInput, { target: { value: 'قيء وإسهال حاد' } });
    fireEvent.change(diagnosisInput, { target: { value: 'نزلات معوية' } });

    // Simulate background sync returning fresh patient array reference with same IDs
    await act(async () => {
      mockFetchPatients.mockResolvedValueOnce([{ ...mockPatient1 }, { ...mockPatient2 }]);
    });

    // Form inputs must not be wiped by polling or re-renders
    expect(symptomsInput.value).toBe('قيء وإسهال حاد');
    expect(diagnosisInput.value).toBe('نزلات معوية');
  });

  it('resets the form and prevents data leakage when switching between different patients', async () => {
    renderDoctorPage();

    await waitFor(() => {
      expect(screen.getByText('أحمد علي')).toBeInTheDocument();
    });

    // 1. Select Patient 1 and type confidential notes
    const startExamBtns = screen.getAllByText('بدء الفحص');
    fireEvent.click(startExamBtns[0]);

    await waitFor(() => {
      expect(screen.getByLabelText(/الأعراض السريرية/i)).toBeInTheDocument();
    });

    const symptomsInput1 = screen.getByLabelText(/الأعراض السريرية/i) as HTMLTextAreaElement;
    const diagnosisInput1 = screen.getByLabelText(/التشخيص الطبي النهائي/i) as HTMLInputElement;

    fireEvent.change(symptomsInput1, { target: { value: 'شكوى خاصة بالطفل أحمد' } });
    fireEvent.change(diagnosisInput1, { target: { value: 'تشخيص خاص بأحمد' } });

    // 2. Go back to children list
    const backBtn = screen.getByText('العودة لجدول وسلسلة الأطفال');
    fireEvent.click(backBtn);

    // 3. Select Patient 2
    await waitFor(() => {
      expect(screen.getByText('سارة حسن')).toBeInTheDocument();
    });

    const startExamBtnsAfter = screen.getAllByText('بدء الفحص');
    fireEvent.click(startExamBtnsAfter[1]);

    await waitFor(() => {
      expect(screen.getByText('سارة حسن')).toBeInTheDocument();
    });

    const symptomsInput2 = screen.getByLabelText(/الأعراض السريرية/i) as HTMLTextAreaElement;
    const diagnosisInput2 = screen.getByLabelText(/التشخيص الطبي النهائي/i) as HTMLInputElement;

    // Must NOT contain Patient 1's typed inputs; must contain Patient 2's saved data
    expect(symptomsInput2.value).not.toContain('أحمد');
    expect(diagnosisInput2.value).not.toContain('أحمد');
    expect(symptomsInput2.value).toBe('أعراض سابقة محفوظة لسارة');
    expect(diagnosisInput2.value).toBe('التهاب الأذن');
  });

  it('renders completed visit summary and electronic prescription section when no active visit is available', async () => {
    const patientWithoutActiveVisit: PatientFile = {
      ...mockPatient1,
      id: 'p-no-active',
      fullName: 'خالد عمر',
      fileNumber: 'FILE-NO-ACT',
      visits: [
        {
          id: 'v-completed',
          patientId: 'p-no-active',
          date: '2026-08-01',
          status: 'completed',
          isCompleted: true,
          labPhotos: [],
          diagnosisText: 'التهاب الأذن الوسطى الحاد',
        },
      ],
    };

    mockFetchPatients.mockResolvedValue([patientWithoutActiveVisit]);

    renderDoctorPage();

    await waitFor(() => {
      expect(screen.getByText('خالد عمر')).toBeInTheDocument();
    });

    const startExamBtn = screen.getByText('بدء الفحص');
    fireEvent.click(startExamBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 4, name: /أحدث زيارة مسجلة ومعتمدة/i })).toBeInTheDocument();
      expect(screen.getByText('التهاب الأذن الوسطى الحاد')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: /الوصفة الطبية الإلكترونية/i })).toBeInTheDocument();
    });

    // Clinical examination form inputs should not be rendered for completed visit
    expect(screen.queryByLabelText(/الأعراض السريرية/i)).not.toBeInTheDocument();
  });

  it('does NOT automatically trigger paper prescription notification upon approving visit, but keeps e-Rx accessible and allows explicit paper rx opt-in', async () => {
    const { notifyDoctorApprovedVisit } = await import('../src/services/notificationService');
    mockSaveDoctorDiagnosis.mockResolvedValue(undefined);

    let currentPatients = [{ ...mockPatient1 }, { ...mockPatient2 }];
    mockFetchPatients.mockImplementation(() => Promise.resolve(currentPatients));

    renderDoctorPage();

    await waitFor(() => {
      expect(screen.getByText('أحمد علي')).toBeInTheDocument();
    });

    const startExamBtns = screen.getAllByText('بدء الفحص');
    fireEvent.click(startExamBtns[0]);

    await waitFor(() => {
      expect(screen.getByLabelText(/التشخيص الطبي النهائي/i)).toBeInTheDocument();
    });

    const diagnosisInput = screen.getByLabelText(/التشخيص الطبي النهائي/i) as HTMLInputElement;
    fireEvent.change(diagnosisInput, { target: { value: 'نزلة معوية حادة' } });

    // Update currentPatients to reflect completion so polling doesn't overwrite
    currentPatients = [
      {
        ...mockPatient1,
        visits: [
          {
            ...mockPatient1.visits[0],
            status: 'completed',
            isCompleted: true,
            diagnosisText: 'نزلة معوية حادة',
          },
        ],
      },
      { ...mockPatient2 },
    ];

    const approveBtn = screen.getByRole('button', { name: /اعتماد وتوثيق الزيارة/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(mockSaveDoctorDiagnosis).toHaveBeenCalled();
    });

    // 1. Verify notification was NOT automatically dispatched
    expect(notifyDoctorApprovedVisit).not.toHaveBeenCalled();

    // 2. Verify success state renders e-prescription section
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: /تم توثيق واعتماد الكشف والتشخيص الطبي/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: /الوصفة الطبية الإلكترونية/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /استخدام وصفة ورقية/i })).toBeInTheDocument();
    });

    // 3. Explicitly click paper prescription button
    const paperRxBtn = screen.getByRole('button', { name: /استخدام وصفة ورقية/i });
    fireEvent.click(paperRxBtn);

    expect(notifyDoctorApprovedVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        visitId: 'v-act-1',
        patientId: 'p-test-1',
        childName: 'أحمد علي',
      })
    );
  });

  it('renders clean empty state on Doctor Workstation when patients array is empty (no mock data)', async () => {
    mockFetchPatients.mockResolvedValueOnce([]);

    renderDoctorPage();

    await waitFor(() => {
      expect(screen.getByText(/لا يوجد أطفال يطابقون البحث/i)).toBeInTheDocument();
    });

    // Verify mock patients are NOT rendered
    expect(screen.queryByText('أحمد علي')).not.toBeInTheDocument();
    expect(screen.queryByText('يوسف أحمد العلي')).not.toBeInTheDocument();
    expect(screen.queryByText('P-1001')).not.toBeInTheDocument();
    expect(screen.queryByText('P-1002')).not.toBeInTheDocument();
  });
});

describe('Secretary Page Empty State & Dynamic Metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPatients.mockResolvedValue([]);
    mockFetchDeletedPatients.mockResolvedValue([]);
  });

  it('renders genuine empty state and zero metrics when no patients exist (never displays mock data)', async () => {
    render(
      <LanguageProvider>
        <SecretaryPureWorkflowPage />
      </LanguageProvider>
    );

    await waitFor(() => {
      // Empty waiting queue state
      expect(screen.getByText(/لا يوجد أطفال بالانتظار حالياً/i)).toBeInTheDocument();
      // Empty registered children state
      expect(screen.getByText(/لا يوجد أطفال يطابقون البحث/i)).toBeInTheDocument();
    });

    // Verify no mock data files or mock tickets are present
    expect(screen.queryByText('P-1001')).not.toBeInTheDocument();
    expect(screen.queryByText('P-1002')).not.toBeInTheDocument();
    expect(screen.queryByText('Q-001')).not.toBeInTheDocument();
    expect(screen.queryByText('Q-002')).not.toBeInTheDocument();
    expect(screen.queryByText('يوسف أحمد العلي')).not.toBeInTheDocument();
    expect(screen.queryByText('مريم حسن')).not.toBeInTheDocument();

    // Verify metric cards show 0
    const zeroElements = screen.getAllByText('0');
    expect(zeroElements.length).toBeGreaterThanOrEqual(3);

    // Verify the yellow prescription alert banner is NOT displayed
    expect(screen.queryByText(/أطفال بانتظار تصوير الوصفة/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/يرجى تصوير الروشتات/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/يوسف أحمد العلي/i)).not.toBeInTheDocument();
  });
});

describe('ElectronicPrescriptionSection (التحقق من رسائل الخطأ والنجاح ومنع الإصدار الناقص)', () => {
  const mockInitialDraft = {
    id: 'rx-draft-1',
    visit_id: 'v-100',
    patient_id: 'p-100',
    status: 'draft' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    items: [
      {
        id: 'item-1',
        prescription_id: 'rx-draft-1',
        medication_name: 'TEST MEDICATION',
        dosage_form: null,
        dose: null,
        frequency: null,
        duration: null,
        display_order: 1,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays clear red error mentioning missing fields when trying to issue incomplete draft, does NOT call RPC, and clears old success messages', async () => {
    const spySave = vi.spyOn(prescriptionService, 'savePrescriptionWithItems');

    render(
      <LanguageProvider>
        <ElectronicPrescriptionSection
          visitId="v-100"
          patientId="p-100"
          initialPrescription={mockInitialDraft as any}
        />
      </LanguageProvider>
    );

    // Initial state: badge shows incomplete draft
    expect(screen.getByText('مسودة غير مكتملة')).toBeInTheDocument();

    // Find "اعتماد وإصدار الوصفة" button and click it
    const issueBtn = screen.getByRole('button', { name: /اعتماد وإصدار الوصفة/i });
    fireEvent.click(issueBtn);

    // 1. Error message appears mentioning missing fields and item name
    await waitFor(() => {
      const errorAlert = screen.getByTestId('rx-error-alert');
      expect(errorAlert).toBeInTheDocument();
      expect(errorAlert.textContent).toContain('لا يمكن إصدار الوصفة: أكمل');
      expect(errorAlert.textContent).toContain('الشكل الدوائي');
      expect(errorAlert.textContent).toContain('عدد مرات الاستخدام (التكرار)');
      expect(errorAlert.textContent).toContain('المدة');
      expect(errorAlert.textContent).toContain('للدواء رقم 1');
      expect(errorAlert.textContent).toContain('TEST MEDICATION');
    });

    // 2. RPC was NOT called on local validation failure
    expect(spySave).not.toHaveBeenCalled();

    // 3. Status remains draft and badge is still incomplete
    expect(screen.getByText('مسودة غير مكتملة')).toBeInTheDocument();
    expect(screen.queryByTestId('rx-success-alert')).not.toBeInTheDocument();
  });

  it('clears previous green success message immediately when a new issue attempt fails validation', async () => {
    const spySave = vi.spyOn(prescriptionService, 'savePrescriptionWithItems');
    spySave.mockResolvedValueOnce({
      ...mockInitialDraft,
      items: [
        {
          id: 'item-1',
          prescription_id: 'rx-draft-1',
          medication_name: 'TEST MEDICATION',
          dosage_form: null,
          dose: null,
          frequency: null,
          duration: null,
          display_order: 1,
        },
      ],
    } as any);

    render(
      <LanguageProvider>
        <ElectronicPrescriptionSection
          visitId="v-100"
          patientId="p-100"
          initialPrescription={mockInitialDraft as any}
        />
      </LanguageProvider>
    );

    // Click "حفظ كمسودة"
    const draftBtn = screen.getByRole('button', { name: /حفظ كمسودة/i });
    fireEvent.click(draftBtn);

    // Success message should appear
    await waitFor(() => {
      expect(screen.getByTestId('rx-success-alert')).toBeInTheDocument();
      expect(screen.getByText('تم حفظ مسودة الوصفة الطبية بنجاح')).toBeInTheDocument();
    });

    // Now click "اعتماد وإصدار الوصفة" with incomplete fields
    const issueBtn = screen.getByRole('button', { name: /اعتماد وإصدار الوصفة/i });
    fireEvent.click(issueBtn);

    // 1. Success alert MUST disappear immediately
    await waitFor(() => {
      expect(screen.queryByTestId('rx-success-alert')).not.toBeInTheDocument();
      expect(screen.queryByText('تم حفظ مسودة الوصفة الطبية بنجاح')).not.toBeInTheDocument();
    });

    // 2. Dedicated red error alert MUST be visible
    const errorAlert = screen.getByTestId('rx-error-alert');
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert.textContent).toContain('لا يمكن إصدار الوصفة: أكمل');

    // 3. RPC for issue was NOT called
    expect(spySave).toHaveBeenCalledTimes(1); // Only the previous draft save
  });

  it('preserves typed values during polling re-renders and displays unsaved changes badge', async () => {
    const { rerender } = render(
      <LanguageProvider>
        <ElectronicPrescriptionSection
          visitId="v-100"
          patientId="p-100"
          initialPrescription={mockInitialDraft as any}
        />
      </LanguageProvider>
    );

    // Initial state: no dirty badge
    expect(screen.queryByTestId('rx-dirty-badge')).not.toBeInTheDocument();

    // Type in medication name and frequency
    const nameInput = screen.getByDisplayValue('TEST MEDICATION');
    fireEvent.change(nameInput, { target: { value: 'Paracetamol Syrup 120mg' } });

    // Dirty badge should now appear
    expect(screen.getByTestId('rx-dirty-badge')).toBeInTheDocument();
    expect(screen.getByText('تعديلات غير محفوظة')).toBeInTheDocument();

    // Simulate 1st background polling (3s later): new object reference with old data arrives
    const pollingPrescription1 = {
      ...mockInitialDraft,
      items: [
        {
          id: 'item-1',
          prescription_id: 'rx-draft-1',
          medication_name: 'TEST MEDICATION',
          dosage_form: null,
          dose: null,
          frequency: null,
          duration: null,
          display_order: 1,
        },
      ],
    };

    rerender(
      <LanguageProvider>
        <ElectronicPrescriptionSection
          visitId="v-100"
          patientId="p-100"
          initialPrescription={pollingPrescription1 as any}
        />
      </LanguageProvider>
    );

    // Verify typed value is PRESERVED and NOT wiped out by polling
    expect(screen.getByDisplayValue('Paracetamol Syrup 120mg')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('TEST MEDICATION')).not.toBeInTheDocument();
    expect(screen.getByTestId('rx-dirty-badge')).toBeInTheDocument();

    // Type in frequency and duration
    const freqInput = screen.getByPlaceholderText('مثال: 3 مرات يومياً / كل 8 ساعات');
    fireEvent.change(freqInput, { target: { value: 'كل 8 ساعات عند اللزوم' } });

    const durInput = screen.getByPlaceholderText('مثال: 5 أيام / أسبوع');
    fireEvent.change(durInput, { target: { value: '3 أيام' } });

    // Simulate 2nd background polling (6s later): another new object reference
    const pollingPrescription2 = { ...mockInitialDraft };
    rerender(
      <LanguageProvider>
        <ElectronicPrescriptionSection
          visitId="v-100"
          patientId="p-100"
          initialPrescription={pollingPrescription2 as any}
        />
      </LanguageProvider>
    );

    // Verify all typed values remain intact
    expect(screen.getByDisplayValue('Paracetamol Syrup 120mg')).toBeInTheDocument();
    expect(screen.getByDisplayValue('كل 8 ساعات عند اللزوم')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3 أيام')).toBeInTheDocument();
    expect(screen.getByTestId('rx-dirty-badge')).toBeInTheDocument();
  });

  it('clears dirty state and unsaved badge upon successful draft save', async () => {
    const spySave = vi.spyOn(prescriptionService, 'savePrescriptionWithItems');
    spySave.mockResolvedValueOnce({
      id: 'rx-draft-1',
      visit_id: 'v-100',
      patient_id: 'p-100',
      status: 'draft',
      items: [
        {
          id: 'item-1',
          prescription_id: 'rx-draft-1',
          medication_name: 'Ibuprofen 100mg',
          dosage_form: 'syrup',
          frequency: '2 times daily',
          duration: '5 days',
          display_order: 1,
        },
      ],
    } as any);

    render(
      <LanguageProvider>
        <ElectronicPrescriptionSection
          visitId="v-100"
          patientId="p-100"
          initialPrescription={mockInitialDraft as any}
        />
      </LanguageProvider>
    );

    // Edit field
    const nameInput = screen.getByDisplayValue('TEST MEDICATION');
    fireEvent.change(nameInput, { target: { value: 'Ibuprofen 100mg' } });
    expect(screen.getByTestId('rx-dirty-badge')).toBeInTheDocument();

    // Click Save Draft
    const draftBtn = screen.getByRole('button', { name: /حفظ كمسودة/i });
    fireEvent.click(draftBtn);

    await waitFor(() => {
      expect(screen.getByTestId('rx-success-alert')).toBeInTheDocument();
      // Dirty badge MUST be removed
      expect(screen.queryByTestId('rx-dirty-badge')).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('Ibuprofen 100mg')).toBeInTheDocument();
    });
  });

  it('preserves typed inputs and keeps dirty badge when draft save fails', async () => {
    const spySave = vi.spyOn(prescriptionService, 'savePrescriptionWithItems');
    spySave.mockRejectedValueOnce(new Error('فشل الاتصال بقاعدة البيانات'));

    render(
      <LanguageProvider>
        <ElectronicPrescriptionSection
          visitId="v-100"
          patientId="p-100"
          initialPrescription={mockInitialDraft as any}
        />
      </LanguageProvider>
    );

    // Edit field
    const nameInput = screen.getByDisplayValue('TEST MEDICATION');
    fireEvent.change(nameInput, { target: { value: 'Amoxicillin 250mg' } });
    expect(screen.getByTestId('rx-dirty-badge')).toBeInTheDocument();

    // Click Save Draft
    const draftBtn = screen.getByRole('button', { name: /حفظ كمسودة/i });
    fireEvent.click(draftBtn);

    await waitFor(() => {
      expect(screen.getByTestId('rx-error-alert')).toBeInTheDocument();
      expect(screen.getByText(/فشل الاتصال بقاعدة البيانات/i)).toBeInTheDocument();
      // Typed value and dirty badge MUST stay
      expect(screen.getByDisplayValue('Amoxicillin 250mg')).toBeInTheDocument();
      expect(screen.getByTestId('rx-dirty-badge')).toBeInTheDocument();
    });
  });

  it('correctly loads new prescription when visitId changes (switching patients or visits)', async () => {
    const { rerender } = render(
      <LanguageProvider>
        <ElectronicPrescriptionSection
          visitId="v-100"
          patientId="p-100"
          initialPrescription={mockInitialDraft as any}
        />
      </LanguageProvider>
    );

    expect(screen.getByDisplayValue('TEST MEDICATION')).toBeInTheDocument();

    // Switch to another patient / visit (v-200)
    const newVisitPrescription = {
      id: 'rx-v200',
      visit_id: 'v-200',
      patient_id: 'p-200',
      status: 'issued' as const,
      items: [
        {
          id: 'item-200',
          prescription_id: 'rx-v200',
          medication_name: 'Cefixime Syrup',
          dosage_form: 'syrup',
          frequency: 'مرة واحدة يومياً',
          duration: '7 أيام',
          display_order: 1,
        },
      ],
    };

    rerender(
      <LanguageProvider>
        <ElectronicPrescriptionSection
          visitId="v-200"
          patientId="p-200"
          initialPrescription={newVisitPrescription as any}
        />
      </LanguageProvider>
    );

    // Verify the new visit's prescription is loaded and old one is replaced
    await waitFor(() => {
      expect(screen.getByDisplayValue('Cefixime Syrup')).toBeInTheDocument();
      expect(screen.queryByDisplayValue('TEST MEDICATION')).not.toBeInTheDocument();
      expect(screen.getByText('وصفة صادرة ومعتمدة')).toBeInTheDocument();
      expect(screen.queryByTestId('rx-dirty-badge')).not.toBeInTheDocument();
    });
  });

  it('correctly hydrates when initialPrescription arrives asynchronously after initial mount', async () => {
    // Initial mount without initialPrescription (undefined/null)
    const { rerender } = render(
      <LanguageProvider>
        <ElectronicPrescriptionSection
          visitId="v-300"
          patientId="p-300"
          initialPrescription={null}
        />
      </LanguageProvider>
    );

    // Initial state: empty fields
    expect(screen.queryByDisplayValue('Azithromycin 200mg')).not.toBeInTheDocument();

    // Now parent finishes fetching data and passes initialPrescription
    const lateArrivedPrescription = {
      id: 'rx-v300',
      visit_id: 'v-300',
      patient_id: 'p-300',
      status: 'draft' as const,
      items: [
        {
          id: 'item-300',
          prescription_id: 'rx-v300',
          medication_name: 'Azithromycin 200mg',
          dosage_form: 'suspension',
          frequency: 'مرة واحدة يومياً',
          duration: '3 أيام',
          display_order: 1,
        },
      ],
    };

    rerender(
      <LanguageProvider>
        <ElectronicPrescriptionSection
          visitId="v-300"
          patientId="p-300"
          initialPrescription={lateArrivedPrescription as any}
        />
      </LanguageProvider>
    );

    // Verify late arrived prescription is correctly hydrated
    await waitFor(() => {
      expect(screen.getByDisplayValue('Azithromycin 200mg')).toBeInTheDocument();
      expect(screen.getByDisplayValue('مرة واحدة يومياً')).toBeInTheDocument();
      expect(screen.getByDisplayValue('3 أيام')).toBeInTheDocument();
      expect(screen.queryByTestId('rx-dirty-badge')).not.toBeInTheDocument();
    });
  });
});




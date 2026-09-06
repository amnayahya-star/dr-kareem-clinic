import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Button } from '../src/components/ui/Button';
import { Badge } from '../src/components/ui/Badge';
import { Alert } from '../src/components/ui/Alert';
import DoctorClinicalWorkstationPage from '../src/app/(doctor)/doctor/page';
import { LanguageProvider } from '../src/context/LanguageContext';
import { PatientFile } from '../src/lib/mock-data/patients';

// Mock dependencies
const mockFetchPatients = vi.fn();
const mockSaveDoctorDiagnosis = vi.fn();

vi.mock('../src/services/patientService', () => ({
  fetchPatients: () => mockFetchPatients(),
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

  it('disables the examination form when no active visit is available', async () => {
    const patientWithoutActiveVisit: PatientFile = {
      ...mockPatient1,
      id: 'p-no-active',
      visits: [
        {
          id: 'v-completed',
          patientId: 'p-no-active',
          date: '2026-08-01',
          status: 'completed',
          isCompleted: true,
          labPhotos: [],
        },
      ],
    };

    mockFetchPatients.mockResolvedValueOnce([patientWithoutActiveVisit]);

    renderDoctorPage();

    await waitFor(() => {
      expect(screen.getByText('أحمد علي')).toBeInTheDocument();
    });

    const startExamBtn = screen.getByText('بدء الفحص');
    fireEvent.click(startExamBtn);

    await waitFor(() => {
      expect(screen.getByText(/لا توجد زيارة نشطة بانتظار الفحص السريري/i)).toBeInTheDocument();
    });

    // Form inputs should not be rendered
    expect(screen.queryByLabelText(/التشخيص الطبي النهائي/i)).not.toBeInTheDocument();
  });
});

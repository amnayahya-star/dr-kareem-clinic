import { Patient, Visit, AuditLog } from "@/types/database";

export interface MedicalPhoto {
  id: string;
  title: string;
  type: "lab_test" | "prescription" | "xray" | "other";
  date: string;
  notes?: string;
  imageUrl: string;
}

export interface VisitRecord {
  id: string;
  patientId: string;
  date: string;
  chiefComplaint?: string;
  weightKg?: number;
  heightCm?: number;
  temperatureC?: number;
  bloodPressure?: string;
  oxygenSaturation?: number;
  diagnosisText?: string;
  clinicalExamination?: string;
  recommendations?: string;
  doctorNotes?: string;
  isCompleted: boolean;
  // Attached photos specifically for this visit
  labPhotos: MedicalPhoto[];
  prescriptionPhoto?: MedicalPhoto | null;
}

export interface PatientFile {
  id: string;
  fileNumber: string;
  fullName: string;
  dateOfBirth: string;
  gender: "male" | "female";
  bloodType?: string;
  allergies?: string;
  chronicDiseases?: string;
  pastSurgeries?: string;
  guardianName: string;
  relationship: string;
  phone: string;
  secondaryPhone?: string;
  address?: string;
  createdAt: string;
  visits: VisitRecord[];
  allLabPhotos: MedicalPhoto[];
  allPrescriptionPhotos: MedicalPhoto[];
}

export const MOCK_PATIENT_FILES: PatientFile[] = [
  {
    id: "p-001",
    fileNumber: "P-1001",
    fullName: "يوسف أحمد العلي",
    dateOfBirth: "2023-05-14",
    gender: "male",
    bloodType: "O+",
    allergies: "حساسية شديدة من البنسلين ومشتقاته (Penicillin Allergy)",
    chronicDiseases: "ربو أطفال تحسسي خفيف",
    pastSurgeries: "لا توجد",
    guardianName: "أحمد العلي",
    relationship: "الأب",
    phone: "07701234567",
    secondaryPhone: "07801234567",
    address: "بغداد - المنصور",
    createdAt: "2025-01-10",
    allLabPhotos: [
      {
        id: "lab-1",
        title: "تحليل دم شامل (CBC)",
        type: "lab_test",
        date: "2026-09-01",
        notes: "كريات الدم البيضاء WBC 11.2 (التهاب فيروسي طفيف)",
        imageUrl: "https://images.unsplash.com/photo-1579154204601-01588f351e67?w=600&auto=format&fit=crop&q=80",
      },
      {
        id: "lab-2",
        title: "فحص بروتين الالتهاب (CRP)",
        type: "lab_test",
        date: "2026-09-01",
        notes: "النتيجة: 8 mg/L",
        imageUrl: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&auto=format&fit=crop&q=80",
      },
      {
        id: "lab-3",
        title: "أشعة سينية للصدر (Chest X-Ray)",
        type: "xray",
        date: "2026-04-12",
        notes: "سلامة الرئتين مع احتقان شعبي خفيف",
        imageUrl: "https://images.unsplash.com/photo-1516549655169-df83a0774514?w=600&auto=format&fit=crop&q=80",
      },
    ],
    allPrescriptionPhotos: [
      {
        id: "rx-photo-1",
        title: "صورة وصفة الزيارة السابقة (1 أيلول 2026)",
        type: "prescription",
        date: "2026-09-01",
        notes: "شراب باراسيتامول + شراب بلاب للأطفال",
        imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80",
      },
      {
        id: "rx-photo-2",
        title: "صورة وصفة زيارة الربو (12 نيسان 2026)",
        type: "prescription",
        date: "2026-04-12",
        notes: "بخاخ فينتولين مع قمع أطفال",
        imageUrl: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&auto=format&fit=crop&q=80",
      },
    ],
    visits: [
      {
        id: "v-001",
        patientId: "p-001",
        date: "2026-09-01",
        chiefComplaint: "ارتفاع حرارة وسعال مستمر منذ يومين",
        weightKg: 14.5,
        heightCm: 95.0,
        temperatureC: 38.5,
        oxygenSaturation: 98.0,
        bloodPressure: "95/60",
        diagnosisText: "التهاب القصبات الهوائية الفيروسي الحاد (Acute Viral Bronchitis)",
        clinicalExamination: "احتقان بالبلعوم، لا يوجد صفير حاد بالصدر",
        recommendations: "سوائل دافئة، خافض حرارة عند اللزوم، تجنب البنسلين",
        doctorNotes: "ملاحظة: الطفل لديه حساسية مؤكدة من البنسلين",
        isCompleted: true,
        labPhotos: [
          {
            id: "lab-1",
            title: "تحليل دم شامل (CBC)",
            type: "lab_test",
            date: "2026-09-01",
            notes: "WBC 11.2",
            imageUrl: "https://images.unsplash.com/photo-1579154204601-01588f351e67?w=600&auto=format&fit=crop&q=80",
          },
        ],
        prescriptionPhoto: {
          id: "rx-photo-1",
          title: "صورة وصفة الزيارة (1 أيلول 2026)",
          type: "prescription",
          date: "2026-09-01",
          notes: "شراب باراسيتامول + شراب بلاب",
          imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80",
        },
      },
      {
        id: "v-002",
        patientId: "p-001",
        date: "2026-04-12",
        chiefComplaint: "متابعة دورية لحساسية الصدر",
        weightKg: 13.8,
        heightCm: 91.5,
        temperatureC: 37.0,
        oxygenSaturation: 99.0,
        diagnosisText: "حساسية قصبية موسمية خفيفة",
        recommendations: "بخاخ فينتولين عند الحاجة",
        isCompleted: true,
        labPhotos: [
          {
            id: "lab-3",
            title: "أشعة سينية للصدر",
            type: "xray",
            date: "2026-04-12",
            notes: "أشعة صدر طبيعية",
            imageUrl: "https://images.unsplash.com/photo-1516549655169-df83a0774514?w=600&auto=format&fit=crop&q=80",
          },
        ],
        prescriptionPhoto: {
          id: "rx-photo-2",
          title: "صورة وصفة الربو",
          type: "prescription",
          date: "2026-04-12",
          notes: "بخاخ فينتولين",
          imageUrl: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&auto=format&fit=crop&q=80",
        },
      },
    ],
  },
  {
    id: "p-002",
    fileNumber: "P-1002",
    fullName: "مريم خالد المنصور",
    dateOfBirth: "2025-12-20",
    gender: "female",
    bloodType: "A+",
    allergies: undefined,
    chronicDiseases: undefined,
    guardianName: "خالد المنصور",
    relationship: "الأب",
    phone: "07719876543",
    address: "بغداد - حي الجامعة",
    createdAt: "2026-02-15",
    allLabPhotos: [
      {
        id: "lab-4",
        title: "فحص براز عام (Stool Exam)",
        type: "lab_test",
        date: "2026-08-10",
        notes: "طبيعي، لا توجد طفيليات",
        imageUrl: "https://images.unsplash.com/photo-1579154204601-01588f351e67?w=600&auto=format&fit=crop&q=80",
      },
    ],
    allPrescriptionPhotos: [
      {
        id: "rx-photo-3",
        title: "صورة وصفة قطرات التسنين والمغص",
        type: "prescription",
        date: "2026-08-10",
        notes: "قطرات فيتامين د + قطرات مغص",
        imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80",
      },
    ],
    visits: [
      {
        id: "v-003",
        patientId: "p-002",
        date: "2026-08-10",
        chiefComplaint: "مراجعة دورية وتأخر تسنين مع إسهال خفيف",
        weightKg: 8.2,
        heightCm: 69.0,
        temperatureC: 37.1,
        oxygenSaturation: 99.0,
        diagnosisText: "أعراض تسنين طبيعية وعسر هضم خفيف",
        recommendations: "الاستمرار على قطرات فيتامين د ومحلول إماهة عند اللزوم",
        isCompleted: true,
        labPhotos: [],
        prescriptionPhoto: {
          id: "rx-photo-3",
          title: "صورة وصفة قطرات التسنين",
          type: "prescription",
          date: "2026-08-10",
          notes: "فيتامين د",
          imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80",
        },
      },
    ],
  },
  {
    id: "p-003",
    fileNumber: "P-1003",
    fullName: "زين الدين عمر السعدي",
    dateOfBirth: "2021-02-10",
    gender: "male",
    bloodType: "B+",
    allergies: "حساسية من الفول السوداني (Peanut Allergy)",
    chronicDiseases: undefined,
    pastSurgeries: "استئصال اللوزتين واللحمية (2025)",
    guardianName: "عمر السعدي",
    relationship: "الأب",
    phone: "07725556677",
    secondaryPhone: "07901112233",
    address: "بغداد - الكاظمية",
    createdAt: "2025-11-05",
    allLabPhotos: [
      {
        id: "lab-5",
        title: "فحص وظائف الكبد وإنزيمات الهضم",
        type: "lab_test",
        date: "2026-07-20",
        notes: "نتائج طبيعية",
        imageUrl: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&auto=format&fit=crop&q=80",
      },
    ],
    allPrescriptionPhotos: [
      {
        id: "rx-photo-4",
        title: "صورة وصفة التهاب الأمعاء",
        type: "prescription",
        date: "2026-07-20",
        notes: "مطهر معوي ومحلول جفاف",
        imageUrl: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&auto=format&fit=crop&q=80",
      },
    ],
    visits: [
      {
        id: "v-004",
        patientId: "p-003",
        date: "2026-07-20",
        chiefComplaint: "ألم بطن مفاجئ وقيء",
        weightKg: 19.8,
        heightCm: 112.0,
        temperatureC: 37.4,
        oxygenSaturation: 98.5,
        diagnosisText: "نوبة نزلة معوية خفيفة (Acute Gastroenteritis)",
        recommendations: "حمية غذائية خفيفة ومطهر معوي",
        isCompleted: true,
        labPhotos: [],
        prescriptionPhoto: {
          id: "rx-photo-4",
          title: "صورة وصفة النزلة المعوية",
          type: "prescription",
          date: "2026-07-20",
          imageUrl: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&auto=format&fit=crop&q=80",
        },
      },
    ],
  },
];

// Helper conversions for legacy routes
export const MOCK_PATIENTS: Patient[] = MOCK_PATIENT_FILES.map((pf) => ({
  id: pf.id,
  file_number: pf.fileNumber,
  full_name: pf.fullName,
  date_of_birth: pf.dateOfBirth,
  gender: pf.gender,
  blood_type: pf.bloodType,
  allergies: pf.allergies,
  chronic_diseases: pf.chronicDiseases,
  past_surgeries: pf.pastSurgeries,
  is_archived: false,
  created_at: `${pf.createdAt}T10:00:00Z`,
  updated_at: `${pf.createdAt}T10:00:00Z`,
  guardian: {
    id: `g-${pf.id}`,
    patient_id: pf.id,
    full_name: pf.guardianName,
    relationship: pf.relationship,
    primary_phone: pf.phone,
    secondary_phone: pf.secondaryPhone,
    address: pf.address,
    created_at: `${pf.createdAt}T10:00:00Z`,
    updated_at: `${pf.createdAt}T10:00:00Z`,
  },
}));

export const MOCK_VISITS: Visit[] = [
  {
    id: "v-001",
    patient_id: "p-001",
    visit_date: "2026-09-01T10:00:00Z",
    status: "completed",
    chief_complaint: "ارتفاع في درجة الحرارة وسعال مستمر منذ يومين",
    completed_at: "2026-09-01T10:45:00Z",
    approved_at: "2026-09-01T10:45:00Z",
    created_at: "2026-09-01T09:50:00Z",
    updated_at: "2026-09-01T10:45:00Z",
    patient: MOCK_PATIENTS[0],
    measurements: {
      id: "m-001",
      visit_id: "v-001",
      patient_id: "p-001",
      weight_kg: 14.5,
      height_cm: 95.0,
      temperature_c: 38.5,
      oxygen_saturation: 98.0,
      blood_pressure: "95/60",
      created_at: "2026-09-01T09:55:00Z",
    },
    diagnosis: {
      id: "d-001",
      visit_id: "v-001",
      patient_id: "p-001",
      symptoms: "حرارة 38.5 وسعال مستمر",
      clinical_examination: "احتقان بالبلعوم، لا يوجد صفير حاد بالصدر",
      diagnosis_text: "التهاب القصبات الهوائية الفيروسي الحاد",
      recommendations: "سوائل دافئة وخافض حرارة",
      doctor_notes: "تجنب البنسلين",
      created_at: "2026-09-01T10:30:00Z",
      updated_at: "2026-09-01T10:45:00Z",
    },
    prescription: {
      id: "rx-001",
      visit_id: "v-001",
      patient_id: "p-001",
      prescription_type: "digital",
      is_approved: true,
      created_at: "2026-09-01T10:35:00Z",
      updated_at: "2026-09-01T10:45:00Z",
      items: [
        {
          id: "rxi-001",
          prescription_id: "rx-001",
          sort_order: 1,
          medication_name: "Paracetamol Syrup",
          strength: "120mg / 5ml",
          dosage_form: "syrup",
          dose: "5 مل",
          frequency: "كل 6 ساعات عند اللزوم",
          duration: "3 أيام",
          created_at: "2026-09-01T10:35:00Z",
        },
      ],
    },
  },
];

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    id: "log-001",
    user_name: "سارة محمود (السكرتير)",
    user_role: "secretary",
    action: "open_visit",
    target_table: "visits",
    description: "إضافة زيارة جديدة وصور التحاليل للطفل يوسف أحمد العلي (P-1001)",
    created_at: "2026-09-01T10:00:00Z",
  },
];

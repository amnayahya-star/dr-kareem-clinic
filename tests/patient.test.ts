import { describe, it, expect } from 'vitest';
import {
  calculateArabicAge,
  isValidEmail,
  isValidPositiveNumber,
  displayOrFallback,
  getPatientFirstVisitDate,
} from '../src/lib/utils';
import {
  validatePatientData,
  createPatientRecord,
  updatePatientRecord,
  fetchPatientById,
} from '../src/services/patientService';

function formatDateLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

describe('Patient Utility Functions', () => {
  describe('calculateArabicAge', () => {
    it('calculates age in years accurately', () => {
      const today = new Date();
      const fourYearsAgo = new Date(today.getFullYear() - 4, today.getMonth(), today.getDate());
      const ageStr = calculateArabicAge(formatDateLocal(fourYearsAgo));
      expect(ageStr).toContain('4 سنوات');
    });

    it('calculates age in months for infants under 1 year', () => {
      const today = new Date();
      const fiveMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, today.getDate());
      const ageStr = calculateArabicAge(formatDateLocal(fiveMonthsAgo));
      expect(ageStr).toContain('5 أشهر');
    });

    it('calculates age in days for newborns under 1 month', () => {
      const today = new Date();
      const fiveDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5);
      const ageStr = calculateArabicAge(formatDateLocal(fiveDaysAgo));
      expect(ageStr).toContain('5 أيام');
    });

    it('returns empty string for invalid or future dates', () => {
      expect(calculateArabicAge('')).toBe('');
      expect(calculateArabicAge('invalid-date')).toBe('');
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      expect(calculateArabicAge(formatDateLocal(futureDate))).toBe('');
    });
  });

  describe('Validation Helpers', () => {
    it('validates email format correctly', () => {
      expect(isValidEmail('parent@example.com')).toBe(true);
      expect(isValidEmail('user.name+tag@clinic.iq')).toBe(true);
      expect(isValidEmail('')).toBe(true); // optional empty
      expect(isValidEmail('   ')).toBe(true);
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
    });

    it('validates positive numbers correctly', () => {
      expect(isValidPositiveNumber(3.5)).toBe(true);
      expect(isValidPositiveNumber('50.2')).toBe(true);
      expect(isValidPositiveNumber(undefined)).toBe(true); // optional
      expect(isValidPositiveNumber(null)).toBe(true);
      expect(isValidPositiveNumber('')).toBe(true);
      expect(isValidPositiveNumber(-1)).toBe(false);
      expect(isValidPositiveNumber(0)).toBe(false);
      expect(isValidPositiveNumber('-5')).toBe(false);
      expect(isValidPositiveNumber('abc')).toBe(false);
    });

    it('displays fallback text when value is null, undefined, or empty', () => {
      expect(displayOrFallback('بغداد')).toBe('بغداد');
      expect(displayOrFallback(null)).toBe('غير مسجل');
      expect(displayOrFallback(undefined)).toBe('غير مسجل');
      expect(displayOrFallback('')).toBe('غير مسجل');
      expect(displayOrFallback('  ', 'لا يوجد')).toBe('لا يوجد');
    });
  });

  describe('getPatientFirstVisitDate', () => {
    it('derives and formats the earliest visit date from visits array', () => {
      const visits = [
        { id: 'v1', visit_date: '2024-05-10', visit_type: 'routine' },
        { id: 'v2', visit_date: '2023-11-01', visit_type: 'emergency' },
        { id: 'v3', visit_date: '2024-01-15', visit_type: 'follow_up' },
      ];
      const result = getPatientFirstVisitDate(visits);
      expect(result).toBeDefined();
      expect(result).not.toBe('لا توجد زيارة مسجلة');
      expect(result).toContain('٢٠٢٣'); // Arabic year
    });

    it('returns fallback message when visits array is empty or undefined', () => {
      expect(getPatientFirstVisitDate([])).toBe('لا توجد زيارة مسجلة');
      expect(getPatientFirstVisitDate(undefined)).toBe('لا توجد زيارة مسجلة');
    });
  });
});

describe('Patient Data Validation (validatePatientData)', () => {
  it('passes for valid complete payload', () => {
    const result = validatePatientData({
      fullName: 'علي حسن أحمد',
      dateOfBirth: '2022-05-15',
      gender: 'male',
      birthPlace: 'مستشفى اليرموك - بغداد',
      birthWeightKg: 3.4,
      birthLengthCm: 50.5,
      guardianName: 'حسن أحمد',
      relationship: 'الأب',
      phone: '07701234567',
      email: 'father@example.com',
      address: 'بغداد - المنصور',
      drugAllergies: 'بنسلين',
      foodAllergies: 'فول سوداني',
      otherAllergies: 'غبار الطلع',
      medicalHistory: 'ربو خفيف',
      chronicDiseases: 'حساسية قصبات مزمنة',
    });
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when full name is missing or empty', () => {
    const result = validatePatientData({
      fullName: '   ',
      dateOfBirth: '2022-05-15',
      gender: 'male',
      guardianName: 'حسن أحمد',
      phone: '07701234567',
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'fullName')).toBe(true);
  });

  it('fails when birth date is in the future', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 2);

    const result = validatePatientData({
      fullName: 'علي حسن أحمد',
      dateOfBirth: formatDateLocal(futureDate),
      gender: 'male',
      guardianName: 'حسن أحمد',
      phone: '07701234567',
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'dateOfBirth')).toBe(true);
  });

  it('fails when birth weight or length is negative or zero', () => {
    const result = validatePatientData({
      fullName: 'علي حسن أحمد',
      dateOfBirth: '2022-05-15',
      gender: 'male',
      guardianName: 'حسن أحمد',
      phone: '07701234567',
      birthWeightKg: -2.5,
      birthLengthCm: 0,
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'birthWeightKg')).toBe(true);
    expect(result.errors.some((e) => e.field === 'birthLengthCm')).toBe(true);
  });

  it('fails when guardian email is invalid format', () => {
    const result = validatePatientData({
      fullName: 'علي حسن أحمد',
      dateOfBirth: '2022-05-15',
      gender: 'male',
      guardianName: 'حسن أحمد',
      phone: '07701234567',
      email: 'invalid-email-address',
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'guardianEmail')).toBe(true);
  });
});

describe('Patient CRUD Operations & Data Integrity', () => {
  it('registers a child with ALL fields (including chronicDiseases) and verifies persistence', async () => {
    const newRecord = await createPatientRecord({
      fullName: 'سارة طارق مهدي',
      dateOfBirth: '2023-08-10',
      gender: 'female',
      bloodType: 'A+',
      birthPlace: 'مدينة الطب - بغداد',
      birthWeightKg: 3.2,
      birthLengthCm: 49.5,
      medicalHistory: 'ولادة طبيعية في الأسبوع 38',
      drugAllergies: 'أموكسيسيلين',
      foodAllergies: 'حليب البقر',
      otherAllergies: 'غبار الطلع',
      chronicDiseases: 'حساسية قصبية مزمنة',
      pastSurgeries: 'استئصال اللوزتين',
      medicalNotes: 'تحتاج فحص دوري للأذن',
      guardianName: 'طارق مهدي',
      relationship: 'الأب',
      phone: '07801234567',
      secondaryPhone: '07709876543',
      email: 'tariq@example.com',
      address: 'بغداد - الكرادة',
    });

    expect(newRecord.id).toBeDefined();
    expect(newRecord.fullName).toBe('سارة طارق مهدي');
    expect(newRecord.birthPlace).toBe('مدينة الطب - بغداد');
    expect(newRecord.birthWeightKg).toBe(3.2);
    expect(newRecord.birthLengthCm).toBe(49.5);
    expect(newRecord.drugAllergies).toBe('أموكسيسيلين');
    expect(newRecord.foodAllergies).toBe('حليب البقر');
    expect(newRecord.otherAllergies).toBe('غبار الطلع');
    expect(newRecord.chronicDiseases).toBe('حساسية قصبية مزمنة');
    expect(newRecord.pastSurgeries).toBe('استئصال اللوزتين');
    expect(newRecord.medicalNotes).toBe('تحتاج فحص دوري للأذن');
    expect(newRecord.guardianName).toBe('طارق مهدي');
    expect(newRecord.relationship).toBe('الأب');
    expect(newRecord.phone).toBe('07801234567');
    expect(newRecord.secondaryPhone).toBe('07709876543');
    expect(newRecord.email).toBe('tariq@example.com');
    expect(newRecord.address).toBe('بغداد - الكرادة');

    // Reopen / fetch file to ensure persistence
    const fetched = await fetchPatientById(newRecord.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.chronicDiseases).toBe('حساسية قصبية مزمنة');
    expect(fetched?.drugAllergies).toBe('أموكسيسيلين');
  });

  it('registers a child with REQUIRED fields only (optional fields remain undefined/null)', async () => {
    const minChild = await createPatientRecord({
      fullName: 'عمر خالد',
      dateOfBirth: '2024-01-01',
      gender: 'male',
      guardianName: 'خالد السعدي',
      phone: '07709990000',
    });

    expect(minChild.id).toBeDefined();
    expect(minChild.fullName).toBe('عمر خالد');
    expect(minChild.birthWeightKg).toBeUndefined();
    expect(minChild.birthLengthCm).toBeUndefined();
    expect(minChild.drugAllergies).toBeUndefined();
    expect(minChild.foodAllergies).toBeUndefined();
    expect(minChild.chronicDiseases).toBeUndefined();
    expect(minChild.guardianName).toBe('خالد السعدي');
    expect(minChild.relationship).toBe('الأب'); // default
  });

  it('preserves legacy allergies field without copying into drug_allergies', async () => {
    // A legacy record with only `allergies` set
    const legacyChild = await createPatientRecord({
      fullName: 'حسن قديم',
      dateOfBirth: '2020-03-15',
      gender: 'male',
      allergies: 'حساسية غير محددة من موسم الربيع',
      guardianName: 'أبو حسن',
      phone: '07700001111',
    });

    expect(legacyChild.allergies).toBe('حساسية غير محددة من موسم الربيع');
    expect(legacyChild.drugAllergies).toBeUndefined();
    expect(legacyChild.foodAllergies).toBeUndefined();
  });

  it('updates child & guardian in-place, verifies persistence and no duplicate guardian rows', async () => {
    const created = await createPatientRecord({
      fullName: 'ياسر عمر',
      dateOfBirth: '2021-02-01',
      gender: 'male',
      guardianName: 'عمر عبد الله',
      relationship: 'الأب',
      phone: '07701112233',
    });

    // Update child profile and guardian profile
    const updated = await updatePatientRecord(created.id, {
      fullName: 'ياسر عمر عبد الله',
      birthPlace: 'مستشفى الكرخ',
      birthWeightKg: 3.8,
      birthLengthCm: 51,
      drugAllergies: 'سولفا',
      foodAllergies: 'بيض',
      chronicDiseases: 'ربو مزمن متوسط',
      guardianName: 'عمر عبد الله المحترم',
      relationship: 'وصي قانوني',
      phone: '07709998877',
      secondaryPhone: '07801112233',
      email: 'omar@example.com',
      address: 'بغداد - اليرموك',
    });

    expect(updated.id).toBe(created.id);
    expect(updated.fullName).toBe('ياسر عمر عبد الله');
    expect(updated.birthPlace).toBe('مستشفى الكرخ');
    expect(updated.birthWeightKg).toBe(3.8);
    expect(updated.drugAllergies).toBe('سولفا');
    expect(updated.chronicDiseases).toBe('ربو مزمن متوسط');
    expect(updated.guardianName).toBe('عمر عبد الله المحترم');
    expect(updated.relationship).toBe('وصي قانوني');
    expect(updated.phone).toBe('07709998877');
    expect(updated.email).toBe('omar@example.com');

    // Reopen to verify that changes persisted cleanly
    const reloaded = await fetchPatientById(created.id);
    expect(reloaded?.fullName).toBe('ياسر عمر عبد الله');
    expect(reloaded?.chronicDiseases).toBe('ربو مزمن متوسط');
    expect(reloaded?.relationship).toBe('وصي قانوني');
  });

  it('fetches existing initial patient correctly', async () => {
    const fetched = await fetchPatientById('p-001');
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe('p-001');
    expect(fetched?.fullName).toBe('يوسف أحمد العلي');
    expect(fetched?.chronicDiseases).toBe('ربو أطفال تحسسي خفيف');
    expect(fetched?.guardianName).toBe('أحمد العلي');
    expect(fetched?.visits.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  validateVaccinationData,
  sanitizeVaccinationInput,
  saveVaccinationProfile,
  fetchVaccinationProfile,
  VACCINATION_STATUS_CONFIG,
  UNRECORDED_VACCINATION_CONFIG,
} from '../src/services/vaccinationService';
import {
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

describe('Vaccination Service & Profile Tests (المرحلة الثانية)', () => {
  describe('1. validateVaccinationData', () => {
    it('Scenario 1: Passes for all valid status values and empty/optional states', () => {
      expect(validateVaccinationData({ vaccinationStatus: 'complete' }).isValid).toBe(true);
      expect(validateVaccinationData({ vaccinationStatus: 'incomplete' }).isValid).toBe(true);
      expect(validateVaccinationData({ vaccinationStatus: 'not_vaccinated' }).isValid).toBe(true);
      expect(validateVaccinationData({ vaccinationStatus: null }).isValid).toBe(true);
      expect(validateVaccinationData({}).isValid).toBe(true);
    });

    it('Scenario 2: Fails for invalid vaccination status string', () => {
      const result = validateVaccinationData({ vaccinationStatus: 'partially_done' as any });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'vaccinationStatus')).toBe(true);
      expect(result.error).toBe('حالة التطعيم المختارة غير صالحة');
    });

    it('Scenario 3: Passes for valid past and current dates', () => {
      const pastDate = '2024-01-15';
      const todayDate = formatDateLocal(new Date());
      expect(validateVaccinationData({ lastVaccineDate: pastDate }).isValid).toBe(true);
      expect(validateVaccinationData({ lastVaccineDate: todayDate }).isValid).toBe(true);
    });

    it('Scenario 4: Fails for future vaccine dates', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const result = validateVaccinationData({ lastVaccineDate: formatDateLocal(futureDate) });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'lastVaccineDate')).toBe(true);
      expect(result.error).toBe('تاريخ آخر تطعيم لا يمكن أن يكون في المستقبل');
    });
  });

  describe('2. sanitizeVaccinationInput', () => {
    it('Scenario 5: Clears lastVaccineName and lastVaccineDate to null when status is not_vaccinated', () => {
      const sanitized = sanitizeVaccinationInput({
        patientId: 'p-test-1',
        vaccinationStatus: 'not_vaccinated',
        lastVaccineName: 'لقاح الحصبة MMR',
        lastVaccineDate: '2024-05-10',
        postVaccinationReactions: 'لا يوجد',
        vaccinationNotes: 'تم توجيه الأهل للبدء بالتطعيم',
      });

      expect(sanitized.vaccinationStatus).toBe('not_vaccinated');
      expect(sanitized.lastVaccineName).toBeNull();
      expect(sanitized.lastVaccineDate).toBeNull();
      expect(sanitized.postVaccinationReactions).toBe('لا يوجد');
      expect(sanitized.vaccinationNotes).toBe('تم توجيه الأهل للبدء بالتطعيم');
    });

    it('Scenario 6: Preserves and trims vaccine name and date when status is complete or incomplete', () => {
      const sanitizedComplete = sanitizeVaccinationInput({
        patientId: 'p-test-2',
        vaccinationStatus: 'complete',
        lastVaccineName: '  اللقاح السداسي Hexa  ',
        lastVaccineDate: '2025-02-14',
      });
      expect(sanitizedComplete.lastVaccineName).toBe('اللقاح السداسي Hexa');
      expect(sanitizedComplete.lastVaccineDate).toBe('2025-02-14');

      const sanitizedIncomplete = sanitizeVaccinationInput({
        patientId: 'p-test-3',
        vaccinationStatus: 'incomplete',
        lastVaccineName: '  لقاح شلل الأطفال OPV  ',
        lastVaccineDate: '2024-11-20',
      });
      expect(sanitizedIncomplete.lastVaccineName).toBe('لقاح شلل الأطفال OPV');
      expect(sanitizedIncomplete.lastVaccineDate).toBe('2024-11-20');
    });
  });

  describe('3. Integration with Patient Creation & Persistence', () => {
    it('Scenario 7: Creates a child with full vaccination profile and verifies persistence', async () => {
      const created = await createPatientRecord({
        fullName: 'نور الهدى عامر',
        dateOfBirth: '2023-11-01',
        gender: 'female',
        guardianName: 'عامر خليل',
        phone: '07705554433',
        vaccinationStatus: 'complete',
        lastVaccineName: 'اللقاح الثلاثي الفيروسي MMR الجرعة الثانية',
        lastVaccineDate: '2025-05-15',
        postVaccinationReactions: 'احمرار طفيف في موقع الحقن استمر 24 ساعة',
        vaccinationNotes: 'تم استكمال جدول التطعيمات لعمر سنة ونصف بنجاح',
      });

      expect(created.id).toBeDefined();
      expect(created.vaccinationStatus).toBe('complete');
      expect(created.lastVaccineName).toBe('اللقاح الثلاثي الفيروسي MMR الجرعة الثانية');
      expect(created.lastVaccineDate).toBe('2025-05-15');
      expect(created.postVaccinationReactions).toBe('احمرار طفيف في موقع الحقن استمر 24 ساعة');
      expect(created.vaccinationNotes).toBe('تم استكمال جدول التطعيمات لعمر سنة ونصف بنجاح');

      // Re-fetch patient to verify persistence
      const reloaded = await fetchPatientById(created.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded?.vaccinationStatus).toBe('complete');
      expect(reloaded?.lastVaccineName).toBe('اللقاح الثلاثي الفيروسي MMR الجرعة الثانية');
      expect(reloaded?.vaccinationNotes).toBe('تم استكمال جدول التطعيمات لعمر سنة ونصف بنجاح');
    });

    it('Scenario 8: Creates child with not_vaccinated and enforces nullification of vaccine name and date', async () => {
      const notVacChild = await createPatientRecord({
        fullName: 'سامر قتيبة',
        dateOfBirth: '2024-06-01',
        gender: 'male',
        guardianName: 'قتيبة جاسم',
        phone: '07801122334',
        vaccinationStatus: 'not_vaccinated',
        lastVaccineName: 'بيانات غير مقصودة يجب تفريغها',
        lastVaccineDate: '2024-07-01',
        vaccinationNotes: 'الطفل لم يتلق أي لقاح بسبب ظروف سفر العائلة',
      });

      expect(notVacChild.vaccinationStatus).toBe('not_vaccinated');
      expect(notVacChild.lastVaccineName).toBeUndefined();
      expect(notVacChild.lastVaccineDate).toBeUndefined();
      expect(notVacChild.vaccinationNotes).toBe('الطفل لم يتلق أي لقاح بسبب ظروف سفر العائلة');

      const reloaded = await fetchPatientById(notVacChild.id);
      expect(reloaded?.vaccinationStatus).toBe('not_vaccinated');
      expect(reloaded?.lastVaccineName).toBeUndefined();
      expect(reloaded?.lastVaccineDate).toBeUndefined();
    });

    it('Scenario 9: Creates child without vaccination details and leaves fields undefined/unrecorded', async () => {
      const childWithoutVac = await createPatientRecord({
        fullName: 'هدى مصطفى',
        dateOfBirth: '2025-01-10',
        gender: 'female',
        guardianName: 'مصطفى كمال',
        phone: '07703332211',
      });

      expect(childWithoutVac.id).toBeDefined();
      expect(childWithoutVac.vaccinationStatus).toBeUndefined();
      expect(childWithoutVac.lastVaccineName).toBeUndefined();
      expect(childWithoutVac.lastVaccineDate).toBeUndefined();
      expect(childWithoutVac.vaccinationNotes).toBeUndefined();
    });
  });

  describe('4. Updating Vaccination Profile (updatePatientRecord & saveVaccinationProfile)', () => {
    it('Scenario 10: Updates child vaccination profile in-place without duplicates', async () => {
      const patient = await createPatientRecord({
        fullName: 'مهدي عبد الرحمن',
        dateOfBirth: '2022-09-15',
        gender: 'male',
        guardianName: 'عبد الرحمن مهدي',
        phone: '07707778899',
        vaccinationStatus: 'incomplete',
        lastVaccineName: 'اللقاح الخماسي Penta الجرعة الأولى',
        lastVaccineDate: '2022-11-15',
      });

      // Update vaccination profile to complete
      const updated = await updatePatientRecord(patient.id, {
        vaccinationStatus: 'complete',
        lastVaccineName: 'اللقاح الخماسي Penta الجرعة الثالثة',
        lastVaccineDate: '2023-03-20',
        postVaccinationReactions: 'حمى خفيفة 38 درجة مئوية',
        vaccinationNotes: 'تم استكمال التطعيمات الأساسية في مركز الرعاية الصحية الأولية',
      });

      expect(updated.id).toBe(patient.id);
      expect(updated.vaccinationStatus).toBe('complete');
      expect(updated.lastVaccineName).toBe('اللقاح الخماسي Penta الجرعة الثالثة');
      expect(updated.lastVaccineDate).toBe('2023-03-20');
      expect(updated.postVaccinationReactions).toBe('حمى خفيفة 38 درجة مئوية');
      expect(updated.vaccinationNotes).toBe('تم استكمال التطعيمات الأساسية في مركز الرعاية الصحية الأولية');

      // Verify persistence on refetch
      const reloaded = await fetchPatientById(patient.id);
      expect(reloaded?.vaccinationStatus).toBe('complete');
      expect(reloaded?.lastVaccineName).toBe('اللقاح الخماسي Penta الجرعة الثالثة');
    });

    it('Scenario 11: Changing status from complete to not_vaccinated clears lastVaccineName and date', async () => {
      const patient = await createPatientRecord({
        fullName: 'ريم حسام',
        dateOfBirth: '2023-04-10',
        gender: 'female',
        guardianName: 'حسام نوري',
        phone: '07706665544',
        vaccinationStatus: 'complete',
        lastVaccineName: 'لقاح الحصبة المنفردة Measles',
        lastVaccineDate: '2024-01-10',
      });

      const updated = await updatePatientRecord(patient.id, {
        vaccinationStatus: 'not_vaccinated',
        vaccinationNotes: 'تم تعديل السجل بعد تصحيح إفادة ولي الأمر',
      });

      expect(updated.vaccinationStatus).toBe('not_vaccinated');
      expect(updated.lastVaccineName).toBeUndefined();
      expect(updated.lastVaccineDate).toBeUndefined();
      expect(updated.vaccinationNotes).toBe('تم تعديل السجل بعد تصحيح إفادة ولي الأمر');
    });
  });

  describe('5. fetchVaccinationProfile & Config Definitions', () => {
    it('Scenario 12: fetchVaccinationProfile retrieves profile correctly or null when unrecorded', async () => {
      // Mock patient p-001 has vaccination status 'incomplete'
      const p1Profile = await fetchVaccinationProfile('p-001');
      expect(p1Profile).not.toBeNull();
      expect(p1Profile?.vaccination_status).toBe('incomplete');
      expect(p1Profile?.last_vaccine_name).toContain('MMR');

      // Mock patient p-002 has vaccination status 'complete'
      const p2Profile = await fetchVaccinationProfile('p-002');
      expect(p2Profile).not.toBeNull();
      expect(p2Profile?.vaccination_status).toBe('complete');

      // Non-existent patient returns null
      const nonExistent = await fetchVaccinationProfile('p-non-existent-9999');
      expect(nonExistent).toBeNull();
    });

    it('Scenario 13: VACCINATION_STATUS_CONFIG & UNRECORDED_VACCINATION_CONFIG provide exact Arabic text and badge specs', () => {
      expect(VACCINATION_STATUS_CONFIG.not_vaccinated.label).toBe('لم يُلقّح');
      expect(VACCINATION_STATUS_CONFIG.not_vaccinated.badgeVariant).toBe('danger');

      expect(VACCINATION_STATUS_CONFIG.incomplete.label).toBe('غير كامل التلقيح');
      expect(VACCINATION_STATUS_CONFIG.incomplete.badgeVariant).toBe('warning');

      expect(VACCINATION_STATUS_CONFIG.complete.label).toBe('كامل التلقيح');
      expect(VACCINATION_STATUS_CONFIG.complete.badgeVariant).toBe('success');

      expect(UNRECORDED_VACCINATION_CONFIG.label).toBe('حالة التطعيم غير مسجلة');
      expect(UNRECORDED_VACCINATION_CONFIG.badgeVariant).toBe('default');
      expect(UNRECORDED_VACCINATION_CONFIG.emptyText).toBe('لم تُسجل معلومات التطعيم لهذا الطفل');
    });
  });
});

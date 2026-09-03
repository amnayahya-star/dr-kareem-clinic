import { describe, it, expect } from 'vitest';
import { calculateArabicAge, normalizeArabicText, DOSAGE_FORM_LABELS, VISIT_STATUS_CONFIG } from '../src/lib/utils';

describe('Arabic Text Normalization (Search Utilities)', () => {
  it('should normalize different forms of Alif and Taa Marboota', () => {
    expect(normalizeArabicText('أحمد')).toBe('احمد');
    expect(normalizeArabicText('إبراهيم')).toBe('ابراهيم');
    expect(normalizeArabicText('آلاء')).toBe('الاء');
    expect(normalizeArabicText('فاطمة')).toBe('فاطمه');
    expect(normalizeArabicText('منى')).toBe('مني');
  });

  it('should strip tashkeel (diacritics) and multiple spaces', () => {
    expect(normalizeArabicText('عُمَرُ   عَلِيّ')).toBe('عمر علي');
  });
});

describe('Dynamic Arabic Age Calculation', () => {
  it('should calculate age correctly for years', () => {
    const today = new Date();
    const threeYearsAgo = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate());
    const ageString = calculateArabicAge(threeYearsAgo.toISOString().split('T')[0]);
    expect(ageString).toContain('3 سنوات');
  });

  it('should handle empty or invalid dates gracefully', () => {
    expect(calculateArabicAge('')).toBe('');
    expect(calculateArabicAge('invalid-date')).toBe('');
  });
});

describe('Medical Configuration Dictionaries', () => {
  it('should have labels for all dosage forms', () => {
    expect(DOSAGE_FORM_LABELS.syrup).toContain('شراب');
    expect(DOSAGE_FORM_LABELS.tablets).toContain('أقراص');
    expect(DOSAGE_FORM_LABELS.injections).toContain('حقن');
  });

  it('should have proper status configuration for visits', () => {
    expect(VISIT_STATUS_CONFIG.waiting.label).toBe('بانتظار الطبيب');
    expect(VISIT_STATUS_CONFIG.completed.label).toBe('مكتملة');
    expect(VISIT_STATUS_CONFIG.in_progress.label).toBe('قيد الفحص');
  });
});

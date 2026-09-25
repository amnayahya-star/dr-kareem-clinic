import { describe, it, expect } from 'vitest';
import { getClinicDateString, CLINIC_TIME_ZONE } from '../src/lib/clinicDate';

describe('Clinic Date Timezone & Boundary Tests (Asia/Baghdad)', () => {
  it('exports explicit clinic timezone Asia/Baghdad', () => {
    expect(CLINIC_TIME_ZONE).toBe('Asia/Baghdad');
  });

  it('correctly maps 2026-09-24T20:30:00Z to 2026-09-24 in Baghdad (23:30 local time)', () => {
    const instant = new Date('2026-09-24T20:30:00Z');
    const result = getClinicDateString(0, instant);
    expect(result).toBe('2026-09-24');
  });

  it('correctly maps 2026-09-24T21:30:00Z to 2026-09-25 in Baghdad (00:30 past midnight local time)', () => {
    const instant = new Date('2026-09-24T21:30:00Z');
    const result = getClinicDateString(0, instant);
    expect(result).toBe('2026-09-25');
  });

  it('correctly computes offsetDays = -1 (yesterday) across midnight', () => {
    const instant = new Date('2026-09-24T21:30:00Z'); // 2026-09-25 in Baghdad
    const yesterday = getClinicDateString(-1, instant);
    expect(yesterday).toBe('2026-09-24');
  });

  it('correctly computes offsetDays = +1 (tomorrow)', () => {
    const instant = new Date('2026-09-24T21:30:00Z'); // 2026-09-25 in Baghdad
    const tomorrow = getClinicDateString(1, instant);
    expect(tomorrow).toBe('2026-09-26');
  });

  it('handles month boundaries accurately with calendar math (not ms additions)', () => {
    // 2026-03-01 at 01:00 in Baghdad
    const marchFirst = new Date('2026-02-28T22:00:00Z');
    expect(getClinicDateString(0, marchFirst)).toBe('2026-03-01');

    // Yesterday must be Feb 28, 2026 (non-leap year)
    const febLast = getClinicDateString(-1, marchFirst);
    expect(febLast).toBe('2026-02-28');
  });

  it('handles year boundary accurately with calendar math', () => {
    // 2026-01-01 at 00:01 in Baghdad (2025-12-31 21:01 UTC)
    const newYear = new Date('2025-12-31T21:01:00Z');
    expect(getClinicDateString(0, newYear)).toBe('2026-01-01');

    // Yesterday must be 2025-12-31
    expect(getClinicDateString(-1, newYear)).toBe('2025-12-31');
  });

  it('remains strictly consistent regardless of process.env.TZ setting', () => {
    const originalTZ = process.env.TZ;
    const instant = new Date('2026-09-24T21:30:00Z');

    try {
      // Simulate server running in UTC
      process.env.TZ = 'UTC';
      expect(getClinicDateString(0, instant)).toBe('2026-09-25');
      expect(getClinicDateString(-1, instant)).toBe('2026-09-24');

      // Simulate client in America/New_York (UTC-4)
      process.env.TZ = 'America/New_York';
      expect(getClinicDateString(0, instant)).toBe('2026-09-25');
      expect(getClinicDateString(-1, instant)).toBe('2026-09-24');

      // Simulate client in Pacific/Auckland (UTC+12)
      process.env.TZ = 'Pacific/Auckland';
      expect(getClinicDateString(0, instant)).toBe('2026-09-25');
      expect(getClinicDateString(-1, instant)).toBe('2026-09-24');
    } finally {
      process.env.TZ = originalTZ;
    }
  });
});

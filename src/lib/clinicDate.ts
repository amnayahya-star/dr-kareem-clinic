export const CLINIC_TIME_ZONE = 'Asia/Baghdad';

/**
 * Extracts the clinic calendar date (YYYY-MM-DD) in Asia/Baghdad timezone,
 * and shifts calendar days safely using year/month/day math rather than raw ms addition.
 */
export function getClinicDateString(offsetDays = 0, now = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(now);
  let year = 0;
  let month = 0;
  let day = 0;

  for (const part of parts) {
    if (part.type === 'year') {
      year = parseInt(part.value, 10);
    } else if (part.type === 'month') {
      month = parseInt(part.value, 10);
    } else if (part.type === 'day') {
      day = parseInt(part.value, 10);
    }
  }

  // Use UTC year/month/day constructor to adjust calendar days safely without timezone shifts
  const clinicDate = new Date(Date.UTC(year, month - 1, day));
  if (offsetDays !== 0) {
    clinicDate.setUTCDate(clinicDate.getUTCDate() + offsetDays);
  }

  const resYear = clinicDate.getUTCFullYear();
  const resMonth = String(clinicDate.getUTCMonth() + 1).padStart(2, '0');
  const resDay = String(clinicDate.getUTCDate()).padStart(2, '0');

  return `${resYear}-${resMonth}-${resDay}`;
}

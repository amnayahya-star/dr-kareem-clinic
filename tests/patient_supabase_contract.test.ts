import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPatients, fetchPatientById } from '../src/services/patientService';
import {
  isMockNotification,
  cleanLegacyMockStorage,
  getClinicNotifications,
  saveClinicNotifications,
} from '../src/services/notificationService';

// Mock Supabase client
const mockSelect = vi.fn();
const mockOrder = vi.fn();
const mockOr = vi.fn();
const mockEq = vi.fn();
const mockFrom = vi.fn();
let isConfigured = true;

vi.mock('../src/lib/supabase/client', () => ({
  createClient: () => ({
    from: mockFrom,
  }),
  isSupabaseConfigured: () => isConfigured,
}));

describe('Patient Service Supabase Data Contracts (No Mock Fallback in Production)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isConfigured = true;

    // Chain setup for fetchPatients
    mockOr.mockReturnValue({ data: [], error: null });
    mockOrder.mockImplementation(() => ({
      or: mockOr,
      then: (resolve: any) => resolve({ data: [], error: null }),
      data: [],
      error: null,
    }));
    mockSelect.mockReturnValue({
      order: mockOrder,
      eq: mockEq,
    });
    mockFrom.mockReturnValue({
      select: mockSelect,
    });
  });

  describe('fetchPatients()', () => {
    it('returns empty array [] when Supabase returns 0 rows (COUNT(*) = 0) - NEVER returns mock patients', async () => {
      mockOrder.mockResolvedValueOnce({ data: [], error: null });

      const result = await fetchPatients();
      expect(result).toEqual([]);
      expect(result.length).toBe(0);
    });

    it('throws error when Supabase query fails - NEVER falls back to mock patients', async () => {
      mockOrder.mockResolvedValueOnce({
        data: null,
        error: { message: 'relation "patients" does not exist' },
      });

      await expect(fetchPatients()).rejects.toThrow(/فشل جلب بيانات المرضى/i);
    });

    it('returns mock data only when Supabase is NOT configured (explicit offline mode)', async () => {
      isConfigured = false;

      const result = await fetchPatients();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].fileNumber).toBeDefined();
    });
  });

  describe('fetchPatientById()', () => {
    it('returns null when patient is not found in Supabase - NEVER returns mock patient fallback', async () => {
      mockEq.mockReturnValueOnce({
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      const result = await fetchPatientById('non-existent-uuid');
      expect(result).toBeNull();
    });

    it('throws error when Supabase query fails - NEVER returns mock patient fallback', async () => {
      mockEq.mockReturnValueOnce({
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: null,
          error: { message: 'permission denied for table patients' },
        }),
      });

      await expect(fetchPatientById('p-123')).rejects.toThrow(/فشل جلب ملف الطفل/i);
    });

    it('returns mock patient by id when Supabase is NOT configured (offline mode)', async () => {
      isConfigured = false;

      const result = await fetchPatientById('p-001');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('p-001');
    });
  });
});

describe('Notification Service Contracts (Zero Mock Notifications in Production)', () => {
  beforeEach(() => {
    localStorage.clear();
    isConfigured = true;
  });

  it('identifies mock notifications by mock patient IDs and mock names', () => {
    expect(isMockNotification({ patientId: 'p-001', childName: 'يوسف أحمد العلي' })).toBe(true);
    expect(isMockNotification({ patientId: 'p-002', childName: 'مريم حسن الجابري' })).toBe(true);
    expect(isMockNotification({ patientId: 'p-test-1', childName: 'أي اسم' })).toBe(true);
    expect(
      isMockNotification({
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        childName: 'محمد أحمد الحقيقي',
      })
    ).toBe(false);
  });

  it('filters out mock notifications from getClinicNotifications in production', () => {
    const mockStorageList = [
      {
        id: 'notif-1',
        type: 'visit_approved_needs_rx',
        patientId: 'p-001',
        childName: 'يوسف أحمد العلي',
        isSnapped: false,
      },
      {
        id: 'notif-2',
        type: 'visit_approved_needs_rx',
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        childName: 'فاطمة كريم الحقيقية',
        isSnapped: false,
      },
    ];
    localStorage.setItem('dr_kareem_clinic_notifications', JSON.stringify(mockStorageList));

    const inProduction = getClinicNotifications();
    expect(inProduction.length).toBe(1);
    expect(inProduction[0].childName).toBe('فاطمة كريم الحقيقية');
  });

  it('cleanLegacyMockStorage removes only mock data without touching user language or session tokens', () => {
    localStorage.setItem('dr_kareem_lang', 'ar');
    localStorage.setItem('sb-12345-auth-token', 'jwt-token-string');
    localStorage.setItem(
      'dr_kareem_clinic_notifications',
      JSON.stringify([
        { id: '1', patientId: 'p-001', childName: 'يوسف أحمد العلي' },
      ])
    );
    localStorage.setItem(
      'dr_kareem_deleted_patients',
      JSON.stringify([
        { id: 'p-001', fullName: 'يوسف أحمد العلي', deletedAt: new Date().toISOString() },
      ])
    );

    cleanLegacyMockStorage();

    // Mock keys must be purged
    expect(localStorage.getItem('dr_kareem_clinic_notifications')).toBeNull();
    expect(localStorage.getItem('dr_kareem_deleted_patients')).toBeNull();

    // Critical session and language keys must remain intact
    expect(localStorage.getItem('dr_kareem_lang')).toBe('ar');
    expect(localStorage.getItem('sb-12345-auth-token')).toBe('jwt-token-string');
  });
});


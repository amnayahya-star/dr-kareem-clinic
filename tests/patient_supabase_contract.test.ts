import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPatients, fetchPatientById } from '../src/services/patientService';

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

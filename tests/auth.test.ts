import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSafeRedirectPath,
  fetchAndVerifyProfile,
  authenticateUser,
  getCurrentSessionUser,
  signOutUser,
} from '../src/services/authService';

describe('Real Auth Service Tests (authService.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Safe Redirect Path Validation (getSafeRedirectPath)', () => {
    it('accepts valid internal doctor redirect paths', () => {
      expect(getSafeRedirectPath('/doctor', 'doctor')).toBe('/doctor');
      expect(getSafeRedirectPath('/doctor/patients', 'doctor')).toBe('/doctor/patients');
      expect(getSafeRedirectPath('/doctor/patients/p-100', 'doctor')).toBe('/doctor/patients/p-100');
    });

    it('accepts valid internal secretary redirect paths', () => {
      expect(getSafeRedirectPath('/secretary', 'secretary')).toBe('/secretary');
      expect(getSafeRedirectPath('/secretary/new-patient', 'secretary')).toBe('/secretary/new-patient');
      expect(getSafeRedirectPath('/secretary/new-visit', 'secretary')).toBe('/secretary/new-visit');
    });

    it('rejects doctor path for secretary and redirects to /secretary', () => {
      expect(getSafeRedirectPath('/doctor/patients', 'secretary')).toBe('/secretary');
      expect(getSafeRedirectPath('/doctor', 'secretary')).toBe('/secretary');
    });

    it('rejects secretary path for doctor and redirects to /doctor', () => {
      expect(getSafeRedirectPath('/secretary/new-patient', 'doctor')).toBe('/doctor');
      expect(getSafeRedirectPath('/secretary', 'doctor')).toBe('/doctor');
    });

    it('rejects external open-redirect URLs (http, https, //, javascript:)', () => {
      expect(getSafeRedirectPath('https://evil.com/doctor', 'doctor')).toBe('/doctor');
      expect(getSafeRedirectPath('http://malicious.site', 'doctor')).toBe('/doctor');
      expect(getSafeRedirectPath('//attacker.com/doctor', 'doctor')).toBe('/doctor');
      expect(getSafeRedirectPath('/\\attacker.com', 'doctor')).toBe('/doctor');
      expect(getSafeRedirectPath('javascript:alert(1)', 'doctor')).toBe('/doctor');
      expect(getSafeRedirectPath('https://external.com/secretary', 'secretary')).toBe('/secretary');
    });

    it('falls back to default role path for null, empty or undefined input', () => {
      expect(getSafeRedirectPath(null, 'doctor')).toBe('/doctor');
      expect(getSafeRedirectPath(undefined, 'doctor')).toBe('/doctor');
      expect(getSafeRedirectPath('', 'doctor')).toBe('/doctor');
      expect(getSafeRedirectPath(null, 'secretary')).toBe('/secretary');
      expect(getSafeRedirectPath(undefined, 'secretary')).toBe('/secretary');
      expect(getSafeRedirectPath('', 'secretary')).toBe('/secretary');
    });
  });

  describe('2. Password handling (NO trim on password)', () => {
    it('passes raw password with leading/trailing spaces without trimming to Supabase Auth', async () => {
      const signInMock = vi.fn().mockResolvedValue({
        data: { user: { id: 'doc-id-1', email: 'doctor@clinic.test' } },
        error: null,
      });

      const mockSupabase = {
        auth: {
          signInWithPassword: signInMock,
          signOut: vi.fn(),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'doc-id-1',
                  full_name: 'د. عبد الكريم عليوي',
                  role: 'doctor',
                  is_active: true,
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      const passwordWithSpaces = '  my secret pass 123!  ';
      await authenticateUser(
        mockSupabase,
        'doctor',
        'doctor@clinic.test',
        passwordWithSpaces
      );

      expect(signInMock).toHaveBeenCalledWith({
        email: 'doctor@clinic.test',
        password: '  my secret pass 123!  ', // Verified: spaces preserved exactly
      });
    });
  });

  describe('3. Profile Verification & Account Status', () => {
    it('successfully verifies active doctor profile', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'doc-id-1',
                  full_name: 'د. عبد الكريم عليوي',
                  role: 'doctor',
                  is_active: true,
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      const user = await fetchAndVerifyProfile(mockSupabase, 'doc-id-1', 'doc@test.com');
      expect(user.role).toBe('doctor');
      expect(user.name).toBe('د. عبد الكريم عليوي');
    });

    it('rejects user if profile is missing in profiles table', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      };

      await expect(
        fetchAndVerifyProfile(mockSupabase, 'missing-id', 'test@test.com')
      ).rejects.toThrow('لم يتم العثور على ملف تعريف مرتبط بهذا الحساب');
    });

    it('rejects user if account is marked is_active = false', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'inactive-id',
                  full_name: 'حساب غير نشط',
                  role: 'secretary',
                  is_active: false,
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      await expect(
        fetchAndVerifyProfile(mockSupabase, 'inactive-id', 'test@test.com')
      ).rejects.toThrow('هذا الحساب معطل، يرجى مراجعة إدارة النظام');
    });

    it('rejects user if role is neither doctor nor secretary', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'invalid-role-id',
                  full_name: 'مستخدم غير معروف',
                  role: 'admin',
                  is_active: true,
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      await expect(
        fetchAndVerifyProfile(mockSupabase, 'invalid-role-id', 'test@test.com')
      ).rejects.toThrow('الدور المحدد للحساب غير صالح');
    });
  });

  describe('4. Full Authentication Flow (authenticateUser)', () => {
    it('authenticates secretary successfully', async () => {
      const mockSupabase = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: { id: 'sec-id-1', email: 'secretary@clinic.test' } },
            error: null,
          }),
          signOut: vi.fn(),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'sec-id-1',
                  full_name: 'موظف الاستقبال',
                  role: 'secretary',
                  is_active: true,
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      const user = await authenticateUser(
        mockSupabase,
        'secretary',
        'secretary@clinic.test',
        'ValidSecPass2026!'
      );

      expect(user.role).toBe('secretary');
      expect(user.id).toBe('sec-id-1');
    });

    it('rejects invalid password with generic safe Arabic message', async () => {
      const mockSupabase = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid login credentials' },
          }),
          signOut: vi.fn(),
        },
      };

      await expect(
        authenticateUser(mockSupabase, 'doctor', 'doctor@test.com', 'wrongpass')
      ).rejects.toThrow('تعذر تسجيل الدخول. تحقق من بيانات الحساب.');
    });

    it('rejects role mismatch (secretary attempting doctor login)', async () => {
      const signOutMock = vi.fn();
      const mockSupabase = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: { id: 'sec-id-1', email: 'sec@test.com' } },
            error: null,
          }),
          signOut: signOutMock,
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'sec-id-1',
                  full_name: 'موظف الاستقبال',
                  role: 'secretary',
                  is_active: true,
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      await expect(
        authenticateUser(mockSupabase, 'doctor', 'sec@test.com', 'pass123')
      ).rejects.toThrow('تعذر تسجيل الدخول. نوع الحساب المحدد لا يتطابق مع صلاحيات هذا المستخدم.');

      expect(signOutMock).toHaveBeenCalled();
    });
  });

  describe('5. Session and SignOut helpers', () => {
    it('restores current session user correctly', async () => {
      const mockSupabase = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { user: { id: 'doc-1', email: 'doc@test.com' } } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'doc-1',
                  full_name: 'د. عبد الكريم عليوي',
                  role: 'doctor',
                  is_active: true,
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      const user = await getCurrentSessionUser(mockSupabase);
      expect(user?.role).toBe('doctor');
      expect(user?.id).toBe('doc-1');
    });

    it('calls client.auth.signOut on signOutUser', async () => {
      const signOutMock = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        auth: { signOut: signOutMock },
      };

      await signOutUser(mockSupabase);
      expect(signOutMock).toHaveBeenCalledTimes(1);
    });
  });
});

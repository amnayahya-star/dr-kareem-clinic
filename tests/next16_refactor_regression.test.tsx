import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { LanguageProvider, useLanguage } from '../src/context/LanguageContext';
import { ElectronicPrescriptionSection } from '../src/components/prescriptions/ElectronicPrescriptionSection';
import SecretaryPureWorkflowPage from '../src/app/(secretary)/secretary/page';
import * as authService from '../src/services/authService';
import * as patientService from '../src/services/patientService';
import * as notificationService from '../src/services/notificationService';
import { Prescription } from '../src/types/database';

// Mock Next router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock services
vi.mock('../src/services/patientService', () => ({
  fetchPatients: vi.fn().mockResolvedValue([]),
  fetchDeletedPatients: vi.fn().mockResolvedValue([]),
  permanentDeletePatient: vi.fn().mockResolvedValue(true),
}));

vi.mock('../src/services/notificationService', () => ({
  getClinicNotifications: vi.fn().mockReturnValue([
    {
      id: 'mock-notif-1',
      type: 'visit_approved_needs_rx',
      visitId: 'visit-1',
      patientId: 'patient-1',
      childName: 'أحمد',
      isSnapped: false,
    },
  ]),
  subscribeToClinicNotifications: vi.fn().mockReturnValue(() => {}),
  cleanLegacyMockStorage: vi.fn(),
  playNotificationChime: vi.fn(),
  isMockNotification: vi.fn().mockReturnValue(false),
}));

vi.mock('../src/services/authService', () => ({
  getCurrentSessionUser: vi.fn(),
  signOutUser: vi.fn().mockResolvedValue(true),
  authenticateUser: vi.fn(),
  fetchAndVerifyProfile: vi.fn(),
}));

vi.mock('../src/lib/supabase/client', () => ({
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
  createClient: vi.fn().mockReturnValue({
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      }),
    },
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn().mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  }),
}));

describe('Next 16 Refactor Regression Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('1. LanguageContext Hydration & Sync Tests', () => {
    function LangConsumer() {
      const { language, isRTL } = useLanguage();
      return (
        <div id="test-lang-container">
          <span data-testid="lang-val">{language}</span>
          <span data-testid="rtl-val">{String(isRTL)}</span>
        </div>
      );
    }

    it('uses default arabic language when localStorage is empty', () => {
      render(
        <LanguageProvider>
          <LangConsumer />
        </LanguageProvider>
      );

      expect(screen.getByTestId('lang-val').textContent).toBe('ar');
      expect(screen.getByTestId('rtl-val').textContent).toBe('true');
      expect(document.documentElement.dir).toBe('rtl');
    });

    it('performs clean server render and client hydrate without hydration mismatch when localStorage has en', async () => {
      // 1. Pre-populate localStorage with "en"
      localStorage.setItem('dr_kareem_lang', 'en');

      // 2. Perform Server-Side Render (SSR) with default snapshot
      const serverHtml = renderToString(
        <LanguageProvider>
          <LangConsumer />
        </LanguageProvider>
      );

      // Server output MUST be Arabic ("ar") per getLanguageServerSnapshot
      expect(serverHtml).toContain('>ar<');

      // 3. Spy on console.error to assert ZERO hydration mismatch errors
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // 4. Hydrate into DOM container
      const container = document.createElement('div');
      container.innerHTML = serverHtml;
      document.body.appendChild(container);

      let root: any;
      await act(async () => {
        root = hydrateRoot(
          container,
          <LanguageProvider>
            <LangConsumer />
          </LanguageProvider>
        );
      });

      // Verify no React hydration mismatch warnings were logged
      const hydrationErrors = consoleErrorSpy.mock.calls.filter((call) =>
        call.some((arg) => typeof arg === 'string' && (arg.includes('did not match') || arg.includes('Hydration failed')))
      );
      expect(hydrationErrors).toHaveLength(0);

      // 5. After hydration completion, useSyncExternalStore synchronizes to client saved language "en"
      await waitFor(() => {
        expect(container.querySelector('[data-testid="lang-val"]')?.textContent).toBe('en');
      });

      root.unmount();
      container.remove();
      consoleErrorSpy.mockRestore();
    });

    it('preserves arabic on hydration when localStorage is empty', async () => {
      const serverHtml = renderToString(
        <LanguageProvider>
          <LangConsumer />
        </LanguageProvider>
      );

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const container = document.createElement('div');
      container.innerHTML = serverHtml;
      document.body.appendChild(container);

      let root: any;
      await act(async () => {
        root = hydrateRoot(
          container,
          <LanguageProvider>
            <LangConsumer />
          </LanguageProvider>
        );
      });

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(container.querySelector('[data-testid="lang-val"]')?.textContent).toBe('ar');

      root.unmount();
      container.remove();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('2. AuthContext Verification & Race-Condition Tests', () => {
    it('verifies initial session asynchronously and updates user', async () => {
      const mockUser = {
        id: 'usr-1',
        email: 'doctor@clinic.com',
        role: 'doctor' as const,
        name: 'د. كريم',
      };
      (authService.getCurrentSessionUser as any).mockResolvedValue(mockUser);

      function AuthConsumer() {
        const { user, isLoading } = useAuth();
        return (
          <div>
            <span data-testid="loading">{String(isLoading)}</span>
            <span data-testid="username">{user?.name || 'none'}</span>
          </div>
        );
      }

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      expect(screen.getByTestId('loading').textContent).toBe('true');

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
      expect(screen.getByTestId('username').textContent).toBe('د. كريم');
    });

    it('ignores stale initSession result when real-time auth event arrives earlier (prevents race condition)', async () => {
      let resolveSlowInit: (value: any) => void;
      const slowInitPromise = new Promise((resolve) => {
        resolveSlowInit = resolve;
      });
      (authService.getCurrentSessionUser as any).mockReturnValue(slowInitPromise);

      let authStateCallback: ((event: string, session: any) => Promise<void>) | null = null;
      const { createClient } = await import('../src/lib/supabase/client');
      (createClient as any).mockReturnValue({
        auth: {
          onAuthStateChange: vi.fn().mockImplementation((cb) => {
            authStateCallback = cb;
            return {
              data: {
                subscription: { unsubscribe: vi.fn() },
              },
            };
          }),
        },
      });

      (authService.fetchAndVerifyProfile as any).mockResolvedValue({
        id: 'user-new',
        email: 'new@clinic.com',
        role: 'doctor' as const,
        name: 'الطبيب الجديد',
      });

      function AuthConsumer() {
        const { user } = useAuth();
        return <span data-testid="active-user">{user?.name || 'anonymous'}</span>;
      }

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      // Fast-forward: A newer real-time auth state change fires first
      await act(async () => {
        if (authStateCallback) {
          await authStateCallback('SIGNED_IN', {
            user: { id: 'user-new', email: 'new@clinic.com' },
          });
        }
      });

      expect(screen.getByTestId('active-user').textContent).toBe('الطبيب الجديد');

      // Now the slow initial session finally resolves with older stale user data
      await act(async () => {
        resolveSlowInit!({
          id: 'user-stale',
          email: 'stale@clinic.com',
          role: 'doctor' as const,
          name: 'المستخدم القديم المتأخر',
        });
      });

      // The guard MUST ignore the stale init result and keep the newer real-time user
      expect(screen.getByTestId('active-user').textContent).toBe('الطبيب الجديد');
    });

    it('unsubscribes from authStateChange on unmount without state updates after unmount', async () => {
      const unsubscribeSpy = vi.fn();
      const { createClient } = await import('../src/lib/supabase/client');
      (createClient as any).mockReturnValue({
        auth: {
          onAuthStateChange: vi.fn().mockReturnValue({
            data: {
              subscription: {
                unsubscribe: unsubscribeSpy,
              },
            },
          }),
        },
      });

      const { unmount } = render(
        <AuthProvider>
          <div>Child</div>
        </AuthProvider>
      );

      unmount();
      expect(unsubscribeSpy).toHaveBeenCalled();
    });
  });

  describe('3. Secretary Workflow Tests', () => {
    it('initializes live notifications via lazy state initializer', async () => {
      render(
        <LanguageProvider>
          <SecretaryPureWorkflowPage />
        </LanguageProvider>
      );

      expect(notificationService.getClinicNotifications).toHaveBeenCalled();
    });
  });

  describe('4. ElectronicPrescriptionSection Synchronization & Re-render Stability', () => {
    const basePrescription: Prescription = {
      id: 'rx-stable-1',
      visit_id: 'visit-1',
      patient_id: 'p-1',
      doctor_id: 'doc-1',
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      general_instructions: 'التعليمات الأصلية',
      items: [
        {
          id: 'item-1',
          prescription_id: 'rx-stable-1',
          medication_name: 'Panadol',
          dosage_form: 'syrup',
          dose: '5ml',
          frequency: 'TDS',
          duration: '3 days',
          instructions: 'بعد الأكل',
          display_order: 1,
        },
      ],
    };

    it('preserves user modifications and avoids render loops when rerendered with new object reference of identical content', () => {
      const { rerender } = render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId="visit-1"
            patientId="p-1"
            initialPrescription={basePrescription}
          />
        </LanguageProvider>
      );

      // Verify initial rendering
      const instructionsInput = screen.getByDisplayValue('التعليمات الأصلية');
      expect(instructionsInput).toBeInTheDocument();

      // User types custom instructions (marking the draft dirty)
      fireEvent.change(instructionsInput, { target: { value: 'تعليمات معدلة من قبل الطبيب' } });
      expect(instructionsInput).toHaveValue('تعليمات معدلة من قبل الطبيب');

      // Rerender with a NEW object reference having identical id & visitId
      const newReferenceIdenticalPrescription = { ...basePrescription };
      rerender(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId="visit-1"
            patientId="p-1"
            initialPrescription={newReferenceIdenticalPrescription}
          />
        </LanguageProvider>
      );

      // User edits MUST NOT be wiped out
      expect(instructionsInput).toHaveValue('تعليمات معدلة من قبل الطبيب');
    });

    it('switches to new visit prescription when visitId changes intentionally', () => {
      const prescriptionVisit2: Prescription = {
        id: 'rx-visit-2',
        visit_id: 'visit-2',
        patient_id: 'p-1',
        doctor_id: 'doc-1',
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        general_instructions: 'تعليمات الزيارة الثانية',
        items: [
          {
            id: 'item-2',
            prescription_id: 'rx-visit-2',
            medication_name: 'Amoxicillin',
            dosage_form: 'syrup',
            dose: '7ml',
            frequency: 'BD',
            duration: '7 days',
            instructions: 'مع الطعام',
            display_order: 1,
          },
        ],
      };

      const { rerender } = render(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId="visit-1"
            patientId="p-1"
            initialPrescription={basePrescription}
          />
        </LanguageProvider>
      );

      expect(screen.getByDisplayValue('Panadol')).toBeInTheDocument();

      // Change visitId prop to visit-2
      rerender(
        <LanguageProvider>
          <ElectronicPrescriptionSection
            visitId="visit-2"
            patientId="p-1"
            initialPrescription={prescriptionVisit2}
          />
        </LanguageProvider>
      );

      expect(screen.getByDisplayValue('Amoxicillin')).toBeInTheDocument();
      expect(screen.queryByDisplayValue('Panadol')).not.toBeInTheDocument();
    });
  });

  describe('5. Next 16 Proxy Route Protection Tests', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-clinic.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
    });

    it('redirects unauthenticated doctor route to login', async () => {
      const { createServerClient } = await import('@supabase/ssr');
      vi.mocked(createServerClient).mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
      } as any);

      const { proxy } = await import('../src/proxy');
      const { NextRequest } = await import('next/server');

      const req = new NextRequest('http://localhost:3000/doctor/dashboard');
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login?redirectTo=%2Fdoctor%2Fdashboard');
    });

    it('redirects unauthenticated secretary route to login', async () => {
      const { createServerClient } = await import('@supabase/ssr');
      vi.mocked(createServerClient).mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
      } as any);

      const { proxy } = await import('../src/proxy');
      const { NextRequest } = await import('next/server');

      const req = new NextRequest('http://localhost:3000/secretary');
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login?redirectTo=%2Fsecretary');
    });

    it('allows public routes like /login without redirection', async () => {
      const { proxy } = await import('../src/proxy');
      const { NextRequest } = await import('next/server');

      const req = new NextRequest('http://localhost:3000/login');
      const res = await proxy(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('allows public routes like root / without redirection', async () => {
      const { proxy } = await import('../src/proxy');
      const { NextRequest } = await import('next/server');

      const req = new NextRequest('http://localhost:3000/');
      const res = await proxy(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  });
});

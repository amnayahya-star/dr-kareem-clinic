import '@testing-library/jest-dom';
import { vi } from 'vitest';

vi.mock('next/navigation', () => {
  return {
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    }),
    usePathname: () => '/doctor/examination/test-visit',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({ visitId: 'test-visit' }),
  };
});

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../src/components/ui/Button';
import { Badge } from '../src/components/ui/Badge';
import { Alert } from '../src/components/ui/Alert';

describe('UI Base Components', () => {
  it('renders button with arabic label', () => {
    render(<Button>حفظ البيانات</Button>);
    expect(screen.getByText('حفظ البيانات')).toBeInTheDocument();
  });

  it('renders badge with warning variant', () => {
    render(<Badge variant="warning">بانتظار الطبيب</Badge>);
    const badge = screen.getByText('بانتظار الطبيب');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-amber-700');
  });

  it('renders alert with title and content', () => {
    render(
      <Alert variant="danger" title="تنبيه الحساسية">
        يوجد حساسية من البنسلين
      </Alert>
    );
    expect(screen.getByText('تنبيه الحساسية')).toBeInTheDocument();
    expect(screen.getByText('يوجد حساسية من البنسلين')).toBeInTheDocument();
  });
});

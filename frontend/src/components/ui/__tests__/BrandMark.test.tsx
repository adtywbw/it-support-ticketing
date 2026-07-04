import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import BrandMark from '../BrandMark';

describe('BrandMark', () => {
  it('renders the polished Support Hub mark with an accessible label', () => {
    render(<BrandMark />);

    const mark = screen.getByLabelText('Support Hub');
    expect(mark).toHaveTextContent('SH');
    expect(mark.className).toContain('bg-gradient-to-br');
    expect(mark.className).toContain('from-primary-600');
    expect(mark.className).toContain('to-sky-500');
  });

  it('supports small size and custom classes', () => {
    render(<BrandMark size="sm" className="ring-2" />);

    const mark = screen.getByLabelText('Support Hub');
    expect(mark.className).toContain('h-8');
    expect(mark.className).toContain('w-8');
    expect(mark.className).toContain('ring-2');
  });
});

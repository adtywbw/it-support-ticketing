import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import BrandMark from '../BrandMark';

describe('BrandMark', () => {
  it('renders the IT HelpDesk eye icon mark with an accessible label', () => {
    render(<BrandMark />);

    const mark = screen.getByLabelText('IT HelpDesk');
    expect(mark.querySelector('svg')).toBeInTheDocument();
    expect(mark.className).toContain('inline-flex');
  });

  it('supports small size and custom classes', () => {
    render(<BrandMark size="sm" className="ring-2" />);

    const mark = screen.getByLabelText('IT HelpDesk');
    expect(mark.className).toContain('h-8');
    expect(mark.className).toContain('w-8');
    expect(mark.className).toContain('ring-2');
  });
});

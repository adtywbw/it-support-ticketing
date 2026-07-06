import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import LoadingSpinner from '../LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders a spinner div', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('applies md size by default', () => {
    const { container } = render(<LoadingSpinner />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner?.className).toContain('h-8');
    expect(spinner?.className).toContain('w-8');
  });

  it('applies sm size', () => {
    const { container } = render(<LoadingSpinner size="sm" />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner?.className).toContain('h-4');
    expect(spinner?.className).toContain('w-4');
  });

  it('applies lg size', () => {
    const { container } = render(<LoadingSpinner size="lg" />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner?.className).toContain('h-12');
    expect(spinner?.className).toContain('w-12');
  });

  it('applies custom className', () => {
    const { container } = render(<LoadingSpinner className="my-4" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('my-4');
  });
});

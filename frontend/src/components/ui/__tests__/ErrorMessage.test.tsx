import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorMessage from '../ErrorMessage';

describe('ErrorMessage', () => {
  it('renders default title and message', () => {
    render(<ErrorMessage />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByText('An error occurred while loading data. Please try again.'),
    ).toBeInTheDocument();
  });

  it('renders custom title and message', () => {
    render(<ErrorMessage title="Oops" message="Custom error message" />);
    expect(screen.getByText('Oops')).toBeInTheDocument();
    expect(screen.getByText('Custom error message')).toBeInTheDocument();
  });

  it('renders retry button when onRetry is provided', () => {
    render(<ErrorMessage onRetry={vi.fn()} />);
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  it('does not render retry button when onRetry is not provided', () => {
    render(<ErrorMessage />);
    expect(screen.queryByText('Try again')).not.toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<ErrorMessage onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders error icon', () => {
    const { container } = render(<ErrorMessage />);
    const iconContainer = container.querySelector('.bg-red-100');
    expect(iconContainer).toBeInTheDocument();
    expect(iconContainer?.querySelector('svg')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <ErrorMessage className="my-custom" />,
    );
    expect(container.firstElementChild?.className).toContain('my-custom');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Switch from '../Switch';

describe('Switch', () => {
  it('renders with role switch', () => {
    render(<Switch checked={false} onChange={vi.fn()} />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('shows checked state via aria-checked', () => {
    const { rerender } = render(<Switch checked={false} onChange={vi.fn()} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    rerender(<Switch checked={true} onChange={vi.fn()} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('renders label as aria-label', () => {
    render(<Switch checked={false} onChange={vi.fn()} label="Notifications" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-label', 'Notifications');
  });

  it('calls onChange with true when clicked while unchecked', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when clicked while checked', () => {
    const onChange = vi.fn();
    render(<Switch checked={true} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies disabled styling', () => {
    render(<Switch checked={false} onChange={vi.fn()} disabled />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('responds to Enter key', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} />);
    const sw = screen.getByRole('switch');
    fireEvent.keyDown(sw, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('responds to Space key', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} />);
    const sw = screen.getByRole('switch');
    fireEvent.keyDown(sw, { key: ' ' });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('applies sm size classes', () => {
    render(<Switch checked={false} onChange={vi.fn()} size="sm" />);
    const btn = screen.getByRole('switch');
    expect(btn.className).toContain('h-4');
    expect(btn.className).toContain('w-7');
  });

  it('applies md size classes by default', () => {
    render(<Switch checked={false} onChange={vi.fn()} />);
    const btn = screen.getByRole('switch');
    expect(btn.className).toContain('h-5');
    expect(btn.className).toContain('w-9');
  });

  it('applies custom className', () => {
    render(<Switch checked={false} onChange={vi.fn()} className="my-custom" />);
    expect(screen.getByRole('switch').className).toContain('my-custom');
  });
});

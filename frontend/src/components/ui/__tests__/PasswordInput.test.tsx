import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PasswordInput from '../PasswordInput';

describe('PasswordInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a password input by default', () => {
    render(<PasswordInput data-testid="pw" />);
    const input = screen.getByTestId('pw');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('passes through additional props to input', () => {
    render(<PasswordInput placeholder="Enter password" data-testid="pw" />);
    expect(screen.getByTestId('pw')).toHaveAttribute('placeholder', 'Enter password');
  });

  it('reveals password on long press (mousedown + mouseup)', () => {
    render(<PasswordInput data-testid="pw" />);
    const input = screen.getByTestId('pw');
    const eyeBtn = screen.getByRole('button');

    fireEvent.mouseDown(eyeBtn);
    act(() => { vi.advanceTimersByTime(150); });
    expect(input).toHaveAttribute('type', 'text');

    fireEvent.mouseUp(eyeBtn);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('hides password on mouseleave', () => {
    render(<PasswordInput data-testid="pw" />);
    const input = screen.getByTestId('pw');
    const eyeBtn = screen.getByRole('button');

    fireEvent.mouseDown(eyeBtn);
    act(() => { vi.advanceTimersByTime(150); });
    expect(input).toHaveAttribute('type', 'text');

    fireEvent.mouseLeave(eyeBtn);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('does not reveal on quick press', () => {
    render(<PasswordInput data-testid="pw" />);
    const eyeBtn = screen.getByRole('button');

    fireEvent.mouseDown(eyeBtn);
    act(() => { vi.advanceTimersByTime(50); });
    fireEvent.mouseUp(eyeBtn);

    expect(screen.getByTestId('pw')).toHaveAttribute('type', 'password');
  });

  it('shows hide icon when password is revealed', () => {
    render(<PasswordInput data-testid="pw" />);
    const eyeBtn = screen.getByRole('button');

    expect(screen.getByLabelText('Show password')).toBeInTheDocument();

    fireEvent.mouseDown(eyeBtn);
    act(() => { vi.advanceTimersByTime(150); });
    expect(screen.getByLabelText('Hide password')).toBeInTheDocument();

    fireEvent.mouseUp(eyeBtn);
    expect(screen.getByLabelText('Show password')).toBeInTheDocument();
  });

  it('applies error border styling when error is true', () => {
    render(<PasswordInput data-testid="pw" error />);
    const input = screen.getByTestId('pw');
    expect(input.className).toContain('border-red-500');
  });

  it('does not apply error border when error is false', () => {
    render(<PasswordInput data-testid="pw" />);
    const input = screen.getByTestId('pw');
    expect(input.className).not.toContain('border-red-500');
  });

  it('merges custom className', () => {
    render(<PasswordInput data-testid="pw" className="custom-class" />);
    expect(screen.getByTestId('pw').className).toContain('custom-class');
  });
});

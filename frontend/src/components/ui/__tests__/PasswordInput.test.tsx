import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PasswordInput from '../PasswordInput';

describe('PasswordInput', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

  it('reveals password on click toggle', () => {
    render(<PasswordInput data-testid="pw" />);
    const input = screen.getByTestId('pw');
    const eyeBtn = screen.getByRole('button');

    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(eyeBtn);
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.click(eyeBtn);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('shows correct icon based on visibility state', () => {
    render(<PasswordInput data-testid="pw" />);
    const eyeBtn = screen.getByRole('button');

    expect(screen.getByLabelText('Show password')).toBeInTheDocument();

    fireEvent.click(eyeBtn);
    expect(screen.getByLabelText('Hide password')).toBeInTheDocument();

    fireEvent.click(eyeBtn);
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

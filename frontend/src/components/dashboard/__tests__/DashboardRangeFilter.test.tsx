import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardRangeFilter from '../DashboardRangeFilter';

const toastError = vi.fn();

vi.mock('react-hot-toast', () => ({
  default: { error: (...args: unknown[]) => toastError(...args) },
}));

describe('DashboardRangeFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onChange with a preset range', () => {
    const onChange = vi.fn();
    render(<DashboardRangeFilter value={{ range: '30d' }} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '7d' }));

    expect(onChange).toHaveBeenCalledWith({ range: '7d' });
  });

  it('shows a toast and does not apply an invalid custom range', () => {
    const onChange = vi.fn();
    render(<DashboardRangeFilter value={{ range: '30d' }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Dashboard custom start date'), { target: { value: '2026-07-10' } });
    fireEvent.change(screen.getByLabelText('Dashboard custom end date'), { target: { value: '2026-07-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));

    expect(toastError).toHaveBeenCalledWith('Start date must be before or equal to end date.');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies a valid custom range', () => {
    const onChange = vi.fn();
    render(<DashboardRangeFilter value={{ range: '30d' }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Dashboard custom start date'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('Dashboard custom end date'), { target: { value: '2026-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));

    expect(onChange).toHaveBeenCalledWith({ range: 'custom', from: '2026-06-01', to: '2026-06-30' });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import NotificationPreferencesSection from '../NotificationPreferencesSection';

const mockUseNotificationPreferences = vi.fn();
const mockUseUpdateNotificationPreferences = vi.fn();
const mockMutateAsync = vi.fn();

vi.mock('@/hooks/use-notification-preferences', () => ({
  useNotificationPreferences: () => mockUseNotificationPreferences(),
  useUpdateNotificationPreferences: () =>
    mockUseUpdateNotificationPreferences(),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('NotificationPreferencesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUpdateNotificationPreferences.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
    mockUseNotificationPreferences.mockReturnValue({
      data: {
        preferences: {
          'ticket.created': true,
          'ticket.assigned': false,
          'ticket.status.updated': true,
        },
        availableEvents: [
          { event: 'ticket.created', label: 'New Ticket Created' },
          { event: 'ticket.assigned', label: 'Ticket Assigned' },
          { event: 'ticket.status.updated', label: 'Ticket Status Updated' },
        ],
      },
      isLoading: false,
    });
  });

  it('renders one checkbox per available event with the current state', () => {
    render(<NotificationPreferencesSection />);

    expect(screen.getByText('New Ticket Created')).toBeInTheDocument();
    expect(screen.getByText('Ticket Assigned')).toBeInTheDocument();
    const created = screen.getByLabelText(
      'New Ticket Created',
    ) as HTMLInputElement;
    const assigned = screen.getByLabelText(
      'Ticket Assigned',
    ) as HTMLInputElement;
    expect(created.checked).toBe(true);
    expect(assigned.checked).toBe(false);
  });

  it('disables Save until a change is made', () => {
    render(<NotificationPreferencesSection />);
    expect(screen.getByText('Save Preferences')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Ticket Assigned'));
    expect(screen.getByText('Save Preferences')).not.toBeDisabled();
  });

  it('saves the updated preferences and shows a success toast', async () => {
    mockMutateAsync.mockResolvedValueOnce({});
    render(<NotificationPreferencesSection />);
    fireEvent.click(screen.getByLabelText('Ticket Assigned')); // false -> true
    fireEvent.click(screen.getByText('Save Preferences'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        'ticket.created': true,
        'ticket.assigned': true,
        'ticket.status.updated': true,
      });
    });
    expect(toast.success).toHaveBeenCalled();
  });
});

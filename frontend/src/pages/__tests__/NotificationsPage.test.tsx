import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationsPage from '../NotificationsPage';

const mockUseNotifications = vi.fn();

vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: (...args: unknown[]) => mockUseNotifications(...args),
  useMarkAsRead: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkAllAsRead: () => ({ mutate: vi.fn(), isPending: false }),
  useClearAll: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/components/ui/Pagination', () => ({
  default: ({ totalPages }: { totalPages: number }) => <div data-testid="pagination">pages:{totalPages}</div>,
}));

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <NotificationsPage />
    </MemoryRouter>,
  );
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show an error state when notifications fail to load', () => {
    mockUseNotifications.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network failed'),
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Failed to load notifications')).toBeInTheDocument();
    expect(screen.getByText('Network failed')).toBeInTheDocument();
    expect(screen.queryByText('No notifications')).not.toBeInTheDocument();
  });

  it('should use meta.totalPages from the backend for pagination', () => {
    mockUseNotifications.mockReturnValue({
      data: {
        data: [{ id: 'n1', title: 'Ticket updated', message: 'A ticket changed', isRead: true, createdAt: '2026-06-18T12:00:00Z' }],
        meta: { page: 1, limit: 20, total: 999, totalPages: 7 },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByTestId('pagination')).toHaveTextContent('pages:7');
  });
});

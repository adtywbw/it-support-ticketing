import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TicketsPage from '../TicketsPage';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('@/components/tickets/TicketList', () => ({
  default: ({ filters, onFiltersChange, page, onPageChange, onLimitChange }: any) => (
    <div data-testid="ticket-list">
      <span data-testid="ticket-list-page">{page}</span>
      <button data-testid="mock-filter-change" onClick={() => onFiltersChange({ ...filters, status: 'Open' })}>
        Change filters
      </button>
      <button data-testid="mock-page-change" onClick={() => onPageChange(page + 1)}>
        Next page
      </button>
      <button data-testid="mock-limit-change" onClick={() => onLimitChange(25)}>
        Change limit
      </button>
    </div>
  ),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn() },
}));

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

function renderTicketsPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TicketsPage />
    </MemoryRouter>,
  );
}

describe('TicketsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('role-based rendering', () => {
    it('shows Export CSV and Create Ticket buttons for Admin', () => {
      useAuthStore.setState({
        user: { id: '1', email: 'admin@test.com', name: 'Admin', role: 'Admin', isActive: true, createdAt: '', updatedAt: '' },
        accessToken: 'token',
        isAuthenticated: true,
      });

      renderTicketsPage();

      expect(screen.getByText('Export CSV')).toBeInTheDocument();
      expect(screen.getByText('Create Ticket')).toBeInTheDocument();
    });

    it('shows Export CSV and Create Ticket buttons for ITSupport', () => {
      useAuthStore.setState({
        user: { id: '2', email: 'support@test.com', name: 'Support', role: 'ITSupport', isActive: true, createdAt: '', updatedAt: '' },
        accessToken: 'token',
        isAuthenticated: true,
      });

      renderTicketsPage();

      expect(screen.getByText('Export CSV')).toBeInTheDocument();
      expect(screen.getByText('Create Ticket')).toBeInTheDocument();
    });

    it('hides Export CSV button for EndUser, but shows Create Ticket', () => {
      useAuthStore.setState({
        user: { id: '3', email: 'user@test.com', name: 'User', role: 'EndUser', isActive: true, createdAt: '', updatedAt: '' },
        accessToken: 'token',
        isAuthenticated: true,
      });

      renderTicketsPage();

      expect(screen.queryByText('Export CSV')).not.toBeInTheDocument();
      expect(screen.getByText('Create Ticket')).toBeInTheDocument();
    });

    it('hides both Export CSV and Create Ticket when no user', () => {
      useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false });

      renderTicketsPage();

      expect(screen.queryByText('Export CSV')).not.toBeInTheDocument();
      expect(screen.queryByText('Create Ticket')).not.toBeInTheDocument();
    });
  });

  describe('TicketList interaction', () => {
    it('renders TicketList with initial page=1', () => {
      useAuthStore.setState({
        user: { id: '1', email: 'admin@test.com', name: 'Admin', role: 'Admin', isActive: true, createdAt: '', updatedAt: '' },
        accessToken: 'token',
        isAuthenticated: true,
      });

      renderTicketsPage();

      expect(screen.getByTestId('ticket-list-page')).toHaveTextContent('1');
    });

    it('resets page to 1 when filters change', async () => {
      useAuthStore.setState({
        user: { id: '1', email: 'admin@test.com', name: 'Admin', role: 'Admin', isActive: true, createdAt: '', updatedAt: '' },
        accessToken: 'token',
        isAuthenticated: true,
      });

      renderTicketsPage();

      // First change page to 2
      fireEvent.click(screen.getByTestId('mock-page-change'));
      expect(screen.getByTestId('ticket-list-page')).toHaveTextContent('2');

      // Then change filters — page should reset to 1
      fireEvent.click(screen.getByTestId('mock-filter-change'));
      expect(screen.getByTestId('ticket-list-page')).toHaveTextContent('1');
    });
  });

  describe('CSV export', () => {
    it('calls export API and triggers download', async () => {
      useAuthStore.setState({
        user: { id: '1', email: 'admin@test.com', name: 'Admin', role: 'Admin', isActive: true, createdAt: '', updatedAt: '' },
        accessToken: 'token',
        isAuthenticated: true,
      });

      const { default: apiClient } = await import('@/lib/axios');
      const blob = new Blob(['id,name\n1,test'], { type: 'text/csv' });
      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: blob });

      const createObjectURL = vi.fn(() => 'blob:test');
      const revokeObjectURL = vi.fn();
      window.URL.createObjectURL = createObjectURL;
      window.URL.revokeObjectURL = revokeObjectURL;

      renderTicketsPage();

      fireEvent.click(screen.getByText('Export CSV'));

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/tickets/export/csv', { responseType: 'blob' });
      });
      expect(createObjectURL).toHaveBeenCalled();
    });

    it('shows toast error when export fails', async () => {
      useAuthStore.setState({
        user: { id: '1', email: 'admin@test.com', name: 'Admin', role: 'Admin', isActive: true, createdAt: '', updatedAt: '' },
        accessToken: 'token',
        isAuthenticated: true,
      });

      const { default: apiClient } = await import('@/lib/axios');
      const { default: toast } = await import('react-hot-toast');
      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Network error'));

      renderTicketsPage();

      fireEvent.click(screen.getByText('Export CSV'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });

  describe('page title', () => {
    it('renders the Tickets heading', () => {
      useAuthStore.setState({
        user: { id: '1', email: 'admin@test.com', name: 'Admin', role: 'Admin', isActive: true, createdAt: '', updatedAt: '' },
        accessToken: 'token',
        isAuthenticated: true,
      });

      renderTicketsPage();

      expect(screen.getByText('Tickets')).toBeInTheDocument();
    });
  });
});

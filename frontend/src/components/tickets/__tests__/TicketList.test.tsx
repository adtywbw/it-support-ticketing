import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TicketList from '../TicketList';
import { useAuthStore } from '@/stores/auth-store';

const mockTickets = [
  {
    id: 'ticket-1',
    ticketNumber: 'TKT-001',
    subject: 'VPN issue',
    status: 'Open',
    priority: 'High',
    slaStatus: 'OnTrack',
    slaDueAt: '2026-07-10T00:00:00.000Z',
    createdAt: '2026-07-05T00:00:00.000Z',
    category: { id: 'cat-1', name: 'Network' },
    requester: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
    assignedTo: { id: 'support-1', name: 'Bob', email: 'bob@example.com' },
    _count: { comments: 0, attachments: 0 },
  },
];

const meta = { page: 1, limit: 10, total: 1, totalPages: 1 };

const defaultFilters = {
  status: [],
  priority: [],
  slaStatus: [],
  search: '',
  categoryId: [],
  assignedToMe: false,
  datePreset: 'all' as const,
  startDate: '',
  endDate: '',
  limit: 10,
  sortBy: 'createdAt',
  sortOrder: 'desc' as const,
};

function renderTicketList(overrides = {}) {
  return render(
    <MemoryRouter>
      <TicketList
        filters={defaultFilters}
        onFiltersChange={vi.fn()}
        page={1}
        onPageChange={vi.fn()}
        onLimitChange={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

vi.mock('@/hooks/use-tickets', () => ({
  useTickets: vi.fn(),
  useUpdateTicketPriority: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useAssignTicket: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteTicket: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/hooks/use-users', () => ({
  useAssignableUsers: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/use-categories', () => ({
  useCategories: vi.fn(() => ({ data: [] })),
}));

import { useTickets } from '@/hooks/use-tickets';

describe('TicketList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
    });
  });

  it('shows loading spinner when isLoading', () => {
    vi.mocked(useTickets).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTickets>);

    renderTicketList();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows error message when isError', () => {
    vi.mocked(useTickets).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTickets>);

    renderTicketList();
    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('shows empty state when no tickets', () => {
    vi.mocked(useTickets).mockReturnValue({
      data: { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTickets>);

    renderTicketList();
    expect(screen.getByText('No tickets found')).toBeInTheDocument();
  });

  it('renders tickets in table', () => {
    vi.mocked(useTickets).mockReturnValue({
      data: { data: mockTickets, meta },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTickets>);

    renderTicketList();
    expect(screen.getByText('TKT-001')).toBeInTheDocument();
    expect(screen.getByText('VPN issue')).toBeInTheDocument();
    expect(screen.getByText('Network')).toBeInTheDocument();
    const statusBadges = screen.getAllByText('Open');
    expect(statusBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows create ticket button in empty state for authenticated user', () => {
    vi.mocked(useTickets).mockReturnValue({
      data: { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTickets>);

    useAuthStore.setState({
      user: { id: 'user-1', email: 'user@example.com', name: 'User', role: 'EndUser', isActive: true, createdAt: '', updatedAt: '' },
      accessToken: 'token',
      isAuthenticated: true,
    });

    renderTicketList();
    expect(screen.getByText('Create Ticket')).toBeInTheDocument();
  });

  it('renders priority select for ITSupport/Admin users', () => {
    vi.mocked(useTickets).mockReturnValue({
      data: { data: mockTickets, meta },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTickets>);

    useAuthStore.setState({
      user: { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'Admin', isActive: true, createdAt: '', updatedAt: '' },
      accessToken: 'token',
      isAuthenticated: true,
    });

    renderTicketList();
    const prioritySelects = screen.getAllByRole('combobox');
    const ticketPrioritySelect = prioritySelects.find(
      (s) => s.querySelector('option[value="Low"]') && s.querySelector('option[value="Critical"]'),
    );
    expect(ticketPrioritySelect).toBeTruthy();
  });

  it('renders priority badge for EndUser', () => {
    vi.mocked(useTickets).mockReturnValue({
      data: { data: mockTickets, meta },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTickets>);

    useAuthStore.setState({
      user: { id: 'user-1', email: 'user@example.com', name: 'User', role: 'EndUser', isActive: true, createdAt: '', updatedAt: '' },
      accessToken: 'token',
      isAuthenticated: true,
    });

    renderTicketList();
    const highElements = screen.getAllByText('High');
    expect(highElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows actions column for admin', () => {
    vi.mocked(useTickets).mockReturnValue({
      data: { data: mockTickets, meta },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTickets>);

    useAuthStore.setState({
      user: { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'Admin', isActive: true, createdAt: '', updatedAt: '' },
      accessToken: 'token',
      isAuthenticated: true,
    });

    renderTicketList();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('hides actions column for non-admin', () => {
    vi.mocked(useTickets).mockReturnValue({
      data: { data: mockTickets, meta },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTickets>);

    useAuthStore.setState({
      user: { id: 'user-1', email: 'user@example.com', name: 'User', role: 'EndUser', isActive: true, createdAt: '', updatedAt: '' },
      accessToken: 'token',
      isAuthenticated: true,
    });

    renderTicketList();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
  });

  it('renders pagination when meta is present with data', () => {
    vi.mocked(useTickets).mockReturnValue({
      data: { data: mockTickets, meta },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTickets>);

    renderTicketList();
    expect(screen.getByText('Items per page:')).toBeInTheDocument();
  });

  it('renders ticket filter bar', () => {
    vi.mocked(useTickets).mockReturnValue({
      data: { data: mockTickets, meta },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTickets>);

    renderTicketList();
    expect(screen.getByPlaceholderText('Search tickets...')).toBeInTheDocument();
  });
});

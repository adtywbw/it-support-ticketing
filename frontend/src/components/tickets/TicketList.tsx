import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTickets, useUpdateTicketPriority } from '@/hooks/use-tickets';
import { useAuthStore } from '@/stores/auth-store';
import type { TicketStatus, TicketPriority } from '@/types';
import StatusBadge from './StatusBadge';
import PriorityBadge from './PriorityBadge';
import TicketFilters from './TicketFilters';
import Pagination from '@/components/ui/Pagination';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { formatDateTime, getUserDisplayName } from '@/lib/utils';

interface FilterValues {
  status: TicketStatus | '';
  priority: TicketPriority | '';
  search: string;
  categoryId: string | '';
  assignedToMe: boolean;
}

export default function TicketList() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const updatePriorityMutation = useUpdateTicketPriority();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FilterValues>({
    status: '',
    priority: '',
    search: '',
    categoryId: '',
    assignedToMe: false,
  });

  const queryFilters = {
    page,
    limit: 10,
    ...(filters.status && { status: filters.status }),
    ...(filters.priority && { priority: filters.priority }),
    ...(filters.search && { search: filters.search }),
    ...(filters.categoryId && { categoryId: filters.categoryId }),
    ...(filters.assignedToMe && user?.id && { assignedToId: user.id }),
  };

  const { data, isLoading, isError, error, refetch } = useTickets(queryFilters);

  const handleFiltersChange = (newFilters: FilterValues) => {
    setFilters(newFilters);
    setPage(1);
  };

  if (isLoading) {
    return (
      <div className="card p-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorMessage
        message={(error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load tickets'}
        onRetry={() => refetch()}
      />
    );
  }

  const tickets = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <TicketFilters filters={filters} onFiltersChange={handleFiltersChange} />
      </div>

      {tickets.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No tickets found"
            description={filters.search ? 'Try adjusting your search or filters.' : 'No tickets have been created yet.'}
            action={
              <button onClick={() => navigate('/tickets/new')} className="btn-primary">
                Create Ticket
              </button>
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Ticket #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Assigned To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-primary-600 dark:text-primary-400">
                      {ticket.ticketNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate">
                      {ticket.subject}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {ticket.category?.name ?? '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user && (user.role === 'ITSupport' || user.role === 'Admin') ? (
                        <select
                          value={ticket.priority}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            updatePriorityMutation.mutate({ id: ticket.id, priority: e.target.value as TicketPriority })
                          }
                          className="input text-xs py-1 px-2"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="Critical">Critical</option>
                        </select>
                      ) : (
                        <PriorityBadge priority={ticket.priority} />
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {ticket.assignedTo ? getUserDisplayName(ticket.assignedTo) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDateTime(ticket.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages || Math.ceil(meta.total / (meta.limit || 10))}
              onPageChange={setPage}
            />
          )}
        </div>
      )}
    </div>
  );
}

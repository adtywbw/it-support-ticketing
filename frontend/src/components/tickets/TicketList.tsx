import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTickets, useUpdateTicketPriority, useAssignTicket, useDeleteTicket } from '@/hooks/use-tickets';
import { useUsers } from '@/hooks/use-users';
import { useAuthStore } from '@/stores/auth-store';
import type { TicketPriority } from '@/types';
import StatusBadge from './StatusBadge';
import PriorityBadge from './PriorityBadge';
import Pagination from '@/components/ui/Pagination';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { formatDateTime, getUserDisplayName } from '@/lib/utils';
import TicketFilters, { type FilterValues } from './TicketFilters';

interface TicketListProps {
  filters: FilterValues;
  onFiltersChange: (filters: FilterValues) => void;
  page: number;
  onPageChange: (page: number) => void;
}

export default function TicketList({ filters, onFiltersChange, page, onPageChange }: TicketListProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const updatePriorityMutation = useUpdateTicketPriority();
  const assignMutation = useAssignTicket();
  const deleteTicketMutation = useDeleteTicket();
  const { data: users } = useUsers();

  const canAssign = user && (user.role === 'ITSupport' || user.role === 'Admin');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; ticketNumber: string } | null>(null);

  const isAdmin = user?.role === 'Admin';

  const queryFilters = {
    page,
    limit: 10,
    ...(filters.status && { status: filters.status }),
    ...(filters.priority && { priority: filters.priority }),
    ...(filters.search && { search: filters.search }),
    ...(filters.categoryId && { categoryId: filters.categoryId }),
    ...(filters.assignedToMe && user?.id && { assignedToId: user.id }),
    ...(filters.startDate && { dateFrom: filters.startDate }),
    ...(filters.endDate && { dateTo: filters.endDate }),
  };

  const { data, isLoading, isError, error, refetch } = useTickets(queryFilters);

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
        <TicketFilters filters={filters} onFiltersChange={onFiltersChange} />
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
                    Created By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Created
                  </th>
                  {isAdmin && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
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
                      {canAssign ? (
                        <select
                          value={ticket.assignedToId ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const id = e.target.value;
                            if (id !== (ticket.assignedToId ?? '')) {
                              assignMutation.mutate({ id: ticket.id, assignedToId: id });
                            }
                          }}
                          className="input text-xs py-1 px-2"
                        >
                          <option value="">Unassigned</option>
                          {users
                            ?.filter((u: { isActive: boolean; role: string }) => u.isActive && (u.role === 'ITSupport' || u.role === 'Admin'))
                            .map((u: { id: string; name: string }) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        ticket.assignedTo ? getUserDisplayName(ticket.assignedTo) : '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {ticket.requester ? getUserDisplayName(ticket.requester) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDateTime(ticket.createdAt)}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ id: ticket.id, ticketNumber: ticket.ticketNumber });
                          }}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                          title="Delete ticket"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages || Math.ceil(meta.total / (meta.limit || 10))}
              onPageChange={onPageChange}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) {
            deleteTicketMutation.mutate(deleteConfirm.id, {
              onSuccess: () => setDeleteConfirm(null),
            });
          }
        }}
        title="Delete Ticket"
        message={`Are you sure you want to delete ticket ${deleteConfirm?.ticketNumber ?? ''}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteTicketMutation.isPending}
      />
    </div>
  );
}

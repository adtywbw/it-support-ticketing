import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import apiClient from '@/lib/axios';
import { useAuthStore } from '@/stores/auth-store';
import TicketList from '@/components/tickets/TicketList';
import type { FilterValues } from '@/components/tickets/TicketFilters';
import { getErrorMessage } from '@/lib/utils';

export default function TicketsPage() {
  const user = useAuthStore((s) => s.user);
  const [exporting, setExporting] = useState(false);
  const canExport = user && (user.role === 'ITSupport' || user.role === 'Admin');
  const canCreate = !!user;

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FilterValues>({
    status: '',
    priority: '',
    search: '',
    categoryId: '',
    assignedToMe: false,
    datePreset: 'all',
    startDate: '',
    endDate: '',
    sortBy: 'createdAt',
    sortOrder: 'desc',
    limit: 10,
  });

  const handleFiltersChange = (newFilters: FilterValues) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleLimitChange = (newLimit: number) => {
    setFilters((prev) => ({ ...prev, limit: newLimit }));
    setPage(1);
  };

  const buildExportParams = () => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.priority) params.append('priority', filters.priority);
    if (filters.search) params.append('search', filters.search);
    if (filters.categoryId) params.append('categoryId', filters.categoryId);
    if (filters.assignedToMe && user?.id) params.append('assignedToId', user.id);
    if (filters.startDate) params.append('dateFrom', filters.startDate);
    if (filters.endDate) params.append('dateTo', filters.endDate);
    return params.toString();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const qs = buildExportParams();
      const response = await apiClient.get(`/tickets/export/csv${qs ? `?${qs}` : ''}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tickets-export.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to export tickets'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tickets</h1>
        <div className="flex items-center gap-2">
          {canExport && (
            <button onClick={handleExport} disabled={exporting} className="btn-secondary">
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          )}
          {canCreate && (
            <Link to="/tickets/new" className="btn-primary">
              Create Ticket
            </Link>
          )}
        </div>
      </div>
      <TicketList filters={filters} onFiltersChange={handleFiltersChange} page={page} onPageChange={setPage} onLimitChange={handleLimitChange} />
    </div>
  );
}

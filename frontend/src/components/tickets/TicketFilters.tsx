import { useState, useEffect } from 'react';
import type { TicketStatus, TicketPriority } from '@/types';
import { useCategories } from '@/hooks/use-categories';
import { useAuthStore } from '@/stores/auth-store';

interface FilterValues {
  status: TicketStatus | '';
  priority: TicketPriority | '';
  search: string;
  categoryId: string | '';
  assignedToMe: boolean;
}

interface TicketFiltersProps {
  filters: FilterValues;
  onFiltersChange: (filters: FilterValues) => void;
}

export default function TicketFilters({ filters, onFiltersChange }: TicketFiltersProps) {
  const [localSearch, setLocalSearch] = useState(filters.search);
  const { data: categories } = useCategories();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== filters.search) {
        onFiltersChange({ ...filters, search: localSearch });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch]);

  const statuses: { value: TicketStatus | ''; label: string }[] = [
    { value: '', label: 'All Statuses' },
    { value: 'Open', label: 'Open' },
    { value: 'InProgress', label: 'In Progress' },
    { value: 'Resolved', label: 'Resolved' },
    { value: 'Closed', label: 'Closed' },
  ];

  const priorities: { value: TicketPriority | ''; label: string }[] = [
    { value: '', label: 'All Priorities' },
    { value: 'Low', label: 'Low' },
    { value: 'Medium', label: 'Medium' },
    { value: 'High', label: 'High' },
    { value: 'Critical', label: 'Critical' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[200px]">
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search tickets..."
          className="input"
        />
      </div>

      <select
        value={filters.status}
        onChange={(e) => onFiltersChange({ ...filters, status: e.target.value as TicketStatus | '' })}
        className="input w-auto"
      >
        {statuses.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <select
        value={filters.priority}
        onChange={(e) => onFiltersChange({ ...filters, priority: e.target.value as TicketPriority | '' })}
        className="input w-auto"
      >
        {priorities.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      <select
        value={filters.categoryId}
        onChange={(e) =>
          onFiltersChange({ ...filters, categoryId: e.target.value })
        }
        className="input w-auto"
      >
        <option value="">All Categories</option>
        {categories?.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.name}
          </option>
        ))}
      </select>

      {user && (user.role === 'ITSupport' || user.role === 'Admin') && (
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.assignedToMe}
            onChange={(e) => onFiltersChange({ ...filters, assignedToMe: e.target.checked })}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Assigned to me
        </label>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import type { TicketStatus, TicketPriority } from '@/types';
import { useCategories } from '@/hooks/use-categories';
import { useAuthStore } from '@/stores/auth-store';

export type DatePreset = 'all' | 'today' | '7days' | '30days' | 'month' | 'custom';

export interface FilterValues {
  status: TicketStatus | '';
  priority: TicketPriority | '';
  search: string;
  categoryId: string | '';
  assignedToMe: boolean;
  datePreset: DatePreset;
  startDate: string;
  endDate: string;
}

interface TicketFiltersProps {
  filters: FilterValues;
  onFiltersChange: (filters: FilterValues) => void;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeDateRange(preset: DatePreset): { startDate: string; endDate: string } {
  const now = new Date();
  const today = formatDate(now);

  switch (preset) {
    case 'today':
      return { startDate: today, endDate: today };
    case '7days': {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { startDate: formatDate(d), endDate: today };
    }
    case '30days': {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      return { startDate: formatDate(d), endDate: today };
    }
    case 'month':
      return { startDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, endDate: today };
    default:
      return { startDate: '', endDate: '' };
  }
}

const datePresetOptions: { value: DatePreset; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: '7days', label: 'Last 7 Days' },
  { value: '30days', label: 'Last 30 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
];

export default function TicketFilters({ filters, onFiltersChange }: TicketFiltersProps) {
  const [local, setLocal] = useState(filters);
  const { data: categories } = useCategories();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    setLocal(filters);
  }, [filters]);

  const handleApply = () => {
    onFiltersChange(local);
  };

  const update = (partial: Partial<FilterValues>) => {
    setLocal((prev) => ({ ...prev, ...partial }));
  };

  const handleDatePresetChange = useCallback((preset: DatePreset) => {
    if (preset === 'custom') {
      setLocal((prev) => ({ ...prev, datePreset: preset }));
    } else {
      const range = computeDateRange(preset);
      setLocal((prev) => ({ ...prev, datePreset: preset, startDate: range.startDate, endDate: range.endDate }));
    }
  }, []);

  const hasChanges = JSON.stringify(local) !== JSON.stringify(filters);

  const statuses: { value: TicketStatus | ''; label: string }[] = [
    { value: '', label: 'All Statuses' },
    { value: 'Open', label: 'Open' },
    { value: 'InProgress', label: 'In Progress' },
    { value: 'OnHold', label: 'On Hold' },
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
          value={local.search}
          onChange={(e) => update({ search: e.target.value })}
          placeholder="Search tickets..."
          className="input"
        />
      </div>

      <select
        value={local.status}
        onChange={(e) => update({ status: e.target.value as TicketStatus | '' })}
        className="input w-auto"
      >
        {statuses.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <select
        value={local.priority}
        onChange={(e) => update({ priority: e.target.value as TicketPriority | '' })}
        className="input w-auto"
      >
        {priorities.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      <select
        value={local.categoryId}
        onChange={(e) => update({ categoryId: e.target.value })}
        className="input w-auto"
      >
        <option value="">All Categories</option>
        {categories?.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.name}
          </option>
        ))}
      </select>

      <select
        value={local.datePreset}
        onChange={(e) => handleDatePresetChange(e.target.value as DatePreset)}
        className="input w-auto"
      >
        {datePresetOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {local.datePreset === 'custom' && (
        <>
          <input
            type="date"
            value={local.startDate}
            onChange={(e) => update({ startDate: e.target.value })}
            className="input w-auto"
            title="Start date"
          />
          <input
            type="date"
            value={local.endDate}
            onChange={(e) => update({ endDate: e.target.value })}
            className="input w-auto"
            title="End date"
          />
        </>
      )}

      {user && (user.role === 'ITSupport' || user.role === 'Admin') && (
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={local.assignedToMe}
            onChange={(e) => update({ assignedToMe: e.target.checked })}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Assigned to me
        </label>
      )}

      <button onClick={handleApply} disabled={!hasChanges} className="btn-primary">
        Apply
      </button>
    </div>
  );
}

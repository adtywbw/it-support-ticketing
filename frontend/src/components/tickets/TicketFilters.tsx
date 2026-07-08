import { useState, useEffect, useCallback } from 'react';
import type { TicketStatus, TicketPriority, SLAStatus } from '@/types';
import { useCategories } from '@/hooks/use-categories';
import { useLocations } from '@/hooks/use-locations';
import { useAllUsers } from '@/hooks/use-all-users';
import { useAuthStore } from '@/stores/auth-store';
import MultiSelect from '@/components/ui/MultiSelect';

export type DatePreset = 'all' | 'today' | '7days' | '30days' | 'month' | 'custom';

export interface FilterValues {
  status: TicketStatus[];
  priority: TicketPriority[];
  slaStatus: SLAStatus[];
  search: string;
  categoryId: string[];
  locationId: string[];
  requesterId: string[];
  assignedToMe: boolean;
  datePreset: DatePreset;
  startDate: string;
  endDate: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  limit: number;
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

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v) => b.includes(v));
}

export default function TicketFilters({ filters, onFiltersChange }: TicketFiltersProps) {
  const [local, setLocal] = useState(filters);
  const { data: categories } = useCategories();
  const { data: locations } = useLocations();
  const { data: allUsers } = useAllUsers();
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

  const hasChanges = !arraysEqual(local.status, filters.status)
    || !arraysEqual(local.priority, filters.priority)
    || !arraysEqual(local.slaStatus, filters.slaStatus)
    || !arraysEqual(local.categoryId, filters.categoryId)
    || !arraysEqual(local.locationId, filters.locationId)
    || !arraysEqual(local.requesterId, filters.requesterId)
    || local.search !== filters.search
    || local.assignedToMe !== filters.assignedToMe
    || local.datePreset !== filters.datePreset
    || local.startDate !== filters.startDate
    || local.endDate !== filters.endDate
    || local.sortBy !== filters.sortBy
    || local.sortOrder !== filters.sortOrder
    || local.limit !== filters.limit;

  const statusOptions = [
    { value: 'Open', label: 'Open' },
    { value: 'InProgress', label: 'In Progress' },
    { value: 'OnHold', label: 'On Hold' },
    { value: 'Resolved', label: 'Resolved' },
    { value: 'Closed', label: 'Closed' },
  ];

  const priorityOptions = [
    { value: 'Low', label: 'Low' },
    { value: 'Medium', label: 'Medium' },
    { value: 'High', label: 'High' },
    { value: 'Critical', label: 'Critical' },
  ];

  const slaStatusOptions = [
    { value: 'OnTrack', label: 'On Track' },
    { value: 'AtRisk', label: 'At Risk' },
    { value: 'Breached', label: 'Breached' },
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

      <MultiSelect
        label="Status"
        options={statusOptions}
        selected={local.status}
        onChange={(v) => update({ status: v as TicketStatus[] })}
      />

      <MultiSelect
        label="Priority"
        options={priorityOptions}
        selected={local.priority}
        onChange={(v) => update({ priority: v as TicketPriority[] })}
      />

      <MultiSelect
        label="SLA Status"
        options={slaStatusOptions}
        selected={local.slaStatus}
        onChange={(v) => update({ slaStatus: v as SLAStatus[] })}
      />

      <MultiSelect
        label="Category"
        options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
        selected={local.categoryId}
        onChange={(v) => update({ categoryId: v })}
      />

      <MultiSelect
        label="Location"
        options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))}
        selected={local.locationId}
        onChange={(v) => update({ locationId: v })}
      />

      {user && (user.role === 'ITSupport' || user.role === 'Admin') && (
        <MultiSelect
          label="Created By"
          options={(allUsers ?? []).map((u) => ({ value: u.id, label: u.name }))}
          selected={local.requesterId}
          onChange={(v) => update({ requesterId: v })}
        />
      )}

      <select
        value={local.datePreset}
        onChange={(e) => handleDatePresetChange(e.target.value as DatePreset)}
        className="input w-auto"
        aria-label="Date range filter"
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
            max={local.endDate || undefined}
            className="input w-auto"
            aria-label="Start date"
          />
          <input
            type="date"
            value={local.endDate}
            onChange={(e) => update({ endDate: e.target.value })}
            min={local.startDate || undefined}
            className="input w-auto"
            aria-label="End date"
          />
        </>
      )}

      {user && (user.role === 'ITSupport' || user.role === 'Admin') && (
        <label className="flex items-center gap-2 text-sm text-navy-700 dark:text-blue-200 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={local.assignedToMe}
            onChange={(e) => update({ assignedToMe: e.target.checked })}
            className="rounded border-blue-200 text-primary-600 focus:ring-primary-500"
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

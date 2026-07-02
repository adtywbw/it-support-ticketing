import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { DashboardRangePreset, DashboardStatsQuery } from '@/types';

type DashboardRangeFilterProps = {
  value: DashboardStatsQuery;
  onChange: (next: DashboardStatsQuery) => void;
  disabled?: boolean;
};

const presets: Array<{ value: Exclude<DashboardRangePreset, 'custom'>; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

export default function DashboardRangeFilter({ value, onChange, disabled = false }: DashboardRangeFilterProps) {
  const [customFrom, setCustomFrom] = useState(value.from ?? '');
  const [customTo, setCustomTo] = useState(value.to ?? '');

  useEffect(() => {
    if (value.range === 'custom') {
      setCustomFrom(value.from ?? '');
      setCustomTo(value.to ?? '');
    }
  }, [value]);

  const applyCustomRange = () => {
    if (!customFrom || !customTo) {
      toast.error('Select both start and end dates.');
      return;
    }
    if (customFrom > customTo) {
      toast.error('Start date must be before or equal to end date.');
      return;
    }
    onChange({ range: 'custom', from: customFrom, to: customTo });
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      <div className="inline-flex rounded-md shadow-sm" aria-label="Dashboard range presets">
        {presets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ range: preset.value })}
            className={`border px-3 py-2 text-sm font-medium first:rounded-l-md last:rounded-r-md disabled:opacity-50 ${
              value.range === preset.value
                ? 'border-primary-600 bg-primary-600 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={customFrom}
          disabled={disabled}
          onChange={(event) => setCustomFrom(event.target.value)}
          className="input w-auto"
          aria-label="Dashboard custom start date"
        />
        <span className="text-sm text-gray-500 dark:text-gray-400">to</span>
        <input
          type="date"
          value={customTo}
          disabled={disabled}
          onChange={(event) => setCustomTo(event.target.value)}
          className="input w-auto"
          aria-label="Dashboard custom end date"
        />
        <button type="button" disabled={disabled} onClick={applyCustomRange} className="btn-secondary">
          Custom
        </button>
      </div>
    </div>
  );
}

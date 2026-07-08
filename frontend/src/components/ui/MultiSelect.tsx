import { useState, useRef, useEffect } from 'react';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const allSelected = options.every((o) => selected.includes(o.value));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input w-auto flex items-center gap-2 whitespace-nowrap"
        aria-label={`${label} filter`}
      >
        <span>{label}</span>
        {selected.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium rounded-full bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-200">
            {selected.length}
          </span>
        )}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 12 12">
          <path d="M3 5l3 3 3-3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-navy-900 border border-blue-200 dark:border-navy-700 rounded-lg shadow-lg min-w-[200px] max-h-64 overflow-y-auto">
          <label className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-navy-500 dark:text-blue-300 border-b border-blue-100 dark:border-navy-700 cursor-pointer hover:bg-blue-50 dark:hover:bg-navy-800">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onChange(allSelected ? [] : options.map((o) => o.value))}
              className="rounded border-blue-200 text-primary-600 focus:ring-primary-500"
            />
            Select All
          </label>
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-3 py-2 text-sm text-navy-700 dark:text-blue-200 cursor-pointer hover:bg-blue-50 dark:hover:bg-navy-800"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="rounded border-blue-200 text-primary-600 focus:ring-primary-500"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

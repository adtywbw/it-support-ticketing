import { useState, useRef, useEffect, useMemo } from 'react';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  title,
  className = '',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setSearch('');
      // Focus the input after render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const selectedOption = options.find((o) => o.value === value);
  const filtered = useMemo(
    () =>
      search
        ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
        : options,
    [options, search],
  );

  const displayText = value ? selectedOption?.label ?? value : placeholder;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        title={title}
        className="input w-full flex items-center justify-between gap-2 text-sm"
      >
        <span className="truncate">{displayText}</span>
        <svg
          className={`w-3 h-3 shrink-0 transition-transform text-navy-400 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 12 12"
        >
          <path d="M3 5l3 3 3-3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-navy-900 border border-blue-200 dark:border-navy-700 rounded-lg shadow-lg min-w-[200px] max-w-[320px]">
          <div className="p-2 border-b border-blue-100 dark:border-navy-700">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="input text-xs py-1.5 px-2 w-full"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
                setSearch('');
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-navy-800 ${
                !value ? 'bg-blue-50 dark:bg-navy-800 font-medium' : 'text-navy-500 dark:text-blue-300'
              }`}
            >
              Unassigned
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-navy-400 dark:text-blue-400">
                No users found
              </div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-navy-800 ${
                    opt.value === value ? 'bg-blue-50 dark:bg-navy-800 font-medium text-primary-600 dark:text-primary-400' : 'text-navy-700 dark:text-blue-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

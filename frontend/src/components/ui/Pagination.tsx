import { useId } from 'react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  limit: number;
  onLimitChange: (limit: number) => void;
  totalItems?: number;
}

const LIMIT_OPTIONS = [
  { label: '10', value: 10 },
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
];

export default function Pagination({ page, totalPages, onPageChange, limit, onLimitChange, totalItems }: PaginationProps) {
  const limitSelectId = `${useId()}-limit-select`;
  const getPages = () => {
    const pages: (number | '...')[] = [];
    if (totalPages <= 0) return pages; // Edge case: no pages

    const delta = 2;
    const left = Math.max(2, page - delta);
    const right = Math.min(totalPages - 1, page + delta);

    pages.push(1);
    if (left > 2) pages.push('...');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push('...');
    if (totalPages > 1) pages.push(totalPages);

    return pages;
  };

  return (
    <nav className="flex items-center justify-between border-t border-blue-100 dark:border-navy-800 px-4 py-3 sm:px-6">
      <div className="flex flex-1 items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor={limitSelectId} className="text-sm text-navy-700 dark:text-blue-200 whitespace-nowrap">
            Items per page:
          </label>
          <select
            id={limitSelectId}
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="input text-xs py-1 px-2 w-auto"
          >
            {LIMIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {totalItems !== undefined && (
            <span className="text-sm text-navy-500 dark:text-blue-300">
              ({totalItems} {totalItems === 1 ? 'item' : 'items'})
            </span>
          )}
        </div>

        {limit > 0 && totalPages > 1 && (
          <>
            <span className="hidden sm:block text-sm text-navy-700 dark:text-blue-200">
              Page <span className="font-medium">{page}</span> of{' '}
              <span className="font-medium">{totalPages}</span>
            </span>

            <div className="flex items-center gap-1 sm:hidden">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="btn-secondary btn-sm"
              >
                Prev
              </button>
              <span className="text-sm text-navy-700 dark:text-blue-200 px-2">
                {page}/{totalPages}
              </span>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="btn-secondary btn-sm"
              >
                Next
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-1">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="btn-secondary btn-sm"
              >
                Previous
              </button>
              {getPages().map((p, idx) =>
                p === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-navy-400 dark:text-blue-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => onPageChange(p as number)}
                    className={cn(
                      'btn-sm min-w-[36px]',
                      p === page
                        ? 'bg-primary-600 text-white hover:bg-primary-700'
                        : 'btn-secondary',
                    )}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="btn-secondary btn-sm"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </nav>
  );
}

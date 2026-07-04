import { cn } from '@/lib/utils';

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-slate-50 dark:bg-slate-800">{children}</thead>;
}

export function TH({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      className={cn(
        'px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400',
        align === 'left' && 'text-left',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return (
    <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
      {children}
    </tbody>
  );
}

export function TR({ children }: { children: React.ReactNode }) {
  return (
    <tr className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50">
      {children}
    </tr>
  );
}

export function TD({
  children,
  align = 'left',
  className,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return (
    <td
      className={cn(
        'px-6 py-4 text-sm text-slate-900 dark:text-slate-100',
        align === 'left' && 'text-left',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

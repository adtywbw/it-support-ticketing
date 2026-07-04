import { cn } from '@/lib/utils';

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <table className="min-w-full divide-y divide-blue-100 dark:divide-navy-800">
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-blue-50 dark:bg-navy-900">{children}</thead>;
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
        'px-6 py-3 text-xs font-medium uppercase tracking-wider text-navy-500 dark:text-blue-300',
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
    <tbody className="divide-y divide-blue-100 bg-white dark:divide-navy-800 dark:bg-navy-900">
      {children}
    </tbody>
  );
}

export function TR({ children }: { children: React.ReactNode }) {
  return (
    <tr className="transition-colors hover:bg-blue-50 dark:hover:bg-navy-800/60">
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
        'px-6 py-4 text-sm text-navy-950 dark:text-blue-50',
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

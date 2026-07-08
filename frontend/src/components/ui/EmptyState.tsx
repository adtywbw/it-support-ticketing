import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export default function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 text-primary-400 dark:text-primary-300">
          {icon}
        </div>
      )}
      <h2 className="text-lg font-medium text-navy-950 dark:text-blue-50">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm text-navy-500 dark:text-blue-300 max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

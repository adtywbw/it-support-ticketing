import { cn } from '@/lib/utils';

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** `auto` = black in light, white in dark. `light` = always white (for dark backgrounds like sidebar). */
  variant?: 'auto' | 'light';
}

const sizeClasses: Record<NonNullable<BrandMarkProps['size']>, string> = {
  sm: 'h-8 w-8 rounded-lg',
  md: 'h-10 w-10 rounded-xl',
  lg: 'h-12 w-12 rounded-2xl',
};

function EyeIcon({ className, variant }: { className?: string; variant: 'auto' | 'light' }) {
  const strokeClass = variant === 'light'
    ? 'stroke-white'
    : 'stroke-black dark:stroke-white';

  const fillClass = variant === 'light'
    ? 'text-white'
    : 'text-black dark:text-white';

  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-5/6 w-5/6', strokeClass, className)}
      fill="none"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12c0 0 4-8 10-8s10 8 10 8-4 8-10 8-10-8-10-8z" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" className={fillClass} />
    </svg>
  );
}

export default function BrandMark({ size = 'md', className, variant = 'auto' }: BrandMarkProps) {
  return (
    <span
      role="img"
      aria-label="IT HelpDesk"
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        sizeClasses[size],
        className,
      )}
    >
      <EyeIcon variant={variant} />
    </span>
  );
}

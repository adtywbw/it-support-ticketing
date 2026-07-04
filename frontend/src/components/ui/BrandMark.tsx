import { cn } from '@/lib/utils';

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses: Record<NonNullable<BrandMarkProps['size']>, string> = {
  sm: 'h-8 w-8 rounded-lg text-xs',
  md: 'h-10 w-10 rounded-xl text-sm',
  lg: 'h-12 w-12 rounded-2xl text-base',
};

export default function BrandMark({ size = 'md', className }: BrandMarkProps) {
  return (
    <span
      aria-label="Support Hub"
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-primary-600 to-sky-500 font-black tracking-tight text-white shadow-soft ring-1 ring-white/20',
        sizeClasses[size],
        className,
      )}
    >
      SH
    </span>
  );
}

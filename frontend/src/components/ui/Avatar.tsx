import { cn } from '@/lib/utils';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
};

export default function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const initial = name.charAt(0).toUpperCase() || '?';

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-medium',
        'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
        sizeClasses[size],
        className,
      )}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full rounded-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

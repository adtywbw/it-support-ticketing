import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const trackSize: Record<NonNullable<SwitchProps['size']>, string> = {
  sm: 'h-4 w-7',
  md: 'h-5 w-9',
};

const knobSize: Record<NonNullable<SwitchProps['size']>, string> = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
};

const knobTranslate: Record<NonNullable<SwitchProps['size']>, (checked: boolean) => string> = {
  sm: checked => (checked ? 'translate-x-3' : 'translate-x-1'),
  md: checked => (checked ? 'translate-x-4' : 'translate-x-1'),
};

export default function Switch({ checked, onChange, disabled, label, size = 'md', className }: SwitchProps) {
  const handleToggle = () => {
    if (!disabled) onChange(!checked);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-navy-950',
        trackSize[size],
        checked ? 'bg-primary-600' : 'bg-blue-200 dark:bg-navy-700',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block transform rounded-full bg-white shadow transition-transform',
          knobSize[size],
          knobTranslate[size](checked),
        )}
      />
    </button>
  );
}

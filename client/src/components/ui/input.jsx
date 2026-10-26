import { cn } from '@/lib/utils.js';

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  );
}

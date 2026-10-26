import { cn } from '@/lib/utils.js';

export function Skeleton({ className, ...props }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-control bg-surface-raised', className)} {...props} />;
}

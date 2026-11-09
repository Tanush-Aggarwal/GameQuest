import { Star } from 'lucide-react';
import { cn } from '@/lib/utils.js';

// One rating style for the whole app, in the brand's acid lime instead of a stock orange star.
// - "overlay": on cover art and heroes. A dark glass pill, lime star, white score.
// - "chip": on light surfaces (search results, lists). A lime pill with dark text, readable on cream.
// `value` is the score out of 10 as a string or number ("8.8"); nothing renders without one.
export function RatingBadge({ value, variant = 'overlay', size = 'sm', className = '' }) {
  if (value == null || value === '') return null;
  const big = size === 'md';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full font-bold tabular-nums leading-none',
        big ? 'px-2.5 py-1 text-sm' : 'px-1.5 py-0.5 text-[11px]',
        variant === 'overlay'
          ? 'bg-black/55 text-white ring-1 ring-white/15 backdrop-blur-sm'
          : 'bg-[var(--accent)] text-[var(--accent-fg)]',
        className,
      )}
      aria-label={`Rated ${value} out of 10`}
    >
      <Star
        aria-hidden="true"
        className={big ? 'h-3.5 w-3.5' : 'h-3 w-3'}
        style={variant === 'overlay' ? { color: 'var(--accent)', fill: 'var(--accent)' } : { color: 'currentColor', fill: 'currentColor' }}
      />
      <span aria-hidden="true">{value}</span>
    </span>
  );
}

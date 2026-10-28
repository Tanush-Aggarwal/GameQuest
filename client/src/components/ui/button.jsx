import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';

const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        // Dark by default: lime is kept for the few hero calls to action that sit on game art.
        primary: 'bg-text text-bg shadow-sm hover:bg-[#2b2e28]',
        secondary: 'border border-border bg-surface-raised text-text hover:bg-border',
        ghost: 'text-text-muted hover:bg-surface-raised hover:text-text',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);

export function Button({ className, variant, type = 'button', ...props }) {
  return <button type={type} className={cn(buttonVariants({ variant }), className)} {...props} />;
}

export { buttonVariants };

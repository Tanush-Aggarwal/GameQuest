import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';

const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:brightness-110',
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

import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, buttonVariants } from './button.jsx';
import { cn } from '@/lib/utils.js';

// Empty state: the reason it is empty plus exactly one action.
export function EmptyState({ icon: Icon, title, description, actionLabel, actionTo }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center">
      {Icon && <Icon className="h-8 w-8 text-text-muted" aria-hidden="true" />}
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-text-muted">{description}</p>
      {actionLabel && actionTo && (
        <Link to={actionTo} className={cn(buttonVariants(), 'mt-2')}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

// Error state scoped to one section, with Retry.
export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-6 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-danger" aria-hidden="true" />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

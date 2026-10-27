import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, buttonVariants } from './button.jsx';
import { SuggestedGames } from './SuggestedGames.jsx';
import { cn } from '@/lib/utils.js';

// Empty state: the reason it is empty plus exactly one action, kept compact (a short strip, not a blank
// panel). With `suggestions` it also offers a few popular games from the catalog to click.
// headingLevel follows the page: h2 by default, h3 inside a section that already has an h2, h1 on a not-found page.
export function EmptyState({ icon: Icon, title, description, actionLabel, actionTo, suggestions = false, headingLevel: Heading = 'h2' }) {
  return (
    <div className="flex flex-col gap-4 rounded-card border border-dashed border-border bg-bg/60 px-4 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {Icon && <Icon className="h-6 w-6 shrink-0 text-text-muted" aria-hidden="true" />}
        <div className="min-w-0 flex-1 basis-56">
          <Heading className="text-base font-semibold">{title}</Heading>
          <p className="mt-0.5 max-w-prose text-sm text-text-muted">{description}</p>
        </div>
        {actionLabel && actionTo && (
          <Link to={actionTo} className={cn(buttonVariants(), 'shrink-0')}>
            {actionLabel}
          </Link>
        )}
      </div>
      {suggestions && <SuggestedGames count={typeof suggestions === 'number' ? suggestions : 6} />}
    </div>
  );
}

// Error state scoped to one section, with Retry.
export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-border bg-bg/60 px-4 py-4">
      <AlertTriangle className="h-6 w-6 shrink-0 text-danger" aria-hidden="true" />
      <p className="min-w-0 flex-1 basis-56 text-sm">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="shrink-0">
          Retry
        </Button>
      )}
    </div>
  );
}

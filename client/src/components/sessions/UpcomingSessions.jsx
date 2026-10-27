import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ArtPanel } from '@/components/art/ArtPanel.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { listSessions } from '@/services/sessionsApi.js';
import { SessionRow } from './SessionRow.jsx';

// The next few sessions on Home — its own section, so a failure here never blanks the page.
export function UpcomingSessions() {
  const load = useCallback((signal) => listSessions({ limit: 3 }, { signal }), []);
  const { status, data, error, retry } = useAsync(load);
  return (
    <ArtPanel aria-labelledby="upcoming-title" seed="home-sessions" className="gq-editorial-panel flex flex-col gap-3 p-4 rounded-card border border-border bg-surface shadow-2xs">
      <div className="flex items-center justify-between gap-3">
        <h2 id="upcoming-title" className="text-base font-bold font-heading text-text">Upcoming sessions</h2>
        <Link to="/sessions" className="text-xs font-semibold text-text hover:underline">All sessions</Link>
      </div>
      {status === 'loading' && <Skeleton className="h-20 w-full" role="status" aria-label="Loading sessions" />}
      {status === 'error' && <ErrorState message={error.message} onRetry={retry} />}
      {status === 'success' && data.items.length === 0 && (
        <EmptyState icon={CalendarDays} title="No sessions planned" description="Schedule a game night and invite your friends." actionLabel="Schedule a session" actionTo="/sessions/new" headingLevel="h3" />
      )}
      {status === 'success' && data.items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.items.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </ul>
      )}
    </ArtPanel>
  );
}

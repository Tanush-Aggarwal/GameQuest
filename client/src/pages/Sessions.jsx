import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { ArtHeader } from '@/components/art/ArtPanel.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { SessionRow } from '@/components/sessions/SessionRow.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useLayered } from '@/hooks/useLayered.js';
import { getErrorInfo } from '@/services/api.js';
import { listSessions } from '@/services/sessionsApi.js';
import { groupByLocalDay, viewerTimeZone } from '@/lib/sessionTime.js';

const PAGE_SIZE = 20;

export default function Sessions() {
  const load = useCallback((signal) => listSessions({ limit: PAGE_SIZE }, { signal }), []);
  const { status, data, error, retry } = useAsync(load);
  const [view, update] = useLayered(data);
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await listSessions({ limit: PAGE_SIZE, cursor: view.nextCursor });
      update((current) => ({ items: [...current.items, ...page.items], nextCursor: page.nextCursor }));
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <ArtHeader
        title="Sessions"
        subtitle={`Times shown in your timezone (${viewerTimeZone()}).`}
        seed="sessions"
        actions={
          <Link to="/sessions/new" className={buttonVariants()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Schedule a session
          </Link>
        }
      />

      {status === 'loading' && (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading sessions">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {status === 'error' && <ErrorState message={error.message} onRetry={retry} />}

      {status === 'success' && view.items.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="No upcoming sessions"
          description="Plan a game night with your friends — pick a game, a time, and who to invite."
          actionLabel="Schedule a session"
          actionTo="/sessions/new"
        />
      )}

      {status === 'success' && view.items.length > 0 && (
        <>
          {groupByLocalDay(view.items).map((group) => (
            <section key={group.key} aria-labelledby={`day-${group.key}`} className="flex flex-col gap-2">
              <h2 id={`day-${group.key}`} className="text-sm font-semibold text-text-muted">{group.heading}</h2>
              <ul className="flex flex-col gap-2">
                {group.sessions.map((s) => (
                  <SessionRow key={s.id} session={s} />
                ))}
              </ul>
            </section>
          ))}
          {view.nextCursor && (
            <Button variant="secondary" className="self-center" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

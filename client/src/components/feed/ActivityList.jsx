import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock, Gamepad2, Layers, Play, Plus, RefreshCw, Star, Trophy, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useLayered } from '@/hooks/useLayered.js';
import { getErrorInfo } from '@/services/api.js';
import { timeAgo } from '@/lib/time.js';

const PAGE_SIZE = 15;

// Each kind of activity gets its own icon and colour, tinted chip behind it, so the feed scans at a glance.
const TONE = {
  added: 'bg-[color-mix(in_srgb,var(--status-backlog)_14%,transparent)] text-[var(--status-backlog)]',
  playing: 'bg-[color-mix(in_srgb,var(--status-playing)_14%,transparent)] text-[var(--status-playing)]',
  completed: 'bg-[color-mix(in_srgb,var(--status-completed)_14%,transparent)] text-[var(--status-completed)]',
  dropped: 'bg-[color-mix(in_srgb,var(--status-dropped)_12%,transparent)] text-[var(--status-dropped)]',
  review: 'bg-[color-mix(in_srgb,var(--reward)_14%,transparent)] text-[var(--reward)]',
  collection: 'bg-[color-mix(in_srgb,var(--secondary-accent)_12%,transparent)] text-[var(--secondary-accent)]',
  session: 'bg-[var(--accent)] text-[var(--accent-fg)]',
};

// One sentence per activity type; the game and collection names are links.
export function describe(item) {
  const game = item.game ? (
    <Link to={`/games/${item.game.slug}`} className="font-medium text-text hover:underline">{item.game.title}</Link>
  ) : (
    'a game'
  );
  switch (item.type) {
    case 'library.statusChanged': {
      const { from, to } = item.data;
      if (to === 'completed') return { icon: Trophy, tone: TONE.completed, body: <>completed {game}</> };
      if (to === 'dropped') return { icon: XCircle, tone: TONE.dropped, body: <>dropped {game}</> };
      if (!from) return { icon: Plus, tone: TONE.added, body: <>added {game} to their {to}</> };
      if (to === 'playing') return { icon: Play, tone: TONE.playing, body: <>started playing {game}</> };
      return { icon: Gamepad2, tone: TONE.added, body: <>moved {game} to {to}</> };
    }
    case 'review.created':
      return {
        icon: Star,
        tone: TONE.review,
        body: (
          <>
            reviewed {game} <span className="tabular-nums">{'★'.repeat(item.data.rating)}<span className="sr-only"> {item.data.rating} out of 5</span></span>
          </>
        ),
      };
    case 'library.sessionLogged':
      return { icon: Clock, tone: TONE.playing, body: <>played {game} for <span className="tabular-nums">{item.data.minutes}</span> min</> };
    case 'collection.created':
      return {
        icon: Layers,
        tone: TONE.collection,
        body: (
          <>
            created the collection{' '}
            <Link to={`/collections/${item.data.collectionId}`} className="font-medium text-text hover:underline">“{item.data.name}”</Link>
          </>
        ),
      };
    case 'session.created':
      return {
        icon: CalendarDays,
        tone: TONE.session,
        body: (
          <>
            scheduled{' '}
            <Link to={`/sessions/${item.data.sessionId}`} className="font-medium text-text hover:underline">{item.data.title || 'a play session'}</Link>
            {item.game && <> for {game}</>}
          </>
        ),
      };
    case 'sync.completed':
      return {
        icon: RefreshCw,
        tone: TONE.added,
        body: <>synced <span className="tabular-nums">{item.data.count}</span> {item.data.count === 1 ? 'game' : 'games'} from {item.data.platform}</>,
      };
    default:
      return { icon: Gamepad2, tone: TONE.added, body: <>did something</> };
  }
}

function ActivityRow({ item, showActor }) {
  const { icon: Icon, tone, body } = describe(item);
  return (
    <li className="flex items-start gap-3 rounded-control px-2 py-3 transition-colors hover:bg-bg">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 text-sm leading-6 text-text-muted">
        {showActor && (
          <Link to={`/u/${item.actor.username}`} className="font-semibold text-text hover:underline">{item.actor.username}</Link>
        )}{' '}
        {body}
      </div>
      <time dateTime={new Date(item.createdAt).toISOString()} className="shrink-0 pt-0.5 text-xs tabular-nums text-text-muted">
        {timeAgo(item.createdAt)}
      </time>
    </li>
  );
}

// Loads a cursor-paginated activity list. `loadPage(params, { signal })` resolves to { items, nextCursor, ... }.
// `renderEmpty(firstPage)` supplies the empty state, so each place can say why and offer its own action.
export function ActivityList({ loadPage, renderEmpty, showActor = true }) {
  const load = useCallback((signal) => loadPage({ limit: PAGE_SIZE }, { signal }), [loadPage]);
  const { status, data, error, retry } = useAsync(load);
  const [view, update] = useLayered(data);
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await loadPage({ limit: PAGE_SIZE, cursor: view.nextCursor }, {});
      update((current) => ({ ...current, items: [...current.items, ...page.items], nextCursor: page.nextCursor }));
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setLoadingMore(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label="Loading activity">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;
  if (view.items.length === 0) return renderEmpty(view);

  return (
    <>
      <ul className="flex flex-col divide-y divide-border/60">
        {view.items.map((item) => (
          <ActivityRow key={item.id} item={item} showActor={showActor} />
        ))}
      </ul>
      {view.nextCursor && (
        <Button variant="secondary" className="self-center" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </>
  );
}

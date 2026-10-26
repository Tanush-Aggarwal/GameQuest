import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layers, Library as LibraryIcon } from 'lucide-react';
import { toast } from 'sonner';
import { LIBRARY_STATUSES } from '@gamequest/shared';
import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { GameCardSkeleton, GameCover } from '@/components/games/GameCard.jsx';
import { StatusBadge } from '@/components/library/StatusBadge.jsx';
import { MoveStatusSelect } from '@/components/library/MoveStatusSelect.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import { changeStatus, listLibrary, removeFromLibrary } from '@/services/libraryApi.js';
import { STATUS_META } from '@/lib/libraryStatus.js';

const PAGE_SIZE = 24;
const TABS = ['all', ...LIBRARY_STATUSES];
const tabLabel = (t) => (t === 'all' ? 'All' : STATUS_META[t].label);

function LibraryCard({ entry, onMove, onRemove, busy }) {
  const [confirming, setConfirming] = useState(false);
  const { game } = entry;
  return (
    <li className="flex flex-col overflow-hidden rounded-card border border-border bg-surface">
      <Link to={game ? `/games/${game.slug}` : '/library'} aria-label={game?.title ?? 'Unknown game'}>
        {game ? <GameCover game={game} /> : <div className="aspect-[3/4] bg-surface-raised" />}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold">{game?.title ?? 'Unknown game'}</h3>
        <StatusBadge status={entry.status} />
        {entry.ownerships.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Platforms">
            {entry.ownerships.map((o) => (
              <li key={o.platform} className="rounded-control border border-border px-2 py-0.5 text-xs text-text-muted">
                {o.platform}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-col gap-2 pt-2">
          <MoveStatusSelect entry={entry} onMove={onMove} disabled={busy} />
          {confirming ? (
            <div className="flex gap-2" role="group" aria-label="Confirm removal">
              <Button variant="secondary" className="flex-1" onClick={() => onRemove(entry)} disabled={busy}>
                Remove
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)} aria-label={`Remove ${game?.title ?? 'game'} from library`}>
              Remove
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function Library() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('status')) ? params.get('status') : 'all';

  const load = useCallback((signal) => listLibrary({ status: tab === 'all' ? undefined : tab, limit: PAGE_SIZE }, { signal }), [tab]);
  const { status, data, error, retry } = useAsync(load);

  // Local edits (optimistic moves, extra pages) layer on top of the loaded data and are
  // discarded automatically whenever `data` is reloaded (tab change or retry).
  const [local, setLocal] = useState({ source: null });
  const view = local.source === data && data ? local : data ? { ...data, source: data } : null;
  const edit = (patch) => setLocal({ ...view, ...patch, source: data });

  const [pending, setPending] = useState(() => new Set());
  const setBusy = (id, on) =>
    setPending((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function move(entry, to) {
    const snapshot = view;
    const counts = { ...view.counts, [entry.status]: view.counts[entry.status] - 1, [to]: view.counts[to] + 1 };
    // On a status tab the entry leaves the list; on "All" it stays with its new status.
    const items =
      tab === 'all'
        ? view.items.map((e) => (e.id === entry.id ? { ...e, status: to } : e))
        : view.items.filter((e) => e.id !== entry.id);
    edit({ items, counts });
    setBusy(entry.id, true);
    try {
      await changeStatus(entry.id, to);
      toast.success(`${entry.game?.title ?? 'Game'} moved to ${STATUS_META[to].label}`);
    } catch (err) {
      setLocal({ ...snapshot, source: data });
      toast.error(getErrorInfo(err).message);
    } finally {
      setBusy(entry.id, false);
    }
  }

  async function remove(entry) {
    const snapshot = view;
    edit({
      items: view.items.filter((e) => e.id !== entry.id),
      counts: { ...view.counts, [entry.status]: view.counts[entry.status] - 1, all: view.counts.all - 1 },
    });
    setBusy(entry.id, true);
    try {
      await removeFromLibrary(entry.id);
      toast.success(`${entry.game?.title ?? 'Game'} removed from your library`);
    } catch (err) {
      setLocal({ ...snapshot, source: data });
      toast.error(getErrorInfo(err).message);
    } finally {
      setBusy(entry.id, false);
    }
  }

  const [loadingMore, setLoadingMore] = useState(false);
  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await listLibrary({ status: tab === 'all' ? undefined : tab, limit: PAGE_SIZE, cursor: view.nextCursor });
      edit({ items: [...view.items, ...page.items], nextCursor: page.nextCursor });
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Library</h1>
        <Link to="/collections" className={buttonVariants({ variant: 'secondary' })}>
          <Layers className="h-4 w-4" aria-hidden="true" /> Collections
        </Link>
      </div>

      <nav aria-label="Library status" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const active = t === tab;
          const count = view?.counts?.[t];
          return (
            <button
              key={t}
              type="button"
              aria-pressed={active}
              onClick={() => setParams(t === 'all' ? {} : { status: t })}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control border px-3 text-sm ${
                active ? 'border-accent bg-surface-raised text-text' : 'border-border text-text-muted hover:text-text'
              }`}
            >
              {tabLabel(t)}{' '}
              {count !== undefined &&<span className="tabular-nums text-text-muted">{count}</span>}
            </button>
          );
        })}
      </nav>

      {status === 'loading' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" role="status" aria-label="Loading your library">
          {Array.from({ length: 10 }, (_, i) => (
            <GameCardSkeleton key={i} />
          ))}
        </div>
      )}

      {status === 'error' && <ErrorState message={error.message} onRetry={retry} />}

      {status === 'success' && view.items.length === 0 && (
        <EmptyState
          icon={LibraryIcon}
          title={tab === 'all' ? 'Your library is empty' : `No ${tabLabel(tab).toLowerCase()} games`}
          description={
            tab === 'all'
              ? 'Add games from the catalog and every platform you play on will live together here.'
              : 'Games you move to this status will show up here.'
          }
          actionLabel="Find games"
          actionTo="/explore"
        />
      )}

      {status === 'success' && view.items.length > 0 && (
        <>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {view.items.map((entry) => (
              <LibraryCard key={entry.id} entry={entry} onMove={move} onRemove={remove} busy={pending.has(entry.id)} />
            ))}
          </ul>
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

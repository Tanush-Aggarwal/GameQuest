import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Clock,
  Gamepad2,
  Layers,
  LayoutGrid,
  Library as LibraryIcon,
  List,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { LIBRARY_STATUSES } from '@gamequest/shared';
import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { CoverImage, GameCardSkeleton, GameCover } from '@/components/games/GameCard.jsx';
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
        {game ? <GameCover game={game} compact /> : <div className="aspect-[3/4] bg-surface-raised" />}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold">{game?.title ?? 'Unknown game'}</h3>
        <StatusBadge status={entry.status} />
        {entry.ownerships?.length > 0 && (
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

function LibraryRow({ entry, onMove, onRemove, busy }) {
  const [confirming, setConfirming] = useState(false);
  const { game } = entry;
  const totalMins = (entry.ownerships ?? []).reduce((s, o) => s + (o.playtimeMin ?? 0), 0) + (entry.loggedMinutes ?? 0);
  const playtimeHours = Math.round(totalMins / 60);

  return (
    <li className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3.5 rounded-card border border-border bg-surface hover:bg-surface-raised/40 transition-colors">
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <Link to={game ? `/games/${game.slug}` : '/library'} className="w-12 h-16 rounded overflow-hidden shrink-0 border border-border bg-surface-raised shadow-sm">
          <CoverImage cover={game?.cover} title={game?.title} compact className="w-full h-full" />
        </Link>
        <div className="flex flex-col gap-1 min-w-0">
          <Link to={game ? `/games/${game.slug}` : '/library'} className="font-semibold text-sm hover:text-accent truncate">
            {game?.title ?? 'Unknown game'}
          </Link>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <StatusBadge status={entry.status} />
            {entry.ownerships?.length > 0 && (
              <ul className="flex flex-wrap gap-1" aria-label="Platforms">
                {entry.ownerships.map((o) => (
                  <li key={o.platform} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-text-muted">
                    {o.platform}
                  </li>
                ))}
              </ul>
            )}
            {playtimeHours > 0 && (
              <span className="text-text-muted flex items-center gap-1 font-medium">
                <Clock className="h-3 w-3" /> {playtimeHours}h played
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress & Controls */}
      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end shrink-0">
        {entry.manualProgress > 0 && (
          <div className="flex items-center gap-2 mr-2">
            <div className="w-20 bg-surface-raised h-2 rounded-full overflow-hidden border border-border/50">
              <div className="bg-accent h-full rounded-full" style={{ width: `${entry.manualProgress}%` }} />
            </div>
            <span className="text-xs tabular-nums text-text-muted font-medium">{entry.manualProgress}%</span>
          </div>
        )}
        <div className="w-36">
          <MoveStatusSelect entry={entry} onMove={onMove} disabled={busy} />
        </div>
        {confirming ? (
          <div className="flex gap-1" role="group" aria-label="Confirm removal">
            <Button variant="secondary" size="sm" onClick={() => onRemove(entry)} disabled={busy}>
              Confirm
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label={`Remove ${game?.title ?? 'game'} from library`}>
            <Trash2 className="h-4 w-4 text-text-muted hover:text-red-400" />
          </Button>
        )}
      </div>
    </li>
  );
}

export default function Library() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('status')) ? params.get('status') : 'all';

  // Filters and views
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [sortBy, setSortBy] = useState('default');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'shelf'

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

  // Platforms present across items
  const availablePlatforms = useMemo(() => {
    const set = new Set();
    for (const e of view?.items ?? []) {
      for (const o of e.ownerships ?? []) if (o.platform) set.add(o.platform);
    }
    return Array.from(set).sort();
  }, [view?.items]);

  // Filtered & sorted view
  const displayItems = useMemo(() => {
    let list = view?.items ?? [];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.game?.title?.toLowerCase().includes(q));
    }

    if (platformFilter !== 'all') {
      list = list.filter((e) => (e.ownerships ?? []).some((o) => o.platform.toLowerCase() === platformFilter.toLowerCase()));
    }

    if (sortBy === 'title') {
      return [...list].sort((a, b) => (a.game?.title ?? '').localeCompare(b.game?.title ?? ''));
    }
    if (sortBy === 'playtime') {
      return [...list].sort((a, b) => {
        const playA = (a.ownerships ?? []).reduce((s, o) => s + (o.playtimeMin ?? 0), 0) + (a.loggedMinutes ?? 0);
        const playB = (b.ownerships ?? []).reduce((s, o) => s + (o.playtimeMin ?? 0), 0) + (b.loggedMinutes ?? 0);
        return playB - playA;
      });
    }
    if (sortBy === 'progress') {
      return [...list].sort((a, b) => (b.manualProgress ?? 0) - (a.manualProgress ?? 0));
    }
    if (sortBy === 'timeToBeat') {
      return [...list].sort((a, b) => (a.game?.timeToBeat?.main ?? 999) - (b.game?.timeToBeat?.main ?? 999));
    }

    return list;
  }, [view?.items, search, platformFilter, sortBy]);

  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold font-heading">Library</h1>
        <Link to="/collections" className={buttonVariants({ variant: 'secondary' })}>
          <Layers className="h-4 w-4" aria-hidden="true" /> Collections
        </Link>
      </div>

      {/* Status Tabs */}
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
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control border px-3 text-sm font-medium transition-colors ${
                active ? 'border-accent bg-surface-raised text-text shadow-sm' : 'border-border text-text-muted hover:text-text'
              }`}
            >
              {tabLabel(t)}{' '}
              {count !== undefined && <span className="tabular-nums text-text-muted">{count}</span>}
            </button>
          );
        })}
      </nav>

      {/* Filter & View Controls Bar */}
      {status === 'success' && view.items.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface border border-border p-3 rounded-card">
          <div className="flex items-center gap-3 flex-1">
            {/* Quick search input */}
            <div className="relative flex-1 max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
              <Input
                type="search"
                aria-label="Filter library"
                placeholder="Filter by title..."
                className="pl-8 text-xs h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Platform filter */}
            {availablePlatforms.length > 0 && (
              <select
                aria-label="Filter by platform"
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="h-9 rounded-control border border-border bg-surface-raised px-2.5 text-xs text-text focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="all">All platforms</option>
                {availablePlatforms.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}

            {/* Sort Dropdown */}
            <select
              aria-label="Sort library"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-9 rounded-control border border-border bg-surface-raised px-2.5 text-xs text-text focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="default">Default order</option>
              <option value="title">Title (A-Z)</option>
              <option value="playtime">Most played</option>
              <option value="progress">Highest progress</option>
              <option value="timeToBeat">Shortest time to beat</option>
            </select>
          </div>

          {/* View Mode Toggle: Grid vs Shelf */}
          <div className="flex items-center gap-1 border border-border rounded-control p-0.5 bg-surface-raised self-end sm:self-auto">
            <button
              type="button"
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-surface text-text shadow-xs' : 'text-text-muted hover:text-text'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Shelf list view"
              aria-pressed={viewMode === 'shelf'}
              onClick={() => setViewMode('shelf')}
              className={`p-1.5 rounded ${viewMode === 'shelf' ? 'bg-surface text-text shadow-xs' : 'text-text-muted hover:text-text'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

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

      {status === 'success' && view.items.length > 0 && displayItems.length === 0 && (
        <div className="rounded-card border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-muted">No games match your current filter.</p>
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setPlatformFilter('all'); }} className="mt-2">
            Clear filters
          </Button>
        </div>
      )}

      {status === 'success' && displayItems.length > 0 && (
        <>
          {viewMode === 'grid' ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {displayItems.map((entry) => (
                <LibraryCard key={entry.id} entry={entry} onMove={move} onRemove={remove} busy={pending.has(entry.id)} />
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {displayItems.map((entry) => (
                <LibraryRow key={entry.id} entry={entry} onMove={move} onRemove={remove} busy={pending.has(entry.id)} />
              ))}
            </ul>
          )}

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

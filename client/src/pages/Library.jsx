import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Clock, Layers, LayoutGrid, Library as LibraryIcon, List, Search, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { LIBRARY_STATUSES } from '@gamequest/shared';
import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { CoverImage, GameCardSkeleton, GameCover, SharedCover } from '@/components/games/GameCard.jsx';
import { StatusBadge } from '@/components/library/StatusBadge.jsx';
import { QuickStatusMenu } from '@/components/library/QuickStatusMenu.jsx';
import { SteamBadge } from '@/components/steam/SteamBadge.jsx';
import { SteamSyncControl } from '@/components/steam/SteamSyncControl.jsx';
import { ArtHeader } from '@/components/art/ArtPanel.jsx';
import { achievementPercent, otherPlatforms, steamOwnership } from '@/lib/steam.js';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import { changeStatus, listLibrary, removeFromLibrary } from '@/services/libraryApi.js';
import { STATUS_META } from '@/lib/libraryStatus.js';

const PAGE_SIZE = 24;
const SEARCH_DELAY_MS = 300;
const TABS = ['all', ...LIBRARY_STATUSES];
const tabLabel = (t) => (t === 'all' ? 'All' : STATUS_META[t].label);
const SELECT = 'h-11 rounded-control border border-border bg-surface-raised px-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent';

const minutesPlayed = (entry) => (entry.ownerships ?? []).reduce((s, o) => s + (o.playtimeMin ?? 0), 0) + (entry.loggedMinutes ?? 0);
const hoursLabel = (minutes) => (minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`);

// "Remove" is confirmed in place; the same row serves the card and the shelf row.
function ConfirmRemove({ entry, onRemove, onCancel, busy }) {
  return (
    <div className="flex gap-2" role="group" aria-label="Confirm removal">
      <Button variant="secondary" className="flex-1" onClick={() => onRemove(entry)} disabled={busy}>
        Remove
      </Button>
      <Button variant="ghost" className="flex-1" autoFocus onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

// A cover with its state on it: status (icon + label), progress, and a quick status menu that shows on hover and
// keyboard focus (always on touch screens). Under the cover: title, playtime and achievements.
function LibraryCard({ entry, onMove, onRemove, busy }) {
  const [confirming, setConfirming] = useState(false);
  const { game } = entry;
  const played = minutesPlayed(entry);
  const pct = achievementPercent(entry.achievements);
  const steam = steamOwnership(entry);
  const slug = game?.slug;
  return (
    <li className="group flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-card border border-border bg-surface-raised shadow-lg transition-colors group-hover:border-accent group-focus-within:border-accent">
        <Link to={game ? `/games/${game.slug}` : '/library'} aria-label={game?.title ?? 'Unknown game'} className="block">
          <SharedCover slug={slug}>{game ? <GameCover game={game} compact /> : <div className="aspect-[3/4] bg-surface-raised" />}</SharedCover>
        </Link>
        {/* solid pill: the status colours keep their contrast over any cover */}
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-bg px-2 py-1">
          <StatusBadge status={entry.status} />
        </span>
        <QuickStatusMenu
          entry={entry}
          onMove={onMove}
          onRemove={() => setConfirming(true)}
          disabled={busy}
          triggerClassName="absolute right-2 top-2 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 data-[state=open]:opacity-100"
        />
        {entry.manualProgress > 0 && (
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5 bg-bg/80">
            <div className="h-full bg-accent" style={{ width: `${entry.manualProgress}%` }} />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{game?.title ?? 'Unknown game'}</h3>
        {steam ? (
          <SteamBadge entry={entry} />
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-text-muted">
            {played > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" /> {hoursLabel(played)}
              </span>
            )}
            {pct !== null && (
              <span className="inline-flex items-center gap-1">
                <Trophy className="h-3 w-3 text-reward" aria-hidden="true" /> {pct}%
              </span>
            )}
          </div>
        )}
        {otherPlatforms(entry).length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Platforms">
            {otherPlatforms(entry).map((o) => (
              <li key={o.platform} className="rounded-control border border-border px-2 py-0.5 text-xs text-text-muted">
                {o.platform}
              </li>
            ))}
          </ul>
        )}
        {confirming && (
          <ConfirmRemove
            entry={entry}
            onRemove={onRemove}
            onCancel={() => setConfirming(false)}
            busy={busy}
          />
        )}
      </div>
    </li>
  );
}

function LibraryRow({ entry, onMove, onRemove, busy }) {
  const [confirming, setConfirming] = useState(false);
  const { game } = entry;
  const played = minutesPlayed(entry);
  return (
    <li className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3.5 transition-colors hover:bg-surface-raised/40">
      <div className="flex items-center gap-3.5">
        <Link to={game ? `/games/${game.slug}` : '/library'} className="h-16 w-12 shrink-0 overflow-hidden rounded border border-border bg-surface-raised">
          <CoverImage cover={game?.cover} title={game?.title} compact className="h-full w-full" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link to={game ? `/games/${game.slug}` : '/library'} className="truncate text-sm font-semibold hover:text-accent">
            {game?.title ?? 'Unknown game'}
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <StatusBadge status={entry.status} />
            {otherPlatforms(entry).length > 0 && (
              <ul className="flex flex-wrap gap-1" aria-label="Platforms">
                {otherPlatforms(entry).map((o) => (
                  <li key={o.platform} className="rounded border border-border px-1.5 py-0.5 text-xs text-text-muted">
                    {o.platform}
                  </li>
                ))}
              </ul>
            )}
            <SteamBadge entry={entry} />
            {played > 0 && !steamOwnership(entry) && (
              <span className="flex items-center gap-1 font-medium text-text-muted">
                <Clock className="h-3 w-3" aria-hidden="true" /> {hoursLabel(played)} played
              </span>
            )}
          </div>
        </div>
        {entry.manualProgress > 0 && (
          <div className="hidden items-center gap-2 sm:flex">
            <div className="h-2 w-20 overflow-hidden rounded-full border border-border/50 bg-surface-raised">
              <div className="h-full rounded-full bg-accent" style={{ width: `${entry.manualProgress}%` }} />
            </div>
            <span className="text-xs font-medium tabular-nums text-text-muted">{entry.manualProgress}%</span>
          </div>
        )}
        <QuickStatusMenu entry={entry} onMove={onMove} onRemove={() => setConfirming(true)} disabled={busy} />
      </div>
      {confirming && <ConfirmRemove entry={entry} onRemove={onRemove} onCancel={() => setConfirming(false)} busy={busy} />}
    </li>
  );
}


export default function Library() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('status')) ? params.get('status') : 'all';

  // Filters (genre, platform and search are applied by the server across the whole library), sort and view.
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('');
  const [platform, setPlatform] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'shelf'

  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useMemo(
    () => ({
      status: tab === 'all' ? undefined : tab,
      genre: genre || undefined,
      platform: platform || undefined,
      q: q || undefined,
      sort: sortBy !== 'default' ? sortBy : undefined,
    }),
    [tab, genre, platform, q, sortBy],
  );
  const filtering = Boolean(genre || platform || q);
  const load = useCallback((signal) => listLibrary({ ...query, limit: PAGE_SIZE }, { signal }), [query]);
  const { status, data, error, retry } = useAsync(load);

  // Local edits (optimistic moves, extra pages) layer on top of the loaded data and are discarded automatically
  // whenever `data` is reloaded (tab or filter change, retry). Every edit is a functional update, and a rollback undoes
  // only its own entry, so two requests in flight can never overwrite each other's changes.
  const [local, setLocal] = useState({ source: null });
  const view = local.source === data && data ? local : data ? { ...data, source: data } : null;
  const patch = (fn) =>
    setLocal((prev) => {
      const base = prev.source === data && data ? prev : { ...data, source: data };
      return { ...base, ...fn(base), source: data };
    });
  const shift = (counts, from, to) => ({ ...counts, [from]: counts[from] - 1, [to]: counts[to] + 1 });
  const insertAt = (items, entry, index) => {
    const next = [...items];
    next.splice(Math.min(index, next.length), 0, entry);
    return next;
  };

  // The tab counts and the filter menus describe the whole library, so they stay while a filtered reload is running.
  const [kept, setKept] = useState({ source: null, counts: null, facets: null });
  if (data && kept.source !== data) setKept({ source: data, counts: data.counts ?? null, facets: data.facets ?? null });

  const [pending, setPending] = useState(() => new Set());
  const setBusy = (id, on) =>
    setPending((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function move(entry, to) {
    const index = view.items.findIndex((e) => e.id === entry.id);
    // On a status tab the entry leaves the list; on "All" it stays with its new status.
    patch((base) => ({
      items: tab === 'all' ? base.items.map((e) => (e.id === entry.id ? { ...e, status: to } : e)) : base.items.filter((e) => e.id !== entry.id),
      counts: shift(base.counts, entry.status, to),
    }));
    setBusy(entry.id, true);
    try {
      await changeStatus(entry.id, to);
      toast.success(`${entry.game?.title ?? 'Game'} moved to ${STATUS_META[to].label}`);
    } catch (err) {
      patch((base) => ({
        items: tab === 'all' ? base.items.map((e) => (e.id === entry.id ? { ...e, status: entry.status } : e)) : insertAt(base.items, entry, index),
        counts: shift(base.counts, to, entry.status),
      }));
      toast.error(getErrorInfo(err).message);
    } finally {
      setBusy(entry.id, false);
    }
  }

  async function remove(entry) {
    const index = view.items.findIndex((e) => e.id === entry.id);
    patch((base) => ({
      items: base.items.filter((e) => e.id !== entry.id),
      counts: { ...base.counts, [entry.status]: base.counts[entry.status] - 1, all: base.counts.all - 1 },
    }));
    setBusy(entry.id, true);
    try {
      await removeFromLibrary(entry.id);
      toast.success(`${entry.game?.title ?? 'Game'} removed from your library`);
    } catch (err) {
      patch((base) => ({
        items: insertAt(base.items, entry, index),
        counts: { ...base.counts, [entry.status]: base.counts[entry.status] + 1, all: base.counts.all + 1 },
      }));
      toast.error(getErrorInfo(err).message);
    } finally {
      setBusy(entry.id, false);
    }
  }

  const [loadingMore, setLoadingMore] = useState(false);
  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await listLibrary({ ...query, limit: PAGE_SIZE, cursor: view.nextCursor });
      patch((base) => ({ items: [...base.items, ...page.items.filter((i) => !base.items.some((e) => e.id === i.id))], nextCursor: page.nextCursor }));
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setLoadingMore(false);
    }
  }
  // The server sorts the full library by the chosen sort order across pages.
  const displayItems = view?.items ?? [];

  const facets = view?.facets ?? kept.facets;
  const tabCounts = view?.counts ?? kept.counts;
  const libraryEmpty = status === 'success' && view.counts?.all === 0 && !filtering;
  const clearFilters = () => {
    setSearch('');
    setQ('');
    setGenre('');
    setPlatform('');
  };

  return (
    <section className="flex flex-col gap-6">
      <ArtHeader
        title="Library"
        seed="library"
        actions={
          <>
            <SteamSyncControl onSynced={retry} />
            <Link to="/collections" className={buttonVariants({ variant: 'secondary' })}>
              <Layers className="h-4 w-4" aria-hidden="true" /> Collections
            </Link>
          </>
        }
      />

      {/* Filter bar (sticky from md up: stacked on a phone it would cover a third of the screen): status tabs with counts, then search, platform, genre, sort and view */}
      {!libraryEmpty && (
        <div className="z-10 -mx-4 flex flex-col gap-3 md:sticky md:top-12 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur">
          <nav aria-label="Library status" className="scrollbar-none flex gap-2 overflow-x-auto">
            {TABS.map((t) => {
              const active = t === tab;
              const count = tabCounts?.[t];
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
                  {tabLabel(t)} {count !== undefined && <span className="tabular-nums text-text-muted">{count}</span>}
                </button>
              );
            })}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-40 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
              <Input
                type="search"
                aria-label="Filter library"
                placeholder="Filter by title..."
                className="h-11 pl-9 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {facets?.platforms?.length > 0 && (
              <select aria-label="Filter by platform" value={platform} onChange={(e) => setPlatform(e.target.value)} className={SELECT}>
                <option value="">All platforms</option>
                {facets.platforms.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}
            {facets?.genres?.length > 0 && (
              <select aria-label="Filter by genre" value={genre} onChange={(e) => setGenre(e.target.value)} className={SELECT}>
                <option value="">All genres</option>
                {facets.genres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}
            <select aria-label="Sort library" value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={SELECT}>
              <option value="default">Recently added</option>
              <option value="title">Title (A-Z)</option>
              <option value="playtime">Most played</option>
              <option value="progress">Highest progress</option>
              <option value="timeToBeat">Shortest time to beat</option>
            </select>

            {filtering && (
              <Button variant="ghost" onClick={clearFilters}>
                Clear filters
              </Button>
            )}

            <div className="ml-auto flex items-center gap-1 rounded-control border border-border bg-surface-raised p-0.5">
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
                onClick={() => setViewMode('grid')}
                className={`flex h-10 w-10 items-center justify-center rounded ${viewMode === 'grid' ? 'bg-surface text-text' : 'text-text-muted hover:text-text'}`}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Shelf list view"
                aria-pressed={viewMode === 'shelf'}
                onClick={() => setViewMode('shelf')}
                className={`flex h-10 w-10 items-center justify-center rounded ${viewMode === 'shelf' ? 'bg-surface text-text' : 'text-text-muted hover:text-text'}`}
              >
                <List className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
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

      {status === 'success' && view.items.length === 0 && !filtering && (
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
          suggestions={tab === 'all'}
        />
      )}

      {status === 'success' && view.items.length === 0 && filtering && (
        <div className="rounded-card border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-muted">No games match your current filter. Use Clear filters above to see everything.</p>
        </div>
      )}

      {status === 'success' && displayItems.length > 0 && (
        <>
          {viewMode === 'grid' ? (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
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

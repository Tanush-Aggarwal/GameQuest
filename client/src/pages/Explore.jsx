import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, Compass, Flame, Gamepad2, Monitor, Search, Sparkles, Star } from 'lucide-react';
import { toast } from 'sonner';
import { FancySelect } from '@/components/ui/FancySelect.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { GameCard, GameCardSkeleton } from '@/components/games/GameCard.jsx';
import { DiscoveryShelf } from '@/components/games/DiscoveryShelf.jsx';
import { HeroCarousel } from '@/components/explore/HeroCarousel.jsx';
import { ArtHeader } from '@/components/art/ArtPanel.jsx';
import { getErrorInfo } from '@/services/api.js';
import { searchGames } from '@/services/gamesApi.js';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll.js';

const PAGE_SIZE = 24;
const DEBOUNCE_MS = 300;
const DAY_MS = 86_400_000;
const SELECT = 'w-full sm:w-auto sm:min-w-[11rem]';

// Categories match a game's IGDB genres, themes or game modes (the API checks all three), so play styles like
// co-op sit next to genres. `top` ones get a pill in the main row; `rail` ones also get a shelf on the default page.
const CATEGORY_GROUPS = [
  {
    title: 'Genres',
    items: [
      { id: 'Role-playing (RPG)', label: 'RPGs', top: true, rail: true },
      { id: 'Shooter', label: 'Shooters', top: true, rail: true },
      { id: 'Adventure', label: 'Adventure', top: true, rail: true },
      { id: 'Indie', label: 'Indies', top: true, rail: true },
      { id: 'Strategy', label: 'Strategy', top: true, rail: true },
      { id: 'Platform', label: 'Platformers', rail: true },
      { id: 'Puzzle', label: 'Puzzles', rail: true },
      { id: 'Racing', label: 'Racing', top: true },
      { id: 'Sport', label: 'Sports', top: true },
      { id: 'Fighting', label: 'Fighting' },
      { id: 'Simulator', label: 'Simulation', top: true },
      { id: "Hack and slash/Beat 'em up", label: "Hack & slash" },
      { id: 'Tactical', label: 'Tactical' },
      { id: 'Real Time Strategy (RTS)', label: 'Real-time strategy' },
      { id: 'Turn-based strategy (TBS)', label: 'Turn-based strategy' },
      { id: 'Arcade', label: 'Arcade' },
      { id: 'Point-and-click', label: 'Point & click' },
      { id: 'Visual Novel', label: 'Visual novels' },
      { id: 'Card & Board Game', label: 'Card & board' },
      { id: 'MOBA', label: 'MOBA' },
      { id: 'Music', label: 'Music & rhythm' },
    ],
  },
  {
    title: 'Play style',
    items: [
      { id: 'Co-operative', label: 'Co-op', top: true, rail: true },
      { id: 'Multiplayer', label: 'Multiplayer', top: true },
      { id: 'Single player', label: 'Single player' },
      { id: 'Split screen', label: 'Split screen', top: true },
      { id: 'Massively Multiplayer Online (MMO)', label: 'MMO' },
      { id: 'Battle Royale', label: 'Battle royale' },
    ],
  },
  {
    title: 'Themes',
    items: [
      { id: 'Open world', label: 'Open world', top: true },
      { id: 'Action', label: 'Action', top: true },
      { id: 'Horror', label: 'Horror', top: true },
      { id: 'Survival', label: 'Survival' },
      { id: 'Fantasy', label: 'Fantasy' },
      { id: 'Science fiction', label: 'Sci-fi' },
      { id: 'Sandbox', label: 'Sandbox' },
      { id: 'Stealth', label: 'Stealth' },
      { id: 'Mystery', label: 'Mystery' },
      { id: 'Thriller', label: 'Thriller' },
      { id: 'Comedy', label: 'Comedy' },
      { id: 'Historical', label: 'Historical' },
      { id: 'Warfare', label: 'Warfare' },
      { id: 'Party', label: 'Party' },
      { id: 'Kids', label: 'Family & kids' },
      { id: '4X (explore, expand, exploit, and exterminate)', label: '4X' },
    ],
  },
];
const CATEGORIES = CATEGORY_GROUPS.flatMap((g) => g.items);

// Catalog platform names as IGDB spells them (what the `platform` filter matches).
const PLATFORMS = ['PC (Microsoft Windows)', 'PlayStation 5', 'PlayStation 4', 'Xbox Series X|S', 'Xbox One', 'Nintendo Switch', 'Nintendo Switch 2'];
const platformLabel = (p) => p.replace(/\s*\(.*\)\s*$/, '');

// How long a game takes (main story) and how well it is rated: both map onto catalog filters.
const LENGTHS = {
  short: { label: 'Under 10 hours', params: { maxHours: 10 } },
  medium: { label: '10 to 20 hours', params: { minHours: 10, maxHours: 20 } },
  long: { label: '40+ hours', params: { minHours: 40 } },
};
// Ratings are shown out of 10 everywhere; the API filters on 0-100.
const RATINGS = { 70: '7+', 80: '8+', 90: '9+' };

const isoDaysAgo = (days, from = Date.now()) => new Date(from - days * DAY_MS).toISOString().slice(0, 10);

// The rails of the default view. Each is its own catalog query, ordered by popularity unless it says otherwise, and
// starts loading only when it nears the screen. The `params` objects are module constants so a rail only reloads
// when it is retried.
// A function, not a constant: "new" is relative to today, so the cutoff is worked out when the page is shown.
const buildRails = (today) => [
  { id: 'pc', title: 'Popular on PC', subtitle: 'What PC players are into', icon: Monitor, params: { platform: PLATFORMS[0] } },
  { id: 'top', title: 'Top rated', subtitle: 'Best rated by critics and players', icon: Star, params: { sort: 'rating', minRating: 80 } },
  { id: 'new', title: 'New & upcoming', subtitle: 'Out in the last two months or on the way', icon: Sparkles, params: { releasedAfter: isoDaysAgo(60, today) } },
  { id: 'short', title: 'Under 10 hours', subtitle: 'Quick weekend wins', icon: Clock, params: { maxHours: 10 } },
  ...CATEGORIES.filter((c) => c.rail).map((c) => ({ id: `genre-${c.id}`, title: c.label, subtitle: 'Popular right now', icon: Flame, params: { genre: c.id } })),
];

// The catalog query behind the main list for the current URL.
function listParams(params) {
  const genre = params.get('genre');
  const length = LENGTHS[params.get('length')];
  const rating = RATINGS[params.get('rating')] ? Number(params.get('rating')) : undefined;
  return {
    q: params.get('q') || undefined,
    genre: genre && genre !== 'all' ? genre : undefined,
    platform: PLATFORMS.includes(params.get('platform')) ? params.get('platform') : undefined,
    ...length?.params,
    minRating: rating,
  };
}

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const selectedGenre = params.get('genre') ?? 'all';
  const platform = PLATFORMS.includes(params.get('platform')) ? params.get('platform') : '';
  const length = LENGTHS[params.get('length')] ? params.get('length') : '';
  const rating = RATINGS[params.get('rating')] ? params.get('rating') : '';

  const [text, setText] = useState(q);
  // When the URL's query changes from outside (back/forward, a link), show it in the box. The box's own
  // debounced writes come back equal to `text`, so they never reset what the user is typing.
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    if (text.trim() !== q) setText(q);
  }
  const [state, setState] = useState({
    status: 'loading',
    items: [],
    nextCursor: null,
    warnings: [],
    error: null,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  // After a failed page the automatic loading stops and a "Try again" button takes over.
  const [moreFailed, setMoreFailed] = useState(false);
  const requestId = useRef(0);

  // Sync debounced search input to URL
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === q) return undefined;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (trimmed) next.set('q', trimmed);
      else next.delete('q');
      setParams(next, { replace: true });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, q, params, setParams]);

  const query = params.toString(); // every filter lives in the URL, so one string is the dependency
  const load = useCallback(async () => {
    const id = (requestId.current += 1);
    setState((s) => ({ ...s, status: 'loading', error: null }));
    setMoreFailed(false);
    try {
      const data = await searchGames({ ...listParams(new URLSearchParams(query)), limit: PAGE_SIZE });
      if (id === requestId.current) setState({ status: 'success', ...data, error: null });
    } catch (err) {
      if (id === requestId.current) setState((s) => ({ ...s, status: 'error', error: getErrorInfo(err).message }));
    }
  }, [query]);

  useEffect(() => {
    load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  const loadingMoreRef = useRef(false);
  async function loadMore() {
    if (loadingMoreRef.current || !state.nextCursor) return;
    loadingMoreRef.current = true;
    const id = requestId.current;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const data = await searchGames({ ...listParams(params), limit: PAGE_SIZE, cursor: state.nextCursor });
      if (id === requestId.current) {
        // A game can move between pages while the catalog updates; never show it twice.
        setState((s) => {
          const seen = new Set(s.items.map((g) => g.id));
          return { ...s, items: [...s.items, ...data.items.filter((g) => !seen.has(g.id))], nextCursor: data.nextCursor };
        });
      }
    } catch (err) {
      if (id === requestId.current) {
        setMoreFailed(true);
        toast.error(getErrorInfo(err).message);
      }
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }
  // Steam-style endless list: the next page starts loading well before the last row reaches the screen.
  const infinite = useInfiniteScroll(loadMore, {
    enabled: state.status === 'success' && Boolean(state.nextCursor) && !loadingMore && !moreFailed,
  });

  function setFilter(name, value) {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(name);
    else next.set(name, value);
    setParams(next);
  }

  const day = isoDaysAgo(0);
  const rails = useMemo(() => buildRails(Date.parse(day)), [day]);
  const filtered = Boolean(selectedGenre !== 'all' || platform || length || rating);
  const isDefaultBrowse = !q && !filtered;

  return (
    <section className="gq-explore flex flex-col gap-6 pb-12">
      {isDefaultBrowse ? (
        <>
          <div className="flex flex-col gap-1">
            <h1 aria-label="Explore Catalog" className="gq-page-heading text-3xl font-extrabold text-text sm:text-4xl">
              Explore Games
            </h1>
            <p className="text-sm text-text-muted">Discover your next favorite game</p>
          </div>
          <HeroCarousel />
        </>
      ) : (
        <ArtHeader title="Explore Catalog" subtitle="Discover new releases, legendary classics, and find your next game." seed="explore" />
      )}

      {/* Search, and the filters for the list below (all of them live in the URL) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 max-w-xl flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <Input
            id="explore-search-input"
            name="search"
            type="search"
            aria-label="Search games"
            placeholder="Search for a game"
            className="h-11 pl-9"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <FancySelect id="explore-platform-filter" name="platform" aria-label="Filter by platform" value={platform} onChange={(e) => setFilter('platform', e.target.value)} className={SELECT}>
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {platformLabel(p)}
            </option>
          ))}
        </FancySelect>
        <FancySelect id="explore-length-filter" name="length" aria-label="Filter by length" value={length} onChange={(e) => setFilter('length', e.target.value)} className={SELECT}>
          <option value="">Any length</option>
          {Object.entries(LENGTHS).map(([id, l]) => (
            <option key={id} value={id}>
              {l.label}
            </option>
          ))}
        </FancySelect>
        <FancySelect id="explore-rating-filter" name="rating" aria-label="Filter by rating" value={rating} onChange={(e) => setFilter('rating', e.target.value)} className={SELECT}>
          <option value="">Any rating</option>
          {Object.entries(RATINGS).map(([id, label]) => (
            <option key={id} value={id}>
              ★ {label}
            </option>
          ))}
        </FancySelect>
        {filtered && (
          <Button variant="ghost" onClick={() => setParams(q ? { q } : {})}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Categories: grouped in tabs (Popular, Genres, Play style, Themes) */}
      <CategoryPicker selected={selectedGenre} onSelect={(id) => setFilter('genre', id)} />

      {/* Rails (default browse only). Each loads on its own as it nears the screen, so none waits for, or hides, another. */}
      {isDefaultBrowse && (
        <div className="flex flex-col gap-8">
          {rails.map(({ id, ...rail }) => (
            <DiscoveryShelf key={id} {...rail} />
          ))}
        </div>
      )}

      {/* Loading Skeleton */}
      {state.status === 'loading' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" role="status" aria-label="Loading games">
          {Array.from({ length: 10 }, (_, i) => (
            <GameCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Scoped Error */}
      {state.status === 'error' && <ErrorState message={state.error} onRetry={load} />}

      {/* Results */}
      {state.status === 'success' && (
        <>
          {state.warnings.map((w) => (
            <p key={w.code} role="status" className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-text-muted">
              {w.message}
            </p>
          ))}

          {state.items.length === 0 ? (
            <EmptyState
              icon={Compass}
              title={q ? `No games found for "${q}"` : filtered ? 'No games match these filters' : 'No games yet'}
              description={
                q
                  ? 'Try a different spelling, a shorter search, or fewer filters.'
                  : filtered
                    ? 'Loosen a filter, or clear them all.'
                    : 'Search for a game by name to add it to the catalog.'
              }
              suggestions
            />
          ) : (
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 border-t border-border pt-4">
                  <Gamepad2 className="h-4 w-4 text-accent" aria-hidden="true" />
                  <h2 className="font-heading text-lg font-bold text-text">{isDefaultBrowse ? 'All Games' : 'Results'}</h2>
                </div>
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  {state.items.map((game) => (
                    <li key={game.id}>
                      <GameCard game={game} />
                    </li>
                  ))}
                </ul>
              </div>

              {loadingMore && (
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, i) => (
                    <li key={i}>
                      <GameCardSkeleton />
                    </li>
                  ))}
                </ul>
              )}
              {state.nextCursor && <div ref={infinite.ref} aria-hidden="true" className="h-px" />}
              {state.nextCursor && (!infinite.supported || moreFailed) && (
                <Button variant="secondary" className="self-center" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : moreFailed ? 'Try again' : 'Load more'}
                </Button>
              )}
              {!state.nextCursor && state.items.length > PAGE_SIZE && (
                <p className="self-center text-xs text-text-muted">You&apos;ve reached the end · {state.items.length.toLocaleString()} games</p>
              )}
              <span role="status" className="sr-only">{loadingMore ? 'Loading more games' : ''}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// Categories in tabs: Popular (the common ones) and every group on its own, each a wrapping set of pills, so no pill is
// ever cut off or hidden in a sideways scroll. Opens on the tab that holds the chosen category.
function CategoryPicker({ selected, onSelect }) {
  const groups = [{ title: 'Popular', items: CATEGORIES.filter((c) => c.top) }, ...CATEGORY_GROUPS];
  const holder = groups.find((g) => g.items.some((c) => c.id === selected));
  const [tab, setTab] = useState(holder?.title ?? 'Popular');
  const items = groups.find((g) => g.title === tab)?.items ?? [];
  const current = CATEGORIES.find((c) => c.id === selected);
  const pill = (id, label, active) => (
    <button
      key={id}
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(active && id !== 'all' ? 'all' : id)}
      className={`gq-genre-tab inline-flex min-h-10 items-center px-3 text-sm font-semibold transition-colors ${active ? 'is-active' : ''}`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div role="tablist" aria-label="Category groups" className="scrollbar-none -mb-px flex gap-5 overflow-x-auto">
          {groups.map((g) => {
            const on = g.title === tab;
            const has = g.items.some((c) => c.id === selected);
            return (
              <button
                key={g.title}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(g.title)}
                className={`relative inline-flex min-h-10 shrink-0 items-center gap-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text ${
                  on ? 'text-text' : 'text-text-muted hover:text-text'
                }`}
              >
                {g.title}
                <span className="text-xs font-medium tabular-nums text-text-muted">{g.items.length}</span>
                {has && !on && <span className="h-1.5 w-1.5 rounded-full bg-text" aria-label="(has the chosen category)" />}
                {on && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-text" />}
              </button>
            );
          })}
        </div>
        {current && (
          <p className="flex items-center gap-2 text-sm text-text-muted">
            Showing <strong className="text-text">{current.label}</strong>
            <button type="button" onClick={() => onSelect('all')} className="rounded-full px-2 py-1 text-xs font-semibold text-text underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text">
              Clear
            </button>
          </p>
        )}
      </div>
      <div role="tabpanel" aria-label={`${tab} categories`} className="flex flex-wrap gap-2">
        {tab === 'Popular' && pill('all', 'All Games', selected === 'all')}
        {items.map((c) => pill(c.id, c.label, selected === c.id))}
      </div>
    </div>
  );
}

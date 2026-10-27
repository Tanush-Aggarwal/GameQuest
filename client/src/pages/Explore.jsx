import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, Compass, Flame, Gamepad2, Monitor, Search, Sparkles, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { GameCard, GameCardSkeleton } from '@/components/games/GameCard.jsx';
import { DiscoveryShelf } from '@/components/games/DiscoveryShelf.jsx';
import { HeroCarousel } from '@/components/explore/HeroCarousel.jsx';
import { ArtHeader } from '@/components/art/ArtPanel.jsx';
import { getErrorInfo } from '@/services/api.js';
import { searchGames } from '@/services/gamesApi.js';

const PAGE_SIZE = 24;
const DEBOUNCE_MS = 300;
const DAY_MS = 86_400_000;
const SELECT = 'h-11 rounded-control border border-border bg-surface-raised px-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent';

const GENRES = [
  { id: 'all', label: 'All Games' },
  { id: 'Role-playing (RPG)', label: 'RPGs' },
  { id: 'Indie', label: 'Indies' },
  { id: 'Adventure', label: 'Adventure' },
  { id: 'Platform', label: 'Platformers' },
  { id: 'Puzzle', label: 'Puzzles' },
  { id: 'Shooter', label: 'Shooters' },
  { id: 'Strategy', label: 'Strategy' },
];

// Catalog platform names as IGDB spells them (what the `platform` filter matches).
const PLATFORMS = ['PC (Microsoft Windows)', 'PlayStation 5', 'PlayStation 4', 'Xbox Series X|S', 'Xbox One', 'Nintendo Switch'];
const platformLabel = (p) => p.replace(/\s*\(.*\)\s*$/, '');

// How long a game takes (main story) and how well it is rated: both map onto catalog filters.
const LENGTHS = {
  short: { label: 'Under 10 hours', params: { maxHours: 10 } },
  medium: { label: '10 to 20 hours', params: { minHours: 10, maxHours: 20 } },
  long: { label: '40+ hours', params: { minHours: 40 } },
};
const RATINGS = { 70: '70+', 80: '80+', 90: '90+' };

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
  ...GENRES.filter((g) => g.id !== 'all').map((g) => ({ id: `genre-${g.id}`, title: g.label, subtitle: 'Popular in this genre', icon: Flame, params: { genre: g.id } })),
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

  async function loadMore() {
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const data = await searchGames({ ...listParams(params), limit: PAGE_SIZE, cursor: state.nextCursor });
      if (id === requestId.current) {
        setState((s) => ({ ...s, items: [...s.items, ...data.items], nextCursor: data.nextCursor }));
      }
    } catch (err) {
      if (id === requestId.current) toast.error(getErrorInfo(err).message);
    } finally {
      setLoadingMore(false);
    }
  }

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
            type="search"
            aria-label="Search games"
            placeholder="Search for a game"
            className="h-11 pl-9"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <select aria-label="Filter by platform" value={platform} onChange={(e) => setFilter('platform', e.target.value)} className={SELECT}>
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {platformLabel(p)}
            </option>
          ))}
        </select>
        <select aria-label="Filter by length" value={length} onChange={(e) => setFilter('length', e.target.value)} className={SELECT}>
          <option value="">Any length</option>
          {Object.entries(LENGTHS).map(([id, l]) => (
            <option key={id} value={id}>
              {l.label}
            </option>
          ))}
        </select>
        <select aria-label="Filter by rating" value={rating} onChange={(e) => setFilter('rating', e.target.value)} className={SELECT}>
          <option value="">Any rating</option>
          {Object.entries(RATINGS).map(([id, label]) => (
            <option key={id} value={id}>
              Rated {label}
            </option>
          ))}
        </select>
        {filtered && (
          <Button variant="ghost" onClick={() => setParams(q ? { q } : {})}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Genre pills */}
      <div className="gq-genre-index scrollbar-none flex gap-2 overflow-x-auto pb-1" aria-label="Browse by genre">
        {GENRES.map((g) => {
          const active = selectedGenre === g.id;
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter('genre', g.id)}
              className={`gq-genre-tab inline-flex min-h-11 shrink-0 items-center px-3 text-sm font-semibold transition-colors ${active ? 'is-active' : ''}`}
            >
              {g.label}
            </button>
          );
        })}
      </div>

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

              {state.nextCursor && (
                <Button variant="secondary" className="self-center" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

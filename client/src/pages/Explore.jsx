import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, Compass, Gamepad2, Search, Star, Swords } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { GameCard, GameCardSkeleton } from '@/components/games/GameCard.jsx';
import { DiscoveryShelf } from '@/components/games/DiscoveryShelf.jsx';
import { ArtHeader } from '@/components/art/ArtPanel.jsx';
import { getErrorInfo } from '@/services/api.js';
import { searchGames } from '@/services/gamesApi.js';

const PAGE_SIZE = 24;
const DEBOUNCE_MS = 300;

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

// Curated shelves. Each is its own catalog query, so it is filled from the whole catalog and ordered by
// popularity (the API's default order), not picked from whatever the main list happened to load.
// The `params` objects are module constants so a shelf only reloads when it is retried.
const SHELVES = [
  {
    id: 'acclaimed',
    title: 'Critically Acclaimed Masterpieces',
    subtitle: 'Rated 80+ by critics and players',
    icon: Star,
    params: { minRating: 80 },
  },
  {
    id: 'quick-wins',
    title: 'Quick Weekend Wins',
    subtitle: 'Under 10 hours to beat',
    icon: Clock,
    params: { maxHours: 10 },
  },
  {
    id: 'epic-rpgs',
    title: 'Massive 40h+ Epic RPGs',
    subtitle: 'Vast worlds to get lost in',
    icon: Swords,
    params: { genre: 'Role-playing (RPG)', minHours: 40 },
  },
];

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const selectedGenre = params.get('genre') ?? 'all';

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

  const load = useCallback(async () => {
    const id = (requestId.current += 1);
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const data = await searchGames({
        q: q || undefined,
        genre: selectedGenre !== 'all' ? selectedGenre : undefined,
        limit: PAGE_SIZE,
      });
      if (id === requestId.current) setState({ status: 'success', ...data, error: null });
    } catch (err) {
      if (id === requestId.current)
        setState((s) => ({ ...s, status: 'error', error: getErrorInfo(err).message }));
    }
  }, [q, selectedGenre]);

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
      const data = await searchGames({
        q: q || undefined,
        genre: selectedGenre !== 'all' ? selectedGenre : undefined,
        limit: PAGE_SIZE,
        cursor: state.nextCursor,
      });
      if (id === requestId.current) {
        setState((s) => ({ ...s, items: [...s.items, ...data.items], nextCursor: data.nextCursor }));
      }
    } catch (err) {
      if (id === requestId.current) toast.error(getErrorInfo(err).message);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleGenreChange(genreId) {
    const next = new URLSearchParams(params);
    if (genreId === 'all') next.delete('genre');
    else next.set('genre', genreId);
    setParams(next);
  }

  const isDefaultBrowse = !q && selectedGenre === 'all';

  return (
    <section className="flex flex-col gap-6 pb-12">
      <ArtHeader
        title="Explore Catalog"
        subtitle="Discover new releases, legendary classics, and find your next game."
        seed="explore"
      />

      {/* Search Input */}
      <div className="relative max-w-xl">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Search games"
          placeholder="Search for a game"
          className="pl-9"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      {/* Genre Filter Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {GENRES.map((g) => {
          const active = selectedGenre === g.id;
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={active}
              onClick={() => handleGenreChange(g.id)}
              className={`inline-flex shrink-0 items-center rounded-full border px-3.5 py-1 text-xs font-semibold transition-colors ${
                active
                  ? 'border-accent bg-accent text-white shadow-sm'
                  : 'border-border bg-surface text-text-muted hover:text-text hover:bg-surface-raised'
              }`}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {/* Curated shelves (default browse only). They load in parallel with the main list and
          independently of it, so neither one waits for, or is hidden by, the other. */}
      {isDefaultBrowse && (
        <div className="flex flex-col gap-6">
          {SHELVES.map(({ id, ...shelf }) => (
            <DiscoveryShelf key={id} {...shelf} />
          ))}
        </div>
      )}

      {/* Loading Skeleton */}
      {state.status === 'loading' && (
        <div
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
          role="status"
          aria-label="Loading games"
        >
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
            <p
              key={w.code}
              role="status"
              className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-text-muted"
            >
              {w.message}
            </p>
          ))}

          {state.items.length === 0 ? (
            <EmptyState
              icon={Compass}
              title={q ? `No games found for "${q}"` : 'No games yet'}
              description={
                q
                  ? 'Try a different spelling or a shorter search.'
                  : 'Search for a game by name to add it to the catalog.'
              }
            />
          ) : (
            <div className="flex flex-col gap-8">
              {/* Main Games Grid */}
              <div className="flex flex-col gap-4">
                {isDefaultBrowse && (
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <Gamepad2 className="h-4 w-4 text-accent" />
                    <h2 className="font-heading text-base font-bold text-text">All Games</h2>
                  </div>
                )}
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  {state.items.map((game) => (
                    <li key={game.id}>
                      <GameCard game={game} />
                    </li>
                  ))}
                </ul>
              </div>

              {state.nextCursor && (
                <Button
                  variant="secondary"
                  className="self-center"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
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

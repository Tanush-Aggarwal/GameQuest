import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Clock,
  Compass,
  Flame,
  Gamepad2,
  Search,
  Sparkles,
  Star,
  Swords,
  Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { GameCard, GameCardSkeleton } from '@/components/games/GameCard.jsx';
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

function CuratedShelf({ title, subtitle, icon: Icon, games }) {
  if (!games || !games.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-accent" aria-hidden="true" />}
          <h2 className="font-heading text-base font-bold text-text">{title}</h2>
        </div>
        {subtitle && <span className="text-xs text-text-muted">{subtitle}</span>}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 pt-1 scrollbar-none snap-x">
        {games.map((game) => (
          <div key={game.id} className="w-36 sm:w-44 shrink-0 snap-start">
            <GameCard game={game} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const selectedGenre = params.get('genre') ?? 'all';

  const [text, setText] = useState(q);
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

  // Curated shelf calculations from current catalog
  const topRated = useMemo(
    () =>
      state.items
        .filter((g) => g.ratingAvg >= 4.0)
        .sort((a, b) => b.ratingAvg - a.ratingAvg)
        .slice(0, 6),
    [state.items],
  );

  const quickWins = useMemo(
    () =>
      state.items
        .filter((g) => g.timeToBeat?.main != null && g.timeToBeat.main <= 10)
        .slice(0, 6),
    [state.items],
  );

  const epicRPGs = useMemo(
    () =>
      state.items
        .filter((g) => (g.genres ?? []).includes('Role-playing (RPG)') && (g.timeToBeat?.main ?? 0) >= 40)
        .slice(0, 6),
    [state.items],
  );

  const isDefaultBrowse = !q && selectedGenre === 'all';

  return (
    <section className="flex flex-col gap-6 pb-12">
      {/* Title */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold font-heading">Explore Catalog</h1>
        <p className="text-sm text-text-muted">
          Discover new releases, legendary classics, and find your next game.
        </p>
      </div>

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
              {/* Curated Shelves (shown on default browse) */}
              {isDefaultBrowse && (
                <div className="flex flex-col gap-6">
                  {topRated.length > 0 && (
                    <CuratedShelf
                      title="Critically Acclaimed Masterpieces"
                      subtitle="Community highest rated"
                      icon={Star}
                      games={topRated}
                    />
                  )}
                  {quickWins.length > 0 && (
                    <CuratedShelf
                      title="Quick Weekend Wins"
                      subtitle="Under 10 hours to beat"
                      icon={Clock}
                      games={quickWins}
                    />
                  )}
                  {epicRPGs.length > 0 && (
                    <CuratedShelf
                      title="Massive 50h+ Epic RPGs"
                      subtitle="Vast worlds to get lost in"
                      icon={Swords}
                      games={epicRPGs}
                    />
                  )}
                </div>
              )}

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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Compass, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { GameCard, GameCardSkeleton } from '@/components/games/GameCard.jsx';
import { getErrorInfo } from '@/services/api.js';
import { searchGames } from '@/services/gamesApi.js';

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [text, setText] = useState(q);
  const [state, setState] = useState({ status: 'loading', items: [], nextCursor: null, warnings: [], error: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);

  // The URL is the source of truth for the query, so searches survive refresh and can be shared.
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === q) return undefined;
    const timer = setTimeout(() => setParams(trimmed ? { q: trimmed } : {}, { replace: true }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, q, setParams]);

  const load = useCallback(async () => {
    const id = (requestId.current += 1);
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const data = await searchGames({ q: q || undefined, limit: PAGE_SIZE });
      if (id === requestId.current) setState({ status: 'success', ...data, error: null });
    } catch (err) {
      if (id === requestId.current) setState((s) => ({ ...s, status: 'error', error: getErrorInfo(err).message }));
    }
  }, [q]);

  useEffect(() => {
    load();
    return () => {
      requestId.current += 1; // ignore a response that arrives after the query changed
    };
  }, [load]);

  async function loadMore() {
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const data = await searchGames({ q: q || undefined, limit: PAGE_SIZE, cursor: state.nextCursor });
      // Drop the page if the query changed while it was loading.
      if (id === requestId.current) {
        setState((s) => ({ ...s, items: [...s.items, ...data.items], nextCursor: data.nextCursor }));
      }
    } catch (err) {
      if (id === requestId.current) toast.error(getErrorInfo(err).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Explore</h1>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <Input
          type="search"
          aria-label="Search games"
          placeholder="Search for a game"
          className="pl-9"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      {state.status === 'loading' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" role="status" aria-label="Loading games">
          {Array.from({ length: 10 }, (_, i) => (
            <GameCardSkeleton key={i} />
          ))}
        </div>
      )}

      {state.status === 'error' && <ErrorState message={state.error} onRetry={load} />}

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
              title={q ? `No games found for "${q}"` : 'No games yet'}
              description={q ? 'Try a different spelling or a shorter search.' : 'Search for a game by name to add it to the catalog.'}
            />
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {state.items.map((game) => (
                  <li key={game.id}>
                    <GameCard game={game} />
                  </li>
                ))}
              </ul>
              {state.nextCursor && (
                <Button variant="secondary" className="self-center" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

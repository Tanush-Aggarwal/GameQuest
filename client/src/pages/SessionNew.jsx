import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { GameCover } from '@/components/games/GameCard.jsx';
import { SessionForm } from '@/components/sessions/SessionForm.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import { getGame, searchGames } from '@/services/gamesApi.js';
import { listLibrary } from '@/services/libraryApi.js';
import { createSession } from '@/services/sessionsApi.js';

const DEBOUNCE_MS = 300;

// Games from the player's own library, the ones they are playing first: most sessions are for one of these.
function useLibraryGames() {
  const load = useCallback(async (signal) => {
    try {
      const data = await listLibrary({ limit: 50 }, { signal });
      const order = { playing: 0, backlog: 1, completed: 2, wishlist: 3, dropped: 4 };
      return (data?.items ?? [])
        .filter((e) => e.game)
        .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9))
        .slice(0, 16)
        .map((e) => ({ ...e.game, status: e.status }));
    } catch {
      return [];
    }
  }, []);
  return useAsync(load);
}

function CoverGrid({ games, onPick, label }) {
  return (
    <ul aria-label={label} className="gq-swap-in grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
      {games.map((g, i) => (
        <li key={g.id} style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }}>
          <button type="button" onClick={() => onPick(g)} className="group flex w-full flex-col gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text">
            <span className="block overflow-hidden rounded-[8px] bg-surface-raised ring-1 ring-border transition-[box-shadow] group-hover:ring-2 group-hover:ring-text">
              <GameCover game={g} compact />
            </span>
            <span className="line-clamp-2 text-sm font-medium leading-snug text-text">{g.title}</span>
            {g.status && <span className="-mt-1.5 text-xs capitalize text-text-muted">{g.status}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function GamePicker({ onPick }) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const searchable = query.length >= 2;
  const load = useCallback((signal) => (searchable ? searchGames({ q: query, limit: 16 }, { signal }) : Promise.resolve({ items: [] })), [query, searchable]);
  const { status, data, error, retry } = useAsync(load);
  const library = useLibraryGames();

  return (
    <div className="flex flex-col gap-8">
      <div className="relative max-w-2xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          type="search"
          aria-label="Search for a game"
          placeholder="Search for a game"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-12 w-full rounded-[8px] border border-border bg-surface pl-11 pr-4 text-[15px] text-text placeholder:text-text-muted hover:border-text-muted focus:border-text focus:outline-none"
        />
      </div>

      <p className="-mt-5 text-[13px] text-text-muted">Type 2 letters to search the whole catalog.</p>

      {searchable ? (
        <section key="results" aria-labelledby="results-title" className="flex flex-col gap-5">
          <h2 id="results-title" className="text-base font-semibold text-text">
            Results for “{query}”
          </h2>
          {status === 'loading' && <Skeleton className="h-48 w-full" role="status" aria-label="Searching games" />}
          {status === 'error' && <ErrorState message={error.message} onRetry={retry} />}
          {status === 'success' && data.items.length === 0 && <EmptyState icon={Search} title={`No games found for “${query}”`} description="Try a different spelling." />}
          {status === 'success' && data.items.length > 0 && <CoverGrid games={data.items} onPick={onPick} label="Search results" />}
        </section>
      ) : (
        <section key="library" aria-labelledby="library-title" className="flex flex-col gap-5">
          <h2 id="library-title" className="text-base font-semibold text-text">
            From your library
          </h2>
          {library.status === 'loading' && <Skeleton className="h-48 w-full" role="status" aria-label="Loading your library" />}
          {library.status === 'success' && library.data.length === 0 && <p className="text-[15px] text-text-muted">Your library is empty. Search above for any game.</p>}
          {library.status === 'success' && library.data.length > 0 && <CoverGrid games={library.data} onPick={onPick} label="Your games" />}
        </section>
      )}
    </div>
  );
}

export default function SessionNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const slug = params.get('game');
  const [chosen, setChosen] = useState(undefined); // undefined = use the ?game= preset, null = cleared, object = picked

  // A game page links here with ?game=<slug>; otherwise the player searches for one.
  const loadPreset = useCallback((signal) => (slug ? getGame(slug, { signal }) : Promise.resolve(null)), [slug]);
  const preset = useAsync(loadPreset);
  const game = chosen === undefined ? (preset.status === 'success' ? preset.data : null) : chosen;
  const presetLoading = slug && chosen === undefined && preset.status === 'loading';

  async function handleCreate(payload) {
    try {
      const session = await createSession(payload);
      toast.success('Session scheduled');
      navigate(`/sessions/${session.id}`);
    } catch (err) {
      throw new Error(getErrorInfo(err).message);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <Link to="/sessions" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Sessions
      </Link>
      {!game && (
        <header className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-raised text-text" aria-hidden="true">
            <CalendarPlus className="h-6 w-6" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-[28px] font-semibold tracking-[-0.02em] text-text">Schedule a session</h1>
            <p className="text-[15px] text-text-muted">Pick a game to start. You choose the time and invite friends next.</p>
          </div>
        </header>
      )}
      {game && <h1 className="sr-only">Schedule a session</h1>}

      {presetLoading && <Skeleton className="h-24 w-full" role="status" aria-label="Loading game" />}
      {slug && chosen === undefined && preset.status === 'error' && <ErrorState message={preset.error.message} onRetry={preset.retry} />}

      {!game && !presetLoading && <GamePicker onPick={setChosen} />}

      {game && <SessionForm gameId={game.id} game={game} onChangeGame={() => setChosen(null)} submitLabel="Schedule session" onSubmit={handleCreate} onCancel={() => navigate('/sessions')} />}
    </section>
  );
}

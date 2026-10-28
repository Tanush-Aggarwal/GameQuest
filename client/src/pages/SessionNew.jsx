import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, RefreshCw, Search } from 'lucide-react';
import { BackdropHero } from '@/components/art/BackdropHero.jsx';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { GameCover } from '@/components/games/GameCard.jsx';
import { SessionForm } from '@/components/sessions/SessionForm.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import { getGame, searchGames } from '@/services/gamesApi.js';
import { createSession } from '@/services/sessionsApi.js';

const DEBOUNCE_MS = 300;

function GamePicker({ onPick }) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const searchable = query.length >= 2;
  const load = useCallback((signal) => (searchable ? searchGames({ q: query, limit: 8 }, { signal }) : Promise.resolve({ items: [] })), [query, searchable]);
  const { status, data, error, retry } = useAsync(load);

  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-sm">
      <div>
        <h2 className="font-heading text-base font-bold text-text">Pick a game</h2>
        <p className="text-xs text-text-muted">Search the catalog; the session page uses its art.</p>
      </div>
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <Input type="search" aria-label="Search for a game" placeholder="Which game are you playing?" className="h-12 pl-9" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {!searchable && <p className="text-sm text-text-muted">Type at least 2 letters of the game’s name.</p>}
      {searchable && status === 'loading' && <Skeleton className="h-24 w-full" role="status" aria-label="Searching games" />}
      {searchable && status === 'error' && <ErrorState message={error.message} onRetry={retry} />}
      {searchable && status === 'success' && data.items.length === 0 && (
        <EmptyState icon={Search} title={`No games found for “${query}”`} description="Try a different spelling." />
      )}
      {searchable && status === 'success' && data.items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {data.items.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onPick(g)}
                className="group flex w-full flex-col gap-2 rounded-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text"
              >
                <div className="overflow-hidden rounded-[10px] border border-border shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                  <GameCover game={g} compact />
                </div>
                <span className="line-clamp-2 text-sm font-semibold text-text">{g.title}</span>
              </button>
            </li>
          ))}
        </ul>
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
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-raised text-text" aria-hidden="true">
          <CalendarPlus className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-text">Schedule a session</h1>
          <p className="text-sm text-text-muted">Pick a game, choose a time and invite your friends.</p>
        </div>
      </header>

      {presetLoading && <Skeleton className="h-24 w-full" role="status" aria-label="Loading game" />}
      {slug && chosen === undefined && preset.status === 'error' && <ErrorState message={preset.error.message} onRetry={preset.retry} />}

      {!game && !presetLoading && <GamePicker onPick={setChosen} />}

      {game && (
        <>
          <BackdropHero art={game} seed={game.title} className="px-5 py-6 sm:px-8">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="w-16 shrink-0 overflow-hidden rounded-[10px] shadow-2xl ring-1 ring-white/20 sm:w-20"><GameCover game={game} compact /></div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-widest text-white/70">Game</p>
                <p className="truncate font-heading text-2xl font-bold text-white sm:text-3xl">{game.title}</p>
              </div>
              <Button variant="ghost" onClick={() => setChosen(null)} aria-label="Change game" className="bg-white/10 text-white ring-1 ring-white/20 backdrop-blur-sm hover:bg-white/20">
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Change
              </Button>
            </div>
          </BackdropHero>
          <SessionForm gameId={game.id} submitLabel="Schedule session" onSubmit={handleCreate} onCancel={() => navigate('/sessions')} />
        </>
      )}
    </section>
  );
}

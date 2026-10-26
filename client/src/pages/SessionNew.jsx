import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
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
    <div className="flex flex-col gap-3">
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <Input type="search" aria-label="Search for a game" placeholder="Which game are you playing?" className="pl-9" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {!searchable && <p className="text-sm text-text-muted">Type at least 2 letters of the game’s name.</p>}
      {searchable && status === 'loading' && <Skeleton className="h-24 w-full" role="status" aria-label="Searching games" />}
      {searchable && status === 'error' && <ErrorState message={error.message} onRetry={retry} />}
      {searchable && status === 'success' && data.items.length === 0 && (
        <EmptyState icon={Search} title={`No games found for “${query}”`} description="Try a different spelling." />
      )}
      {searchable && status === 'success' && data.items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.items.map((g) => (
            <li key={g.id}>
              <button type="button" onClick={() => onPick(g)} className="flex min-h-11 w-full items-center gap-3 rounded-card border border-border bg-surface p-2 text-left hover:bg-surface-raised">
                <div className="w-10 shrink-0 overflow-hidden rounded-control"><GameCover game={g} compact /></div>
                <span className="text-sm font-semibold">{g.title}</span>
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
      <h1 className="text-2xl font-bold">Schedule a session</h1>

      {presetLoading && <Skeleton className="h-24 w-full" role="status" aria-label="Loading game" />}
      {slug && chosen === undefined && preset.status === 'error' && <ErrorState message={preset.error.message} onRetry={preset.retry} />}

      {!game && !presetLoading && <GamePicker onPick={setChosen} />}

      {game && (
        <>
          <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-3">
            <div className="w-12 shrink-0 overflow-hidden rounded-control"><GameCover game={game} compact /></div>
            <div className="flex-1">
              <p className="text-xs text-text-muted">Game</p>
              <p className="font-semibold">{game.title}</p>
            </div>
            <Button variant="ghost" onClick={() => setChosen(null)} aria-label="Change game">Change</Button>
          </div>
          <SessionForm gameId={game.id} submitLabel="Schedule session" onSubmit={handleCreate} onCancel={() => navigate('/sessions')} />
        </>
      )}
    </section>
  );
}

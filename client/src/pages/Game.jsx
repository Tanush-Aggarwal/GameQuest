import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { GameCover } from '@/components/games/GameCard.jsx';
import { GameLibraryPanel } from '@/components/library/GameLibraryPanel.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getGame } from '@/services/gamesApi.js';

function TimeToBeat({ timeToBeat }) {
  const rows = [
    ['Main story', timeToBeat.main],
    ['Main + extras', timeToBeat.extras],
    ['Completionist', timeToBeat.full],
  ];
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Clock className="h-4 w-4 text-text-muted" aria-hidden="true" /> Time to beat
      </h2>
      <dl className="flex flex-col gap-1 text-sm">
        {rows.map(([label, hours]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-text-muted">{label}</dt>
            <dd className="tabular-nums">{hours ? `${hours} h` : '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function GameSkeleton() {
  return (
    <div className="flex flex-col gap-6 md:flex-row" role="status" aria-label="Loading game">
      <Skeleton className="aspect-[3/4] w-48 shrink-0" />
      <div className="flex flex-1 flex-col gap-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

export default function Game() {
  const { slug } = useParams();
  const load = useCallback((signal) => getGame(slug, { signal }), [slug]);
  const { status, data: game, error, retry } = useAsync(load);
  return (
    <section className="flex flex-col gap-6">
      <Link to="/explore" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Explore
      </Link>

      {status === 'loading' && <GameSkeleton />}

      {status === 'error' &&
        (error.status === 404 ? (
          <EmptyState title="Game not found" description="This game isn't in the catalog. Try searching for it." actionLabel="Search games" actionTo="/explore" />
        ) : (
          <ErrorState message={error.message} onRetry={retry} />
        ))}

      {status === 'success' && (
        <div className="flex flex-col gap-6 md:flex-row">
          <div className="w-48 shrink-0 overflow-hidden rounded-card border border-border">
            <GameCover game={game} />
          </div>
          <div className="flex flex-1 flex-col gap-4">
            <div>
              <h1 className="text-3xl font-bold">{game.title}</h1>
              <p className="text-sm text-text-muted">
                {[game.releaseDate && new Date(game.releaseDate).getUTCFullYear(), game.genres.join(', ')].filter(Boolean).join(' · ')}
              </p>
            </div>
            {game.platforms.length > 0 && <p className="text-sm text-text-muted">{game.platforms.join(' · ')}</p>}
            <p className="max-w-prose text-sm">{game.summary || 'No description available yet.'}</p>
            <GameLibraryPanel game={game} />
            <div className="max-w-xs">
              <TimeToBeat timeToBeat={game.timeToBeat} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

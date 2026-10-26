import { Gamepad2 } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Normalises cover URLs so that IGDB images render in high resolution (2x retina / 1080p).
 */
export function getHighResCover(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('images.igdb.com/igdb/image/upload/t_cover_big/')) {
    return url.replace('/t_cover_big/', '/t_cover_big_2x/');
  }
  return url;
}

export function GameCover({ game, className = '' }) {
  const coverUrl = getHighResCover(game?.cover);
  return coverUrl ? (
    <img src={coverUrl} alt="" loading="lazy" className={`aspect-[3/4] w-full object-cover ${className}`} />
  ) : (
    <div className={`flex aspect-[3/4] w-full items-center justify-center bg-surface-raised ${className}`}>
      <Gamepad2 className="h-8 w-8 text-text-muted" aria-hidden="true" />
    </div>
  );
}

export function GameCard({ game }) {
  const year = game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;
  return (
    <Link
      to={`/games/${game.slug}`}
      className="group flex flex-col overflow-hidden rounded-card border border-border bg-surface transition-colors hover:bg-surface-raised"
    >
      <GameCover game={game} />
      <div className="flex flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold">{game.title}</h3>
        <p className="text-xs text-text-muted">{[year, game.genres[0]].filter(Boolean).join(' · ') || 'Game'}</p>
      </div>
    </Link>
  );
}

export function GameCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface" aria-hidden="true">
      <div className="aspect-[3/4] w-full animate-pulse bg-surface-raised" />
      <div className="flex flex-col gap-2 p-3">
        <div className="h-4 w-3/4 animate-pulse rounded-control bg-surface-raised" />
        <div className="h-3 w-1/2 animate-pulse rounded-control bg-surface-raised" />
      </div>
    </div>
  );
}

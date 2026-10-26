import { useState } from 'react';
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

// IGDB covers come in two sizes (264x374 and 528x748); other URLs have a single size.
export function coverSrcSet(url) {
  if (typeof url !== 'string') return undefined;
  const match = /^(.*\/upload\/)t_cover_big(?:_2x)?(\/[^/]+)$/.exec(url);
  return match ? `${match[1]}t_cover_big${match[2]} 1x, ${match[1]}t_cover_big_2x${match[2]} 2x` : undefined;
}

const hueOf = (text) => {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
};

/**
 * A cover that is never a blank box: lazy-loaded IGDB art with srcset, or (no art / failed load) a
 * gradient generated from the title with the title on top. `compact` hides the title on tiny thumbnails.
 * Size and shape come from `className`, which applies to both the image and the fallback.
 */
export function CoverImage({ cover, title = '', alt = '', className = '', sizes, compact = false }) {
  const [failedUrl, setFailedUrl] = useState(null); // keyed by URL so a new cover gets a fresh try
  if (cover && failedUrl !== cover) {
    return (
      <img
        src={getHighResCover(cover)}
        srcSet={coverSrcSet(cover)}
        sizes={sizes}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(cover)}
        className={`object-cover ${className}`}
      />
    );
  }
  const hue = hueOf(title || 'game');
  return (
    <div
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      style={{ backgroundImage: `linear-gradient(150deg, hsl(${hue} 55% 30%), hsl(${(hue + 50) % 360} 60% 14%))` }}
      className={`flex items-center justify-center overflow-hidden p-1.5 text-center ${className}`}
    >
      {!compact && title && <span className="line-clamp-4 break-words text-xs font-semibold leading-tight text-white/90">{title}</span>}
    </div>
  );
}

export function GameCover({ game, className = '', compact = false }) {
  return (
    <CoverImage
      cover={game?.cover}
      title={game?.title}
      compact={compact}
      sizes="(min-width: 768px) 200px, 45vw"
      className={`aspect-[3/4] w-full ${className}`}
    />
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

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Gamepad2, Heart, Layers, Star } from 'lucide-react';
import { useMotionOk } from '@/lib/motion.js';

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

// A cover that glides to the same game's cover on the page you navigate to (a framer layoutId shared by the card and
// the game page hero). No glide, and no layout tracking at all, when the viewer prefers reduced motion.
export function SharedCover({ slug, className = '', children }) {
  const motionOk = useMotionOk();
  if (!motionOk || !slug) return <div className={className}>{children}</div>;
  return (
    <motion.div layoutId={`cover-${slug}`} data-shared-cover={slug} className={className}>
      {children}
    </motion.div>
  );
}

export const ARTWORK_LOOKUP = {
  'hollow-knight-silksong': '/assets/trending-hollow-knight.jpg',
  'elden-ring': '/assets/trending-elden-ring.jpg',
  'clair-obscur-expedition-33': '/assets/trending-clair-obscur.jpg',
  'hades': '/assets/trending-hades-2.jpg',
  'zenless-zone-zero': '/assets/trending-zenless.jpg',
  'genshin-impact': '/assets/rec-genshin.jpg',
};

export function getGameArtwork(game) {
  if (!game) return null;
  if (game.slug && ARTWORK_LOOKUP[game.slug]) return ARTWORK_LOOKUP[game.slug];
  const lowerTitle = (game.title || '').toLowerCase();
  if (lowerTitle.includes('silksong')) return '/assets/trending-hollow-knight.jpg';
  if (lowerTitle.includes('elden ring')) return '/assets/trending-elden-ring.jpg';
  if (lowerTitle.includes('clair obscur') || lowerTitle.includes('expedition 33')) return '/assets/trending-clair-obscur.jpg';
  if (lowerTitle.includes('hades')) return '/assets/trending-hades-2.jpg';
  if (lowerTitle.includes('zenless')) return '/assets/trending-zenless.jpg';
  if (lowerTitle.includes('genshin')) return '/assets/rec-genshin.jpg';
  return null;
}

export function GameCard({ game, shared = true }) {
  const rating = game.ratingAvg > 0
    ? game.ratingAvg.toFixed(1)
    : (game.totalRating ? (game.totalRating / 10).toFixed(1) : null);
  const artwork = getGameArtwork(game);

  return (
    <Link
      to={`/games/${game.slug}`}
      className="gq-game-card group relative flex flex-col aspect-[3/4] w-full overflow-hidden rounded-[10px] bg-[#161816] text-white transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="relative h-full w-full overflow-hidden">
        <SharedCover slug={shared ? game.slug : null} className="h-full w-full">
          {artwork ? (
            <img
              src={artwork}
              alt={game.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <GameCover game={game} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          )}
        </SharedCover>

        {/* Top-right heart / wishlist icon */}
        <div className="absolute top-2.5 right-2.5 rounded-full bg-black/40 p-1.5 backdrop-blur-xs text-white/80 transition-colors group-hover:text-white" aria-hidden="true">
          <Heart className="h-3.5 w-3.5" />
        </div>

        {/* Bottom dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 via-45% to-transparent pointer-events-none" />

        {/* Overlaid details at bottom */}
        <div className="absolute inset-x-0 bottom-0 p-3 flex flex-col gap-1 z-10">
          <h3 className="line-clamp-2 text-xs sm:text-sm font-bold leading-tight text-white drop-shadow-sm">
            {game.title}
          </h3>
          <div className="flex items-center justify-between text-xs pt-0.5">
            <div className="flex items-center gap-1.5 text-gray-400">
              <Gamepad2 className="h-3 w-3" aria-hidden="true" />
              <Layers className="h-3 w-3" aria-hidden="true" />
            </div>
            {rating && (
              <span className="flex items-center gap-1 font-bold text-[#E58A2B]">
                <Star className="h-3 w-3 fill-[#E58A2B] text-[#E58A2B]" aria-hidden="true" />
                {rating}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function GameCardSkeleton() {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[10px] bg-[#161816]" aria-hidden="true">
      <div className="h-full w-full animate-pulse bg-white/5" />
      <div className="absolute inset-x-0 bottom-0 p-3 flex flex-col gap-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
        <div className="flex items-center justify-between">
          <div className="h-3 w-1/3 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-8 animate-pulse rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}

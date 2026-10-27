import { useState } from 'react';
import { cn } from '@/lib/utils.js';
import { artImageUrl, artImageSrcSet, fallbackGradient } from '@/lib/art.js';

// Text sits on the left over a dark gradient scrim (black 85% to transparent over the left 55%),
// ensuring the artwork retains full vividness without being washed out by any cream/ivory overlay.
export const HERO_SCRIM_SIDE = 'bg-gradient-to-r from-black/85 via-black/60 via-55% to-transparent';
export const HERO_SCRIM_BOTTOM = 'bg-gradient-to-t from-black/80 via-black/20 to-transparent';

// Art wider than this (IGDB sometimes stores a logo strip or a banner, e.g. 1920x295) is no backdrop: it would be a black
// band with nothing in it, so the hero moves on to the next candidate.
export const MAX_BACKDROP_RATIO = 2.8;

// A full-width cinematic header: the game's backdrop at its largest size behind a dark scrim, content on top.
// `art` is { backdrop, cover } (or a URL). Candidates, in order: the backdrop, then the cover (blurred, so it reads as
// colour); one that fails to load, or is too wide to be a backdrop, is skipped. With none left there is a gradient from
// `seed`, never a flat box. The image is the likely largest paint of the page, so it loads eagerly with high priority.
export function BackdropHero({ art, seed = '', as: Tag = 'section', className, children, ...rest }) {
  const own = typeof art === 'string' ? { backdrop: art } : art;
  const backdropUrl = artImageUrl(own?.backdrop, 'hero');
  const coverUrl = artImageUrl(own?.cover, 'cover');
  const [rejected, setRejected] = useState(() => new Set());
  const reject = (u) => setRejected((s) => (s.has(u) ? s : new Set(s).add(u)));
  const url = [backdropUrl, coverUrl].find((u) => u && !rejected.has(u)) ?? null;
  const usable = Boolean(url);
  const [loadedUrl, setLoadedUrl] = useState(null);
  // true when the picture can be shown; a too-wide backdrop is rejected instead
  const accept = (img) => {
    if (url === backdropUrl && img.naturalHeight > 0 && img.naturalWidth / img.naturalHeight > MAX_BACKDROP_RATIO) {
      reject(url);
      return;
    }
    setLoadedUrl(url);
  };
  return (
    <Tag
      data-hero={usable ? 'art' : 'gradient'}
      className={cn('relative isolate overflow-hidden rounded-none border-y border-white/10 bg-[#111311] text-white sm:rounded-card sm:border', className)}
      {...rest}
    >
      <div
        aria-hidden="true"
        data-art={usable ? (url === backdropUrl ? 'backdrop' : 'cover') : 'gradient'}
        className="pointer-events-none absolute inset-0 -z-10"
      >
        {usable ? (
          (() => {
            const responsive = artImageSrcSet(url, url === backdropUrl ? 'hero' : 'cover');
            return (
              <img
                key={url}
                ref={(el) => {
                  if (el?.complete && el.naturalWidth > 0) accept(el);
                }}
                src={url}
                srcSet={responsive?.srcSet}
                sizes={responsive?.sizes}
                alt=""
                fetchPriority="high"
                decoding="async"
                onLoad={(e) => accept(e.currentTarget)}
                onError={() => reject(url)}
                className={cn(
                  'h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-500',
                  loadedUrl === url ? 'opacity-100' : 'opacity-0',
                  url === coverUrl && 'scale-125 blur-2xl',
                )}
              />
            );
          })()
        ) : (
          <div className="h-full w-full" style={{ backgroundImage: fallbackGradient(seed) }} />
        )}
        <div className={cn('absolute inset-0', HERO_SCRIM_SIDE)} />
        <div className={cn('absolute inset-0', HERO_SCRIM_BOTTOM)} />
      </div>
      {children}
    </Tag>
  );
}

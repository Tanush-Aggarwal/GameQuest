import { useState } from 'react';
import { cn } from '@/lib/utils.js';
import { artImageUrl, artImageSrcSet, fallbackGradient } from '@/lib/art.js';
import { heroCandidates, useBestArt } from '@/lib/artPicker.js';
import { heroFrameStyle } from '@/lib/heroFrame.js';

// Text sits on the left over a dark gradient scrim (black 85% to transparent over the left 55%),
// ensuring the artwork retains full vividness without being washed out by any cream/ivory overlay.
const HERO_SCRIM_SIDE = 'bg-gradient-to-r from-black/85 via-black/60 via-55% to-transparent';
const HERO_SCRIM_BOTTOM = 'bg-gradient-to-t from-black/80 via-black/20 to-transparent';

// Art wider than this (IGDB sometimes stores a logo strip or a banner, e.g. 1920x295) is no backdrop: it would be a black
// band with nothing in it, so the hero moves on to the next candidate.
export const MAX_BACKDROP_RATIO = 3.3; // Steam's library hero (3840x1240, 3.1:1) is made for banners and fits

// Shared size for the two profile headers (your Profile & Settings page and the public profile), so moving between
// them doesn't make the banner jump.
export const PROFILE_HERO_CLASS = 'flex min-h-[260px] flex-col justify-center px-5 py-8 sm:min-h-[320px] sm:px-10 sm:py-10';

// A full-width cinematic header: the game's backdrop at its largest size behind a dark scrim, content on top.
// `art` is { backdrop, cover } (or a URL). Candidates, in order: the backdrop, then the cover (blurred, so it reads as
// colour); one that fails to load, or is too wide to be a backdrop, is skipped. With none left there is a gradient from
// `seed`, never a flat box. The image is the likely largest paint of the page, so it loads eagerly with high priority.
export function BackdropHero({ art, seed = '', as: Tag = 'section', className, children, ...rest }) {
  const own = typeof art === 'string' ? { backdrop: art } : art;
  // Wide candidates in order of reliability (Steam banner art, screenshots, then IGDB art; see heroCandidates);
  // the blurred cover is only the last resort.
  // An administrator's choice (header editor) wins: that picture, framed the way they set it.
  const override = own?.heroOverride?.url ? own.heroOverride : null;
  const wideUrls = (override ? [override.url] : heroCandidates(own))
    .map((a) => artImageUrl(a, 'hero'))
    .filter(Boolean);
  const coverUrl = artImageUrl(own?.cover, 'cover');
  const [rejected, setRejected] = useState(() => new Set());
  const reject = (u) => setRejected((s) => (s.has(u) ? s : new Set(s).add(u)));
  // The best-looking wide candidate for a banner (logos, blank strips, tiny headers and badly shaped art are skipped;
  // see lib/artPicker.js). Until it is known the header shows its gradient; the blurred cover is the last resort.
  const best = useBestArt(wideUrls, rejected);
  const url = best.url ?? (best.settled && coverUrl && !rejected.has(coverUrl) ? coverUrl : null);
  const isWide = Boolean(url) && url !== coverUrl;
  const backdropUrl = isWide ? url : null;
  const usable = Boolean(url);
  const [loadedUrl, setLoadedUrl] = useState(null);
  // true when the picture can be shown; a too-wide backdrop is rejected instead
  const accept = (img) => {
    if (override) {
      setLoadedUrl(url); // chosen by hand: shown as it is
      return;
    }
    const ratio = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 0;
    // too wide (a logo strip), too square (a logo or key art that would be zoomed in) or too small to fill a banner
    const misfit = ratio > MAX_BACKDROP_RATIO || (ratio > 0 && ratio < 1.3) || img.naturalWidth < 800;
    const hasNextWide = wideUrls.some((u) => u !== url && !rejected.has(u));
    // (the picker already measured shape and content; this check is the safety net when it couldn't)
    if (url === backdropUrl && img.naturalHeight > 0 && (ratio > MAX_BACKDROP_RATIO || (misfit && hasNextWide))) {
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
        data-picked={best.settled ? 'yes' : 'pending'}
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
                style={override && url === artImageUrl(override.url, 'hero') ? heroFrameStyle(override) : undefined}
                className={cn(
                  'h-full w-full object-cover object-[center_30%] motion-safe:transition-opacity motion-safe:duration-500',
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

import { useState } from 'react';
import { cn } from '@/lib/utils.js';
import { artImageUrl, fallbackGradient } from '@/lib/art.js';
import { useArt } from './useArt.js';

// Readability: the art is shown at 60% and covered by a scrim that is at least 70% --bg. Even for pure white art
// the pixel behind the text is about #3a3b40, so --text-muted (#a3a8bd) keeps about 4.7:1 and --text far more.
// Real game art is darker than white, so it does better. Do not lighten these without re-checking.
// (tailwind.test.js compiles these classes: Tailwind silently drops an opacity it cannot apply.)
export const ART_IMAGE_CLASS = 'opacity-60';
export const ART_SCRIM_CLASS = 'bg-gradient-to-r from-bg/90 via-bg/80 to-bg/70';

function ArtLayer({ art, seed, waiting }) {
  const backdrop = artImageUrl(art?.backdrop, 'backdrop');
  const cover = artImageUrl(art?.cover, 'cover');
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = backdrop ?? cover;
  const usable = url && !failed;
  const kind = usable ? (backdrop ? 'backdrop' : 'cover') : 'gradient';
  return (
    <div aria-hidden="true" data-art={waiting ? 'pending' : kind} className="pointer-events-none absolute inset-0 -z-10">
      {/* While the shared art is still loading nothing is drawn (no gradient that flashes and is then replaced) */}
      {!waiting && usable && (
        <img
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0) setLoaded(true); // already cached by the browser
          }}
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          // fades in when it arrives; a cover is tall and small, so it is scaled and blurred to read as colour
          className={cn(
            'h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-500',
            loaded ? ART_IMAGE_CLASS : 'opacity-0',
            kind === 'cover' && 'scale-125 blur-2xl',
          )}
        />
      )}
      {!waiting && !usable && <div className="h-full w-full" style={{ backgroundImage: fallbackGradient(seed) }} />}
      <div className={cn('absolute inset-0', ART_SCRIM_CLASS)} />
    </div>
  );
}

// A section with game art behind it. `art` is the game's own art ({ backdrop, cover } or a URL) when the
// section is about one game; otherwise `seed` (any string naming the section) picks a stable game from the
// shared pool. No art at all gives a gradient from the seed, never a flat grey card.
export function ArtPanel({ as: Tag = 'section', art, seed = '', className, children, ...rest }) {
  const { artFor, status } = useArt();
  const own = typeof art === 'string' ? { backdrop: art } : art;
  const hasOwn = Boolean(own && (own.backdrop || own.cover));
  const resolved = hasOwn ? own : artFor(seed);
  const waiting = !hasOwn && status === 'loading'; // the pool is not here yet
  const key = `${resolved?.backdrop ?? resolved?.cover ?? 'none'}:${waiting}`;
  return (
    <Tag className={cn('relative isolate overflow-hidden rounded-card border border-border bg-surface', className)} {...rest}>
      <ArtLayer key={key} art={resolved} seed={seed} waiting={waiting} />
      {children}
    </Tag>
  );
}

// The title band at the top of a page.
export function ArtHeader({ title, subtitle, actions, seed, art, children, className }) {
  return (
    <ArtPanel as="header" seed={seed ?? String(title)} art={art} className={cn('px-5 py-6', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </ArtPanel>
  );
}

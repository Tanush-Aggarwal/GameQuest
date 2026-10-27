import { useState } from 'react';
import { cn } from '@/lib/utils.js';
import { artImageUrl, fallbackGradient } from '@/lib/art.js';

// Text sits on the left over --bg at 90-100%, so --text and --text-muted keep their contrast whatever the art is;
// the bottom fades into the page. (tailwind.test.js compiles these classes.)
export const HERO_SCRIM_SIDE = 'bg-gradient-to-r from-bg via-bg/75 to-bg/10';
export const HERO_SCRIM_BOTTOM = 'bg-gradient-to-t from-bg via-transparent to-transparent';

// A full-width cinematic header: the game's backdrop at its largest size behind a scrim, content on top.
// `art` is { backdrop, cover } (or a URL); with no usable art there is a gradient from `seed`, never a flat box.
// The image is the likely largest paint of the page, so it loads eagerly with high priority.
export function BackdropHero({ art, seed = '', as: Tag = 'section', className, children, ...rest }) {
  const own = typeof art === 'string' ? { backdrop: art } : art;
  const url = artImageUrl(own?.backdrop, 'hero') ?? artImageUrl(own?.cover, 'cover');
  const [failedUrl, setFailedUrl] = useState(null);
  const usable = Boolean(url) && failedUrl !== url;
  const [loadedUrl, setLoadedUrl] = useState(null);
  return (
    <Tag
      data-hero={usable ? 'art' : 'gradient'}
      className={cn('relative isolate overflow-hidden rounded-none border-y border-border bg-surface sm:rounded-card sm:border', className)}
      {...rest}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        {usable ? (
          <img
            key={url}
            ref={(el) => {
              if (el?.complete && el.naturalWidth > 0) setLoadedUrl(url);
            }}
            src={url}
            alt=""
            fetchPriority="high"
            decoding="async"
            onLoad={() => setLoadedUrl(url)}
            onError={() => setFailedUrl(url)}
            className={cn(
              'h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-500',
              loadedUrl === url ? 'opacity-100' : 'opacity-0',
              !own?.backdrop && 'scale-125 blur-2xl',
            )}
          />
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

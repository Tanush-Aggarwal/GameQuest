import { useCallback } from 'react';
import { useAsync } from '@/hooks/useAsync.js';
import { artImageUrl, fallbackGradient } from '@/lib/art.js';
import { getPublicCovers } from '@/services/publicApi.js';

const COLUMNS = 6;
const MIN_PER_COPY = 8; // a column's repeating unit is at least this many covers: taller than any screen's share of it

// Splits the covers into COLUMNS columns, dealing them out in turn so neighbours differ.
export function toColumns(covers, columns = COLUMNS) {
  const out = Array.from({ length: columns }, () => []);
  covers.forEach((cover, i) => out[i % columns].push(cover));
  return out.filter((c) => c.length);
}

// One column's repeating unit: its covers, repeated until there are enough to fill more than a screen.
export function repeatingUnit(column, min = MIN_PER_COPY) {
  return Array.from({ length: Math.ceil(min / column.length) }, () => column).flat();
}

// A full-screen, tilted collage of popular covers drifting slowly behind the sign-in card. Purely decorative
// (aria-hidden, no focus) and it fails soft: while it loads, or if the covers cannot be fetched, the page shows a
// calm gradient and nothing else changes. Each column is its covers twice over, so sliding by half of it loops
// without a seam (the padding at the bottom of a column makes half of it exactly one repeat). Reduced motion stops
// the drift. A scrim over everything keeps the card's text readable.
export function CoverCollage() {
  const load = useCallback((signal) => getPublicCovers({ signal }), []);
  const { status, data } = useAsync(load);
  // the regular cover size: they are drawn small
  const covers = status === 'success' ? (data ?? []).map((c) => artImageUrl(c.cover, 'cover')).filter(Boolean) : [];
  const columns = toColumns(covers);

  return (
    <div aria-hidden="true" data-collage={columns.length ? 'covers' : 'gradient'} className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg">
      <div className="absolute inset-0" style={{ backgroundImage: fallbackGradient('gamequest-sign-in') }} />
      {columns.length > 0 && (
        <div className="absolute -inset-[20%] flex -rotate-12 justify-center gap-4">
          {columns.map((column, i) => (
            <div
              key={i}
              // the last two columns only on wider screens: fewer images to fetch on a phone
              className={`${i >= 4 ? 'hidden sm:flex' : 'flex'} w-36 shrink-0 transform-gpu flex-col gap-4 pb-4 sm:w-44 ${i % 2 ? 'animate-drift-down' : 'animate-drift-up'} motion-reduce:animate-none`}
            >
              {[...repeatingUnit(column), ...repeatingUnit(column)].map((cover, n) => (
                <img
                  key={n}
                  src={cover}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-[3/4] w-full rounded-card border border-border object-cover"
                />
              ))}
            </div>
          ))}
        </div>
      )}
      {/* the scrim: the covers stay a texture, never competing with the form */}
      <div className="absolute inset-0 bg-bg/75" />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-transparent to-bg/80" />
    </div>
  );
}
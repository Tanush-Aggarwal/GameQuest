import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { screenshotFull, screenshotThumb } from '@/lib/art.js';

const MAX_THUMBS = 8;

// A grid of screenshot thumbnails; clicking one opens a lightbox (Radix Dialog: focus trap, Escape closes) with
// previous/next buttons, the left/right arrow keys and a counter. Focus goes back to the thumbnail that opened it.
// Renders nothing when the game has no screenshots.
export function ScreenshotGallery({ title, screenshots = [], compact = false }) {
  const shots = screenshots.filter(Boolean);
  const [index, setIndex] = useState(null);
  const [pairOffset, setPairOffset] = useState(0);
  const opener = useRef(null);
  if (!shots.length) return null;

  const total = shots.length;
  const open = index !== null;
  const go = (step) => setIndex((i) => (i + step + total) % total);
  const alt = (i) => `${title} screenshot ${i + 1} of ${total}`;

  function onKeyDown(e) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    }
  }

  const currentPair = compact ? shots.slice(pairOffset, pairOffset + 2) : shots.slice(0, MAX_THUMBS);

  return (
    <section aria-labelledby={compact ? undefined : 'shots-title'} className="flex flex-col gap-3">
      {!compact && (
        <h2 id="shots-title" className="font-heading text-2xl font-bold text-text">
          Screenshots
        </h2>
      )}

      {compact ? (
        <div className="relative group/shots">
          <ul className="grid grid-cols-2 gap-3">
            {currentPair.map((url, localIdx) => {
              const globalIdx = pairOffset + localIdx;
              return (
                <li key={url} className="w-full">
                  <button
                    type="button"
                    aria-label={`Open ${alt(globalIdx)}`}
                    onClick={(e) => {
                      opener.current = e.currentTarget;
                      setIndex(globalIdx);
                    }}
                    className="group relative block aspect-video w-full overflow-hidden rounded-[8px] border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text"
                  >
                    <img
                      src={screenshotThumb(url)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </button>
                </li>
              );
            })}
          </ul>

          {shots.length > 2 && (
            <>
              <button
                type="button"
                aria-label="Previous screenshot pair"
                onClick={() => setPairOffset((p) => (p - 2 >= 0 ? p - 2 : Math.max(0, shots.length - 2)))}
                className="absolute -left-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface/90 text-text shadow-lg backdrop-blur-sm transition hover:border-text hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Next screenshot pair"
                onClick={() => setPairOffset((p) => (p + 2 < shots.length ? p + 2 : 0))}
                className="absolute -right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface/90 text-text shadow-lg backdrop-blur-sm transition hover:border-text hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shots.slice(0, MAX_THUMBS).map((url, i) => (
            <li key={url}>
              <button
                type="button"
                aria-label={`Open ${alt(i)}`}
                onClick={(e) => {
                  opener.current = e.currentTarget;
                  setIndex(i);
                }}
                className="group relative block aspect-video w-full overflow-hidden rounded-[8px] border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text"
              >
                <img
                  src={screenshotThumb(url)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover motion-safe:transition-transform motion-safe:group-hover:scale-105"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog.Root open={open} onOpenChange={(next) => !next && setIndex(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/85 backdrop-blur-md" />
          <Dialog.Content
            aria-describedby={undefined}
            onKeyDown={onKeyDown}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              opener.current?.focus?.();
            }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-4 focus:outline-none"
          >
            <Dialog.Title className="sr-only">{`${title} screenshots`}</Dialog.Title>
            {open && (
              <>
                <img
                  key={index}
                  src={screenshotFull(shots[index])}
                  alt={alt(index)}
                  decoding="async"
                  className="max-h-[75vh] max-w-full rounded-card border border-border object-contain"
                />
                <div className="flex items-center gap-3">
                  <button type="button" aria-label="Previous screenshot" onClick={() => go(-1)} className={navButton}>
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <p aria-live="polite" className="min-w-16 text-center text-sm tabular-nums text-text-muted">
                    {index + 1} / {total}
                  </p>
                  <button type="button" aria-label="Next screenshot" onClick={() => go(1)} className={navButton}>
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </>
            )}
            <Dialog.Close aria-label="Close screenshots" className={`${navButton} absolute right-4 top-4`}>
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

const navButton =
  'flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text hover:border-text hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text';
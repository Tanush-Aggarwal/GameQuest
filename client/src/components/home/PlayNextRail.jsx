import { useCallback, useEffect, useRef, useState } from 'react';
import { ProgressBar } from '@/components/ui/ProgressBar.jsx';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock, Gamepad2, Sparkles, TrendingUp } from 'lucide-react';
import { ArtPanel } from '@/components/art/ArtPanel.jsx';
import { useAmbient } from '@/components/art/ambientContext.js';
import { CoverImage } from '@/components/games/GameCard.jsx';
import { StatusBadge } from '@/components/library/StatusBadge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { STATUS_META } from '@/lib/libraryStatus.js';

const CARD = 'w-40 shrink-0 snap-start sm:w-48';

function RailSkeleton() {
  return (
    <div role="status" aria-label="Loading suggestions" className="flex min-h-[22rem] gap-4 overflow-hidden pb-2 sm:min-h-[26rem]">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={CARD} aria-hidden="true">
          <div className="aspect-[3/4] w-full animate-pulse rounded-card bg-surface-raised" />
          <div className="mt-2 h-4 w-3/4 animate-pulse rounded-control bg-surface-raised" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded-control bg-surface-raised" />
        </div>
      ))}
    </div>
  );
}

// One suggestion: a large cover, then why it was picked. The reasons are shown in full as chips (they were a
// single clipped line before), because "why this game" is the point of the section.
export function PlayNextCard({ item }) {
  const { previewGame, clearPreview } = useAmbient();
  const progress = item.status === 'playing' && item.manualProgress > 0 ? item.manualProgress : 0;
  // "~12h to beat" is already shown under the title, so it is not repeated as a chip
  const reasons = (item.reasons ?? []).filter((r) => !(item.timeToBeatMain != null && /to beat$/.test(r)));
  // The link is the cover and the title: its name is its visible text (status, title, progress), never a different label.
  // The longer "why" sits under it as plain text, so it is not read out as part of the link's name.
  return (
    <li className={`${CARD} gq-play-next-card`}>
      <div
        className="group flex h-full flex-col gap-3 rounded-card border border-border bg-surface p-2 pb-3 shadow-sm transition-[transform,box-shadow,border-color] delay-0 duration-300 ease-[cubic-bezier(.16,1,.3,1)] hover:delay-150 hover:border-[color-mix(in_srgb,var(--text)_25%,var(--border))] hover:shadow-[0_18px_36px_-14px_rgba(21,23,19,0.35)] motion-safe:hover:-translate-y-1 focus-within:border-text"
        onMouseEnter={() => previewGame(item)}
        onFocus={() => previewGame(item)}
        onMouseLeave={clearPreview}
        onBlur={clearPreview}
      >
        <Link to={`/library/${item.entryId}`} className="flex flex-col gap-2 rounded-card">
          <div className="gq-play-next-cover relative aspect-[3/4] w-full overflow-hidden rounded-[8px] bg-surface-raised">
            <CoverImage
              cover={item.cover}
              title={item.title}
              alt=""
              sizes="(min-width: 640px) 192px, 160px"
              className="h-full w-full transition-transform delay-0 duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover:delay-150 motion-safe:group-hover:scale-[1.04]"
            />
            {/* solid pill: the status colours must keep 4.5:1 even over a white cover */}
            <span className="absolute left-2 top-2 rounded-full bg-bg px-2 py-1">
              <StatusBadge status={item.status} />
            </span>
            {progress > 0 && (
              <div aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-2 pt-6">
                <div className="flex items-center gap-2">
                  <ProgressBar value={progress} onDark className="!h-1.5 flex-1" />
                  <span className="text-[11px] font-bold tabular-nums text-white">{progress}%</span>
                </div>
              </div>
            )}
          </div>
          <p className="line-clamp-1 px-1 text-sm font-bold leading-snug text-text group-hover:text-[var(--accent-text)]" title={item.title}>
            {item.title}
            {progress > 0 && <span className="sr-only">, {progress}% done</span>}
          </p>
        </Link>
        <div className="-mt-1 flex min-w-0 flex-col gap-2 px-1">
          {item.timeToBeatMain != null && (
            <p className="flex items-center gap-1 text-xs tabular-nums text-text-muted">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />~{item.timeToBeatMain}h to beat
            </p>
          )}
          {reasons.length > 0 && (
            <ul aria-label={`Why ${item.title}`} className="flex flex-wrap gap-1">
              {reasons.map((reason) => (
                // one tidy line each; the full reason is in the tooltip
                <li
                  key={reason}
                  title={reason}
                  className="flex max-w-full items-center gap-1 truncate rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium leading-5 text-text-muted"
                >
                  <Sparkles className="h-3 w-3 shrink-0 text-[var(--secondary-accent)]" aria-hidden="true" />
                  <span className="truncate">{reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
// "What to play next" as a rail of large covers on the first suggestion's art. `playNext` is a useAsync result.
export function PlayNextSection({ playNext }) {
  const rail = useRef(null);
  const items = playNext.data?.items ?? [];
  // Whether the row actually overflows, and whether it can still go left/right: drives the scroll buttons.
  const [edges, setEdges] = useState({ overflow: false, left: false, right: false });

  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    setEdges({
      overflow: el.scrollWidth > el.clientWidth + 1,
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = rail.current;
    if (!el) return undefined;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [measure, items.length]);

  function scrollBy(direction) {
    const el = rail.current;
    if (!el?.scrollBy) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduced ? 'auto' : 'smooth' });
  }

  return (
    <ArtPanel aria-labelledby="play-next-title" art={items[0]} seed="home-next" className="gq-editorial-panel gq-play-next-section flex flex-col gap-5 px-5 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="play-next-title" className="flex items-center gap-2 font-heading text-lg font-bold text-text">
            <TrendingUp size={18} className="text-[var(--secondary-accent)]" aria-hidden="true" />
            What to play next
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">Picked from your library, your taste and how long each game takes.</p>
        </div>
        {edges.overflow && (
          <div className="hidden gap-1 md:flex">
            <Button variant="ghost" aria-label="Scroll suggestions left" onClick={() => scrollBy(-1)} disabled={!edges.left} className="px-3">
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
            <Button variant="ghost" aria-label="Scroll suggestions right" onClick={() => scrollBy(1)} disabled={!edges.right} className="px-3">
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {playNext.status === 'loading' && <RailSkeleton />}

      {playNext.status === 'error' && <ErrorState message="Couldn't load your suggestions." onRetry={playNext.retry} />}

      {playNext.status === 'success' && items.length === 0 && (
        <EmptyState
          icon={Gamepad2}
          title="Nothing to recommend yet"
          description="Add games to your backlog and we'll suggest what to play next."
          actionLabel="Find games"
          actionTo="/explore"
          suggestions
          headingLevel="h3"
        />
      )}

      {playNext.status === 'success' && items.length > 0 && (
        // generous padding with a matching negative margin: the focus ring, the hover lift and the shadow of a
        // card are not clipped by the scrolling row (overflow-x also clips y)
        <ul ref={rail} aria-label="Suggested games" className="scrollbar-none -m-2 flex snap-x snap-mandatory gap-4 overflow-x-auto p-2 pb-3">
          {items.map((item) => (
            <PlayNextCard key={item.entryId} item={item} />
          ))}
        </ul>
      )}
    </ArtPanel>
  );
}

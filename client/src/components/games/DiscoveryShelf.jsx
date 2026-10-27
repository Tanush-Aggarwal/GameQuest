import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Rail } from '@/components/ui/Rail.jsx';
import { GameCard, GameCardSkeleton } from '@/components/games/GameCard.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { searchGames } from '@/services/gamesApi.js';

export const SHELF_SIZE = 12;
const CARD = 'w-36 shrink-0 snap-start sm:w-44';

function ShelfHeader({ title, subtitle, icon: Icon }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-accent" aria-hidden="true" />}
        <h2 className="font-heading text-lg font-bold text-text">{title}</h2>
      </div>
      {subtitle && <span className="text-xs text-text-muted">{subtitle}</span>}
    </div>
  );
}

function ShelfSkeleton({ title, subtitle, icon }) {
  return (
    <section className="flex flex-col gap-3" role="status" aria-label={`Loading ${title}`}>
      <ShelfHeader title={title} subtitle={subtitle} icon={icon} />
      <div className="flex gap-4 overflow-hidden pb-2 pt-1">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={CARD}>
            <GameCardSkeleton />
          </div>
        ))}
      </div>
    </section>
  );
}

// True once the element is within `margin` of the viewport (and for good after that). Without IntersectionObserver
// (old browsers, tests) it is true at once, so nothing waits for an observer that cannot exist.
function useNearViewport(margin = '400px') {
  const ref = useRef(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near, margin]);
  return [ref, near];
}

function LoadedShelf({ title, subtitle, icon, params }) {
  const load = useCallback(async (signal) => (await searchGames({ ...params, limit: SHELF_SIZE }, { signal })).items, [params]);
  const { status, data: games, retry } = useAsync(load);

  if (status === 'loading') return <ShelfSkeleton title={title} subtitle={subtitle} icon={icon} />;
  if (status === 'error') {
    return (
      <section className="flex flex-col gap-3" aria-label={title}>
        <ShelfHeader title={title} subtitle={subtitle} icon={icon} />
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4 text-sm">
          <span>Could not load this shelf.</span>
          <Button variant="secondary" onClick={retry} aria-label={`Retry ${title}`}>
            Retry
          </Button>
        </div>
      </section>
    );
  }
  if (!games?.length) return null; // an empty shelf is not shown

  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <ShelfHeader title={title} subtitle={subtitle} icon={icon} />
      <Rail label={`${title} games`}>
        {games.map((game) => (
          <li key={game.id} className={CARD}>
            {/* no shared cover glide here: the same game can sit in several shelves, and a layout id must be unique */}
            <GameCard game={game} shared={false} />
          </li>
        ))}
      </Rail>
    </section>
  );
}

// A horizontal rail of games loaded from the catalog with `params` (a stable object). It starts loading only when it
// is about to scroll into view, so the page does not fire a dozen requests at once. Each shelf has its own loading
// and error state, so one failing shelf never blanks the page; an empty shelf is hidden.
export function DiscoveryShelf(props) {
  const [ref, near] = useNearViewport();
  if (!near) {
    return (
      <div ref={ref}>
        <ShelfSkeleton title={props.title} subtitle={props.subtitle} icon={props.icon} />
      </div>
    );
  }
  return <LoadedShelf {...props} />;
}
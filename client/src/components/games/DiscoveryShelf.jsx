import { useCallback } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { GameCard, GameCardSkeleton } from '@/components/games/GameCard.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { searchGames } from '@/services/gamesApi.js';

export const SHELF_SIZE = 12;

function ShelfHeader({ title, subtitle, icon: Icon }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-accent" aria-hidden="true" />}
        <h2 className="font-heading text-base font-bold text-text">{title}</h2>
      </div>
      {subtitle && <span className="text-xs text-text-muted">{subtitle}</span>}
    </div>
  );
}

// A curated horizontal shelf that loads its own games from the catalog with `params` (a stable
// object). The API returns them most popular first and the shelf keeps that order. Each shelf has its
// own loading and error state, so one failing shelf never blanks the page; an empty shelf is hidden.
export function DiscoveryShelf({ title, subtitle, icon, params }) {
  const load = useCallback(async (signal) => (await searchGames({ ...params, limit: SHELF_SIZE }, { signal })).items, [params]);
  const { status, data: games, retry } = useAsync(load);

  if (status === 'loading') {
    return (
      <section className="flex flex-col gap-3" role="status" aria-label={`Loading ${title}`}>
        <ShelfHeader title={title} subtitle={subtitle} icon={icon} />
        <div className="flex gap-4 overflow-hidden pb-2 pt-1">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="w-36 shrink-0 sm:w-44">
              <GameCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    );
  }
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
  if (!games?.length) return null;

  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <ShelfHeader title={title} subtitle={subtitle} icon={icon} />
      <ul className="scrollbar-none flex snap-x gap-4 overflow-x-auto pb-2 pt-1">
        {games.map((game) => (
          <li key={game.id} className="w-36 shrink-0 snap-start sm:w-44">
            <GameCard game={game} />
          </li>
        ))}
      </ul>
    </section>
  );
}

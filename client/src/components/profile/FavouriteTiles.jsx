import { Plus, X } from 'lucide-react';
import { CoverImage } from '@/components/games/GameCard.jsx';
import { cn } from '@/lib/utils.js';

export const SLOT_COUNT = 4;
// Cover-sized, not page-sized: the same fixed tile everywhere a favourite is shown.
export const TILE = 'w-24 shrink-0 sm:w-28';
// The public profile shows the favourites bigger: it is the showcase, not the editor.
export const LARGE_TILE = 'w-32 shrink-0 sm:w-44';

// The four favourite slots as a compact row of cover-sized tiles. A filled tile shows the cover and a remove
// button; an empty tile is a dashed "+" that opens the picker for that slot. `slots` has SLOT_COUNT entries
// (a game or null); the parent owns the state. Each slot's button carries data-slot-action={index} so the
// parent can put keyboard focus back on it after a pick, a removal or closing the picker.
export function FavouriteTiles({ slots, openSlot, onOpen, onRemove }) {
  return (
    <ul aria-label="Favourite games" className="flex flex-wrap gap-3">
      {slots.map((game, i) => (
        <li key={game ? game.id : `empty-${i}`} className={cn(TILE, 'flex flex-col gap-1.5')}>
          {game ? (
            <>
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-card border border-border bg-surface-raised">
                {/* the title is shown under the cover, so the picture itself is decorative */}
                <CoverImage cover={game.cover} title={game.title} alt="" compact className="h-full w-full" />
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  data-slot-action={i}
                  aria-label={`Remove ${game.title} from favourites`}
                  className="absolute right-0 top-0 flex h-11 w-11 items-start justify-end p-1.5 text-text focus-visible:outline-offset-0"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/80 text-white shadow-md ring-1 ring-white/20 transition hover:bg-danger">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </button>
              </div>
              <p className="line-clamp-2 text-xs font-medium leading-snug" title={game.title}>
                {game.title}
              </p>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onOpen(i)}
              data-slot-action={i}
              aria-label={`Add favourite game ${i + 1}`}
              aria-expanded={openSlot === i}
              className={cn(
                'flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-card border border-dashed bg-bg/50 text-text-muted transition-colors hover:border-text hover:text-text',
                openSlot === i ? 'border-text text-text' : 'border-border',
              )}
            >
              <Plus className="h-6 w-6" aria-hidden="true" />
              <span className="text-xs">Slot {i + 1}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

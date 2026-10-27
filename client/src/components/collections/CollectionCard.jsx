import { Link } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { TypeBadge, VisibilityBadge } from './badges.jsx';
import { CoverImage } from '../games/GameCard.jsx';

// 2×2 mosaic of the first covers; a placeholder icon when there are none.
export function CoverMosaic({ covers }) {
  if (!covers.length) {
    return (
      <div className="flex aspect-square w-full items-center justify-center bg-surface-raised">
        <Gamepad2 className="h-8 w-8 text-text-muted" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="grid aspect-square w-full grid-cols-2 grid-rows-2 gap-px bg-border">
      {[0, 1, 2, 3].map((i) =>
        covers[i] ? <CoverImage key={i} cover={covers[i]} title={covers[i]} compact className="h-full w-full" /> : <div key={i} className="bg-surface-raised" />,
      )}
    </div>
  );
}

// A collection is its covers: the mosaic fills the card and the name, size and badges sit on a fade at the bottom.
// `headingLevel`: h3 under a section heading (a profile), h2 when the card is directly under the page title.
export function CollectionCard({ collection, headingLevel: Heading = 'h3' }) {
  return (
    <li>
      <Link
        to={`/collections/${collection.id}`}
        className="group relative block overflow-hidden rounded-card border border-border bg-surface shadow-lg transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <CoverMosaic covers={collection.covers} />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-bg via-bg/90 to-transparent p-3 pt-12">
          <Heading className="line-clamp-1 text-sm font-semibold">{collection.name}</Heading>
          <p className="text-xs tabular-nums text-text-muted">
            {collection.itemCount} {collection.itemCount === 1 ? 'game' : 'games'}
          </p>
          <div className="flex gap-3">
            <TypeBadge type={collection.type} />
            <VisibilityBadge visibility={collection.visibility} />
          </div>
        </div>
      </Link>
    </li>
  );
}
import { Link } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { TypeBadge, VisibilityBadge } from './badges.jsx';
import { getHighResCover } from '../games/GameCard.jsx';

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
        covers[i] ? <img key={i} src={getHighResCover(covers[i])} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div key={i} className="bg-surface-raised" />,
      )}
    </div>
  );
}

export function CollectionCard({ collection }) {
  return (
    <li>
      <Link to={`/collections/${collection.id}`} className="flex flex-col overflow-hidden rounded-card border border-border bg-surface transition-colors hover:bg-surface-raised">
        <CoverMosaic covers={collection.covers} />
        <div className="flex flex-col gap-1 p-3">
          <h3 className="line-clamp-1 text-sm font-semibold">{collection.name}</h3>
          <p className="text-xs text-text-muted tabular-nums">
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

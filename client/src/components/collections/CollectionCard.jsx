import { Link } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { TypeBadge, VisibilityBadge } from './badges.jsx';
import { CoverImage } from '../games/GameCard.jsx';

const Empty = () => (
  <div className="flex aspect-[4/3] w-full items-center justify-center bg-surface-raised">
    <Gamepad2 className="h-8 w-8 text-text-muted" aria-hidden="true" />
  </div>
);

// 2×2 mosaic of the first covers, edge to edge; a placeholder icon when there are none.
function CoverMosaic({ covers }) {
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
        covers[i] ? <CoverImage key={i} cover={covers[i]} title={covers[i]} compact className="h-full w-full object-cover" /> : <div key={i} className="bg-surface-raised" />,
      )}
    </div>
  );
}

// Playlist-style art: the first cover large on the left, the next three stacked small on the right
// (empty slots stay as quiet tiles). An icon when the collection is empty.
function CoverGrid({ covers }) {
  if (!covers.length) return <Empty />;
  const [first, ...rest] = covers;
  return (
    <div className="grid aspect-[4/3] w-full grid-cols-[2fr_1fr] gap-1 bg-surface p-1">
      <div className="overflow-hidden rounded-[8px] bg-surface-raised">
        <CoverImage cover={first} title={first} compact className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      </div>
      <div className="grid grid-rows-3 gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="overflow-hidden rounded-[6px] bg-surface-raised">
            {rest[i] && <CoverImage cover={rest[i]} title={rest[i]} compact className="h-full w-full object-cover object-top" />}
          </div>
        ))}
      </div>
    </div>
  );
}

const metaLine = (collection) => (
  <>
    {collection.itemCount} {collection.itemCount === 1 ? 'game' : 'games'}
  </>
);

// A collection card, in one of two styles:
//   'mosaic' (default): the 2×2 covers fill the card, and the name, size and labels sit on a fade at the bottom;
//   'feature': one big cover and three small, with the name, description, size and labels below.
// `headingLevel`: h3 under a section heading (a profile), h2 when the card is directly under the page title.
export function CollectionCard({ collection, headingLevel: Heading = 'h3', art = 'mosaic' }) {
  if (art !== 'feature') {
    return (
      <li>
        <Link
          to={`/collections/${collection.id}`}
          className="group relative block overflow-hidden rounded-card border border-border bg-surface shadow-lg transition-colors hover:border-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text"
        >
          <CoverMosaic covers={collection.covers ?? []} />
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-bg via-bg/90 to-transparent p-3 pt-12">
            <Heading className="line-clamp-1 text-sm font-semibold">{collection.name}</Heading>
            <p className="text-xs tabular-nums text-text-muted">{metaLine(collection)}</p>
            <div className="flex gap-3">
              <TypeBadge type={collection.type} />
              <VisibilityBadge visibility={collection.visibility} />
            </div>
          </div>
        </Link>
      </li>
    );
  }
  return (
    <li>
      <Link
        to={`/collections/${collection.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface transition-colors hover:border-[color-mix(in_srgb,var(--text)_35%,var(--border))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text"
      >
        <CoverGrid covers={collection.covers ?? []} />
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <Heading className="line-clamp-1 font-heading text-base font-bold">{collection.name}</Heading>
          {collection.description && <p className="line-clamp-2 text-sm text-text-muted">{collection.description}</p>}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5">
            <span className="text-xs font-semibold tabular-nums text-text">{metaLine(collection)}</span>
            <TypeBadge type={collection.type} />
            <VisibilityBadge visibility={collection.visibility} />
          </div>
        </div>
      </Link>
    </li>
  );
}

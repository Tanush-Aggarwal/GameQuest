import { Link } from 'react-router-dom';
import { CoverImage } from '@/components/games/GameCard.jsx';
import { useArt } from '@/components/art/useArt.js';

// A short row of popular games from the catalog (none you already own), for empty states: instead of a dead
// end the user sees something to click. Shows nothing while the art/pool is loading or when it is empty.
export function SuggestedGames({ count = 6, label = 'Popular right now' }) {
  const { suggestions } = useArt();
  const games = suggestions.slice(0, count);
  if (!games.length) return null;
  return (
    <div className="flex w-full flex-col gap-2">
      <p aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <ul aria-label={label} className="flex gap-2 p-1 sm:gap-3">
        {games.map((game, i) => (
          <li key={game.id} className={i >= 4 ? 'hidden sm:block' : undefined}>
            <Link to={`/games/${game.slug}`} aria-label={game.title} title={game.title} className="block w-14 min-[360px]:w-16 sm:w-20">
              <CoverImage
                cover={game.cover}
                title={game.title}
                alt=""
                compact
                sizes="80px"
                className="aspect-[3/4] w-full rounded-control border border-border transition-colors hover:border-accent"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

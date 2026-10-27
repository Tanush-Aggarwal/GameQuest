import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { CoverImage, SharedCover } from '@/components/games/GameCard.jsx';
import { Rail } from '@/components/ui/Rail.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { searchGames } from '@/services/gamesApi.js';

const SIZE = 12;
const CARD = 'w-36 shrink-0 snap-start sm:w-40';

// Games of the same first genre (in the catalog's default order). Its own section: a failure here never touches the
// rest of the page; with nothing else in the genre it says so in one line, and a game without genres has no section.
export function MoreLikeThis({ game }) {
  const genre = game.genres?.[0];
  const load = useCallback(
    async (signal) => {
      if (!genre) return [];
      const { items } = await searchGames({ genre, limit: SIZE + 1 }, { signal });
      return items.filter((g) => g.id !== game.id).slice(0, SIZE);
    },
    [genre, game.id],
  );
  const { status, data, retry } = useAsync(load);
  if (!genre) return null;

  return (
    <section aria-labelledby="more-like-title" className="flex flex-col gap-3">
      <h2 id="more-like-title" className="font-heading text-lg font-bold">
        More like this
      </h2>
      {status === 'loading' && (
        <div role="status" aria-label="Loading similar games" className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className={`${CARD} aspect-[3/4] rounded-card`} />
          ))}
        </div>
      )}
      {status === 'error' && <ErrorState message="Couldn't load similar games." onRetry={retry} />}
      {status === 'success' && data.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <Gamepad2 className="h-4 w-4" aria-hidden="true" /> No other {genre} games in the catalog yet.
        </p>
      )}
      {status === 'success' && data.length > 0 && (
        <Rail label="Similar games">
          {data.map((g) => (
            <li key={g.id} className={CARD}>
              <Link to={`/games/${g.slug}`} aria-label={g.title} className="group flex flex-col gap-2 rounded-card">
                <SharedCover slug={g.slug} className="overflow-hidden rounded-card border border-border shadow-lg group-hover:border-accent">
                  <CoverImage cover={g.cover} title={g.title} alt="" sizes="160px" className="aspect-[3/4] w-full" />
                </SharedCover>
                <span className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-accent">{g.title}</span>
              </Link>
            </li>
          ))}
        </Rail>
      )}
    </section>
  );
}
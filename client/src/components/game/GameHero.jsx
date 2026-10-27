import { Link } from 'react-router-dom';
import { CalendarPlus, Clock, Sparkles, Star } from 'lucide-react';
import { BackdropHero } from '@/components/art/BackdropHero.jsx';
import { GameCover, SharedCover } from '@/components/games/GameCard.jsx';
import { GameLibraryPanel } from '@/components/library/GameLibraryPanel.jsx';
import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { PlatformPills } from '@/components/ui/PlatformPills.jsx';

// The top of the game page: cover on the left, title and actions on the right, matching reference design.
export function GameHero({ game, entryState, onRecommend }) {
  const year = game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;
  const developer = (game.developer ?? []).slice(0, 2).join(', ');
  const main = game.timeToBeat?.main;

  return (
    <BackdropHero art={game} seed={game.title} className="gq-game-hero min-h-80 px-6 py-8 sm:px-10 sm:py-10 rounded-card border border-white/10 bg-[#161816] text-white shadow-2xl">
      <div className="relative z-10 flex flex-col gap-8 md:flex-row md:items-center">
        {/* Left: Framed Game Cover */}
        <div className="shrink-0 self-center md:self-auto" aria-hidden="true">
          <SharedCover slug={game.slug} className="gq-hero-artwork w-44 sm:w-52 lg:w-60 aspect-[3/4] rounded-card overflow-hidden border border-white/15 bg-[#111311] shadow-2xl transition-transform hover:scale-[1.02]">
            <GameCover game={game} className="h-full w-full object-cover" />
          </SharedCover>
        </div>

        {/* Right: Game Title, Meta, and Actions */}
        <div className="flex min-w-0 flex-1 max-w-2xl flex-col gap-4">
          <PlatformPills platforms={game.platforms} />

          <div className="flex flex-col gap-1.5">
            <h1 tabIndex={-1} className="font-heading text-3xl font-extrabold leading-tight tracking-tight text-white focus:outline-none sm:text-5xl">
              {game.title}
            </h1>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
              <p className="text-xs font-mono font-semibold uppercase tracking-wider text-gray-300">
                {[developer, year].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>

          <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {game.ratingAvg > 0 && (
              <div>
                <dt className="sr-only">Community rating</dt>
                <dd className="flex items-center gap-1 font-semibold tabular-nums text-white">
                  <Star className="h-4 w-4 fill-[var(--accent)] text-[var(--accent)]" aria-hidden="true" />
                  {game.ratingAvg.toFixed(1)}
                  <span className="font-normal text-gray-400">({game.ratingCount})</span>
                </dd>
              </div>
            )}
            {main != null && (
              <div>
                <dt className="sr-only">Time to beat</dt>
                <dd className="flex items-center gap-1 font-semibold tabular-nums text-gray-300">
                  <Clock className="h-4 w-4 text-gray-400" aria-hidden="true" />~{main} h to beat
                </dd>
              </div>
            )}
          </dl>

          {game.genres?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {game.genres.slice(0, 4).map((g) => (
                <span key={g} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-gray-300">
                  {g}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2">
            <GameLibraryPanel game={game} state={entryState} />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={onRecommend} className="font-semibold">
                <Sparkles className="h-4 w-4 text-accent-text" aria-hidden="true" />
                Recommend
              </Button>
              <Link to={`/sessions/new?game=${game.slug}`} className={buttonVariants({ variant: 'secondary' })}>
                <CalendarPlus className="h-4 w-4 text-accent-text" aria-hidden="true" />
                Schedule
              </Link>
            </div>
          </div>
        </div>
      </div>
    </BackdropHero>
  );
}

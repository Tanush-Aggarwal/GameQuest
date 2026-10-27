import { Link } from 'react-router-dom';
import { CalendarPlus, Clock, Sparkles, Star } from 'lucide-react';
import { BackdropHero } from '@/components/art/BackdropHero.jsx';
import { GameCover, SharedCover } from '@/components/games/GameCard.jsx';
import { GameLibraryPanel } from '@/components/library/GameLibraryPanel.jsx';
import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { PlatformPills } from '@/components/ui/PlatformPills.jsx';

// The top of the game page: cinematic backdrop, cover, title, who made it and when, rating, time to beat, platforms,
// one primary library action and the two social ones. `entryState` is useLibraryEntry's result.
export function GameHero({ game, entryState, onRecommend }) {
  const year = game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;
  const developer = (game.developer ?? []).slice(0, 2).join(', ');
  const main = game.timeToBeat?.main;
  return (
    <BackdropHero art={game} seed={game.title} className="min-h-80 px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-6 md:flex-row md:items-end">
        <SharedCover slug={game.slug} className="w-40 shrink-0 overflow-hidden rounded-card border border-border bg-surface shadow-2xl sm:w-48">
          <GameCover game={game} />
        </SharedCover>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{[developer, year].filter(Boolean).join(' · ')}</p>
            <h1 tabIndex={-1} className="font-heading text-3xl focus:outline-none font-bold leading-tight tracking-tight sm:text-5xl">{game.title}</h1>
          </div>

          <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {game.ratingAvg > 0 && (
              <div>
                <dt className="sr-only">Community rating</dt>
                <dd className="flex items-center gap-1 font-semibold tabular-nums">
                  <Star className="h-4 w-4 fill-accent stroke-accent" aria-hidden="true" />
                  {game.ratingAvg.toFixed(1)}
                  <span className="font-normal text-text-muted">({game.ratingCount})</span>
                </dd>
              </div>
            )}
            {main != null && (
              <div>
                <dt className="sr-only">Time to beat</dt>
                <dd className="flex items-center gap-1 font-semibold tabular-nums">
                  <Clock className="h-4 w-4 text-text-muted" aria-hidden="true" />~{main} h to beat
                </dd>
              </div>
            )}
          </dl>

          <PlatformPills platforms={game.platforms} />

          <div className="flex flex-col gap-3">
            <GameLibraryPanel game={game} state={entryState} />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={onRecommend}>
                <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
                Recommend
              </Button>
              <Link to={`/sessions/new?game=${game.slug}`} className={buttonVariants({ variant: 'secondary' })}>
                <CalendarPlus className="h-4 w-4 text-accent" aria-hidden="true" />
                Schedule
              </Link>
            </div>
          </div>
        </div>
      </div>
    </BackdropHero>
  );
}
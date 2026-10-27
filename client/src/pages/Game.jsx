import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { useAmbient } from '@/components/art/ambientContext.js';
import { TrailerPlayer } from '@/components/games/TrailerPlayer.jsx';
import { GameHero } from '@/components/game/GameHero.jsx';
import { FriendsSection, ReviewsSection, TimeToBeatCard } from '@/components/game/GameSections.jsx';
import { MoreLikeThis } from '@/components/game/MoreLikeThis.jsx';
import { ScreenshotGallery } from '@/components/game/ScreenshotGallery.jsx';
import { ProgressPanel } from '@/components/progress/ProgressPanel.jsx';
import { ReviewPanel } from '@/components/review/ReviewPanel.jsx';
import { RecommendationModal } from '@/components/recommendations/RecommendationModal.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useLibraryEntry } from '@/hooks/useLibraryEntry.js';
import { getGame } from '@/services/gamesApi.js';

function GameSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading game">
      <Skeleton className="h-72 w-full rounded-card" />
      <Skeleton className="h-11 w-full max-w-md" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

const TAB = 'flex min-h-11 items-center gap-2 border-b-2 border-transparent px-4 text-sm font-semibold text-text-muted transition-colors hover:text-text data-[state=active]:border-accent data-[state=active]:text-text';

// Everything about the page that needs the loaded game; the entry state is shared by the hero and the progress tab.
function GameDetails({ game }) {
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [tab, setTab] = useState('about');
  const entryState = useLibraryEntry(game.id);
  const { entry } = entryState;
  const { setBase, clearBase } = useAmbient();

  // the page's game tints the background behind everything
  useEffect(() => {
    setBase(game);
    return () => clearBase(game);
  }, [game, setBase, clearBase]);

  return (
    <div className="flex flex-col gap-8">
      <GameHero game={game} entryState={entryState} onRecommend={() => setRecommendOpen(true)} />
      <RecommendationModal game={game} isOpen={recommendOpen} onClose={() => setRecommendOpen(false)} />

      <Tabs.Root value={tab} onValueChange={setTab} className="flex flex-col gap-6">
        <Tabs.List aria-label="Game details" className="flex overflow-x-auto border-b border-border">
          <Tabs.Trigger value="about" className={TAB}>
            About
          </Tabs.Trigger>
          <Tabs.Trigger value="progress" className={TAB}>
            Your progress
          </Tabs.Trigger>
          <Tabs.Trigger value="reviews" className={TAB}>
            Reviews
            {game.ratingCount > 0 && <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs tabular-nums text-text-muted">{game.ratingCount}</span>}
          </Tabs.Trigger>
          <Tabs.Trigger value="friends" className={TAB}>
            Friends
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="about" className="flex flex-col gap-6 focus-visible:outline-none">
          {/* Trailer: validated pick first, tabs for the others; absent when there is none */}
          <TrailerPlayer slug={game.slug} title={game.title} />
          <ScreenshotGallery title={game.title} screenshots={game.screenshots} />
          <div className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-text-muted">About</h2>
            <p className="max-w-prose text-sm leading-relaxed text-text">{game.summary || 'No description available yet.'}</p>
            {game.genres?.length > 0 && (
              <ul aria-label="Genres" className="mt-3 flex flex-wrap gap-1.5">
                {game.genres.map((g) => (
                  <li key={g} className="rounded-full border border-border bg-bg/70 px-2.5 py-0.5 text-xs text-text-muted">
                    {g}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {game.timeToBeat && <TimeToBeatCard timeToBeat={game.timeToBeat} />}
        </Tabs.Content>

        <Tabs.Content value="progress" className="focus-visible:outline-none">
          {entryState.status === 'loading' && <Skeleton className="h-40 w-full" role="status" aria-label="Loading your progress" />}
          {entryState.status === 'error' && <ErrorState message={entryState.error.message} onRetry={entryState.retry} />}
          {entryState.status === 'success' && !entry && (
            <EmptyState
              title="Not in your library yet"
              description="Add this game to track progress, play sessions and notes."
              headingLevel="h2"
            />
          )}
          {entryState.status === 'success' && entry && (
            <ProgressPanel key={entry.id} entryId={entry.id} status={entry.status} initialProgress={entry.manualProgress ?? 0} />
          )}
        </Tabs.Content>

        <Tabs.Content value="reviews" className="focus-visible:outline-none">
          {entry ? <ReviewPanel gameId={game.id} status={entry.status} /> : <ReviewsSection gameId={game.id} />}
        </Tabs.Content>

        <Tabs.Content value="friends" className="focus-visible:outline-none">
          <FriendsSection slug={game.slug} />
        </Tabs.Content>
      </Tabs.Root>

      <MoreLikeThis game={game} />
    </div>
  );
}

export default function Game() {
  const { slug } = useParams();
  const load = useCallback((signal) => getGame(slug, { signal }), [slug]);
  const { status, data: game, error, retry } = useAsync(load);

  // A new game (a card in "More like this") opens at the top, with focus on its title.
  const shownId = status === 'success' ? game?.id : null;
  useEffect(() => {
    if (!shownId) return;
    window.scrollTo?.({ top: 0 });
    document.querySelector('main h1')?.focus?.({ preventScroll: true });
  }, [shownId]);

  return (
    <section className="flex flex-col gap-6 pb-12">
      <Link to="/explore" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Explore
      </Link>

      {status === 'loading' && <GameSkeleton />}

      {status === 'error' &&
        (error.status === 404 ? (
          <EmptyState
            headingLevel="h1"
            title="Game not found"
            description="This game isn't in the catalog yet. Try searching for it."
            actionLabel="Search games"
            actionTo="/explore"
          />
        ) : (
          <ErrorState message={error.message} onRetry={retry} />
        ))}

      {status === 'success' && game && <GameDetails key={game.id} game={game} />}
    </section>
  );
}
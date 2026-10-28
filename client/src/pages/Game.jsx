import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { Clock3, Play, Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { useAmbient } from '@/components/art/ambientContext.js';
import { TrailerModal } from '@/components/games/TrailerModal.jsx';
import { GameHero, groupedPlatforms } from '@/components/game/GameHero.jsx';
import { FriendsSection, ReviewsSection } from '@/components/game/GameSections.jsx';
import { MoreLikeThis } from '@/components/game/MoreLikeThis.jsx';
import { ScreenshotGallery } from '@/components/game/ScreenshotGallery.jsx';
import { ProgressPanel } from '@/components/progress/ProgressPanel.jsx';
import { ReviewPanel } from '@/components/review/ReviewPanel.jsx';
import { RecommendationModal } from '@/components/recommendations/RecommendationModal.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useLibraryEntry } from '@/hooks/useLibraryEntry.js';
import { getGame, getGameRequirements, getTrailers } from '@/services/gamesApi.js';

function GameSkeleton() {
  return <div role="status" aria-label="Loading game" className="flex flex-col gap-5"><Skeleton className="h-[560px] w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-72 w-full" /></div>;
}

const TAB = 'min-h-12 shrink-0 border-b-2 border-transparent px-3 text-sm font-semibold text-text-muted transition-colors hover:text-text data-[state=active]:border-text data-[state=active]:text-text sm:px-5';

function formatDate(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

function Facts({ game }) {
  const families = groupedPlatforms(game.platforms);
  const platformsDisplay = families.length > 0 ? families.join(', ') : (game.platforms?.join(', ') || null);
  const facts = [
    ['Developer', game.developer?.join(', ')],
    ['Publisher', game.publisher?.join(', ')],
    ['Release date', formatDate(game.releaseDate)],
    ['Genre', game.genres?.join(', ')],
    ['Modes', game.gameModes?.join(', ')],
    ['Platforms', platformsDisplay],
  ].filter(([, value]) => value);
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-medium text-text-muted">{label}</dt>
          <dd className="mt-1 text-sm font-semibold text-text">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// Time to beat as three comparable cards: each shows its hours big and a bar scaled to the longest, so the gap
// between a quick run and a completionist run is obvious at a glance.
function TimeToBeat({ timeToBeat }) {
  const items = [
    { key: 'main', label: 'Main story', hint: 'Just the story', value: timeToBeat?.main, color: 'var(--status-playing)' },
    { key: 'extras', label: 'Main + extras', hint: 'Story and side content', value: timeToBeat?.extras, color: 'var(--secondary-accent)' },
    { key: 'full', label: 'Completionist', hint: 'Everything, 100%', value: timeToBeat?.full, color: 'var(--status-completed)' },
  ].filter((item) => item.value != null);

  if (!items.length && !timeToBeat?.endless) return null;
  const max = Math.max(...items.map((v) => v.value), 1);

  return (
    <section className="mt-8 border-t border-border pt-6" aria-labelledby="time-to-beat">
      <div className="mb-4 flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-text-muted" aria-hidden="true" />
        <h3 id="time-to-beat" className="text-sm font-semibold text-text">Time to beat</h3>
      </div>
      {timeToBeat?.endless && (
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-text-muted">
          <span className="h-2 w-2 rounded-full bg-[var(--status-completed)]" aria-hidden="true" />
          Endless: multiplayer / live service
        </p>
      )}
      {items.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <li key={item.key} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{item.label}</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
              </div>
              <p className="font-heading text-3xl font-bold tabular-nums leading-none text-text">
                {item.value}
                <span className="ml-1 text-base font-semibold text-text-muted">h</span>
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-surface-raised" aria-hidden="true">
                <div className="h-full rounded-full" style={{ width: `${Math.max(6, (item.value / max) * 100)}%`, backgroundColor: item.color }} />
              </div>
              <span className="text-xs text-text-muted">{item.hint}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Overview({ game, onScreenshots }) {
  const shots = (game.screenshots ?? []).filter(Boolean);
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.8fr)]">
      <section aria-labelledby="about-title">
        <h2 id="about-title" className="font-heading text-2xl font-bold text-text">About</h2>
        <p className="mt-4 max-w-[70ch] whitespace-pre-line text-sm leading-7 text-text-muted">
          {game.summary || 'No description available yet.'}
        </p>
        <div className="mt-8 border-t border-border pt-6">
          <Facts game={game} />
        </div>
        <TimeToBeat timeToBeat={game.timeToBeat} />
      </section>

      <section aria-labelledby="screenshots-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="screenshots-title" className="font-heading text-2xl font-bold text-text">
            Screenshots
          </h2>
          {shots.length > 0 && (
            <button
              type="button"
              onClick={onScreenshots}
              className="text-sm font-medium text-text-muted transition hover:text-text"
            >
              View all &rarr;
            </button>
          )}
        </div>
        {shots.length > 0 ? (
          <ScreenshotGallery title={game.title} screenshots={shots} compact />
        ) : (
          <p className="mt-5 text-sm text-text-muted">No screenshots available yet.</p>
        )}
      </section>
    </div>
  );
}

function TrailerTiles({ slug, onPlay }) {
  const load = useCallback((signal) => getTrailers(slug, { signal }), [slug]);
  const { status, data, error, retry } = useAsync(load);
  if (status === 'loading') return <Skeleton className="aspect-video w-full" role="status" aria-label="Loading trailers" />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;
  return <>{(data ?? []).map((trailer) => <button key={trailer.videoId} type="button" onClick={onPlay} className="group relative aspect-video overflow-hidden rounded-control border border-border bg-surface-raised text-left"><img src={`https://i.ytimg.com/vi/${trailer.videoId}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100" /><span className="absolute inset-0 flex items-center justify-center bg-black/25"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#111311] shadow-lg"><Play className="h-5 w-5 fill-current" aria-hidden="true" /></span></span><span className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2 text-xs font-medium text-white">{trailer.label}</span></button>)}</>;
}

function Requirements({ data }) {
  const list = (items) => <dl className="space-y-3">{(items ?? []).map((item) => <div key={`${item.label}-${item.value}`}><dt className="text-xs text-text-muted">{item.label}</dt><dd className="mt-1 text-sm text-text">{item.value || '—'}</dd></div>)}</dl>;
  return <div className="grid gap-6 sm:grid-cols-2"><section className="rounded-control border border-border bg-surface p-5"><h2 className="mb-5 text-lg font-semibold text-text">Minimum</h2>{list(data.minimum)}</section><section className="rounded-control border border-border bg-surface p-5"><h2 className="mb-5 text-lg font-semibold text-text">Recommended</h2>{list(data.recommended)}</section></div>;
}

function GameDetails({ game }) {
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [tab, setTab] = useState('overview');
  const [trailerOpen, setTrailerOpen] = useState(false);
  // Only show the System requirements tab when the store actually has them for this game.
  const loadReqs = useCallback((signal) => getGameRequirements(game.slug, { signal }), [game.slug]);
  const { data: reqs } = useAsync(loadReqs);
  const hasReqs = Boolean(reqs?.available);
  const entryState = useLibraryEntry(game.id);
  const { entry } = entryState;
  const { setBase, clearBase } = useAmbient();
  useEffect(() => {
    setBase(game);
    return () => clearBase(game);
  }, [clearBase, game, setBase]);

  return (
    <div className="flex flex-col">
      <GameHero
        game={game}
        entryState={entryState}
        onRecommend={() => setRecommendOpen(true)}
        onSchedule={() => {
          window.location.href = `/sessions/new?game=${game.slug}`;
        }}
        onScreenshots={() => setTab('screenshots')}
      />
      <RecommendationModal game={game} isOpen={recommendOpen} onClose={() => setRecommendOpen(false)} />

      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 pt-6 sm:px-8">
        <Tabs.Root value={tab} onValueChange={setTab} className="flex flex-col gap-8">
          <Tabs.List aria-label="Game details" className="flex overflow-x-auto border-b border-border">
            <Tabs.Trigger value="overview" className={TAB}>Overview</Tabs.Trigger>
            <Tabs.Trigger value="screenshots" className={TAB}>Screenshots</Tabs.Trigger>
            <Tabs.Trigger value="community" className={TAB}>Community</Tabs.Trigger>
            {entry && <Tabs.Trigger value="progress" className={TAB}>Your progress</Tabs.Trigger>}
            {hasReqs && <Tabs.Trigger value="requirements" className={TAB}>System requirements</Tabs.Trigger>}
          </Tabs.List>
          <Tabs.Content value="overview" className="focus-visible:outline-none">
            <Overview game={game} onScreenshots={() => setTab('screenshots')} />
          </Tabs.Content>
          <Tabs.Content value="screenshots" className="focus-visible:outline-none">
            <div className="grid gap-8">
              <ScreenshotGallery title={game.title} screenshots={game.screenshots ?? []} />
              <section>
                <h2 className="mb-3 font-heading text-2xl font-bold text-text">Trailers</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <TrailerTiles slug={game.slug} onPlay={() => setTrailerOpen(true)} />
                </div>
              </section>
            </div>
            <TrailerModal slug={game.slug} title={game.title} isOpen={trailerOpen} onClose={() => setTrailerOpen(false)} />
          </Tabs.Content>
          <Tabs.Content value="community" className="grid gap-8 focus-visible:outline-none lg:grid-cols-2">
            <section>
              <h2 className="mb-4 font-heading text-2xl font-bold text-text">Community reviews</h2>
              {entry ? <ReviewPanel gameId={game.id} status={entry.status} /> : <ReviewsSection gameId={game.id} />}
            </section>
            <section>
              <h2 className="mb-4 font-heading text-2xl font-bold text-text">Friends who have the game</h2>
              <FriendsSection slug={game.slug} />
            </section>
          </Tabs.Content>
          {entry && (
            <Tabs.Content value="progress" className="focus-visible:outline-none">
              <ProgressPanel key={entry.id} entryId={entry.id} status={entry.status} initialProgress={entry.manualProgress ?? 0} />
            </Tabs.Content>
          )}
          {hasReqs && (
            <Tabs.Content value="requirements" className="focus-visible:outline-none">
              <Requirements data={reqs} />
            </Tabs.Content>
          )}
        </Tabs.Root>
        <MoreLikeThis game={game} />
      </div>
    </div>
  );
}

export default function Game() {
  const { slug } = useParams();
  const load = useCallback((signal) => getGame(slug, { signal }), [slug]);
  const { status, data: game, error, retry } = useAsync(load);
  return <section className="flex flex-col gap-6 bg-bg pb-12 text-text">
    {status === 'loading' && <GameSkeleton />}
    {status === 'error' && (error.status === 404 || error.response?.status === 404 ? <EmptyState headingLevel="h1" title="Game not found" description="This game isn't in the catalog yet. Try searching for it." actionLabel="Search games" actionTo="/explore" /> : <ErrorState message={error.message} onRetry={retry} />)}
    {status === 'success' && game && <GameDetails key={game.id} game={game} />}
  </section>;
}

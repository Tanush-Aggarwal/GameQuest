import { lazy, Suspense, useCallback, useState } from 'react';
const VelocityChart = lazy(() => import('@/components/home/VelocityChart.jsx'));
import { Link } from 'react-router-dom';
import {
  Gamepad2,
  Layers,
  Trophy,
  Clock,
  ChevronRight,
  Star,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.js';
import { useAsync } from '@/hooks/useAsync.js';
import { getBacklogHealth, getDashboard, getNextAdventure, getPlayNext } from '@/services/progressApi.js';
import { getFeaturedGames, searchGames } from '@/services/gamesApi.js';
import { ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { SectionBoundary } from '@/components/ui/SectionBoundary.jsx';
import { FriendFeed } from '@/components/feed/FriendFeed.jsx';
import { UpcomingSessions } from '@/components/sessions/UpcomingSessions.jsx';
import { PlayNextSection } from '@/components/home/PlayNextRail.jsx';
import { HomeHero } from '@/components/home/HomeHero.jsx';
import { CoverImage, GameCardSkeleton } from '@/components/games/GameCard.jsx';

export default function Home() {
  const { user } = useAuth();

  const loadDashboard = useCallback((signal) => getDashboard({ signal }), []);
  const loadPlayNext = useCallback((signal) => getPlayNext({ limit: 8 }, { signal }), []);
  const loadBacklogHealth = useCallback((signal) => getBacklogHealth({ signal }), []);
  const loadTrending = useCallback(async (signal) => {
    try {
      const data = await getFeaturedGames({ limit: 5 }, { signal });
      return data?.items ?? [];
    } catch {
      try {
        const data = await searchGames({ limit: 5 }, { signal });
        return data?.items ?? [];
      } catch {
        return [];
      }
    }
  }, []);

  const dashboard = useAsync(loadDashboard);
  const playNext = useAsync(loadPlayNext);
  const backlogHealth = useAsync(loadBacklogHealth);
  const trending = useAsync(loadTrending);

  return (
    <section className="gq-home flex flex-col gap-8 pb-12">
      <div className="sr-only" data-art="header" />
      <HomeHero username={user?.username} dashboard={dashboard} playNext={playNext} />

      {/* Two-column layout: Trending games + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left: Trending Games */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div>
                <h2 className="font-heading text-lg font-bold text-[var(--text)]">Trending Games</h2>
                <p className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                  <span aria-hidden="true">&harr;</span> Popular right now in the community
                </p>
              </div>
            </div>
            <Link
              to="/explore"
              className="flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              View All
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <TrendingRow trending={trending} />
        </div>

        {/* Right: Recommendation + Community */}
        <div className="flex flex-col gap-4">
          <AdventureCard />
          <CommunityCard />
        </div>
      </div>

      {/* Library stats */}
      <StatTiles dashboard={dashboard} />

      {/* Play next */}
      <PlayNextSection playNext={playNext} />

      {/* Sessions and friend activity */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <UpcomingSessions />
        <FriendFeed />
      </div>

      {/* Backlog health */}
      <BacklogHealth backlogHealth={backlogHealth} />
    </section>
  );
}

// ── Stat tiles ───────────────────────────────────────────────────────────────

function StatTiles({ dashboard }) {
  if (dashboard.status === 'loading') {
    return (
      <div role="status" aria-label="Loading your library at a glance">
        <Skeleton className="h-[8.25rem] w-full rounded-card" />
      </div>
    );
  }
  if (dashboard.status === 'error') return <ErrorState message="Couldn't load your stats." onRetry={dashboard.retry} />;
  const d = dashboard.data ?? {};
  const tiles = [
    { icon: Gamepad2, label: 'Playing', value: d.statusCounts?.playing ?? 0, color: 'var(--status-playing)' },
    { icon: Layers, label: 'Backlog', value: d.statusCounts?.backlog ?? 0, color: 'var(--status-backlog)' },
    { icon: Trophy, label: 'Completed', value: d.statusCounts?.completed ?? 0, color: 'var(--status-completed)' },
    { icon: Clock, label: 'Hours logged', value: d.totalHours ?? 0, color: 'var(--secondary-accent)' },
  ];
  return (
    <section aria-label="Your library at a glance" className="gq-stat-strip p-4 rounded-card border border-border bg-surface">
      <div className="sr-only" data-art="stats" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
        {tiles.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
            >
              <Icon className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold font-heading tabular-nums text-text">{value}</p>
              <p className="text-xs text-text-muted truncate">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Trending Games Row ───────────────────────────────────────────────────────

function TrendingRow({ trending }) {
  if (trending.status === 'loading') {
    return (
      <div className="flex overflow-x-auto gap-3 pb-2 scrollbar-none sm:grid sm:grid-cols-3 lg:grid-cols-5 sm:overflow-visible sm:pb-0" role="status" aria-label="Loading trending games">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="w-[145px] shrink-0 sm:w-auto">
            <GameCardSkeleton />
          </div>
        ))}
      </div>
    );
  }

  if (trending.status === 'error') {
    return <ErrorState message="Couldn't load trending games." onRetry={trending.retry} />;
  }

  const items = trending.data ?? [];
  if (!items.length) {
    return (
      <div className="rounded-[10px] border border-border/40 bg-surface/50 p-8 text-center text-xs text-text-muted">
        No trending games available right now.
      </div>
    );
  }

  return (
    <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 scrollbar-none sm:grid sm:grid-cols-3 lg:grid-cols-5 sm:overflow-visible sm:pb-0">
      {items.slice(0, 5).map((game) => (
        <TrendingCard key={game.id || game.slug} game={game} />
      ))}
    </div>
  );
}

function TrendingCard({ game }) {
  const displayTitle = game.title;
  const ratingValue = game.rating != null
    ? (typeof game.rating === 'number' ? game.rating.toFixed(1) : game.rating)
    : (game.ratingAvg > 0 ? game.ratingAvg.toFixed(1) : (game.totalRating ? (game.totalRating / 10).toFixed(1) : null));

  return (
    <Link
      to={`/games/${game.slug}`}
      className="gq-game-card group relative flex flex-col aspect-[3/4] w-[150px] shrink-0 snap-start sm:w-auto overflow-hidden rounded-[10px] bg-[#161816] text-white transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="relative h-full w-full overflow-hidden">
        <CoverImage
          cover={game.cover}
          title={displayTitle}
          alt={displayTitle}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* Dark bottom gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 via-45% to-transparent pointer-events-none" />

        {/* Overlaid game details at bottom */}
        <div className="absolute inset-x-0 bottom-0 p-3 flex flex-col gap-1 z-10">
          <h3 className="line-clamp-2 text-xs sm:text-sm font-bold leading-tight text-white drop-shadow-sm">
            {displayTitle}
          </h3>
          <div className="flex items-center justify-between text-xs pt-0.5">
            <span className="truncate rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm">
              {game.genres?.[0] ?? 'Game'}
            </span>
            {ratingValue && (
              <span className="flex items-center gap-1 font-bold text-[#F5A04A]">
                <Star className="h-3.5 w-3.5 fill-[#E58A2B] text-[#E58A2B]" aria-hidden="true" />
                {ratingValue}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Right-Side Adventure & Community Panels ──────────────────────────────────

function WideArt({ sources }) {
  const list = [...new Set(sources.filter(Boolean))];
  const [i, setI] = useState(0);
  const src = list[i];
  return (
    <div className="absolute inset-0 -z-0" aria-hidden="true">
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
          loading="lazy"
          onError={() => setI((n) => n + 1)}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-[#161816]/95 via-[#161816]/75 via-50% to-[#161816]/10" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#161816]/80 to-transparent" />
    </div>
  );
}

function AdventureCard() {
  const loadAdventure = useCallback((signal) => getNextAdventure({ signal }), []);
  const { status, data, retry } = useAsync(loadAdventure);

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading your next adventure" className="aspect-[16/9] sm:min-h-[200px] w-full">
        <Skeleton className="h-full w-full rounded-[10px] bg-white/5" />
      </div>
    );
  }

  if (status === 'error') {
    return <ErrorState message="Could not load your next adventure." onRetry={retry} />;
  }

  const pick = data?.pick;
  const game = pick?.game;
  if (!game) return null;

  const title = game.title;
  const badges = pick.reasons?.length
    ? pick.reasons.slice(0, 3)
    : (game.genres?.length ? game.genres.slice(0, 3) : ['RPG', 'Adventure']);
  const summary = game.summary || game.storyline || 'Explore a vast world of wonders and uncover its hidden secrets.';
  const isLibrary = pick.source === 'library';
  const ctaLink = isLibrary && pick.entryId ? `/library/${pick.entryId}` : `/games/${game.slug}`;
  const ctaText = isLibrary ? 'Continue in Library' : 'Add to Library';

  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-[10px] bg-[#161816] p-5 text-white min-h-[200px] border border-white/10 shadow-xl">
      {/* Horizontal art across the whole card: first screenshot, then backdrop/artworks; skips any that fail */}
      <WideArt sources={[game.screenshots?.[0], game.backdrop, ...(game.artworks ?? []), ...(game.screenshots ?? []).slice(1)]} />

      <div className="relative z-10 flex flex-col gap-2.5 max-w-[240px]">
        <div className="flex items-center gap-2">
          <span className="font-heading text-xs font-bold uppercase tracking-wider text-white">
            Your Next Adventure
          </span>
        </div>

        <h3 className="font-heading text-lg font-bold leading-tight text-white drop-shadow-sm">
          {title}
        </h3>

        <div className="flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span
              key={b}
              className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm"
            >
              {b}
            </span>
          ))}
        </div>

        <p className="line-clamp-2 text-xs leading-relaxed text-white/85 drop-shadow-xs">
          {summary}
        </p>
      </div>

      <div className="relative z-10 pt-4">
        <Link
          to={ctaLink}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-5 py-2 text-xs font-bold text-[var(--accent-fg)] transition-transform hover:scale-105 shadow-sm"
        >
          {ctaText}
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </div>
  );
}

function CommunityCard() {
  return (
    <Link
      to="/friends"
      className="relative flex flex-col justify-end overflow-hidden rounded-[10px] bg-[#161816] p-5 text-white min-h-[110px] border border-white/10 shadow-xl transition-transform hover:-translate-y-0.5 group"
    >
      <div className="absolute inset-0 -z-0">
        <img
          src="/assets/community-banner.jpg"
          alt=""
          className="absolute right-0 top-0 h-full w-[60%] object-cover object-right transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#161816] via-[#161816]/90 via-45% to-transparent" />
      </div>
      <div className="relative z-10 flex flex-col gap-0.5">
        <h3 className="text-base font-bold text-white">Join the Community</h3>
        <p className="text-xs text-gray-300">Discuss, share, and connect with fellow gamers.</p>
      </div>
    </Link>
  );
}

// ── Your gaming pace: games added vs finished over 6 months ─────────────────

function PaceStat({ label, value, hint }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-card border border-border bg-bg/60 px-4 py-3">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <span className="font-heading text-2xl font-bold tabular-nums text-text">{value}</span>
      {hint && <span className="text-[11px] text-text-muted">{hint}</span>}
    </div>
  );
}

function clearHint(months) {
  if (months == null) return 'Finish a game to see when your backlog clears';
  if (months <= 1) return 'Clears in about a month at this pace';
  if (months < 24) return `Clears in about ${months} months at this pace`;
  return `About ${Math.round(months / 12)} years at this pace`;
}

function BacklogHealth({ backlogHealth }) {
  if (backlogHealth.status === 'loading') {
    return (
      <div role="status" aria-label="Loading your gaming pace">
        <Skeleton className="h-[22rem] w-full rounded-card" />
      </div>
    );
  }
  if (backlogHealth.status === 'error') return <ErrorState message="Couldn't load your gaming pace." onRetry={backlogHealth.retry} />;
  const h = backlogHealth.data ?? {};
  const data = h.data ?? [];
  const hasActivity = (h.totalAdded ?? 0) + (h.totalCompleted ?? 0) > 0;

  return (
    <section aria-labelledby="pace-title" className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="pace-title" className="font-heading text-lg font-bold text-text">Your gaming pace</h2>
          <p className="text-xs text-text-muted">Games you added vs games you finished, last 6 months</p>
        </div>
        <Link to="/library?status=backlog" className="inline-flex items-center gap-1 text-sm font-medium text-text-muted hover:text-text">
          Open backlog <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PaceStat label="Added" value={h.totalAdded ?? 0} hint="last 6 months" />
        <PaceStat label="Finished" value={h.totalCompleted ?? 0} hint="last 6 months" />
        <PaceStat label="Finished per month" value={h.completedPerMonth ?? 0} hint="6-month average" />
        <PaceStat label="In backlog" value={h.backlogCount ?? 0} hint={clearHint(h.projectedClearMonths)} />
      </div>

      {hasActivity ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4 text-xs text-text-muted" aria-hidden="true">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-[var(--accent)]" /> Added</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-[var(--status-completed)]" /> Finished</span>
          </div>
          <div className="h-[16rem] w-full">
            <Suspense fallback={<Skeleton className="h-full w-full rounded-card" />}>
              <VelocityChart chartData={data} />
            </Suspense>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border px-4 py-10 text-center">
          <Layers className="h-7 w-7 text-text-muted opacity-50" aria-hidden="true" />
          <p className="text-sm font-medium text-text">Nothing added or finished in the last 6 months</p>
          <p className="max-w-md text-xs text-text-muted">Add games to your library or mark one as completed, and your pace shows up here.</p>
          <Link to="/explore" className="mt-1 text-sm font-semibold text-text underline-offset-4 hover:underline">Find a game</Link>
        </div>
      )}
    </section>
  );
}

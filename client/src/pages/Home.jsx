import { lazy, Suspense, useCallback, useState } from 'react';
const VelocityChart = lazy(() => import('@/components/home/VelocityChart.jsx'));
import { Link } from 'react-router-dom';
import {
  Flame,
  Gamepad2,
  Layers,
  Trophy,
  Clock,
  ChevronRight,
  Star,
  ShoppingBag,
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
              <Flame className="h-5 w-5 text-[var(--secondary-accent)] fill-[var(--secondary-accent)]" aria-hidden="true" />
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
      <div className="gq-social-grid">
        <UpcomingSessions />
        <FriendFeed />
      </div>

      {/* Backlog health */}
      <BacklogHealth dashboard={dashboard} backlogHealth={backlogHealth} />
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
    { icon: Clock, label: 'Hours logged', value: d.totalHours ?? 0, color: 'var(--accent)' },
  ];
  return (
    <section aria-label="Your library at a glance" className="gq-stat-strip p-4 rounded-card border border-border bg-surface">
      <div className="sr-only" data-art="stats" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
        {tiles.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)]">
              <Icon className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" role="status" aria-label="Loading trending games">
        {Array.from({ length: 5 }, (_, i) => (
          <GameCardSkeleton key={i} />
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
      className="gq-game-card group relative flex flex-col aspect-[3/4] w-full overflow-hidden rounded-[10px] bg-[#161816] text-white transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
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
            <div className="flex items-center gap-1.5 text-gray-400">
              <ShoppingBag className="h-3 w-3" aria-hidden="true" />
              <Gamepad2 className="h-3 w-3" aria-hidden="true" />
            </div>
            {ratingValue && (
              <span className="flex items-center gap-1 font-bold text-[#E58A2B]">
                <Star className="h-3 w-3 fill-[#E58A2B] text-[#E58A2B]" aria-hidden="true" />
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

      <div className="relative z-10 flex flex-col gap-2.5 max-w-[210px]">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-[var(--secondary-accent)] fill-[var(--secondary-accent)]" aria-hidden="true" />
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
              className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-medium text-gray-300 backdrop-blur-xs"
            >
              {b}
            </span>
          ))}
        </div>

        <p className="line-clamp-2 text-xs leading-relaxed text-gray-300 drop-shadow-xs">
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

// ── Backlog health chart ────────────────────────────────────────────────────

function BacklogHealth({ dashboard, backlogHealth }) {
  if (dashboard.status === 'loading') {
    return (
      <div role="status" aria-label="Loading your backlog trajectory">
        <Skeleton className="h-[22rem] w-full rounded-card" />
      </div>
    );
  }
  if (dashboard.status === 'error') return <ErrorState message="Couldn't load your backlog health." onRetry={dashboard.retry} />;
  const d = dashboard.data ?? {};
  const backlogCount = d.statusCounts?.backlog ?? 0;
  const isHealthy = d.velocity?.perMonth > 0;
  return (
    <section aria-label="Backlog health and completion trajectory" className="flex flex-col gap-4">
      <SectionBoundary
        title="Backlog Health"
        subtitle={
          isHealthy
            ? `At your current velocity of ${d.velocity.perMonth} games/mo, your backlog of ${backlogCount} games will be cleared around ${d.projectedClearDate ?? 'soon'}.`
            : `You have ${backlogCount} games in your backlog. Log completions to see your projected clear date.`
        }
      >
        <div className="gq-chart-panel rounded-card border border-border bg-surface p-5">
          <Suspense fallback={<Skeleton className="h-[18rem] w-full rounded-card" />}>
            <VelocityChart history={backlogHealth.data?.history ?? []} />
          </Suspense>
        </div>
      </SectionBoundary>
    </section>
  );
}

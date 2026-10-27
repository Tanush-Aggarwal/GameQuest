import { lazy, Suspense, useCallback } from 'react';
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
import { getBacklogHealth, getDashboard, getPlayNext } from '@/services/progressApi.js';
import { listInbox } from '@/services/recommendationsApi.js';
import { ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { SectionBoundary } from '@/components/ui/SectionBoundary.jsx';
import { FriendFeed } from '@/components/feed/FriendFeed.jsx';
import { UpcomingSessions } from '@/components/sessions/UpcomingSessions.jsx';
import { RecommendationWidget } from '@/components/recommendations/RecommendationWidget.jsx';
import { PlayNextSection } from '@/components/home/PlayNextRail.jsx';
import { HomeHero } from '@/components/home/HomeHero.jsx';
import { GameCardSkeleton, getGameArtwork } from '@/components/games/GameCard.jsx';
import { getGame, searchGames } from '@/services/gamesApi.js';

export default function Home() {
  const { user } = useAuth();

  const loadDashboard = useCallback((signal) => getDashboard({ signal }), []);
  const loadPlayNext = useCallback((signal) => getPlayNext({ limit: 8 }, { signal }), []);
  const loadBacklogHealth = useCallback((signal) => getBacklogHealth({ signal }), []);
  const loadTrending = useCallback(async (signal) => {
    try {
      const featuredSlugs = ['hollow-knight-silksong', 'elden-ring', 'clair-obscur-expedition-33', 'hades-ii', 'zenless-zone-zero'];
      const results = await Promise.allSettled(
        featuredSlugs.map((slug) => getGame(slug, { signal }))
      );
      const featured = results
        .filter((r) => r.status === 'fulfilled' && r.value)
        .map((r) => r.value);
      if (featured.length === 5) return featured;
    } catch {
      // fallback to search
    }
    const data = await searchGames({ limit: 5 }, { signal }).catch(() => null);
    return data?.items ?? [];
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
          <AdventureCard dashboard={dashboard} />
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
              <p className="font-heading text-xl font-bold tabular-nums text-text">{value}</p>
              <p className="text-xs text-text-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Trending row: 5 game cards in a horizontal row
function TrendingRow({ trending }) {
  if (trending.status === 'loading') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" role="status" aria-label="Loading trending games">
        {Array.from({ length: 5 }, (_, i) => <GameCardSkeleton key={i} />)}
      </div>
    );
  }
  if (trending.status === 'error') {
    return <ErrorState message="Couldn't load trending games." onRetry={trending.retry} />;
  }
  const items = trending.data ?? [];
  if (!items.length) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.slice(0, 5).map((game) => (
        <TrendingCard key={game.id || game.slug} game={game} />
      ))}
    </div>
  );
}

// Individual trending card matching reference: full bleed image with dark overlay, white text anchored at bottom-left, rating at bottom-right
function TrendingCard({ game }) {
  const displayTitle = game.title;
  const ratingValue = game.ratingAvg > 0
    ? game.ratingAvg.toFixed(1)
    : (game.totalRating ? (game.totalRating / 10).toFixed(1) : null);
  const artwork = getGameArtwork(game) || game.cover;

  return (
    <Link
      to={`/games/${game.slug}`}
      className="gq-game-card group relative flex flex-col aspect-[3/4] w-full overflow-hidden rounded-[10px] bg-[#161816] text-white transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="relative h-full w-full overflow-hidden">
        {artwork ? (
          <img
            src={artwork}
            alt={displayTitle}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-[#1a1c1a]" />
        )}

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

// "Your Next Adventure" recommendation card: dynamically selects an eligible game from the catalogue
function AdventureCard({ dashboard }) {
  const topGenre = dashboard?.data?.topGenres?.[0]?.name;

  const loadRec = useCallback(async (signal) => {
    // 1. Check if user has a pending friend recommendation
    try {
      const inbox = await listInbox({ status: 'pending', limit: 1 }, { signal });
      if (inbox?.items?.[0]?.game) {
        return inbox.items[0].game;
      }
    } catch {
      // Proceed to catalogue recommendation
    }

    // 2. Discover an eligible catalogue game matching user's top genre or top rated
    try {
      const res = await searchGames(
        topGenre ? { genre: topGenre, limit: 10 } : { sort: 'rating', limit: 10 },
        { signal },
      );
      const candidates = (res?.items ?? []).filter((g) => g && g.slug);
      if (candidates.length) {
        return candidates[0];
      }
    } catch {
      // Proceed to fallback
    }

    // 3. Documented catalogue fallback
    try {
      const fallback = await searchGames({ limit: 5 }, { signal });
      if (fallback?.items?.[0]) return fallback.items[0];
    } catch {
      // fallback
    }

    // 4. Default catalogue reference game (Genshin Impact) if network unavailable
    return {
      title: 'Genshin Impact',
      slug: 'genshin-impact',
      genres: ['Role-playing (RPG)', 'Adventure'],
      summary: 'Explore a vast world of wonders and uncover its hidden secrets across the realm of Teyvat.',
      heroImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/ar2ht4.jpg',
      backdrop: 'https://images.igdb.com/igdb/image/upload/t_1080p/ar2ht4.jpg',
      cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/coa9dy.jpg',
    };
  }, [topGenre]);

  const { status, data: game } = useAsync(loadRec);

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading recommendation" className="aspect-[16/9] sm:min-h-[200px] w-full">
        <Skeleton className="h-full w-full rounded-[10px] bg-white/5" />
      </div>
    );
  }

  if (!game) return null;

  const title = game.title;
  const genres = game.genres?.length ? game.genres.slice(0, 3) : ['RPG', 'Adventure'];
  const summary = game.summary || game.storyline || 'Explore a vast world of wonders and uncover its hidden secrets.';
  const artwork = game.heroImage || game.backdrop || game.artworks?.[0] || game.cover;
  const link = `/games/${game.slug}`;

  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-[10px] bg-[#161816] p-5 text-white min-h-[200px]">
      {/* Background artwork on the right */}
      <div className="absolute inset-0 -z-0">
        {artwork && (
          <img
            src={artwork}
            alt={title}
            className="absolute right-0 top-0 h-full w-[55%] object-cover object-right"
            loading="lazy"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-[#161816] via-[#161816]/90 via-55% to-transparent" />
      </div>

      <div className="relative z-10 flex flex-col gap-2.5 max-w-[210px]">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-[var(--secondary-accent)] fill-[var(--secondary-accent)]" aria-hidden="true" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">Your Next Adventure</h3>
        </div>

        <div>
          <h4 className="text-base font-bold text-white leading-tight line-clamp-1">{title}</h4>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {genres.map((g) => (
              <span key={g} className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-gray-300">
                {g}
              </span>
            ))}
          </div>
        </div>

        <p className="text-xs leading-relaxed text-gray-300 line-clamp-2">
          {summary}
        </p>
      </div>

      <div className="relative z-10 pt-3">
        <Link
          to={link}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-bold text-[var(--accent-fg)] transition-transform hover:scale-[1.02]"
        >
          Add to Library
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

// Community card
function CommunityCard() {
  return (
    <Link
      to="/friends"
      className="relative flex flex-col justify-end overflow-hidden rounded-[10px] bg-[#161816] p-5 text-white min-h-[110px] transition-transform hover:-translate-y-0.5 group"
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

// Backlog health section
function BacklogHealth({ dashboard, backlogHealth }) {
  const d = dashboard.data;
  const h = backlogHealth.data;

  if (!d?.backlogHours && !d?.completedThisYear && !h?.data?.length) return null;

  const chartData = (h?.data ?? []).map((item) => ({
    ...item,
    formattedMonth: new Date(`${item.month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short' }),
  }));

  return (
    <section aria-labelledby="backlog-health-title" className="gq-editorial-panel gq-backlog-panel flex flex-col gap-4 py-5 rounded-card border border-border bg-surface p-5">
      <div className="sr-only" data-art="backlog" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="backlog-health-title" className="font-semibold flex items-center gap-2 font-heading">
          <Layers size={18} className="text-[var(--accent)]" aria-hidden="true" />
          Backlog Health
        </h2>
      </div>

      <div className="flex gap-6 flex-wrap text-sm border-b border-border pb-4">
        {d?.completedThisYear > 0 && (
          <div>
            <p className="text-2xl font-bold tabular-nums font-heading text-[var(--status-completed)]">{d.completedThisYear}</p>
            <p className="text-text-muted text-xs">completed this year</p>
          </div>
        )}
        {d?.backlogHours > 0 && (
          <div>
            <p className="text-2xl font-bold tabular-nums font-heading text-[var(--warning)]">{Math.round(d.backlogHours)}h</p>
            <p className="text-text-muted text-xs">in backlog</p>
          </div>
        )}
        {h?.backlogCount > 0 && (
          <div>
            <p className="text-2xl font-bold tabular-nums font-heading text-text">{h.backlogCount}</p>
            <p className="text-text-muted text-xs">backlog titles</p>
          </div>
        )}
      </div>

      {chartData.length >= 2 && (
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>6-Month Trajectory: Added vs Completed</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Added
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-completed)]" /> Completed
              </span>
            </div>
          </div>

          <div className="h-44 w-full">
            <SectionBoundary message="Couldn't load the chart.">
              <Suspense fallback={<div role="status" aria-label="Loading chart" className="h-full w-full" />}>
                <VelocityChart chartData={chartData} />
              </Suspense>
            </SectionBoundary>
          </div>
        </div>
      )}
    </section>
  );
}

import { lazy, Suspense, useCallback } from 'react';
// Recharts is the largest dependency on this page and only draws one chart, so it loads on demand.
const VelocityChart = lazy(() => import('@/components/home/VelocityChart.jsx'));
import {
  Clock,
  Gamepad2,
  Hourglass,
  Layers,
  Trophy,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.js';
import { useAsync } from '@/hooks/useAsync.js';
import { getBacklogHealth, getDashboard, getPlayNext } from '@/services/progressApi.js';
import { ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { SectionBoundary } from '@/components/ui/SectionBoundary.jsx';
import { FriendFeed } from '@/components/feed/FriendFeed.jsx';
import { UpcomingSessions } from '@/components/sessions/UpcomingSessions.jsx';
import { RecommendationWidget } from '@/components/recommendations/RecommendationWidget.jsx';
import { ArtPanel } from '@/components/art/ArtPanel.jsx';
import { PlayNextSection } from '@/components/home/PlayNextRail.jsx';
import { HomeHero } from '@/components/home/HomeHero.jsx';

export default function Home() {
  const { user } = useAuth();

  const loadDashboard = useCallback((signal) => getDashboard({ signal }), []);
  const loadPlayNext = useCallback((signal) => getPlayNext({ limit: 8 }, { signal }), []);
  const loadBacklogHealth = useCallback((signal) => getBacklogHealth({ signal }), []);

  const dashboard = useAsync(loadDashboard);
  const playNext = useAsync(loadPlayNext);
  const backlogHealth = useAsync(loadBacklogHealth);

  return (
    <section className="gq-home flex flex-col gap-8 pb-12">
      {/* Large cinematic gaming-artwork hero */}
      <HomeHero username={user?.username} dashboard={dashboard} playNext={playNext} />

      {/* Main layout: trending row & stats alongside narrower recommendation & community column */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
        {/* Main column: Trending / What to play next row, quick stats strip, and velocity chart */}
        <div className="flex flex-col gap-8 lg:col-span-8">
          {/* Trending games arranged in a horizontal row */}
          <PlayNextSection playNext={playNext} />

          {/* Quick stat tiles */}
          <StatTiles dashboard={dashboard} />

          {/* Backlog health with Recharts */}
          <BacklogHealth dashboard={dashboard} backlogHealth={backlogHealth} />
        </div>

        {/* Narrower recommendation and community column alongside */}
        <div className="flex flex-col gap-6 lg:col-span-4">
          {/* Recommended for you */}
          <RecommendationWidget />

          {/* Community & friends: upcoming sessions & activity feed */}
          <UpcomingSessions />
          <FriendFeed />
        </div>
      </div>
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
    { icon: Gamepad2, label: 'Playing', value: d.statusCounts?.playing ?? 0 },
    { icon: Layers, label: 'Backlog', value: d.statusCounts?.backlog ?? 0 },
    { icon: Trophy, label: 'Completed', value: d.statusCounts?.completed ?? 0 },
    { icon: Clock, label: 'Hours logged', value: d.totalHours ?? 0 },
  ];
  return (
    <section aria-label="Your library at a glance" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-2xs transition-shadow hover:shadow-xs">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface-raised text-text">
            <Icon size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-heading text-xl font-bold tabular-nums text-text leading-none">{value}</p>
            <p className="mt-1 text-xs text-text-muted truncate">{label}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

// ── Backlog health ──────────────────────────────────────────────────────────

function BacklogHealth({ dashboard, backlogHealth }) {
  const d = dashboard.data;
  const h = backlogHealth.data;

  if (!d?.backlogHours && !d?.completedThisYear && !h?.data?.length) return null;

  const chartData = (h?.data ?? []).map((item) => ({
    ...item,
    formattedMonth: new Date(`${item.month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short' }),
  }));

  return (
    <ArtPanel aria-labelledby="backlog-health-title" seed="home-backlog" className="gq-editorial-panel gq-backlog-panel flex flex-col gap-4 p-5 rounded-card border border-border bg-surface shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="backlog-health-title" className="font-bold flex items-center gap-2 font-heading text-base text-text">
          <Layers size={18} className="text-text" />
          Backlog Health & Velocity
        </h2>
        {h?.projectedClearMonths != null && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-fg">
            <Hourglass className="h-3.5 w-3.5" />
            Clear backlog in ~{h.projectedClearMonths} months
          </span>
        )}
      </div>

      <div className="flex gap-6 flex-wrap text-sm border-b border-border/50 pb-4">
        {d?.completedThisYear > 0 && (
          <div>
            <p className="text-2xl font-bold tabular-nums font-heading text-[var(--status-completed)]">{d.completedThisYear}</p>
            <p className="text-[var(--text-muted)] text-xs">completed this year</p>
          </div>
        )}
        {d?.backlogHours > 0 && (
          <div>
            <p className="text-2xl font-bold tabular-nums font-heading text-[var(--warning)]">{Math.round(d.backlogHours)}h</p>
            <p className="text-[var(--text-muted)] text-xs">in backlog</p>
          </div>
        )}
        {h?.backlogCount > 0 && (
          <div>
            <p className="text-2xl font-bold tabular-nums font-heading text-text">{h.backlogCount}</p>
            <p className="text-[var(--text-muted)] text-xs">backlog titles</p>
          </div>
        )}
        {d?.topGenres?.length > 0 && (
          <div className="flex-1 min-w-[140px]">
            <p className="text-xs text-[var(--text-muted)] mb-1.5">Top genres played</p>
            <div className="flex flex-wrap gap-1">
              {d.topGenres.slice(0, 4).map((g) => (
                <span key={g.name} className="text-xs px-2.5 py-0.5 rounded-full bg-[var(--surface-raised)] text-text font-medium">
                  {g.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Velocity Trend Chart */}
      {chartData.length >= 2 && (
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>6-Month Trajectory: Added vs Completed</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#C9F36D] border border-black/20" /> Added
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-completed)]" /> Completed
              </span>
            </div>
          </div>

          <div className="h-44 w-full">
            <SectionBoundary message="Couldn’t load the chart.">
              <Suspense fallback={<div role="status" aria-label="Loading chart" className="h-full w-full" />}>
                <VelocityChart chartData={chartData} />
              </Suspense>
            </SectionBoundary>
          </div>
        </div>
      )}
    </ArtPanel>
  );
}

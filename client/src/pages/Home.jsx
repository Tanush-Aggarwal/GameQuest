import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChevronRight,
  Clock,
  Compass,
  Gamepad2,
  Hourglass,
  Layers,
  Trophy,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.js';
import { useAsync } from '@/hooks/useAsync.js';
import { getBacklogHealth, getDashboard, getPlayNext } from '@/services/progressApi.js';
import { ErrorState } from '@/components/ui/states.jsx';
import { FriendFeed } from '@/components/feed/FriendFeed.jsx';
import { UpcomingSessions } from '@/components/sessions/UpcomingSessions.jsx';
import { RecommendationWidget } from '@/components/recommendations/RecommendationWidget.jsx';
import { CoverImage } from '@/components/games/GameCard.jsx';
import { ArtHeader, ArtPanel } from '@/components/art/ArtPanel.jsx';
import { PlayNextSection } from '@/components/home/PlayNextRail.jsx';
import { buttonVariants } from '@/components/ui/button.jsx';

export default function Home() {
  const { user } = useAuth();

  const loadDashboard = useCallback((signal) => getDashboard({ signal }), []);
  const loadPlayNext = useCallback((signal) => getPlayNext({ limit: 8 }, { signal }), []);
  const loadBacklogHealth = useCallback((signal) => getBacklogHealth({ signal }), []);

  const dashboard = useAsync(loadDashboard);
  const playNext = useAsync(loadPlayNext);
  const backlogHealth = useAsync(loadBacklogHealth);

  return (
    <section className="flex flex-col gap-6 pb-12">
      <ArtHeader
        title={`Welcome back, ${user?.username}`}
        seed="home"
        actions={
          <Link to="/explore" className={buttonVariants({ variant: 'secondary' })}>
            <Compass className="h-4 w-4" aria-hidden="true" /> Discover new games
          </Link>
        }
      />

      {/* Resume card */}
      <ResumeCard dashboard={dashboard} />

      {/* Recommended for you */}
      <RecommendationWidget />

      {/* Stat tiles */}
      <StatTiles dashboard={dashboard} />

      {/* Play next */}
      <PlayNextSection playNext={playNext} />

      {/* Planned game nights */}
      <UpcomingSessions />

      {/* What friends are up to */}
      <FriendFeed />

      {/* Backlog health with Recharts */}
      <BacklogHealth dashboard={dashboard} backlogHealth={backlogHealth} />
    </section>
  );
}

// ── Resume card ─────────────────────────────────────────────────────────────

function ResumeCard({ dashboard }) {
  if (dashboard.status === 'loading') return <div className="h-32 rounded-[var(--radius-card)] bg-[var(--surface)] animate-pulse" />;
  if (dashboard.status === 'error') return null; // silent: resume card is bonus UX
  const card = dashboard.data?.resumeCard;
  if (!card) return null;

  return (
    <ArtPanel
      as={Link}
      to={`/library/${card.entryId}`}
      art={card}
      seed="home-resume"
      className="group flex gap-4 p-4 transition-colors hover:border-accent"
    >
      {card.cover && (
        <CoverImage cover={card.cover} title={card.title} alt={card.title} compact className="w-16 h-20 rounded-lg flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wide">Continue playing</p>
        <h2 className="font-bold font-heading text-lg truncate">{card.title}</h2>

        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-[var(--border)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${card.manualProgress}%` }}
            />
          </div>
          <span className="text-xs text-[var(--text-muted)] tabular-nums">{card.manualProgress}%</span>
        </div>

        {card.note && <p className="mt-2 text-sm text-[var(--text-muted)] line-clamp-1 italic">&ldquo;{card.note}&rdquo;</p>}
      </div>
      <ChevronRight size={18} className="text-[var(--text-muted)] self-center group-hover:text-[var(--accent)] transition-colors flex-shrink-0" />
    </ArtPanel>
  );
}

// ── Stat tiles ───────────────────────────────────────────────────────────────

function StatTiles({ dashboard }) {
  if (dashboard.status === 'loading') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 rounded-[var(--radius-card)] bg-[var(--surface)] animate-pulse" />
        ))}
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
    <ArtPanel aria-label="Your library at a glance" seed="home-stats" className="p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="flex flex-col gap-1 rounded-card border border-border/60 bg-bg/70 p-4">
            <Icon size={18} style={{ color }} aria-hidden="true" />
            <p className="font-heading text-2xl font-bold tabular-nums">{value}</p>
            <p className="text-xs text-text-muted">{label}</p>
          </div>
        ))}
      </div>
    </ArtPanel>
  );
}

// ── Backlog health ──────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const formattedMonth = label ? new Date(`${label}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : label;
    return (
      <div className="rounded-card border border-border bg-surface p-2.5 shadow-xl text-xs space-y-1">
        <p className="font-semibold text-text mb-1">{formattedMonth}</p>
        {payload.map((entry) => (
          <p key={entry.name} className="flex items-center gap-2 font-medium" style={{ color: entry.color }}>
            <span className="capitalize">{entry.name}:</span>
            <span className="tabular-nums font-bold">{entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
}

function BacklogHealth({ dashboard, backlogHealth }) {
  const d = dashboard.data;
  const h = backlogHealth.data;

  if (!d?.backlogHours && !d?.completedThisYear && !h?.data?.length) return null;

  const chartData = (h?.data ?? []).map((item) => ({
    ...item,
    formattedMonth: new Date(`${item.month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short' }),
  }));

  return (
    <ArtPanel aria-labelledby="backlog-health-title" seed="home-backlog" className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="backlog-health-title" className="font-semibold flex items-center gap-2 font-heading">
          <Layers size={18} className="text-[var(--accent)]" />
          Backlog Health & Velocity
        </h2>
        {h?.projectedClearMonths != null && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
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
                <span key={g.name} className="text-xs px-2.5 py-0.5 rounded-full bg-[var(--surface-raised)] text-[var(--text-muted)] font-medium">
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
                <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Added
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-completed)]" /> Completed
              </span>
            </div>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAdded" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--status-completed)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--status-completed)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="formattedMonth" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="added"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorAdded)"
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  stroke="var(--status-completed)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCompleted)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </ArtPanel>
  );
}

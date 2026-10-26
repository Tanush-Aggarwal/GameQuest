import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Gamepad2, Clock, Trophy, Layers, ChevronRight, TrendingUp } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { useAuth } from '@/hooks/useAuth.js';
import { useAsync } from '@/hooks/useAsync.js';
import { getDashboard, getPlayNext } from '@/services/progressApi.js';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { FriendFeed } from '@/components/feed/FriendFeed.jsx';
import { UpcomingSessions } from '@/components/sessions/UpcomingSessions.jsx';

export default function Home() {
  const { user } = useAuth();

  const loadDashboard = useCallback((signal) => getDashboard({ signal }), []);
  const loadPlayNext = useCallback((signal) => getPlayNext({}, { signal }), []);

  const dashboard = useAsync(loadDashboard);
  const playNext = useAsync(loadPlayNext);

  return (
    <section className="flex flex-col gap-6 pb-12">
      <h1 className="text-2xl font-bold font-heading">Welcome back, {user?.username}</h1>

      {/* Resume card */}
      <ResumeCard dashboard={dashboard} />

      {/* Stat tiles */}
      <StatTiles dashboard={dashboard} />

      {/* Play next */}
      <PlayNextSection playNext={playNext} />

      {/* Planned game nights */}
      <UpcomingSessions />

      {/* What friends are up to */}
      <FriendFeed />

      {/* Backlog health */}
      <BacklogHealth dashboard={dashboard} />
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
    <Link
      to={`/library/${card.entryId}`}
      className="flex gap-4 p-4 rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors group"
    >
      {card.cover && (
        <img src={card.cover} alt={card.title} className="w-16 h-20 object-cover rounded-lg flex-shrink-0" loading="lazy" />
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
    </Link>
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
  if (dashboard.status === 'error') return <ErrorState title="Couldn't load stats" retry={dashboard.retry} />;
  const d = dashboard.data ?? {};
  const tiles = [
    { icon: Gamepad2, label: 'Playing', value: d.statusCounts?.playing ?? 0, color: 'var(--status-playing)' },
    { icon: Layers, label: 'Backlog', value: d.statusCounts?.backlog ?? 0, color: 'var(--status-backlog)' },
    { icon: Trophy, label: 'Completed', value: d.statusCounts?.completed ?? 0, color: 'var(--status-completed)' },
    { icon: Clock, label: 'Hours logged', value: d.totalHours ?? 0, color: 'var(--accent)' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {tiles.map(({ icon: Icon, label, value, color }) => (
        <div key={label} className="flex flex-col gap-1 p-4 rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)]">
          <Icon size={18} style={{ color }} />
          <p className="text-2xl font-bold tabular-nums font-heading">{value}</p>
          <p className="text-xs text-[var(--text-muted)]">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Play next ─────────────────────────────────────────────────────────────

function PlayNextSection({ playNext }) {
  return (
    <div>
      <h2 className="text-lg font-bold font-heading mb-3 flex items-center gap-2">
        <TrendingUp size={18} className="text-[var(--accent)]" />
        What to play next
      </h2>

      {playNext.status === 'loading' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 rounded-[var(--radius-card)] bg-[var(--surface)] animate-pulse" />
          ))}
        </div>
      )}

      {playNext.status === 'error' && <ErrorState title="Couldn't load recommendations" retry={playNext.retry} />}

      {playNext.status === 'success' && !playNext.data?.items?.length && (
        <EmptyState
          icon={Gamepad2}
          title="Nothing to recommend yet"
          description="Add games to your backlog and we'll suggest what to play next."
          actionLabel="Find games"
          actionTo="/explore"
        />
      )}

      {playNext.status === 'success' && playNext.data?.items?.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {playNext.data.items.map((item) => (
            <PlayNextCard key={item.entryId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlayNextCard({ item }) {
  return (
    <Link
      to={`/library/${item.entryId}`}
      className="flex gap-3 p-3 rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors group"
    >
      {item.cover ? (
        <img src={item.cover} alt={item.title} className="w-12 h-16 object-cover rounded-lg flex-shrink-0" loading="lazy" />
      ) : (
        <div className="w-12 h-16 rounded-lg bg-[var(--surface-raised)] flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate text-sm">{item.title}</p>
        {item.timeToBeatMain && (
          <p className="text-xs text-[var(--text-muted)] mt-0.5">~{item.timeToBeatMain}h to beat</p>
        )}
        {item.reasons?.length > 0 && (
          <p className="text-xs text-[var(--accent)] mt-1 line-clamp-2">{item.reasons[0]}</p>
        )}
      </div>
    </Link>
  );
}

// ── Backlog health ──────────────────────────────────────────────────────────

function BacklogHealth({ dashboard }) {
  const d = dashboard.data;
  if (!d?.backlogHours && !d?.completedThisYear) return null;

  return (
    <div className="p-4 rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)]">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Layers size={16} className="text-[var(--text-muted)]" />
        Backlog snapshot
      </h3>
      <div className="flex gap-6 flex-wrap text-sm">
        {d.completedThisYear > 0 && (
          <div>
            <p className="text-2xl font-bold tabular-nums font-heading text-[var(--status-completed)]">{d.completedThisYear}</p>
            <p className="text-[var(--text-muted)] text-xs">completed this year</p>
          </div>
        )}
        {d.backlogHours > 0 && (
          <div>
            <p className="text-2xl font-bold tabular-nums font-heading text-[var(--warning)]">{Math.round(d.backlogHours)}h</p>
            <p className="text-[var(--text-muted)] text-xs">in backlog</p>
          </div>
        )}
        {d.topGenres?.length > 0 && (
          <div className="flex-1 min-w-[140px]">
            <p className="text-xs text-[var(--text-muted)] mb-1">Top genres</p>
            <div className="flex flex-wrap gap-1">
              {d.topGenres.slice(0, 4).map((g) => (
                <span key={g.name} className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-raised)] text-[var(--text-muted)]">
                  {g.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

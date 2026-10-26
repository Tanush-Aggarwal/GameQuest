import { useCallback, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Clock, Trophy, Gamepad2, Trash2, Eye, EyeOff, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { LIBRARY_TRANSITIONS } from '@gamequest/shared';
import { useAsync } from '@/hooks/useAsync.js';
import { ErrorState } from '@/components/ui/states.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ProgressPanel } from '@/components/progress/ProgressPanel.jsx';
import { ReviewPanel } from '@/components/review/ReviewPanel.jsx';
import { AddToCollection } from '@/components/collections/AddToCollection.jsx';
import { RecommendationModal } from '@/components/recommendations/RecommendationModal.jsx';
import { getLibraryEntry, changeStatus, setVisibility, removeFromLibrary } from '@/services/libraryApi.js';
import { getErrorInfo } from '@/services/api.js';
import { CoverImage } from '@/components/games/GameCard.jsx';

const STATUS_COLORS = {
  wishlist: 'var(--status-wishlist)',
  backlog: 'var(--status-backlog)',
  playing: 'var(--status-playing)',
  completed: 'var(--status-completed)',
  dropped: 'var(--status-dropped)',
};

const STATUS_LABELS = {
  wishlist: 'Wishlist',
  backlog: 'Backlog',
  playing: 'Playing',
  completed: 'Completed',
  dropped: 'Dropped',
};

export default function LibraryEntry() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [recommendOpen, setRecommendOpen] = useState(false);

  const load = useCallback((signal) => getLibraryEntry(id, { signal }), [id]);
  const { status, data: fetched, retry } = useAsync(load);

  // Local edits (status, visibility) layer over the fetched entry and are dropped when it reloads.
  const [override, setOverride] = useState({ source: null, entry: null });
  const entry = override.source === fetched && fetched ? override.entry : fetched;
  const setEntry = (next) => setOverride({ source: fetched, entry: next });

  async function handleStatusChange(to) {
    try {
      const updated = await changeStatus(id, to);
      setEntry(updated);
      toast.success(`Moved to ${STATUS_LABELS[to]}`);
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    }
  }

  async function handleToggleVisibility() {
    if (!entry) return;
    try {
      const updated = await setVisibility(id, !entry.hiddenFromFriends);
      setEntry(updated);
      toast.success(updated.hiddenFromFriends ? 'Hidden from friends' : 'Visible to friends');
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    }
  }

  async function handleRemove() {
    if (!confirm('Remove this game from your library?')) return;
    try {
      await removeFromLibrary(id);
      toast.success('Removed from library');
      navigate('/library', { replace: true });
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    }
  }

  if (status === 'loading') return <LoadingSkeleton />;
  if (status === 'error') return <ErrorState message="Couldn't load this library entry." onRetry={retry} />;
  if (!entry) return null;

  const game = entry.game ?? {};
  const nextStatuses = LIBRARY_TRANSITIONS[entry.status] ?? [];
  const totalPlaytimeMin = Math.max(
    entry.loggedMinutes ?? 0,
    (entry.ownerships ?? []).reduce((s, o) => s + (o.playtimeMin ?? 0), 0),
  );

  return (
    <section className="flex flex-col gap-6 pb-12 max-w-2xl mx-auto">
      {/* Back nav */}
      <Link to="/library" className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors w-fit">
        <ArrowLeft size={14} /> Library
      </Link>

      {/* Hero */}
      <div className="flex gap-4">
        {game.cover ? (
          <CoverImage cover={game.cover} title={game.title} alt={game.title} className="w-24 h-32 rounded-xl flex-shrink-0 shadow-lg" />
        ) : (
          <div className="w-24 h-32 rounded-xl flex-shrink-0 bg-[var(--surface-raised)] flex items-center justify-center">
            <Gamepad2 size={28} className="text-[var(--text-muted)]" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-1">{game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : ''}</p>
          <h1 className="font-bold font-heading text-2xl leading-tight">{game.title ?? 'Unknown game'}</h1>

          {/* Status badge */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
              style={{ background: `color-mix(in srgb, ${STATUS_COLORS[entry.status]} 15%, transparent)`, color: STATUS_COLORS[entry.status] }}
            >
              {STATUS_LABELS[entry.status]}
            </span>
            {entry.status === 'completed' && entry.completedAt && (
              <span className="text-xs text-[var(--text-muted)]">
                {new Date(entry.completedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>

          {/* Quick stats */}
          <div className="mt-3 flex gap-4 flex-wrap text-sm">
            {totalPlaytimeMin > 0 && (
              <Stat icon={Clock} value={`${Math.round(totalPlaytimeMin / 60)}h`} label="played" />
            )}
            {game.ratingAvg > 0 && (
              <Stat icon={Star} value={game.ratingAvg.toFixed(1)} label="rating" />
            )}
            {game.timeToBeat?.main > 0 && (
              <Stat icon={Trophy} value={`~${game.timeToBeat.main}h`} label="to beat" />
            )}
          </div>
        </div>
      </div>

      {/* Status actions */}
      {nextStatuses.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {nextStatuses.map((to) => (
            <button
              key={to}
              onClick={() => handleStatusChange(to)}
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              Move to {STATUS_LABELS[to]}
            </button>
          ))}
        </div>
      )}

      {/* Platforms */}
      {(entry.ownerships ?? []).length > 0 && (
        <div>
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">Platforms</p>
          <div className="flex gap-2 flex-wrap">
            {entry.ownerships.map((o, i) => (
              <span key={i} className="text-xs px-2.5 py-0.5 rounded-full bg-[var(--surface-raised)] border border-[var(--border)]">
                {o.platform}
                {o.playtimeMin > 0 && <> · {Math.round(o.playtimeMin / 60)}h</>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {game.summary && (
        <div>
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">About</p>
          <CollapsibleSummary text={game.summary} />
        </div>
      )}

      {/* Genres */}
      {(game.genres ?? []).length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {game.genres.map((g) => (
            <span key={g} className="text-xs px-2 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-muted)]">{g}</span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <AddToCollection entryId={id} />
        <Button variant="secondary" onClick={() => setRecommendOpen(true)} className="text-xs h-9">
          Recommend
        </Button>
      </div>
      {game && <RecommendationModal game={{ id: entry.gameId, title: game.title }} isOpen={recommendOpen} onClose={() => setRecommendOpen(false)} />}

      {/* Progress panel */}
      <ProgressPanel entryId={id} status={entry.status} initialProgress={entry.manualProgress ?? 0} />

      {/* Reviews */}
      <ReviewPanel gameId={entry.gameId} status={entry.status} />

      {/* Danger zone */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
        <button
          onClick={handleToggleVisibility}
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          {entry.hiddenFromFriends ? <EyeOff size={13} /> : <Eye size={13} />}
          {entry.hiddenFromFriends ? 'Hidden from friends' : 'Visible to friends'}
        </button>
        <button
          onClick={handleRemove}
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
        >
          <Trash2 size={13} /> Remove from library
        </button>
      </div>
    </section>
  );
}

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="flex items-center gap-1 text-[var(--text-muted)]">
      <Icon size={13} />
      <span className="font-semibold tabular-nums text-[var(--text)]">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}

function CollapsibleSummary({ text }) {
  const [expanded, setExpanded] = useState(false);
  const short = text.length > 240;
  const shown = expanded || !short ? text : text.slice(0, 240) + '…';
  return (
    <div>
      <p className="text-sm text-[var(--text-muted)] leading-relaxed">{shown}</p>
      {short && (
        <button onClick={() => setExpanded((v) => !v)} className="mt-1 flex items-center gap-1 text-xs text-[var(--accent)] hover:underline">
          {expanded ? 'Show less' : 'Show more'} <ChevronRight size={12} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <section className="flex flex-col gap-6 pb-12 max-w-2xl mx-auto animate-pulse">
      <div className="h-4 w-20 rounded bg-[var(--surface)]" />
      <div className="flex gap-4">
        <div className="w-24 h-32 rounded-xl bg-[var(--surface)]" />
        <div className="flex-1 flex flex-col gap-3">
          <div className="h-4 w-24 rounded bg-[var(--surface)]" />
          <div className="h-7 w-48 rounded bg-[var(--surface)]" />
          <div className="h-5 w-20 rounded-full bg-[var(--surface)]" />
        </div>
      </div>
      <div className="h-48 rounded-[var(--radius-card)] bg-[var(--surface)]" />
    </section>
  );
}

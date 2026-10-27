import { useCallback, useEffect, useState } from 'react';
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
import { BackdropHero } from '@/components/art/BackdropHero.jsx';
import { useAmbient } from '@/components/art/ambientContext.js';
import { StatusBadge } from '@/components/library/StatusBadge.jsx';
import { SteamDetails } from '@/components/steam/SteamBadge.jsx';
import { otherPlatforms, steamOwnership } from '@/lib/steam.js';

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

  // the game of this entry tints the background behind the page
  const { setBase, clearBase } = useAmbient();
  const art = entry?.game ?? null;
  useEffect(() => {
    if (!art) return undefined;
    setBase(art);
    return () => clearBase(art);
  }, [art, setBase, clearBase]);

  const [busy, setBusy] = useState(false); // one status change at a time: a double click must not send two requests
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  async function handleStatusChange(to) {
    setBusy(true);
    try {
      const updated = await changeStatus(id, to);
      setEntry(updated);
      toast.success(`Moved to ${STATUS_LABELS[to]}`);
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setBusy(false);
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
    <section className="flex flex-col gap-6 pb-12">
      {/* Back nav */}
      <Link to="/library" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]">
        <ArrowLeft size={14} aria-hidden="true" /> Library
      </Link>

      {/* Hero: the game's backdrop, cover, title, status and the numbers that matter */}
      <BackdropHero art={game} seed={game.title ?? 'entry'} className="px-4 py-6 sm:px-8 sm:py-8">
        <div className="flex items-end gap-4 sm:gap-6">
          {game.cover ? (
            <CoverImage cover={game.cover} title={game.title} alt={game.title} className="h-32 w-24 flex-shrink-0 rounded-xl shadow-lg sm:h-44 sm:w-32" />
          ) : (
            <div className="flex h-32 w-24 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--surface-raised)] sm:h-44 sm:w-32">
              <Gamepad2 size={28} className="text-[var(--text-muted)]" aria-hidden="true" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs uppercase tracking-wide text-[var(--text-muted)]">{game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : ''}</p>
            <h1 className="font-heading text-2xl font-bold leading-tight sm:text-4xl">{game.title ?? 'Unknown game'}</h1>

            {/* Status: icon + label on a solid pill, so it never relies on colour alone */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-bg px-2.5 py-1">
                <StatusBadge status={entry.status} />
              </span>
              {entry.status === 'completed' && entry.completedAt && (
                <span className="text-xs text-[var(--text-muted)]">
                  {new Date(entry.completedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>

            {/* Quick stats */}
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              {totalPlaytimeMin > 0 && <Stat icon={Clock} value={`${Math.round(totalPlaytimeMin / 60)}h`} label="played" />}
              {game.ratingAvg > 0 && <Stat icon={Star} value={game.ratingAvg.toFixed(1)} label="rating" />}
              {game.timeToBeat?.main > 0 && <Stat icon={Trophy} value={`~${game.timeToBeat.main}h`} label="to beat" />}
            </div>
          </div>
        </div>
      </BackdropHero>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {/* Status actions */}
      {nextStatuses.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {nextStatuses.map((to) => (
            <button
              key={to}
              onClick={() => handleStatusChange(to)}
              disabled={busy}
              className="min-h-11 rounded-full border border-[var(--border)] px-4 text-sm font-medium transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
            >
              Move to {STATUS_LABELS[to]}
            </button>
          ))}
        </div>
      )}

      {/* Platforms */}
      {steamOwnership(entry) && <SteamDetails entry={entry} />}
      {otherPlatforms(entry).length > 0 && (
        <div>
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">Platforms</p>
          <div className="flex gap-2 flex-wrap">
            {otherPlatforms(entry).map((o, i) => (
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
        <Button variant="secondary" onClick={() => setRecommendOpen(true)}>
          Recommend
        </Button>
      </div>
      {game && <RecommendationModal game={{ id: entry.gameId, title: game.title }} isOpen={recommendOpen} onClose={() => setRecommendOpen(false)} />}

      {/* Progress panel */}
      <ProgressPanel entryId={id} status={entry.status} initialProgress={entry.manualProgress ?? 0} />

      {/* Reviews */}
      <ReviewPanel gameId={entry.gameId} status={entry.status} />

      {/* Danger zone */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2">
        <button
          onClick={handleToggleVisibility}
          className="flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {entry.hiddenFromFriends ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
          {entry.hiddenFromFriends ? 'Hidden from friends' : 'Visible to friends'}
        </button>
        {confirmingRemove ? (
          <div role="group" aria-label="Confirm removal" className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--text-muted)]">Remove this game from your library?</span>
            <Button variant="secondary" onClick={handleRemove}>
              Remove
            </Button>
            {/* the safe choice takes focus */}
            <Button variant="ghost" autoFocus onClick={() => setConfirmingRemove(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingRemove(true)}
            className="flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Trash2 size={14} aria-hidden="true" /> Remove from library
          </button>
        )}
      </div>
      </div>    </section>
  );
}

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="flex items-center gap-1 text-[var(--text-muted)]">
      <Icon size={13} aria-hidden="true" />
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
    <section role="status" aria-label="Loading library entry" className="flex flex-col gap-6 pb-12">
      <div className="h-11 w-24 rounded bg-[var(--surface)] motion-safe:animate-pulse" />
      <div className="h-64 rounded-[var(--radius-card)] bg-[var(--surface)] motion-safe:animate-pulse" />
      <div className="mx-auto h-48 w-full max-w-2xl rounded-[var(--radius-card)] bg-[var(--surface)] motion-safe:animate-pulse" />
    </section>
  );
}
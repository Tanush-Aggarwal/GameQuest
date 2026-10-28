import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Clock, Trophy, Gamepad2, Trash2, Eye, EyeOff, ChevronRight, Sparkles } from 'lucide-react';
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
import { formatPlaytime, otherPlatforms, steamOwnership } from '@/lib/steam.js';

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

  const year = game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;
  const progress = Math.max(0, Math.min(100, entry.manualProgress ?? 0));

  return (
    <section className="flex flex-col gap-6 pb-12">
      <Link to="/library" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text">
        <ArrowLeft size={16} aria-hidden="true" /> Back to library
      </Link>

      {/* Hero: backdrop behind a dark scrim, so every word on it is white and readable */}
      <BackdropHero art={game} seed={game.title ?? 'entry'} className="min-h-[300px] px-5 py-7 text-white sm:px-10 sm:py-10">
        <div className="flex h-full flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
          {game.cover ? (
            <CoverImage cover={game.cover} title={game.title} alt={game.title} className="h-48 w-36 flex-shrink-0 rounded-[14px] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] ring-1 ring-white/20 sm:h-60 sm:w-44" />
          ) : (
            <div className="flex h-48 w-36 flex-shrink-0 items-center justify-center rounded-[10px] bg-white/10 sm:h-60 sm:w-44">
              <Gamepad2 size={32} className="text-white/60" aria-hidden="true" />
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/70">
              <span>In your library</span>
              {year && <><span aria-hidden="true">•</span><span>{year}</span></>}
              {game.developer?.[0] && <><span aria-hidden="true">•</span><span className="normal-case tracking-normal">{game.developer[0]}</span></>}
            </div>
            <h1 className="font-heading text-3xl font-bold leading-none tracking-tight text-white sm:text-5xl">{game.title ?? 'Unknown game'}</h1>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#fbf8f1] px-3 py-1.5 shadow">
                <StatusBadge status={entry.status} />
              </span>
              {entry.status === 'completed' && entry.completedAt && (
                <span className="text-xs text-white/70">
                  Completed {new Date(entry.completedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap gap-2">
              {totalPlaytimeMin > 0 && <Stat icon={Clock} value={formatPlaytime(totalPlaytimeMin)} label="played" />}
              {game.ratingAvg > 0 && <Stat icon={Star} value={game.ratingAvg.toFixed(1)} label="rating" />}
              {game.timeToBeat?.main > 0 && <Stat icon={Trophy} value={`~${game.timeToBeat.main}h`} label="to beat" />}
              <Stat icon={Gamepad2} value={`${progress}%`} label="progress" />
            </div>

            {(nextStatuses.length > 0 || game.slug) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {nextStatuses.map((to, i) => (
                  <button
                    key={to}
                    onClick={() => handleStatusChange(to)}
                    disabled={busy}
                    className={`min-h-11 rounded-full px-5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-60 ${
                      i === 0 ? 'bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-105' : 'border border-white/30 text-white hover:bg-white/10'
                    }`}
                  >
                    Move to {STATUS_LABELS[to]}
                  </button>
                ))}
                {game.slug && (
                  <Link
                    to={`/games/${game.slug}`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white/85 underline-offset-4 transition hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    Game details <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </BackdropHero>

      <div className="mx-auto grid w-full max-w-[1200px] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main column: what you do with the game */}
        <div className="flex min-w-0 flex-col gap-6">
          {game.summary && (
            <Card title="About">
              <CollapsibleSummary text={game.summary} />
              {(game.genres ?? []).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {game.genres.map((g) => (
                    <span key={g} className="rounded-full border border-border bg-bg px-3 py-1 text-xs font-medium text-text-muted">{g}</span>
                  ))}
                </div>
              )}
            </Card>
          )}

          <ProgressPanel
            entryId={id}
            status={entry.status}
            initialProgress={entry.manualProgress ?? 0}
            onProgressSaved={(p) => setEntry({ ...entry, manualProgress: p })}
          />

          <ReviewPanel gameId={entry.gameId} status={entry.status} />
        </div>

        {/* Side column: platform data and actions */}
        <aside className="flex min-w-0 flex-col gap-6">
          {steamOwnership(entry) && <SteamDetails entry={entry} />}
          {otherPlatforms(entry).length > 0 && (
            <Card title="Platforms">
              <div className="flex flex-wrap gap-2">
                {otherPlatforms(entry).map((o, i) => (
                  <span key={i} className="rounded-full border border-border bg-bg px-3 py-1 text-xs font-medium">
                    {o.platform}
                    {o.playtimeMin > 0 && <> · {Math.round(o.playtimeMin / 60)}h</>}
                  </span>
                ))}
              </div>
            </Card>
          )}

          <Card title="Organise &amp; share">
            <div className="flex flex-col gap-3">
              <AddToCollection entryId={id} />
              <Button variant="secondary" onClick={() => setRecommendOpen(true)} className="w-full">
                <Sparkles size={16} aria-hidden="true" /> Recommend to a friend
              </Button>
              <button
                onClick={handleToggleVisibility}
                className="flex min-h-11 items-center gap-2 rounded-control px-1 text-sm text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text"
              >
                {entry.hiddenFromFriends ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                {entry.hiddenFromFriends ? 'Hidden from friends' : 'Visible to friends'}
              </button>
            </div>
          </Card>
          {game && <RecommendationModal game={{ id: entry.gameId, title: game.title }} isOpen={recommendOpen} onClose={() => setRecommendOpen(false)} />}

          <Card title="Danger zone">
            {confirmingRemove ? (
              <div role="group" aria-label="Confirm removal" className="flex flex-col gap-3">
                <span className="text-sm text-text-muted">Remove this game from your library? Progress and notes go with it.</span>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={handleRemove}>Remove</Button>
                  {/* the safe choice takes focus */}
                  <Button variant="ghost" autoFocus onClick={() => setConfirmingRemove(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingRemove(true)}
                className="flex min-h-11 items-center gap-2 rounded-control px-1 text-sm font-medium text-[var(--danger)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text"
              >
                <Trash2 size={16} aria-hidden="true" /> Remove from library
              </button>
            )}
          </Card>
        </aside>
      </div>
    </section>
  );
}

function Card({ title, children }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-white/75 backdrop-blur-sm">
      <Icon size={14} aria-hidden="true" />
      <span className="font-semibold tabular-nums text-white">{value}</span>
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
      <p className="text-sm leading-7 text-text">{shown}</p>
      {short && (
        <button onClick={() => setExpanded((v) => !v)} className="mt-1 flex items-center gap-1 text-xs font-semibold text-[var(--accent-text)] hover:underline">
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
      <div className="mx-auto h-48 w-full max-w-[1200px] rounded-[var(--radius-card)] bg-[var(--surface)] motion-safe:animate-pulse" />
    </section>
  );
}
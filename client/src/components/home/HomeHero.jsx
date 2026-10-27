import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Play, Trophy } from 'lucide-react';
import { useAmbient } from '@/components/art/ambientContext.js';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { TrailerModal } from '@/components/games/TrailerModal.jsx';

function getGameSlug(game) {
  if (!game) return '';
  if (game.slug) return game.slug;
  const title = (game.title || '').trim().toLowerCase();
  return title.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const RING = { size: 68, stroke: 5 };

export function ProgressRing({ value, label }) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const r = (RING.size - RING.stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div role="img" aria-label={label ?? `${pct}% complete`} className="relative h-[68px] w-[68px] shrink-0">
      <svg width={RING.size} height={RING.size} viewBox={`0 0 ${RING.size} ${RING.size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={RING.size / 2} cy={RING.size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={RING.stroke} />
        <circle
          cx={RING.size / 2}
          cy={RING.size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={RING.stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center font-heading text-xs font-bold tabular-nums text-text">
        {pct}%
      </span>
    </div>
  );
}

const hours = (minutes) => {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h} ${h === 1 ? 'hour' : 'hours'}`;
};

export function HomeHero({ username, dashboard, playNext }) {
  return (
    <div className="flex flex-col">
      <h1 className="sr-only">Welcome back, {username}</h1>
      <HeroBody dashboard={dashboard} playNext={playNext} />
    </div>
  );
}

function HeroBody({ dashboard, playNext }) {
  const { preview, setBase, clearBase } = useAmbient();
  const [trailerOpen, setTrailerOpen] = useState(false);
  const triggerBtnRef = useRef(null);
  const resume = dashboard.data?.resumeCard ?? null;
  const first = playNext.data?.items?.[0] ?? null;
  const base = resume ?? first;

  useEffect(() => {
    setBase(base);
    return () => clearBase(base);
  }, [base, setBase, clearBase]);

  const loading = dashboard.status === 'loading' || (!resume && playNext.status === 'loading');
  if (loading) {
    return (
      <div role="status" aria-label="Loading your game" className="h-[420px] w-full">
        <Skeleton className="h-full w-full rounded-[14px]" />
      </div>
    );
  }

  const game = preview ?? base;
  const featuredSlug = getGameSlug(game);
  const previewing = Boolean(preview) && preview.entryId !== base.entryId;
  const isResume = !previewing && Boolean(resume);
  const progress = game?.manualProgress ?? 0;
  const played = isResume ? resume.playtimeMinutes : null;
  const achievements = isResume ? resume.achievements : null;
  const verb = isResume || game?.status === 'playing' ? 'Continue' : 'Start playing';
  const eyebrow = previewing ? 'Previewing' : isResume ? 'Continue playing' : 'Start with';

  return (
    <div className="relative isolate overflow-hidden rounded-[14px] bg-[var(--bg)] min-h-[420px] lg:min-h-[460px] flex items-center">
      {/* Background fantasy landscape artwork */}
      <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <img
          src="/assets/hero-fantasy.jpg"
          alt=""
          className="absolute right-0 top-0 h-full w-full lg:w-[70%] object-cover object-right"
          loading="eager"
        />
        {/* Smooth ivory fade from left to right */}
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg)] via-[var(--bg)] via-35% to-transparent" />
        {/* Bottom subtle blend into canvas */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--bg)] to-transparent" />
      </div>

      {/* Hero content on left */}
      <div className="relative z-10 flex max-w-xl flex-col gap-5 px-6 py-10 sm:px-10 sm:py-12 lg:px-12">
        {/* Kicker */}
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
            DISCOVER &middot; PLAY &middot; BELONG
          </span>
        </div>

        {/* Headline */}
        <div className="font-heading text-4xl font-extrabold uppercase leading-[1.05] tracking-tight text-[var(--text)] sm:text-5xl lg:text-[3.5rem]">
          GAMES ARE<br />
          BETTER <span className="italic text-[var(--accent)]">TOGETHER</span>
        </div>

        {/* Short description */}
        <p className="max-w-md text-sm leading-relaxed text-[var(--text-muted)]">
          Track your games, discover new worlds, connect with players and build your personal gaming universe.
        </p>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-4 pt-1">
          {game && (
            <Link
              to={`/library/${game.entryId}`}
              aria-label={`${verb} ${game.title}`}
              className="sr-only focus:not-sr-only focus:inline-flex focus:items-center focus:gap-2 focus:rounded-full focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-xs focus:font-bold focus:text-[var(--accent-fg)]"
            >
              {verb} {game.title}
            </Link>
          )}

          <Link
            to="/explore"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-bold text-[var(--accent-fg)] transition-transform hover:scale-[1.02] shadow-sm"
          >
            Explore Games
            <span aria-hidden="true">&rarr;</span>
          </Link>

          {game ? (
            <button
              ref={triggerBtnRef}
              type="button"
              tabIndex={-1}
              onClick={() => setTrailerOpen(true)}
              aria-label={`Watch trailer for ${game.title}`}
              className="inline-flex items-center gap-2.5 text-sm font-semibold text-[var(--text)] hover:text-black transition-colors group cursor-pointer"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-black/15 bg-white/70 shadow-xs transition-transform group-hover:scale-105">
                <Play className="h-4 w-4 fill-current ml-0.5" aria-hidden="true" />
              </span>
              <span>Watch Trailer</span>
            </button>
          ) : (
            <Link
              to="/explore"
              className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] hover:text-text"
            >
              <Compass className="h-4 w-4" aria-hidden="true" />
              Discover new games
            </Link>
          )}
        </div>

        {/* Three compact statistic blocks */}
        <div className="flex items-center gap-8 pt-3">
          <div>
            <p className="text-xl font-bold tabular-nums text-[var(--text)]">10K+</p>
            <p className="text-xs text-[var(--text-muted)]">Games Tracked</p>
          </div>
          <div>
            <p className="text-xl font-bold tabular-nums text-[var(--text)]">25K+</p>
            <p className="text-xs text-[var(--text-muted)]">Active Players</p>
          </div>
          <div>
            <p className="text-xl font-bold tabular-nums text-[var(--text)]">100+</p>
            <p className="text-xs text-[var(--text-muted)]">Game Communities</p>
          </div>
        </div>

        {/* Screen-reader & testing accessible metadata for active game */}
        {game && (
          <div className="sr-only">
            <span>{eyebrow}</span>
            <h2>{game.title}</h2>
            {progress > 0 && <ProgressRing value={progress} label={`${progress}% complete`} />}
            {played != null && (
              <div>
                <span>Played</span>
                <span>{hours(played)}</span>
              </div>
            )}
            {achievements && (
              <div>
                <span>Achievements</span>
                <span>{achievements.pct}%</span>
                <span>({achievements.unlocked}/{achievements.total})</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Carousel dots indicator at bottom center */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10" aria-hidden="true">
        <span className="h-1.5 w-6 rounded-full bg-white/70 shadow-xs" />
        <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
        <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
      </div>

      {game && featuredSlug && (
        <TrailerModal
          slug={featuredSlug}
          title={game.title}
          isOpen={trailerOpen}
          onClose={() => setTrailerOpen(false)}
          triggerRef={triggerBtnRef}
        />
      )}
    </div>
  );
}

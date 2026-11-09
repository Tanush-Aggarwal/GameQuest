import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RatingBadge } from '@/components/ui/RatingBadge.jsx';
import { artImageSrcSet, artImageUrl } from '@/lib/art.js';
import { heroCandidates, useBestArt } from '@/lib/artPicker.js';
import { heroFrameStyle } from '@/lib/heroFrame.js';
import { Link } from 'react-router-dom';
import { useAmbient } from '@/components/art/ambientContext.js';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { getPublicStats } from '@/services/publicApi.js';
import { getFeaturedGames } from '@/services/gamesApi.js';

const SLIDE_MS = 7000;
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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

// One slide's wide art: the best banner picture among the game's candidates (see lib/artPicker.js), reported as ready
// once it has loaded so the carousel never fades to an image that is still loading.
function WideArt({ game, visible, onReady }) {
  const override = game.heroOverride?.url ? game.heroOverride : null;
  const candidates = (override ? [override.url] : heroCandidates(game)).map((u) => artImageUrl(u, 'hero'));
  const [failed, setFailed] = useState(() => new Set());
  const best = useBestArt(candidates, failed);
  const src = best.url;
  useEffect(() => {
    if (best.settled && !src) onReady?.(); // nothing usable: don't hold the carousel up
  }, [best.settled, src, onReady]);
  if (!src) return null;
  const responsive = artImageSrcSet(src);
  return (
    <img
      src={src}
      srcSet={responsive?.srcSet}
      sizes={responsive?.sizes}
      alt=""
      onLoad={() => onReady?.()}
      onError={() => setFailed((f) => new Set(f).add(src))}
      data-active={visible}
      style={override ? { objectPosition: heroFrameStyle(override).objectPosition } : undefined}
      className="gq-hero-slide absolute inset-0 h-full w-full object-cover object-[center_30%]"
      loading="eager"
      decoding="async"
    />
  );
}

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
  const [stats, setStats] = useState(null);
  const [slides, setSlides] = useState([]);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(() => new Set());
  const markReady = (id) => setReady((r) => (r.has(id) ? r : new Set(r).add(id)));
  const touchX = useRef(null);
  const resume = dashboard.data?.resumeCard ?? null;
  const first = playNext.data?.items?.[0] ?? null;
  const base = resume ?? first;

  useEffect(() => {
    setBase(base);
    return () => clearBase(base);
  }, [base, setBase, clearBase]);

  useEffect(() => {
    let active = true;
    getPublicStats()
      .then((data) => {
        if (active) setStats(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Hero artwork: the real featured games (released, popular, with wide art), rotating like a console dashboard.
  useEffect(() => {
    let active = true;
    getFeaturedGames({ limit: 5 })
      .then((data) => {
        if (active) setSlides((data?.items ?? []).filter((g) => g.backdrop || g.screenshots?.length));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Auto-advance, one slide per SLIDE_MS. It waits on a slide whose picture hasn't loaded yet (no fade to a
  // blank frame) and stops while hovered, focused or when the viewer prefers reduced motion.
  const nextReady = slides.length > 1 && ready.has(slides[(slide + 1) % slides.length]?.id);
  useEffect(() => {
    if (slides.length < 2 || paused || !nextReady || prefersReducedMotion()) return undefined;
    const id = setTimeout(() => setSlide((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearTimeout(id);
  }, [slides.length, paused, nextReady, slide]);
  const go = (step) => setSlide((i) => (i + step + slides.length) % slides.length);

  const loading = dashboard.status === 'loading' || (!resume && playNext.status === 'loading');
  if (loading) {
    return (
      <div role="status" aria-label="Loading your game" className="h-[420px] w-full">
        <Skeleton className="h-full w-full rounded-[14px]" />
      </div>
    );
  }

  const game = preview ?? base;
  const previewing = Boolean(preview) && preview.entryId !== base.entryId;
  const isResume = !previewing && Boolean(resume);
  const progress = game?.manualProgress ?? 0;
  const played = isResume ? resume.playtimeMinutes : null;
  const achievements = isResume ? resume.achievements : null;
  const verb = isResume || game?.status === 'playing' ? 'Continue' : 'Start playing';
  const eyebrow = previewing ? 'Previewing' : isResume ? 'Continue playing' : 'Start with';

  return (
    <div
      className="relative isolate overflow-hidden rounded-[14px] bg-[#111311] border border-white/10 min-h-[420px] lg:min-h-[460px] flex items-center text-white shadow-2xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (touchX.current ?? e.changedTouches[0].clientX);
        if (slides.length > 1 && Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      {/* Background artwork at full strength with dark left-side scrim */}
      <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        {slides.length > 0
          ? slides.map((g, i) => (
              <WideArt key={g.id} game={g} visible={i === slide} onReady={() => markReady(g.id)} />
            ))
          : <img src={game?.backdrop || '/assets/hero-fantasy.jpg'} alt="" className="absolute inset-0 h-full w-full object-cover object-center" loading="eager" />}
        {/* On mobile: protective dark overlay for bright artwork; on desktop: transparent right-side */}
        <div className="absolute inset-0 bg-black/60 sm:bg-transparent" />
        {/* Dark scrim behind text: vertical depth on mobile, editorial left-to-right on desktop */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/50 to-black/90 sm:bg-gradient-to-r sm:from-black/90 sm:via-black/70 sm:via-55% sm:to-transparent" />
        {/* Subtle dark fade at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/90 to-transparent" />
      </div>

      {/* Hero content on left */}
      <div className="relative z-10 flex max-w-xl flex-col gap-5 px-6 py-10 sm:px-10 sm:py-12 lg:px-12">
        {/* Kicker */}
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/80">
            DISCOVER &middot; PLAY &middot; BELONG
          </span>
        </div>

        {/* Headline */}
        <div className="font-heading text-4xl font-extrabold uppercase leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-[3.5rem]">
          GAMES ARE<br />
          BETTER <span className="italic text-[var(--accent)]">TOGETHER</span>
        </div>

        {/* Short description */}
        <p className="max-w-md text-sm leading-relaxed text-gray-200">
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

          {!game && (
            <Link
              to="/explore"
              className="sr-only focus:not-sr-only inline-flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-white"
            >
              Discover new games
            </Link>
          )}
        </div>

        {/* Three compact statistic blocks from real public stats */}
        <div className="flex items-center gap-8 pt-3">
          <div>
            <p className="text-xl font-bold tabular-nums text-white">
              {stats?.games != null ? stats.games.toLocaleString() : '—'}
            </p>
            <p className="text-xs text-gray-400">Games Tracked</p>
          </div>
          <div>
            <p className="text-xl font-bold tabular-nums text-white">
              {stats?.players != null ? stats.players.toLocaleString() : '—'}
            </p>
            <p className="text-xs text-gray-400">Players</p>
          </div>
          <div>
            <p className="text-xl font-bold tabular-nums text-white">
              {stats?.collections != null ? stats.collections.toLocaleString() : '—'}
            </p>
            <p className="text-xs text-gray-400">Public Collections</p>
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

      {/* Featured game label (fades in with each slide), arrows and progress dots */}
      {slides[slide] && (
        <Link
          key={slides[slide].id}
          to={`/games/${slides[slide].slug}`}
          className="gq-hero-caption absolute bottom-5 right-6 z-10 hidden max-w-[40%] items-center gap-2 rounded-full bg-black/55 py-1.5 pl-4 pr-1.5 text-xs font-semibold text-white ring-1 ring-white/10 backdrop-blur-sm hover:bg-black/75 sm:inline-flex"
        >
          <span className="truncate">Featured: {slides[slide].title}</span>
          {slides[slide].rating != null && <RatingBadge value={slides[slide].rating.toFixed(1)} />}
        </Link>
      )}
      {slides.length > 1 && (
        <>
          {[
            { step: -1, label: 'Previous featured game', Icon: ChevronLeft, side: 'left-3' },
            { step: 1, label: 'Next featured game', Icon: ChevronRight, side: 'right-3' },
          ].map(({ step, label, Icon, side }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              onClick={() => go(step)}
              className={`gq-hero-arrow absolute ${side} top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-sm hover:bg-black/70 sm:flex`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </button>
          ))}
          <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
            {slides.map((g, i) => (
              <button
                key={g.id}
                type="button"
                aria-label={`Show ${g.title}`}
                aria-current={i === slide}
                onClick={() => setSlide(i)}
                className={`relative h-1.5 overflow-hidden rounded-full transition-[width,background-color] duration-500 ${i === slide ? 'w-8 bg-white/30' : 'w-1.5 bg-white/40 hover:bg-white/70'}`}
              >
                {i === slide && (
                  <span
                    key={slide}
                    className="gq-hero-dot-fill absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
                    style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: paused || !nextReady ? 'paused' : 'running' }}
                  />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

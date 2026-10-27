import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Gamepad2, Play, Trophy } from 'lucide-react';
import { BackdropHero } from '@/components/art/BackdropHero.jsx';
import { useAmbient } from '@/components/art/ambientContext.js';
import { useArt } from '@/components/art/useArt.js';
import { CoverImage } from '@/components/games/GameCard.jsx';
import { buttonVariants } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { timeAgo } from '@/lib/time.js';

const RING = { size: 68, stroke: 5 };

// A circular progress meter with acid-lime accent arc.
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

// Cinematic hero with bold contemporary headline on the left and one coherent artwork composition on the right.
export function HomeHero({ username, dashboard, playNext }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="gq-home-intro">
        <p className="gq-kicker">Personal Universe</p>
        <h1 className="gq-home-greeting">Welcome back, {username}</h1>
      </div>
      <HeroBody dashboard={dashboard} playNext={playNext} />
    </div>
  );
}

// One coherent artwork composition on the right
function HeroArtwork({ game }) {
  if (!game) return null;
  return (
    <div className="hidden md:flex shrink-0 items-center justify-center" aria-hidden="true">
      <div className="gq-hero-artwork relative w-44 sm:w-52 lg:w-60 aspect-[3/4] rounded-card overflow-hidden border border-black/10 bg-surface shadow-xl transition-all duration-300 hover:scale-[1.02]">
        {game.cover ? (
          <CoverImage
            cover={game.cover}
            title={game.title ?? 'GameQuest'}
            alt=""
            sizes="(min-width: 1024px) 240px, 208px"
            className="h-full w-full object-cover transition-transform duration-300"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center bg-surface-raised">
            <Gamepad2 className="h-10 w-10 text-text-muted mb-2" />
            <span className="font-heading font-bold text-sm text-text line-clamp-2">{game.title || 'GameQuest'}</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
      </div>
    </div>
  );
}

function HeroBody({ dashboard, playNext }) {
  const { preview, setBase, clearBase } = useAmbient();
  const { artFor } = useArt();
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
      <div role="status" aria-label="Loading your game">
        <Skeleton className="h-72 w-full rounded-card" />
      </div>
    );
  }

  const discover = (
    <Link to="/explore" className={buttonVariants({ variant: 'secondary' })}>
      <Compass className="h-4 w-4" aria-hidden="true" /> Discover new games
    </Link>
  );

  if (!base) {
    return (
      <BackdropHero art={artFor('home')} seed="home" className="gq-home-hero px-6 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="gq-home-hero__copy flex max-w-xl flex-col gap-4">
            <p className="text-sm text-text-muted">Add a game to your library and it will show up here.</p>
            <div className="mt-1">{discover}</div>
          </div>
        </div>
      </BackdropHero>
    );
  }

  const game = preview ?? base;
  const previewing = Boolean(preview) && preview.entryId !== base.entryId;
  const isResume = !previewing && Boolean(resume);
  const progress = game.manualProgress ?? 0;
  const played = isResume ? resume.playtimeMinutes : null;
  const achievements = isResume ? resume.achievements : null;
  const verb = isResume || game.status === 'playing' ? 'Continue' : 'Start playing';
  const eyebrow = previewing ? 'Previewing' : isResume ? 'Continue playing' : 'Start with';

  return (
    <BackdropHero art={game} seed={game.title} className="gq-home-hero min-h-72 px-6 py-8 sm:px-8 sm:py-10">
      <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div className="gq-home-hero__copy flex max-w-xl flex-col gap-4">
          <div>
            <p className="text-xs font-mono font-semibold uppercase tracking-wider text-text-muted">
              {eyebrow}
              {isResume && resume.lastPlayedAt ? ` · last played ${timeAgo(resume.lastPlayedAt)}` : ''}
            </p>
            <h2 className="mt-1 font-heading text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl text-text">
              {game.title}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {(isResume || progress > 0) && <ProgressRing value={progress} label={`${progress}% complete`} />}
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {played != null && (
                <div>
                  <dt className="text-xs text-text-muted">Played</dt>
                  <dd className="font-semibold tabular-nums text-text">{hours(played)}</dd>
                </div>
              )}
              {achievements && (
                <div>
                  <dt className="text-xs text-text-muted">Achievements</dt>
                  <dd className="flex items-center gap-1 font-semibold tabular-nums text-text">
                    <Trophy className="h-4 w-4 text-[var(--secondary-accent)]" aria-hidden="true" />
                    {achievements.pct}% <span className="font-normal text-text-muted">({achievements.unlocked}/{achievements.total})</span>
                  </dd>
                </div>
              )}
              {game.timeToBeatMain != null && (
                <div>
                  <dt className="text-xs text-text-muted">Time to beat</dt>
                  <dd className="font-semibold tabular-nums text-text">~{game.timeToBeatMain} h</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <Link to={`/library/${game.entryId}`} aria-label={`${verb} ${game.title}`} className={buttonVariants({ variant: 'primary' })}>
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              {verb}
            </Link>
            {discover}
          </div>
        </div>

        <HeroArtwork game={game} />
      </div>
    </BackdropHero>
  );
}

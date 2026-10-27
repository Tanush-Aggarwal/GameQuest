import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Play, Trophy } from 'lucide-react';
import { BackdropHero } from '@/components/art/BackdropHero.jsx';
import { useAmbient } from '@/components/art/ambientContext.js';
import { useArt } from '@/components/art/useArt.js';
import { buttonVariants } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { timeAgo } from '@/lib/time.js';

const RING = { size: 72, stroke: 6 };

// A circular progress meter. The number in the middle and the label are the real information; the arc is decoration.
export function ProgressRing({ value, label }) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const r = (RING.size - RING.stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div role="img" aria-label={label ?? `${pct}% complete`} className="relative h-[72px] w-[72px] shrink-0">
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
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center font-heading text-sm font-bold tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

const hours = (minutes) => {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h} ${h === 1 ? 'hour' : 'hours'}`;
};

// The first thing on Home: the game you last played, big, with a way back in. Hovering or focusing a card in the
// "what to play next" rail below previews that game here (see AmbientProvider for the 250 ms debounce).
// `dashboard` and `playNext` are useAsync results; neither failing blanks the hero (it falls back to a greeting).
export function HomeHero({ username, dashboard, playNext }) {
  // The greeting is one element that stays mounted through every state below it (loading, empty, a game).
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-heading text-xl font-bold">Welcome back, {username}</h1>
      <HeroBody dashboard={dashboard} playNext={playNext} />
    </div>
  );
}

function HeroBody({ dashboard, playNext }) {
  const { preview, setBase, clearBase } = useAmbient();
  const { artFor } = useArt();
  const resume = dashboard.data?.resumeCard ?? null;
  const first = playNext.data?.items?.[0] ?? null;
  const base = resume ?? first;

  // tells the ambient background which game this page is about
  useEffect(() => {
    setBase(base);
    return () => clearBase(base);
  }, [base, setBase, clearBase]);

  const loading = dashboard.status === 'loading' || (!resume && playNext.status === 'loading');
  if (loading) {
    return (
      <div role="status" aria-label="Loading your game">
        <Skeleton className="h-72 w-full rounded-card" /> {/* the hero's own minimum height, so the page does not jump when it arrives */}
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
      <BackdropHero art={artFor('home')} seed="home" className="px-5 py-8 sm:px-8">
        <p className="text-sm text-text-muted">Add a game to your library and it will show up here.</p>
        <div className="mt-4">{discover}</div>
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
    <BackdropHero art={game} seed={game.title} className="min-h-72 px-5 py-8 sm:px-8 sm:py-10">
      <div className="flex max-w-xl flex-col gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            {eyebrow}
            {isResume && resume.lastPlayedAt ? ` · last played ${timeAgo(resume.lastPlayedAt)}` : ''}
          </p>
          <h2 className="mt-1 font-heading text-3xl font-bold leading-tight sm:text-4xl">{game.title}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {(isResume || progress > 0) && <ProgressRing value={progress} label={`${progress}% complete`} />}
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {played != null && (
              <div>
                <dt className="text-xs text-text-muted">Played</dt>
                <dd className="font-semibold tabular-nums">{hours(played)}</dd>
              </div>
            )}
            {achievements && (
              <div>
                <dt className="text-xs text-text-muted">Achievements</dt>
                <dd className="flex items-center gap-1 font-semibold tabular-nums">
                  <Trophy className="h-4 w-4 text-reward" aria-hidden="true" />
                  {achievements.pct}% <span className="font-normal text-text-muted">({achievements.unlocked}/{achievements.total})</span>
                </dd>
              </div>
            )}
            {game.timeToBeatMain != null && (
              <div>
                <dt className="text-xs text-text-muted">Time to beat</dt>
                <dd className="font-semibold tabular-nums">~{game.timeToBeatMain} h</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/library/${game.entryId}`} aria-label={`${verb} ${game.title}`} className={buttonVariants({ variant: 'primary' })}>
            <Play className="h-4 w-4" aria-hidden="true" />
            {verb}
          </Link>
          {discover}
        </div>
      </div>
    </BackdropHero>
  );
}

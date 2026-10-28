import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth.js';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Button } from '@/components/ui/button.jsx';
import { CalendarDays, Check, Gamepad2, Library, Loader2, RefreshCw, ServerCog, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';

const AUTO_RETRY_SECONDS = 8;
const MAX_AUTO_RETRIES = 8; // about a minute: long enough for a sleeping free-tier server to wake up

// Shown while the session is checked, and when the API cannot be reached. The API runs on a free host that
// sleeps when idle and needs up to a minute to wake, so instead of a dead end this page explains that,
// retries on its own with a visible countdown, and still offers "Retry" right away.
function ServerWaking({ retry }) {
  const [attempt, setAttempt] = useState(1);
  const [left, setLeft] = useState(AUTO_RETRY_SECONDS);
  const [covers] = useState(() => pickCovers()); // a fresh random set each time the page opens
  const auto = attempt <= MAX_AUTO_RETRIES;

  // One timer drives the countdown; when it reaches zero it starts the next attempt.
  useEffect(() => {
    if (!auto) return undefined;
    let remaining = AUTO_RETRY_SECONDS;
    const tick = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setLeft(remaining);
        return;
      }
      clearInterval(tick);
      setLeft(AUTO_RETRY_SECONDS);
      setAttempt((a) => a + 1);
      retry();
    }, 1000);
    return () => clearInterval(tick);
  }, [auto, attempt, retry]);

  const progress = ((AUTO_RETRY_SECONDS - left) / AUTO_RETRY_SECONDS) * 100;
  // Overall progress across all attempts, so the page always shows forward movement.
  const overall = Math.min(100, (((attempt - 1) * AUTO_RETRY_SECONDS + (AUTO_RETRY_SECONDS - left)) / (MAX_AUTO_RETRIES * AUTO_RETRY_SECONDS)) * 100);
  const steps = [
    { label: 'Reaching the GameQuest server', done: attempt > 1 || !auto, active: auto && attempt === 1 },
    { label: 'Waiting for it to wake up', done: !auto, active: auto && attempt > 1 },
    { label: 'Checking your session', done: false, active: false },
  ];
  // Explicit colours (style) so global heading/link styles can never make this page unreadable.
  const ink = { color: 'var(--text)' };
  const muted = { color: 'var(--text-muted)' };

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Art side: the GameQuest world, so the wait still feels like the app */}
      <aside className="relative hidden overflow-hidden lg:block" aria-hidden="true" style={{ backgroundColor: '#111311' }}>
        <img src="/assets/hero-fantasy.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(17,19,17,0.35) 0%, rgba(17,19,17,0.75) 55%, rgba(17,19,17,0.95) 100%)' }} />

        {/* The fan: cards sit on one arc around a pivot below them, and the whole hand sways together. */}
        <div className="absolute inset-x-0 top-[12%] flex justify-center">
          <div className="relative h-[360px] w-[680px] xl:h-[400px]">
            <span
              className="absolute left-1/2 top-1/2 h-72 w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
              style={{ background: 'radial-gradient(closest-side, rgba(201,243,109,0.22), transparent)' }}
            />
            <div className="group/fan absolute inset-0 origin-bottom motion-safe:animate-[gqsway_9s_ease-in-out_infinite]">
              {covers.map((cover, i) => (
                <FanCard key={cover.hd} cover={cover} index={i} />
              ))}
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-10 xl:p-14">
          <p className="font-heading text-4xl font-bold leading-tight" style={{ color: '#fff' }}>
            Every game you own.<br />
            <span style={{ color: 'var(--accent)' }}>One quest log.</span>
          </p>
          <p className="mt-3 max-w-md text-sm leading-6" style={{ color: 'rgba(255,255,255,0.75)' }}>
            Track your library across platforms, decide what to play next and plan game nights with friends.
          </p>
        </div>
        <style>{'@keyframes gqsway{0%,100%{transform:rotate(-1.6deg) translate3d(0,0,0)}50%{transform:rotate(1.6deg) translate3d(0,-10px,0)}}@keyframes gqshimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}@keyframes gqspread{from{opacity:0;transform:translateX(-50%) rotate(0deg) translateY(40px)}to{opacity:1;transform:translateX(-50%) rotate(var(--r)) translateY(0)}}'}</style>
      </aside>

      {/* Status side */}
      <div className="flex min-h-screen flex-col px-6 py-8 sm:px-10 xl:px-16">
        <header className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-control" style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}>
              <Gamepad2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-heading text-xl font-bold" style={ink}>GameQuest</span>
          </span>
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)', color: auto ? 'var(--warning)' : 'var(--danger)' }}
          >
            <span className="relative flex h-2 w-2">
              {auto && <span className="absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping" style={{ backgroundColor: 'currentColor' }} />}
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: 'currentColor' }} />
            </span>
            {auto ? 'Server starting' : 'Server offline'}
          </span>
        </header>

        <section role="alert" className="my-auto flex max-w-xl flex-col gap-6 py-10">
          <div className="flex items-center gap-4">
            <span className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
              {auto && <span className="absolute -inset-1 rounded-[20px] border-2 border-t-transparent motion-safe:animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent', animationDuration: '1.6s' }} aria-hidden="true" />}
              <ServerCog className="h-8 w-8" strokeWidth={1.75} style={{ color: auto ? 'var(--status-completed)' : 'var(--danger)' }} aria-hidden="true" />
            </span>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-text)' }}>
              {auto ? 'One moment' : 'Server not responding'}
            </p>
          </div>

          <div>
            <h1 className="font-heading text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl" style={ink}>
              {auto ? 'Waking up the server' : 'The server is still asleep'}
            </h1>
            <p className="mt-4 text-base leading-7" style={muted}>
              We couldn&apos;t check your session yet. GameQuest runs on free hosting that sleeps when nobody is using it,
              so the first visit after a break can take <strong style={ink}>up to a minute</strong>. Your library and data are safe.
            </p>
          </div>

          <div className="rounded-card border p-5 shadow-sm" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <ol className="flex flex-col gap-3">
              {steps.map((st) => (
                <li key={st.label} className="flex items-center gap-3 text-sm font-medium" style={st.done || st.active ? ink : muted}>
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
                    style={{
                      borderColor: st.done ? 'var(--status-completed)' : st.active ? 'var(--text)' : 'var(--border)',
                      backgroundColor: st.done ? 'var(--status-completed)' : 'var(--bg)',
                      color: st.done ? '#fff' : 'var(--text)',
                    }}
                  >
                    {st.done ? <Check className="h-4 w-4" aria-hidden="true" /> : st.active ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : null}
                  </span>
                  {st.label}
                </li>
              ))}
            </ol>

            <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              {auto ? (
                <>
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold" style={ink}>
                    <span>Attempt {attempt} of {MAX_AUTO_RETRIES}</span>
                    <span className="tabular-nums" style={muted}>next try in {left}s</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--surface-raised)' }} aria-hidden="true">
                    <div className="h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${overall}%`, background: 'linear-gradient(90deg, var(--status-completed), var(--accent))' }} />
                  </div>
                  <span className="sr-only">{Math.round(progress)}% of this attempt</span>
                </>
              ) : (
                <p className="text-sm" style={muted}>No answer after about a minute. Check your internet connection, then press Retry.</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button
              onClick={() => {
                setAttempt((a) => (auto ? a + 1 : 1)); // restarts the countdown
                setLeft(AUTO_RETRY_SECONDS);
                retry();
              }}
              className="px-6"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
            </Button>
            <span className="text-sm" style={muted}>Opens by itself as soon as the server answers.</span>
          </div>
        </section>

        {/* While you wait: what GameQuest does */}
        <footer>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={muted}>While you wait</p>
          <ul className="grid gap-3 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text, color }) => (
              <li key={title} className="flex flex-col gap-2 rounded-card border p-4" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="text-sm font-bold" style={ink}>{title}</span>
                <span className="text-xs leading-5" style={muted}>{text}</span>
              </li>
            ))}
          </ul>
        </footer>
      </div>
    </main>
  );
}

// Steam's 600x900 @2x library art (sharp on any screen); the bundled image is the fallback if Steam is unreachable.
const steamCover = (appid) => `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900_2x.jpg`;
// One fanned cover: a shimmering placeholder until the art arrives, the bundled image if Steam fails, and a titled
// gradient if both fail, so the fan never has a gap. Floats gently; on hover it lifts along its own angle and comes forward, keeping the fan's arc.
function FanCard({ cover, index }) {
  const [src, setSrc] = useState(cover.hd);
  const [state, setState] = useState('loading'); // loading | ready | failed
  const offset = index - 2;
  const fail = () => {
    if (src === cover.hd) setSrc(cover.fallback);
    else setState('failed');
  };
  return (
    // Outer: placed on the arc (rotation around a pivot far below the card) and dealt out on open.
    <span
      className="group/card absolute bottom-0 left-1/2 block hover:!z-30"
      style={{
        '--r': `${offset * 12}deg`,
        zIndex: 10 - Math.abs(offset),
        transformOrigin: '50% 300%',
        transform: 'translateX(-50%) rotate(var(--r))',
        animation: `gqspread 900ms cubic-bezier(.16,1,.3,1) ${150 + index * 70}ms both`,
      }}
    >
      {/* Inner: lifts outward along the card's own angle on hover, so the arc is never broken. */}
      <span
        className="relative block h-56 w-40 cursor-pointer overflow-hidden rounded-[14px] transition-[transform,opacity,filter] duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover/fan:opacity-60 group-hover/card:!-translate-y-7 group-hover/card:!scale-[1.07] group-hover/card:!opacity-100 group-hover/card:!brightness-110 xl:h-64 xl:w-44"
        style={{
          boxShadow: '0 28px 50px -18px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.16), inset 0 1px 0 rgba(255,255,255,0.12)',
          backgroundColor: '#1c1f1c',
        }}
      >
        {state !== 'failed' && (
          <img
            src={src}
            alt=""
            decoding="async"
            onLoad={() => setState('ready')}
            onError={fail}
            className="absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-700 ease-out"
            style={{ opacity: state === 'ready' ? 1 : 0, transform: state === 'ready' ? 'scale(1)' : 'scale(1.06)' }}
          />
        )}
        {state === 'loading' && (
          <span className="absolute inset-0 overflow-hidden" style={{ background: 'linear-gradient(160deg,#2a2e2a,#1a1c1a)' }}>
            <span className="absolute inset-0 motion-safe:animate-[gqshimmer_1.4s_ease-in-out_infinite]" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)' }} />
            <Gamepad2 className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.25)' }} />
          </span>
        )}
        {state === 'failed' && (
          <span className="absolute inset-0 flex items-end p-3" style={{ background: 'linear-gradient(160deg,#3a4a1c,#111311)' }}>
            <span className="font-heading text-sm font-bold" style={{ color: '#fff' }}>{cover.title}</span>
          </span>
        )}
        {/* soft sheen so the art reads as a card, not a flat image */}
        <span className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.14), transparent 35%, transparent 70%, rgba(0,0,0,0.35))' }} />
      </span>
    </span>
  );
}

const LOCAL_FALLBACKS = [
  '/assets/trending-hades-2.jpg',
  '/assets/trending-hollow-knight.jpg',
  '/assets/trending-elden-ring.jpg',
  '/assets/trending-clair-obscur.jpg',
  '/assets/trending-zenless.jpg',
];
// A pool of well-known games; five are picked at random each time the page opens. Steam's CDN serves the art,
// so this works while our own API is down.
const COVER_POOL = [
  [1245620, 'Elden Ring'],
  [1091500, 'Cyberpunk 2077'],
  [1174180, 'Red Dead Redemption 2'],
  [292030, 'The Witcher 3'],
  [1593500, 'God of War'],
  [1086940, 'Baldur\'s Gate 3'],
  [814380, 'Sekiro'],
  [367520, 'Hollow Knight'],
  [1145350, 'Hades II'],
  [1145360, 'Hades'],
  [1903340, 'Clair Obscur: Expedition 33'],
  [2358720, 'Black Myth: Wukong'],
  [2215430, 'Ghost of Tsushima'],
  [1817070, 'Marvel\'s Spider-Man Remastered'],
  [413150, 'Stardew Valley'],
  [504230, 'Celeste'],
];
function pickCovers(count = 5) {
  const pool = [...COVER_POOL];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).map(([appid, title], i) => ({ hd: steamCover(appid), fallback: LOCAL_FALLBACKS[i], title }));
}

const FEATURES = [
  { icon: Library, title: 'One library', text: 'Steam and every other platform in one place.', color: 'var(--status-playing)' },
  { icon: Trophy, title: 'Track progress', text: 'Playtime, achievements and time to beat.', color: 'var(--status-completed)' },
  { icon: CalendarDays, title: 'Game nights', text: 'Plan sessions and invite your friends.', color: 'var(--secondary-accent)' },
];

function SessionCheck({ status, retry }) {
  // Once a check has failed, keep the waking page up during the retries (status flips back to 'loading'
  // each time), so its countdown and attempt count are not reset.
  const [failed, setFailed] = useState(false);
  if (status === 'error' && !failed) setFailed(true);
  if (status === 'error' || failed) return <ServerWaking retry={retry} />;
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-16" role="status" aria-label="Checking your session">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function ProtectedRoute() {
  const { status, retry } = useAuth();
  const location = useLocation();
  if (status === 'loading' || status === 'error') return <SessionCheck status={status} retry={retry} />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { status, retry } = useAuth();
  const location = useLocation();
  if (status === 'loading' || status === 'error') return <SessionCheck status={status} retry={retry} />;
  if (status === 'authenticated') return <Navigate to={location.state?.from ?? '/'} replace />;
  return <Outlet />;
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { BackdropHero } from '@/components/art/BackdropHero.jsx';
import { cn } from '@/lib/utils.js';
import { buttonVariants } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useMotionOk } from '@/lib/motion.js';
import { searchGames } from '@/services/gamesApi.js';

const SLIDES = 5;

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export const ADVANCE_MS = 7000;

// The slide that is fading out stays visible for a moment but is hidden from screen readers and keyboard focus.
function Leaving({ children }) {
  const present = useIsPresent();
  return (
    <div aria-hidden={present ? undefined : true} inert={present ? undefined : true} className="h-full">
      {children}
    </div>
  );
}
const ICON_BUTTON =
  'flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg/80 text-text hover:border-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text';

// Trending games (the most popular in the catalog) as a hero. It moves by itself every few seconds unless the viewer
// prefers reduced motion; it also holds still while the pointer or keyboard focus is on it. Dots, arrows and the
// slide's own link work without a pointer. Its own section: a failure here shows an error with Retry and leaves the
// rest of the page alone.
export function HeroCarousel() {
  // Popular games, shuffled so the header is a different game each visit; games with wide art are preferred.
  const load = useCallback(async (signal) => {
    const items = (await searchGames({ limit: SLIDES + 3 }, { signal })).items.filter((g) => g.backdrop || g.screenshots?.length || g.cover);
    return shuffle(items).slice(0, SLIDES);
  }, []);
  const { status, data: slides, retry } = useAsync(load);
  const motionOk = useMotionOk();
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false); // pointer or focus is on the carousel

  const count = slides?.length ?? 0;
  const auto = motionOk && !held && count > 1;
  const go = useCallback((to) => setIndex((i) => (count ? (((typeof to === 'function' ? to(i) : to) % count) + count) % count : 0)), [count]);

  useEffect(() => {
    if (!auto) return undefined;
    const timer = setInterval(() => go((i) => i + 1), ADVANCE_MS);
    return () => clearInterval(timer);
  }, [auto, go]);

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading trending games">
        <Skeleton className="h-72 w-full rounded-card" />
      </div>
    );
  }
  if (status === 'error') return <ErrorState message="Couldn't load trending games." onRetry={retry} />;
  if (!count) return null;

  const game = slides[Math.min(index, count - 1)];
  const year = game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;
  // The outgoing slide stays underneath while the new one fades in (both share one grid cell), so the switch is a
  // smooth cross-fade instead of a cut to black. The text rises in a moment later.
  const crossFade = motionOk
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.9, ease: [0.4, 0, 0.2, 1] } }
    : {};
  const fade = motionOk
    ? { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] } }
    : {};

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Trending games"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHeld(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false);
      }}
      className="flex flex-col gap-3"
    >
      {/* The live region is this stable wrapper; keyed BackdropHero renders full strength backdrop art with dark scrim */}
      <div aria-live={auto ? 'off' : 'polite'} className="grid overflow-hidden rounded-card">
        <AnimatePresence initial={false}>
        <motion.div key={game.id} {...crossFade} style={{ gridArea: '1 / 1' }}>
        <Leaving>
        <BackdropHero as="div" art={game} seed={game.title} className="gq-home-hero flex flex-col justify-center !min-h-[320px] px-5 py-9 sm:!min-h-[360px] sm:px-10 sm:py-10 lg:!min-h-[390px]">
          <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <motion.div {...fade} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${count}`} className="flex max-w-xl flex-col gap-3">
              <p className="flex items-center gap-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-[var(--accent)]">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> Trending now
              </p>
              <h2 className="font-heading text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-[2.75rem]">{game.title}</h2>
              <p className="text-sm font-medium text-gray-300">{[year, ...(game.genres ?? []).slice(0, 2)].filter(Boolean).join(' · ')}</p>
              {game.summary && <p className="line-clamp-2 text-sm text-gray-200 leading-relaxed">{game.summary}</p>}
              <div className="pt-1">
                <Link to={`/games/${game.slug}`} aria-label={`View game: ${game.title}`} className={cn(buttonVariants(), 'bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent)] hover:brightness-105')}>
                  View game
                </Link>
              </div>
            </motion.div>
          </div>
        </BackdropHero>
        </Leaving>
        </motion.div>
        </AnimatePresence>
      </div>

      {count > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-label="Previous slide" onClick={() => go((i) => i - 1)} className={ICON_BUTTON}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div role="group" aria-label="Choose a slide" className="flex flex-wrap items-center gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Slide ${i + 1}: ${s.title}`}
                aria-pressed={i === index}
                onClick={() => go(i)}
                className={`relative h-2.5 overflow-hidden rounded-full transition-[width,background-color] duration-500 ${i === index ? 'w-8 bg-border' : 'w-2.5 bg-border hover:bg-text-muted'}`}
              >
                {i === index && (
                  <span
                    key={index}
                    className="gq-hero-dot-fill absolute inset-y-0 left-0 rounded-full bg-text"
                    style={{ animationDuration: `${ADVANCE_MS}ms`, animationPlayState: auto ? 'running' : 'paused' }}
                  />
                )}
              </button>
            ))}
          </div>
          <button type="button" aria-label="Next slide" onClick={() => go((i) => i + 1)} className={ICON_BUTTON}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}

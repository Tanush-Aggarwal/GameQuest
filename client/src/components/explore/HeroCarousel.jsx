import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Pause, Play, TrendingUp } from 'lucide-react';
import { BackdropHero } from '@/components/art/BackdropHero.jsx';
import { CoverImage } from '@/components/games/GameCard.jsx';
import { buttonVariants } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useMotionOk } from '@/lib/motion.js';
import { searchGames } from '@/services/gamesApi.js';

export const SLIDES = 5;
export const ADVANCE_MS = 7000;
const ICON_BUTTON =
  'flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg/80 text-text hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

// Trending games (the most popular in the catalog) as a hero. It moves by itself every few seconds unless the viewer
// prefers reduced motion; a Pause button is always there while it moves, and it also holds still while the pointer or
// keyboard focus is on it. Dots, arrows and the slide's own link work without a pointer. Its own section: a failure
// here shows an error with Retry and leaves the rest of the page alone.
export function HeroCarousel() {
  const load = useCallback(async (signal) => (await searchGames({ limit: SLIDES + 3 }, { signal })).items.filter((g) => g.backdrop || g.cover).slice(0, SLIDES), []);
  const { status, data: slides, retry } = useAsync(load);
  const motionOk = useMotionOk();
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [held, setHeld] = useState(false); // pointer or focus is on the carousel

  const count = slides?.length ?? 0;
  const auto = motionOk && !userPaused && !held && count > 1;
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
  const fade = motionOk ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4 } } : {};

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
      {/* The live region is this stable wrapper (a region that is re-created on every slide is not announced); only the
          art and the slide are keyed, so the controls below keep their identity, and keyboard focus, across slides. */}
      <div aria-live={auto ? 'off' : 'polite'}>
        <BackdropHero key={game.id} as="div" art={game} seed={game.title} className="gq-home-hero min-h-72 px-5 py-8 sm:px-8 sm:py-10">
          <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <motion.div {...fade} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${count}`} className="flex max-w-xl flex-col gap-3">
              <p className="flex items-center gap-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-secondary-accent">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> Trending now
              </p>
              <h2 className="font-heading text-3xl font-extrabold leading-tight tracking-tight text-text sm:text-4xl">{game.title}</h2>
              <p className="text-sm font-medium text-text-muted">{[year, ...(game.genres ?? []).slice(0, 2)].filter(Boolean).join(' · ')}</p>
              {game.summary && <p className="line-clamp-2 text-sm text-text/90 leading-relaxed">{game.summary}</p>}
              <div className="pt-1">
                <Link to={`/games/${game.slug}`} aria-label={`View game: ${game.title}`} className={buttonVariants({ variant: 'primary' })}>
                  View game
                </Link>
              </div>
            </motion.div>

            <div className="hidden md:flex shrink-0 items-center justify-center" aria-hidden="true">
              <div className="gq-hero-artwork relative w-40 sm:w-48 lg:w-56 aspect-[3/4] rounded-card overflow-hidden border border-black/10 bg-surface shadow-xl transition-all duration-300 hover:scale-[1.02]">
                <CoverImage cover={game.cover} title={game.title} alt="" sizes="224px" className="h-full w-full object-cover" />
              </div>
            </div>
          </div>
        </BackdropHero>
      </div>

      {count > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-label="Previous slide" onClick={() => go((i) => i - 1)} className={ICON_BUTTON}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div role="group" aria-label="Choose a slide" className="flex">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Show ${s.title}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className="group flex h-11 w-8 items-center justify-center focus-visible:outline-none"
              >
                <span
                  aria-hidden="true"
                  className={`h-2 rounded-full transition-all group-focus-visible:ring-2 group-focus-visible:ring-accent ${i === index ? 'w-6 bg-accent' : 'w-2 bg-text-muted'}`}
                />
              </button>
            ))}
          </div>
          <button type="button" aria-label="Next slide" onClick={() => go((i) => i + 1)} className={ICON_BUTTON}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          {motionOk && (
            <button type="button" aria-label={userPaused ? 'Play slideshow' : 'Pause slideshow'} onClick={() => setUserPaused((p) => !p)} className={ICON_BUTTON}>
              {userPaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ArtProvider } from '@/components/art/ArtProvider.jsx';
import { AmbientProvider } from '@/components/art/AmbientProvider.jsx';
import { AmbientBackground } from '@/components/art/AmbientBackground.jsx';
import { PAGE_TRANSITION, useMotionOk } from '@/lib/motion.js';
import { SideRail } from './SideRail.jsx';
import { TopBar } from './TopBar.jsx';
import { BottomTabBar } from './BottomTabBar.jsx';

// Loaded the first time it is opened, so it costs nothing on a page that never uses it.
const CommandPalette = lazy(() => import('@/components/command/CommandPalette.jsx'));

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading page">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

// The page, faded and lifted in on every navigation. The previous page stays mounted while it leaves
// (AnimatePresence + popLayout), which is what lets a cover glide from a card to the game page's hero.
// With reduced motion the page is simply swapped.
function AnimatedPage() {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const motionOk = useMotionOk();
  const page = <Suspense fallback={<PageSkeleton />}>{outlet}</Suspense>;
  if (!motionOk) return page;
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div key={pathname} data-page-transition {...PAGE_TRANSITION} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
        {page}
      </motion.div>
    </AnimatePresence>
  );
}

// Desktop: a 72 px rail on the left, a slim bar on top, the page in between. Mobile: the slim bar on top
// and the tab bar at the bottom.
// The art provider loads the game art for section backgrounds once for every page inside the shell; the ambient
// provider lets a page say which game tints the background behind everything.
export function AppLayout() {
  const [palette, setPalette] = useState({ open: false, used: false });
  const openPalette = (open) => setPalette((p) => ({ open, used: p.used || open }));

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => ({ open: !p.open, used: true }));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <ArtProvider>
      <AmbientProvider>
        <AmbientBackground />
        <div className="gq-app min-h-screen">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-control focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
          >
            Skip to content
          </a>
          <SideRail />
          <div className="md:pl-[72px]">
            <TopBar onOpenPalette={() => openPalette(true)} />
            <main id="main" className="gq-main mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 pb-24 lg:pb-12">
              <AnimatedPage />
            </main>
          </div>
          <BottomTabBar />
        </div>
        {palette.used && (
          <Suspense fallback={null}>
            <CommandPalette open={palette.open} onOpenChange={openPalette} />
          </Suspense>
        )}
      </AmbientProvider>
    </ArtProvider>
  );
}

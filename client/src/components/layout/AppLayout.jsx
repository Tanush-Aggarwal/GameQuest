import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ArtProvider } from '@/components/art/ArtProvider.jsx';
import { SideRail } from './SideRail.jsx';
import { TopBar } from './TopBar.jsx';
import { BottomTabBar } from './BottomTabBar.jsx';

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading page">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

// Desktop: a 72 px rail on the left, a slim bar on top, the page in between. Mobile: the slim bar on top
// and the tab bar at the bottom.
// The art provider loads the game art for section backgrounds once for every page inside the shell.
export function AppLayout() {
  return (
    <ArtProvider>
      <div className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-control focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
        >
          Skip to content
        </a>
        <SideRail />
        <div className="md:pl-[72px]">
          <TopBar />
          <main id="main" className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:pb-10">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
        <BottomTabBar />
      </div>
    </ArtProvider>
  );
}

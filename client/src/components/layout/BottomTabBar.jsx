import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils.js';
import { NAV_ITEMS } from './navItems.js';

export function BottomTabBar() {
  const { pathname } = useLocation();
  const isGamePage = pathname.startsWith('/games/');

  return (
    <nav
      aria-label="Main"
      className={cn(
        'gq-bottom-tabbar fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:hidden',
        isGamePage ? 'border-white/10 bg-[#0B0C0F]' : 'border-border bg-surface',
      )}
    >
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium',
                  isActive
                    ? 'text-accent'
                    : isGamePage
                      ? 'text-[#9AA3B2] hover:text-white'
                      : 'text-text-muted hover:text-text',
                )
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils.js';
import { NAV_ITEMS } from './navItems.js';

export function BottomTabBar() {
  return (
    <nav
      aria-label="Main"
      className="gq-bottom-tabbar fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
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
                  isActive ? 'text-accent' : 'text-text-muted',
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

import { Link, NavLink } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { DESKTOP_NAV_ITEMS } from './navItems.js';

// Narrow dark left sidebar with acid-lime active navigation.
export function SideRail() {
  return (
    <div
      className="gq-side-rail fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col items-center border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] py-4 md:flex"
    >
      <Link
        to="/"
        aria-label="GameQuest home"
        className="gq-brand flex h-12 w-12 items-center justify-center rounded-control transition-colors hover:bg-white/5"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-control bg-accent text-accent-fg shadow-sm">
          <Gamepad2 className="h-5 w-5" aria-hidden="true" />
        </span>
      </Link>

      <nav aria-label="Main" className="mt-5 flex w-full flex-1 flex-col items-center">
        <ul className="flex w-full flex-col items-center gap-1">
          {DESKTOP_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to} className="w-full">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'gq-nav-link relative flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors',
                    isActive
                      ? 'is-active text-accent font-semibold bg-white/[0.04]'
                      : 'text-[var(--sidebar-text)] hover:bg-white/[0.03] hover:text-bg',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="gq-nav-indicator absolute inset-y-2 left-0 w-[3px] rounded-r bg-accent"
                      />
                    )}
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

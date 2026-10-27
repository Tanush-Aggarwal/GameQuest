import { Link, NavLink } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { DESKTOP_NAV_ITEMS } from './navItems.js';

// The desktop navigation: a slim rail down the left edge (icon over label), like a console dashboard
// rather than a website header. Hidden below md, where the bottom tab bar takes over. The container is a
// plain div: the only landmark is the labelled <nav> inside it (an <aside> would announce "complementary").
export function SideRail() {
  return (
    <div className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col items-center gap-2 border-r border-border bg-surface py-3 md:flex">
      <Link
        to="/"
        aria-label="GameQuest home"
        className="flex h-11 w-11 items-center justify-center rounded-control text-accent hover:bg-surface-raised"
      >
        <Gamepad2 className="h-7 w-7" aria-hidden="true" />
      </Link>

      <nav aria-label="Main" className="flex w-full flex-1 flex-col items-center">
        <ul className="flex w-full flex-col items-center gap-1">
          {DESKTOP_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to} className="w-full px-0.5">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'relative flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-control text-[11px] font-medium leading-tight tracking-tight transition-colors',
                    isActive ? 'bg-surface-raised text-text' : 'text-text-muted hover:bg-surface-raised/60 hover:text-text',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />}
                    <Icon className={cn('h-5 w-5', isActive && 'text-accent')} aria-hidden="true" />
                    {label}
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

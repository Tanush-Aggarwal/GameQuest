import { Link, NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils.js';
import { useAuth } from '@/hooks/useAuth.js';
import { DESKTOP_NAV_ITEMS } from './navItems.js';

// Desktop sidebar: narrow dark panel matching the reference design.
// Hidden below md; the bottom tab bar handles mobile navigation.
export function SideRail() {
  const { user } = useAuth();

  return (
    <aside className="gq-side-rail fixed inset-y-0 left-0 z-30 hidden w-[160px] flex-col border-r bg-[var(--sidebar-bg)] border-[var(--sidebar-border)] md:flex">
      {/* Logo */}
      <Link to="/" aria-label="GameQuest home" className="flex items-center gap-2 px-5 py-5">
        <span className="text-lg font-heading font-bold tracking-tight text-white">
          Game<span className="text-[var(--accent)]">Quest</span>
        </span>
      </Link>

      {/* Navigation */}
      <nav aria-label="Main" className="flex w-full flex-1 flex-col px-3 mt-2">
        <ul className="flex w-full flex-col gap-0.5">
          {DESKTOP_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to} className="w-full">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) => cn(
                  'gq-nav-link relative flex min-h-[44px] w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'text-white bg-white/10 is-active'
                    : 'text-[var(--sidebar-text)] hover:text-white hover:bg-white/5'
                )}
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[var(--accent)]" />}
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* User badge at bottom */}
      {user && (
        <div className="p-3 border-t border-[var(--sidebar-border)]">
          <Link
            to="/profile"
            className="flex items-center gap-2.5 rounded-[10px] bg-[#181A18] border border-white/5 p-2 transition-colors hover:border-white/10 group"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)] text-xs font-bold ring-1 ring-white/10">
              {user.username?.charAt(0).toUpperCase() ?? 'U'}
            </span>
            <span className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-white truncate group-hover:text-[var(--accent)] transition-colors">
                {user.username}
              </span>
              <span className="text-[10px] text-gray-400 font-medium">Level 12</span>
            </span>
          </Link>
        </div>
      )}
    </aside>
  );
}

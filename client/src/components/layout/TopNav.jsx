import { Link, NavLink } from 'react-router-dom';
import { Gamepad2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth.js';
import { Button } from '@/components/ui/button.jsx';
import { cn } from '@/lib/utils.js';
import { NAV_ITEMS } from './navItems.js';

export function TopNav() {
  const { user, logout } = useAuth();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      toast.error('Could not reach the server, but you were logged out on this device.');
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2 font-heading text-lg font-bold">
          <Gamepad2 className="h-6 w-6 text-accent" aria-hidden="true" />
          GameQuest
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium',
                  isActive ? 'bg-surface-raised text-text' : 'text-text-muted hover:text-text',
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user && <span className="hidden text-sm text-text-muted sm:inline">{user.username}</span>}
          <Button variant="ghost" onClick={handleLogout} aria-label="Log out">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Log out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

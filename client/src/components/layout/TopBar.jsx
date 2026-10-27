import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Command, LogOut, Search, User } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth.js';
import { Button } from '@/components/ui/button.jsx';

// Horizontal top bar: search, command-palette, notifications, profile, logout.
export function TopBar({ onOpenPalette }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [text, setText] = useState('');
  const showSearch = pathname !== '/explore';

  function search(e) {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    navigate(`/explore?q=${encodeURIComponent(q)}`);
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      toast.error('Could not reach the server, but you were logged out on this device.');
    }
  }

  return (
    <header className="gq-topbar sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur-md">
      <div className="gq-topbar-inner mx-auto flex h-12 w-full max-w-[1480px] items-center gap-2 px-3 sm:gap-3 sm:px-6">
        {/* Mobile logo */}
        <Link
          to="/"
          aria-label="GameQuest home"
          className="gq-mobile-brand flex min-h-11 min-w-11 items-center gap-2 font-heading font-bold md:hidden"
        >
          <span className="text-sm font-bold tracking-tight text-text">
            Game<span className="text-[var(--accent)]">Quest</span>
          </span>
        </Link>

        {/* Search bar */}
        {showSearch && (
          <form role="search" onSubmit={search} className="relative min-w-0 flex-1 md:max-w-md mx-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search games"
              placeholder="Search games, genres, players..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="gq-search h-11 w-full rounded-full border border-border bg-surface pl-9 pr-14 text-sm text-text placeholder:text-text-muted transition-colors focus:border-text focus:outline-none"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-block rounded border border-border bg-surface-raised px-1.5 py-0.5 text-[10px] font-mono font-medium text-text-muted">
              Ctrl K
            </kbd>
          </form>
        )}

        {/* Right actions */}
        <div className="gq-top-actions ml-auto flex items-center gap-1 sm:gap-1.5">
          {onOpenPalette && (
            <Button
              variant="ghost"
              onClick={onOpenPalette}
              aria-keyshortcuts="Control+K Meta+K"
              className="h-10 px-2 sm:px-2.5 text-text-muted hover:text-text transition-colors"
            >
              <Command className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Quick search</span>
              <kbd className="hidden rounded-control border border-border bg-surface px-1.5 py-0.5 text-[11px] font-mono font-medium text-text-muted lg:inline">Ctrl K</kbd>
            </Button>
          )}

          {/* Notifications button with dot */}
          <Button
            variant="ghost"
            className="relative h-10 w-10 px-0 text-text-muted hover:text-text transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-[var(--secondary-accent)]" aria-hidden="true" />
          </Button>

          {user && (
            <Link
              to="/profile"
              className="flex min-h-11 items-center gap-1.5 sm:gap-2 rounded-control px-1.5 sm:px-2 py-1 text-sm font-medium text-text-muted hover:text-text transition-colors"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)] text-xs font-bold"
              >
                {user.username ? user.username.charAt(0).toUpperCase() : <User className="h-4 w-4" aria-hidden="true" />}
              </span>
              <span className="sr-only">Your profile:</span>
              <span className="hidden max-w-[10rem] truncate font-semibold sm:inline">{user.username}</span>
            </Link>
          )}

          <Button
            variant="ghost"
            onClick={handleLogout}
            aria-label="Log out"
            className="h-10 px-2 sm:px-2.5 text-text-muted hover:text-text transition-colors"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden text-xs font-semibold lg:inline">Log out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

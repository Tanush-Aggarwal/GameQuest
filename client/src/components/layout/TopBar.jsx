import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Command, Gamepad2, LogOut, Search, User } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth.js';
import { Button } from '@/components/ui/button.jsx';

// The slim bar across the top: game search, and who you are. Navigation lives in the side rail (desktop)
// and the bottom tab bar (mobile); the logo only shows here on mobile, where there is no rail.
export function TopBar({ onOpenPalette }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [text, setText] = useState('');
  // Explore has its own search box (kept in sync with the URL); a second one up here would show other text.
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
    <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-3 px-4">
        <Link to="/" className="flex min-h-11 min-w-11 items-center gap-2 font-heading font-bold md:hidden">
          <Gamepad2 className="h-6 w-6 text-accent" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">GameQuest home</span>
        </Link>

        {showSearch && (
          <form role="search" onSubmit={search} className="relative min-w-0 flex-1 md:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search games"
              placeholder="Search games"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-11 w-full rounded-control border border-border bg-surface pl-9 pr-3 text-sm text-text placeholder:text-text-muted"
            />
          </form>
        )}

        <div className="ml-auto flex items-center gap-1">
          {onOpenPalette && (
            <Button variant="ghost" onClick={onOpenPalette} aria-keyshortcuts="Control+K Meta+K" className="px-3">
              {/* the name is the text, so what is seen (Ctrl K) is part of what is announced */}
              <Command className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Quick search</span>
              <kbd className="hidden rounded-control border border-border px-1.5 text-xs lg:inline">Ctrl K</kbd>
            </Button>
          )}
          {user && (
            <Link
              to="/profile"
              className="flex min-h-11 items-center gap-2 rounded-control px-2 text-sm text-text-muted hover:bg-surface-raised hover:text-text"
            >
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-text"
              >
                <User className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="sr-only">Your profile:</span>
              <span className="hidden max-w-[10rem] truncate sm:inline">{user.username}</span>
            </Link>
          )}
          <Button variant="ghost" onClick={handleLogout} aria-label="Log out" className="px-3">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden lg:inline">Log out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

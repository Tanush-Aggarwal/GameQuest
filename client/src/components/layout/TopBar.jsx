import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Command, Gamepad2, LogOut, Search, User } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth.js';
import { Button } from '@/components/ui/button.jsx';

// Horizontal top bar containing search, command-palette shortcut, account and logout controls.
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
    <header className="gq-topbar sticky top-0 z-20 border-b border-[#DCD5C6] bg-[#F2EEE4]/90 backdrop-blur-md">
      <div className="gq-topbar-inner mx-auto flex h-12 w-full max-w-[1480px] items-center gap-3 px-4 sm:px-6">
        <Link
          to="/"
          aria-label="GameQuest home"
          className="gq-mobile-brand flex min-h-11 min-w-11 items-center gap-2 font-heading font-bold md:hidden"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-control bg-[#C9F36D] text-[#111311]">
            <Gamepad2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="sr-only sm:not-sr-only text-sm font-bold tracking-tight text-[#151713]">GameQuest</span>
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
              className="gq-search h-11 w-full rounded-control border border-[#DCD5C6] bg-white pl-9 pr-3 text-sm text-text placeholder:text-text-muted shadow-2xs transition-colors focus:border-text focus:outline-none"
            />
          </form>
        )}

        <div className="gq-top-actions ml-auto flex items-center gap-1.5">
          {onOpenPalette && (
            <Button
              variant="ghost"
              onClick={onOpenPalette}
              aria-keyshortcuts="Control+K Meta+K"
              className="h-10 px-2.5 text-text hover:bg-white/60 transition-colors"
            >
              <Command className="h-4 w-4 text-text" aria-hidden="true" />
              <span className="sr-only">Quick search</span>
              <kbd className="hidden rounded-control border border-[#DCD5C6] bg-white px-1.5 py-0.5 text-[11px] font-mono font-medium text-text-muted shadow-2xs lg:inline">Ctrl K</kbd>
            </Button>
          )}

          {user && (
            <Link
              to="/profile"
              className="flex min-h-11 items-center gap-2 rounded-control px-2 py-1 text-sm font-medium text-text hover:bg-white/60 transition-colors"
            >
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[#111311] text-[#C9F36D] text-xs font-bold"
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
            className="h-10 px-2.5 text-text hover:bg-white/60 transition-colors"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden text-xs font-semibold lg:inline">Log out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

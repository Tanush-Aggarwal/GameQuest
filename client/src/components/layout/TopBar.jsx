import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Check, Command, LogOut, Search, User } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth.js';
import { Button } from '@/components/ui/button.jsx';
import { getNotifications, markNotificationsRead } from '@/services/accountApi.js';

function formatRelativeTime(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays}d ago`;
}

// Horizontal top bar: search, command-palette, notifications, profile, logout.
export function TopBar({ onOpenPalette }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [text, setText] = useState('');
  const [notifications, setNotifications] = useState({ items: [], unread: 0 });
  const [openNotifications, setOpenNotifications] = useState(false);
  const notifRef = useRef(null);
  const showSearch = pathname !== '/explore';

  useEffect(() => {
    let active = true;
    if (user) {
      getNotifications()
        .then((data) => {
          if (active && data) {
            setNotifications({ items: data.items ?? [], unread: data.unread ?? 0 });
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [user]);

  // Click outside to close notifications dropdown
  useEffect(() => {
    if (!openNotifications) return undefined;
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setOpenNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openNotifications]);

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

  async function handleMarkAllRead() {
    try {
      await markNotificationsRead();
      setNotifications((prev) => ({
        unread: 0,
        items: prev.items.map((i) => ({ ...i, unread: false })),
      }));
    } catch {
      // ignore
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

          {/* Notifications button with unread dot & dropdown */}
          <div className="relative" ref={notifRef}>
            <Button
              variant="ghost"
              className="relative h-10 w-10 px-0 text-text-muted hover:text-text transition-colors"
              aria-label={notifications.unread > 0 ? `Notifications (${notifications.unread} unread)` : 'Notifications'}
              onClick={() => setOpenNotifications((o) => !o)}
            >
              <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
              {notifications.unread > 0 && (
                <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-[var(--secondary-accent)] ring-2 ring-[var(--bg)]" aria-hidden="true" />
              )}
            </Button>

            {openNotifications && (
              <div
                role="region"
                aria-label="Notifications list"
                className="absolute right-0 top-12 mt-1 w-80 max-w-[calc(100vw-24px)] rounded-[14px] border border-border bg-surface p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <span className="font-heading text-xs font-bold uppercase tracking-wider text-text">
                    Notifications {notifications.unread > 0 && `(${notifications.unread})`}
                  </span>
                  {notifications.unread > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-[11px] font-semibold text-[var(--accent-text)] hover:underline flex items-center gap-1"
                    >
                      <Check className="h-3 w-3" aria-hidden="true" />
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="mt-2 max-h-72 overflow-y-auto flex flex-col gap-1.5">
                  {notifications.items.length === 0 ? (
                    <p className="py-6 text-center text-xs text-text-muted">No notifications yet.</p>
                  ) : (
                    notifications.items.slice(0, 10).map((item) => (
                      <Link
                        key={item.id}
                        to={item.link}
                        onClick={() => {
                          setOpenNotifications(false);
                          if (item.unread) handleMarkAllRead();
                        }}
                        className={`flex items-start gap-2.5 p-2 rounded-[8px] transition-colors text-xs ${
                          item.unread ? 'bg-surface-raised font-medium' : 'hover:bg-surface-raised/50 text-text-muted'
                        }`}
                      >
                        {item.actor?.avatar ? (
                          <img src={item.actor.avatar} alt="" className="h-7 w-7 rounded-full object-cover shrink-0 mt-0.5" />
                        ) : (
                          <span className="flex h-7 w-7 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] font-bold items-center justify-center shrink-0 mt-0.5 text-[10px]">
                            {item.actor?.username?.charAt(0).toUpperCase() || 'U'}
                          </span>
                        )}
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-text leading-snug">{item.text}</span>
                          <span className="text-[10px] text-text-muted mt-0.5">{formatRelativeTime(item.createdAt)}</span>
                        </div>
                        {item.unread && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shrink-0 mt-2" aria-hidden="true" />
                        )}
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

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

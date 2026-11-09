import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import {
  Check, ExternalLink, Eye, EyeOff, Film, Gamepad2, ImageIcon, ImageOff, LayoutDashboard, Loader2, Pencil, RotateCcw, Search, Shield, Star, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Avatar } from '@/components/ui/Avatar.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { HeaderEditor } from '@/components/admin/HeaderEditor.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useAuth } from '@/hooks/useAuth.js';
import { useIsAdmin } from '@/hooks/useIsAdmin.js';
import { getErrorInfo } from '@/services/api.js';
import {
  getAdminOverview, getHiddenTrailers, restoreTrailer, searchAdminGames, searchAdminUsers, setUserRole, updateAdminGame,
} from '@/services/adminApi.js';
import { cn } from '@/lib/utils.js';

const TABS = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard },
  { value: 'games', label: 'Games', icon: Gamepad2 },
  { value: 'trailers', label: 'Hidden trailers', icon: Film },
  { value: 'users', label: 'Users', icon: Users },
];

// Admin console: the everyday catalog upkeep that otherwise needs code or database access.
//   Overview  – the numbers that show what needs attention;
//   Games     – find any game (hidden ones too), rename it, hide/show it in the catalog, edit its header;
//   Hidden trailers – every video an admin hid as wrong, with Restore;
//   Users     – find accounts and make someone an administrator (or not).
// The server checks the administrator role on every call; this page only decides what to show.
export default function Admin() {
  const isAdmin = useIsAdmin();
  const [tab, setTab] = useState('overview');

  if (!isAdmin) {
    return (
      <EmptyState
        icon={Shield}
        headingLevel="h1"
        title="Administrators only"
        description="This page is for GameQuest administrators. Ask an administrator if you need access."
        actionLabel="Go home"
        actionTo="/"
      />
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-muted">
            <Shield className="h-3.5 w-3.5" aria-hidden="true" /> Administrator
          </p>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Admin console</h1>
          <p className="text-sm text-text-muted">Keep the catalog tidy: headers, trailers, games and roles. Every change is logged.</p>
        </div>
      </header>

      <Tabs.Root value={tab} onValueChange={setTab} className="flex flex-col gap-5">
        <Tabs.List aria-label="Admin sections" className="flex gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1">
          {TABS.map(({ value, label, icon: Icon }) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text data-[state=active]:bg-[#151713] data-[state=active]:text-white"
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="overview" className="focus:outline-none"><Overview onOpen={setTab} /></Tabs.Content>
        <Tabs.Content value="games" className="focus:outline-none"><GamesPanel /></Tabs.Content>
        <Tabs.Content value="trailers" className="focus:outline-none"><TrailersPanel /></Tabs.Content>
        <Tabs.Content value="users" className="focus:outline-none"><UsersPanel /></Tabs.Content>
      </Tabs.Root>
    </section>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function Overview({ onOpen }) {
  const load = useCallback((signal) => getAdminOverview({ signal }), []);
  const { status, data, error, retry } = useAsync(load);
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;
  const tiles = [
    { label: 'Games in the catalog', value: data?.visibleGames, icon: Gamepad2, tab: 'games' },
    { label: 'Hidden games (DLC, editions)', value: data?.hiddenGames, icon: EyeOff, tab: 'games' },
    { label: 'Custom headers', value: data?.customHeaders, icon: ImageIcon, tab: 'games' },
    { label: 'Games with hidden trailers', value: data?.withHiddenTrailers, icon: Film, tab: 'trailers' },
    { label: 'Games without wide art', value: data?.gamesWithoutArt, icon: ImageOff, tab: 'games', warn: true },
    { label: 'Players', value: data?.players, icon: Users, tab: 'users' },
    { label: 'Administrators', value: data?.admins, icon: Shield, tab: 'users' },
    { label: 'Reviews', value: data?.reviews, icon: Star },
  ];
  return (
    <div className="flex flex-col gap-5">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon, tab, warn }) => {
          const body = (
            <>
              <Icon className={cn('h-5 w-5', warn && value ? 'text-[#B7791F]' : 'text-text-muted')} aria-hidden="true" />
              {status === 'loading' ? <Skeleton className="h-8 w-16" /> : <span className="font-heading text-3xl font-bold tabular-nums">{(value ?? 0).toLocaleString()}</span>}
              <span className="text-xs font-medium text-text-muted">{label}</span>
            </>
          );
          const cls = 'flex h-full w-full flex-col items-start gap-2 rounded-card border border-border bg-surface p-4 text-left';
          return (
            <li key={label}>
              {tab ? (
                <button type="button" onClick={() => onOpen(tab)} className={cn(cls, 'transition-colors hover:border-text/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text')}>{body}</button>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="font-heading text-lg font-bold">What you can do here</h2>
        <ul className="mt-2 grid gap-2 text-sm text-text-muted sm:grid-cols-2">
          <li><strong className="text-text">Fix a header:</strong> Games › Edit header, or ⋯ › Edit header on any game page.</li>
          <li><strong className="text-text">Hide a wrong trailer:</strong> “Hide this video (admin)” under the player. Restore it here.</li>
          <li><strong className="text-text">Clean the catalog:</strong> hide a DLC or duplicate that slipped in, fix a title.</li>
          <li><strong className="text-text">Share the work:</strong> Users › make a trusted player an administrator.</li>
        </ul>
      </div>
    </div>
  );
}

// ── Games ─────────────────────────────────────────────────────────────────────

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function SearchField({ value, onChange, placeholder, label }) {
  return (
    <label className="relative flex min-w-0 flex-1 basis-64 items-center">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-full border border-border bg-surface pl-9 pr-4 text-sm focus:border-text focus:outline-none"
      />
    </label>
  );
}

function GamesPanel() {
  const [q, setQ] = useState('');
  const [hidden, setHidden] = useState('all');
  const query = useDebounced(q.trim());
  const load = useCallback((signal) => searchAdminGames({ q: query || undefined, hidden, limit: 30 }, { signal }), [query, hidden]);
  const { status, data, error, retry } = useAsync(load);
  const [rows, setRows] = useState({}); // id -> latest row after an edit
  const [editing, setEditing] = useState(null);

  const items = (data?.items ?? []).map((g) => rows[g.id] ?? g);
  const patchRow = (row) => setRows((r) => ({ ...r, [row.id]: row }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField value={q} onChange={setQ} placeholder="Search any game, hidden ones too" label="Search games" />
        <div role="radiogroup" aria-label="Show" className="flex rounded-full border border-border bg-surface p-1">
          {[['all', 'All'], ['visible', 'In catalog'], ['hidden', 'Hidden']].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={hidden === value}
              onClick={() => setHidden(value)}
              className={cn('min-h-9 rounded-full px-3 text-xs font-semibold', hidden === value ? 'bg-[#151713] text-white' : 'text-text-muted hover:text-text')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {status === 'error' ? (
        <ErrorState message={error.message} onRetry={retry} />
      ) : status === 'loading' ? (
        <RowsSkeleton />
      ) : !items.length ? (
        <EmptyState icon={Search} title="No games found" description="Try another title or switch the filter." />
      ) : (
        <ul aria-label="Games" className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {items.map((g) => (
            <GameRow key={g.id} game={g} onChange={patchRow} onEditHeader={() => setEditing(g)} />
          ))}
        </ul>
      )}
      {editing && (
        <HeaderEditor
          game={editing}
          open
          onOpenChange={(v) => !v && setEditing(null)}
          onSaved={(updated) => patchRow({ ...editing, hasCustomHeader: Boolean(updated?.heroOverride?.url) })}
        />
      )}
    </div>
  );
}

function GameRow({ game, onChange, onEditHeader }) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(game.title);
  const [busy, setBusy] = useState(false);
  const year = game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;

  async function save(patch, message) {
    setBusy(true);
    try {
      const updated = await updateAdminGame(game.id, patch);
      onChange({ ...game, ...updated });
      toast.success(message);
      return true;
    } catch (err) {
      toast.error(getErrorInfo(err).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function rename(e) {
    e.preventDefault();
    const next = title.trim();
    if (!next || next === game.title) return setRenaming(false);
    if (await save({ title: next }, 'Title updated')) setRenaming(false);
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="h-14 w-10 shrink-0 overflow-hidden rounded-[6px] bg-surface-raised">
        {game.cover && <img src={game.cover} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </span>
      <div className="min-w-0 flex-1 basis-48">
        {renaming ? (
          <form onSubmit={rename} className="flex items-center gap-1.5">
            <label htmlFor={`title-${game.id}`} className="sr-only">Title</label>
            <input
              id={`title-${game.id}`}
              autoFocus
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (setTitle(game.title), setRenaming(false))}
              className="h-9 min-w-0 flex-1 rounded-control border border-border bg-bg px-2.5 text-sm font-semibold focus:border-text focus:outline-none"
            />
            <Button type="submit" variant="secondary" disabled={busy} aria-label="Save title" className="h-9 w-9 px-0"><Check className="h-4 w-4" aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" onClick={() => (setTitle(game.title), setRenaming(false))} aria-label="Cancel rename" className="h-9 w-9 px-0"><X className="h-4 w-4" aria-hidden="true" /></Button>
          </form>
        ) : (
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-semibold">{game.title}</span>
            <button type="button" onClick={() => setRenaming(true)} aria-label={`Rename ${game.title}`} className="shrink-0 rounded p-1 text-text-muted hover:bg-surface-raised hover:text-text">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </p>
        )}
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
          {[year, (game.platforms ?? []).slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
          {game.hidden && <Badge tone="muted">Hidden</Badge>}
          {game.hasCustomHeader && <Badge>Custom header</Badge>}
          {game.hiddenTrailers?.length > 0 && <Badge tone="muted">{game.hiddenTrailers.length} trailer{game.hiddenTrailers.length > 1 ? 's' : ''} hidden</Badge>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="secondary" onClick={onEditHeader} disabled={busy}>
          <ImageIcon className="h-4 w-4" aria-hidden="true" /> Edit header
        </Button>
        <Button
          variant="ghost"
          onClick={() => save({ hidden: !game.hidden }, game.hidden ? `${game.title} is back in the catalog` : `${game.title} hidden from the catalog`)}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : game.hidden ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
          {game.hidden ? 'Show' : 'Hide'}
        </Button>
        {!game.hidden && (
          <Link to={`/games/${game.slug}`} aria-label={`Open ${game.title}`} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-text-muted hover:bg-surface-raised hover:text-text">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </li>
  );
}

function Badge({ children, tone }) {
  return (
    <span
      className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', tone === 'muted' ? 'bg-surface-raised text-text-muted' : '')}
      style={tone === 'muted' ? undefined : { background: 'var(--accent)', color: 'var(--accent-fg)' }}
    >
      {children}
    </span>
  );
}

function RowsSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  );
}

// ── Hidden trailers ───────────────────────────────────────────────────────────

const YT = /^[A-Za-z0-9_-]{11}$/;

function TrailersPanel() {
  const load = useCallback((signal) => getHiddenTrailers({ signal }), []);
  const { status, data, error, retry } = useAsync(load);
  const [restored, setRestored] = useState(() => new Set()); // `${gameId}:${videoId}`
  const [busy, setBusy] = useState(null);

  async function restore(game, videoId) {
    const key = `${game.id}:${videoId}`;
    setBusy(key);
    try {
      await restoreTrailer(game.id, videoId);
      setRestored((s) => new Set(s).add(key));
      toast.success(`Trailer restored on ${game.title}`);
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setBusy(null);
    }
  }

  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;
  if (status === 'loading') return <RowsSkeleton />;
  const games = (data?.items ?? [])
    .map((g) => ({ ...g, hiddenTrailers: g.hiddenTrailers.filter((v) => !restored.has(`${g.id}:${v}`)) }))
    .filter((g) => g.hiddenTrailers.length);
  if (!games.length) {
    return <EmptyState icon={Film} title="No hidden trailers" description="Videos you hide with “Hide this video (admin)” on a game page show up here, so they can be restored." />;
  }
  return (
    <ul aria-label="Games with hidden trailers" className="flex flex-col gap-3">
      {games.map((g) => (
        <li key={g.id} className="rounded-card border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link to={`/games/${g.slug}`} className="font-semibold hover:underline">{g.title}</Link>
            <span className="text-xs text-text-muted">{g.hiddenTrailers.length} hidden</span>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {g.hiddenTrailers.map((v) => (
              <li key={v} className="flex flex-col gap-2">
                <a
                  href={YT.test(v) ? `https://www.youtube.com/watch?v=${v}` : undefined}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="relative block aspect-video overflow-hidden rounded-[8px] bg-[#111311]"
                >
                  {YT.test(v) ? (
                    <img src={`https://i.ytimg.com/vi/${v}/mqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover opacity-80" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-xs font-semibold text-white/70">Steam video</span>
                  )}
                  <span className="sr-only">Watch the hidden video</span>
                </a>
                <Button variant="secondary" onClick={() => restore(g, v)} disabled={busy === `${g.id}:${v}`}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> Restore
                </Button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────────

function UsersPanel() {
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim());
  const load = useCallback((signal) => searchAdminUsers({ q: query || undefined, limit: 30 }, { signal }), [query]);
  const { status, data, error, retry } = useAsync(load);
  const [roles, setRoles] = useState({});
  const [busy, setBusy] = useState(null);

  async function change(u, role) {
    setBusy(u.id);
    try {
      await setUserRole(u.id, role);
      setRoles((r) => ({ ...r, [u.id]: role }));
      toast.success(role === 'admin' ? `${u.username} is now an administrator` : `${u.username} is now a player`);
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SearchField value={q} onChange={setQ} placeholder="Search by username or email" label="Search users" />
      {status === 'error' ? (
        <ErrorState message={error.message} onRetry={retry} />
      ) : status === 'loading' ? (
        <RowsSkeleton />
      ) : !data?.items?.length ? (
        <EmptyState icon={Users} title="No users found" description="Try another username or email." />
      ) : (
        <ul aria-label="Users" className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {data.items.map((u) => {
            const role = roles[u.id] ?? u.role;
            const self = String(u.id) === String(me?.id);
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar user={u} size={36} />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex items-center gap-1.5 truncate font-semibold">
                    <Link to={`/u/${u.username}`} className="truncate hover:underline">{u.username}</Link>
                    {self && <span className="text-xs font-normal text-text-muted">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    {u.email} · {u.google ? 'Google' : u.emailVerified ? 'Verified' : 'Not verified'}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-text-muted">
                  Role
                  <select
                    value={role}
                    disabled={self || busy === u.id}
                    title={self ? 'You can’t change your own role' : undefined}
                    onChange={(e) => change(u, e.target.value)}
                    className="h-9 rounded-control border border-border bg-bg px-2 text-sm font-semibold text-text disabled:opacity-60"
                  >
                    <option value="user">Player</option>
                    <option value="admin">Administrator</option>
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

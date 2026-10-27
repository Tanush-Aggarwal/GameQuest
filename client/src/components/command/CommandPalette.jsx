import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { FolderOpen, Gamepad2, Search, User } from 'lucide-react';
import { searchGames } from '@/services/gamesApi.js';
import { searchUsers } from '@/services/socialApi.js';
import { listCollections } from '@/services/collectionsApi.js';
import { cn } from '@/lib/utils.js';

const SEARCH_DELAY_MS = 200;
const PER_GROUP = 5;

const GROUPS = [
  { key: 'games', label: 'Games', icon: Gamepad2 },
  { key: 'friends', label: 'Friends', icon: User },
  { key: 'collections', label: 'Collections', icon: FolderOpen },
];

// Flattens the groups into the options the keyboard walks through, each with its destination.
export function buildOptions(results) {
  const out = [];
  for (const group of GROUPS) {
    for (const item of results[group.key] ?? []) {
      if (group.key === 'games') out.push({ key: `g-${item.slug}`, group: group.key, label: item.title, hint: item.releaseYear ? String(item.releaseYear) : '', to: `/games/${item.slug}` });
      if (group.key === 'friends') out.push({ key: `u-${item.id}`, group: group.key, label: item.username, hint: item.relation === 'friend' ? 'Friend' : '', to: `/u/${encodeURIComponent(item.username)}` });
      if (group.key === 'collections') out.push({ key: `c-${item.id}`, group: group.key, label: item.name, hint: item.itemCount != null ? `${item.itemCount} games` : '', to: `/collections/${item.id}` });
    }
  }
  return out;
}

// Ctrl/Cmd+K: jump to a game, a friend or one of your collections. Each source is independent: one failing (or
// slow) never hides the others. Games and friends are searched on the server after a short pause in typing;
// collections are loaded once when the palette opens and filtered here.
export default function CommandPalette({ open, onOpenChange }) {
  const inputRef = useRef(null);
  const opener = useRef(null);

  // Radix only returns focus to a Dialog.Trigger, and the palette has none (the keyboard shortcut opens it), so the
  // element that had focus is remembered here, before the dialog moves focus, and given back on close.
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement;
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/80 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus?.();
          }}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-card border border-border bg-surface shadow-2xl"
        >
          {/* its own component, mounted only while open: every opening starts with an empty query and fresh results */}
          <PaletteBody inputRef={inputRef} onClose={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PaletteBody({ inputRef, onClose }) {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [attempt, setAttempt] = useState(0); // Retry
  const [collections, setCollections] = useState({ status: 'loading', items: [] });
  const [found, setFound] = useState({ query: '', games: [], friends: [], failed: [] });

  useEffect(() => {
    const controller = new AbortController();
    listCollections({}, { signal: controller.signal }).then(
      (data) => setCollections({ status: 'ready', items: data?.items ?? [] }),
      () => !controller.signal.aborted && setCollections({ status: 'failed', items: [] }),
    );
    return () => controller.abort();
  }, [attempt]);

  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const [games, friends] = await Promise.allSettled([
        searchGames({ q, limit: PER_GROUP }, { signal: controller.signal }),
        searchUsers(q, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      setFound({
        query: q,
        games: games.status === 'fulfilled' ? (games.value?.items ?? []).slice(0, PER_GROUP) : [],
        friends: friends.status === 'fulfilled' ? (friends.value ?? []).slice(0, PER_GROUP) : [],
        failed: [games.status === 'rejected' && 'games', friends.status === 'rejected' && 'friends'].filter(Boolean),
      });
    }, q === found.query ? 0 : SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- found.query only picks the delay of a retry
  }, [q, attempt]);
  const needle = q.toLowerCase();
  const results = useMemo(
    () => ({
      games: found.query === q ? found.games : [],
      friends: found.query === q ? found.friends : [],
      collections: collections.items.filter((c) => !needle || c.name.toLowerCase().includes(needle)).slice(0, PER_GROUP),
    }),
    [found, q, needle, collections.items],
  );
  const options = useMemo(() => buildOptions(results), [results]);
  const settled = q.length < 2 || found.query === q;
  const failed = [...(found.query === q ? found.failed : []), collections.status === 'failed' && 'collections'].filter(Boolean);
  const current = options[Math.min(active, options.length - 1)];

  function choose(option) {
    if (!option) return;
    onClose();
    navigate(option.to);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!options.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (Math.min(i, options.length - 1) + step + options.length) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(current);
    }
  }

  return (
    <>
          <Dialog.Title className="sr-only">Search games, friends and collections</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={current ? `${listId}-${current.key}` : undefined}
              aria-label="Search games, friends and collections"
              placeholder="Search games, friends, collections"
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="h-12 w-full bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none"
            />
            <kbd className="hidden rounded-control border border-border px-1.5 py-0.5 text-xs text-text-muted sm:block">Esc</kbd>
          </div>

          <div className="max-h-[50vh] overflow-y-auto p-2">
            <div id={listId} role="listbox" aria-label="Results">
            {GROUPS.map(({ key, label, icon: Icon }) => {
              const rows = options.filter((o) => o.group === key);
              if (!rows.length) return null;
              return (
                <div key={key} role="group" aria-labelledby={`${listId}-${key}`} className="mb-1">
                  <p id={`${listId}-${key}`} className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                    {label}
                  </p>
                  {rows.map((o) => (
                    <div
                      key={o.key}
                      id={`${listId}-${o.key}`}
                      role="option"
                      aria-selected={current?.key === o.key}
                      onMouseMove={() => setActive(options.indexOf(o))}
                      onClick={() => choose(o)}
                      className={cn(
                        'flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 text-sm',
                        current?.key === o.key ? 'bg-surface-raised text-text' : 'text-text-muted',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-text">{o.label}</span>
                      {o.hint && <span className="text-xs tabular-nums text-text-muted">{o.hint}</span>}
                    </div>
                  ))}
                </div>
              );
            })}
            </div>
            {!options.length && (
              <p role="status" className="px-2 py-6 text-center text-sm text-text-muted">
                {q.length < 2 && collections.status === 'loading' ? 'Loading your collections…' : q.length < 2 ? 'Type at least two letters to search games and friends.' : settled ? `Nothing found for “${q}”.` : 'Searching…'}
              </p>
            )}
            {failed.length > 0 && (
              <div role="alert" className="flex items-center justify-between gap-2 px-2 py-2 text-xs text-text-muted">
                <span>Couldn’t search {failed.join(' and ')} right now.</span>
                <button type="button" onClick={() => setAttempt((n) => n + 1)} className="min-h-11 rounded-control px-3 text-accent underline">
                  Retry
                </button>
              </div>
            )}
          </div>
    </>
  );
}

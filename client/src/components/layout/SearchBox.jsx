import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Gamepad2, Loader2, Search, Star } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar.jsx';
import { CoverImage } from '@/components/games/GameCard.jsx';
import { searchGames } from '@/services/gamesApi.js';
import { searchUsers } from '@/services/socialApi.js';

const DEBOUNCE_MS = 220;

// The top bar search: results appear while typing (games and players), arrow keys move through them, Enter opens
// the highlighted one or every result on Explore. "/" focuses it from anywhere (Ctrl K stays the command palette).
export function SearchBox() {
  const navigate = useNavigate();
  const listId = useId();
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ q: '', loading: false, games: [], players: [] });
  const [active, setActive] = useState(-1);

  // "/" jumps to search unless the person is already typing somewhere.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    function onDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const q = text.trim();
  useEffect(() => {
    if (q.length < 2) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, q, loading: true }));
      const [games, players] = await Promise.allSettled([
        searchGames({ q, limit: 5 }, { signal: controller.signal }),
        searchUsers(q, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      setState({
        q,
        loading: false,
        games: games.status === 'fulfilled' ? games.value?.items ?? [] : [],
        players: players.status === 'fulfilled' ? (players.value ?? []).slice(0, 3) : [],
      });
      setActive(-1);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const ready = q.length >= 2 && state.q === q;
  const options = ready
    ? [
        ...state.games.map((g) => ({ key: `g-${g.id}`, to: `/games/${g.slug}`, game: g })),
        ...state.players.map((p) => ({ key: `p-${p.id}`, to: `/u/${p.username}`, player: p })),
        { key: 'all', to: `/explore?q=${encodeURIComponent(q)}`, all: true },
      ]
    : [];

  function go(option) {
    setOpen(false);
    setText('');
    inputRef.current?.blur();
    navigate(option.to);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!options.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!q) return;
    if (active >= 0 && options[active]) go(options[active]);
    else go({ to: `/explore?q=${encodeURIComponent(q)}` });
  }

  const showPanel = open && q.length >= 2;
  const optionId = (i) => `${listId}-opt-${i}`;
  const row = (i) =>
    `flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors ${i === active ? 'bg-surface-raised' : 'hover:bg-surface-raised/70'}`;

  return (
    <div ref={boxRef} className="relative min-w-0 flex-1 md:max-w-md mx-auto">
      <form role="search" onSubmit={onSubmit}>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          id="topbar-search-input"
          name="search"
          ref={inputRef}
          type="search"
          aria-label="Search games"
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          placeholder="Search games, genres, players..."
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="gq-search h-11 w-full rounded-full border border-border bg-surface pl-10 pr-12 text-sm text-text transition-[border-color,box-shadow] placeholder:text-text-muted focus:border-text focus:outline-none focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--text)_8%,transparent)]"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-[6px] border border-border bg-surface-raised px-2 py-0.5 font-mono text-[11px] font-semibold text-text-muted sm:inline-block" title="Press / to search">
          /
        </kbd>
      </form>

      {showPanel && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-[16px] border border-border bg-surface p-2 shadow-[0_24px_48px_-16px_rgba(21,23,19,0.35)]">
          {!ready && (
            <p className="flex items-center gap-2 px-3 py-3 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Searching…
            </p>
          )}
          {ready && (
            <ul id={listId} role="listbox" aria-label="Search suggestions" className="flex flex-col">
              {state.games.length > 0 && <li role="presentation" className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-widest text-text-muted">Games</li>}
              {options.map((o, i) =>
                o.game ? (
                  <li key={o.key} id={optionId(i)} role="option" aria-selected={i === active}>
                    <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(o)} className={row(i)}>
                      <span className="h-12 w-9 shrink-0 overflow-hidden rounded-[6px] bg-surface-raised">
                        <CoverImage cover={o.game.cover} title={o.game.title} alt="" compact className="h-full w-full object-cover" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold text-text">{o.game.title}</span>
                        <span className="truncate text-xs text-text-muted">
                          {[o.game.releaseDate ? new Date(o.game.releaseDate).getUTCFullYear() : null, o.game.genres?.[0]].filter(Boolean).join(' · ') || 'Game'}
                        </span>
                      </span>
                      {o.game.totalRating > 0 && (
                        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-text-muted">
                          <Star className="h-3.5 w-3.5 fill-[#E58A2B] text-[#E58A2B]" aria-hidden="true" />
                          {(o.game.totalRating / 10).toFixed(1)}
                        </span>
                      )}
                    </button>
                  </li>
                ) : o.player ? (
                  <li key={o.key} id={optionId(i)} role="option" aria-selected={i === active}>
                    {i === state.games.length && (
                      <span role="presentation" className="block px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">Players</span>
                    )}
                    <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(o)} className={row(i)}>
                      <Avatar user={o.player} size={32} />
                      <span className="truncate text-sm font-semibold text-text">{o.player.username}</span>
                    </button>
                  </li>
                ) : (
                  <li key={o.key} id={optionId(i)} role="option" aria-selected={i === active} className="mt-1 border-t border-border pt-1">
                    <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(o)} className={`${row(i)} justify-between`}>
                      <span className="flex items-center gap-2 text-sm text-text">
                        <Gamepad2 className="h-4 w-4 text-text-muted" aria-hidden="true" />
                        See all results for <strong className="font-semibold">“{q}”</strong>
                      </span>
                      <ArrowRight className="h-4 w-4 text-text-muted" aria-hidden="true" />
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
          {ready && !state.games.length && !state.players.length && (
            <p className="px-3 pb-1 pt-2 text-xs text-text-muted">No quick matches. Try “See all results”.</p>
          )}
        </div>
      )}
    </div>
  );
}

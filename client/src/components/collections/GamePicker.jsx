import { useCallback, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { CoverImage } from '@/components/games/GameCard.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { listLibrary } from '@/services/libraryApi.js';

// Pick games from your library while creating a manual collection, so it starts full instead of empty.
// `selected` is a Set of library entry ids; `onChange` gets the next Set.
export function GamePicker({ selected, onChange }) {
  const load = useCallback(async (signal) => {
    try {
      const data = await listLibrary({ limit: 100 }, { signal });
      return data?.items ?? [];
    } catch {
      return [];
    }
  }, []);
  const { status, data } = useAsync(load);
  const [filter, setFilter] = useState('');
  const entries = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (data ?? []).filter((e) => e.game && (!f || e.game.title.toLowerCase().includes(f)));
  }, [data, filter]);

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  if (status === 'success' && !(data ?? []).length) return null;

  return (
    <fieldset className="flex flex-col gap-3 rounded-card border border-border bg-bg p-3">
      <legend className="px-1 text-sm font-medium">
        Add games now <span className="text-text-muted">(optional{selected.size ? ` · ${selected.size} selected` : ''})</span>
      </legend>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          type="search"
          aria-label="Filter your games"
          placeholder="Filter your library…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-10 w-full rounded-control border border-border bg-surface pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus:border-text focus:outline-none"
        />
      </div>
      {status === 'loading' ? (
        <p className="px-1 text-sm text-text-muted">Loading your library…</p>
      ) : (
        <ul className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-5 lg:grid-cols-6">
          {entries.map((e) => {
            const on = selected.has(e.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={e.game.title}
                  onClick={() => toggle(e.id)}
                  className={`group relative block w-full overflow-hidden rounded-[8px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text ${on ? 'ring-2 ring-text' : 'ring-1 ring-border hover:ring-text/50'}`}
                >
                  <span className="block aspect-[3/4] w-full bg-surface-raised">
                    <CoverImage cover={e.game.cover} title={e.game.title} alt="" compact className={`h-full w-full object-cover transition ${on ? 'brightness-75' : ''}`} />
                  </span>
                  {on && (
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-text text-bg shadow" aria-hidden="true">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4 text-left text-[11px] font-semibold text-white">
                    {e.game.title}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}

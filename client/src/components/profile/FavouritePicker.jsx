import { useCallback, useEffect, useId, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { CoverImage } from '@/components/games/GameCard.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { searchGames } from '@/services/gamesApi.js';
import { listLibrary } from '@/services/libraryApi.js';

const DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

// One choice in the picker: a small cover with the title. Already-chosen games are shown but disabled.
function Choice({ game, chosen, onPick }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(game)}
        disabled={chosen}
        aria-label={chosen ? `${game.title} (already a favourite)` : game.title}
        className="group flex w-20 flex-col gap-1 text-left disabled:opacity-50 sm:w-24"
      >
        <span className="relative block aspect-[3/4] w-full overflow-hidden rounded-control border border-border group-hover:border-accent group-disabled:group-hover:border-border">
          <CoverImage cover={game.cover} title={game.title} compact className="h-full w-full" />
          {chosen && (
            <span className="absolute inset-0 flex items-center justify-center bg-bg/70">
              <Check className="h-5 w-5 text-text" aria-hidden="true" />
            </span>
          )}
        </span>
        <span className="line-clamp-2 text-xs leading-snug">{game.title}</span>
      </button>
    </li>
  );
}

function ChoiceList({ label, status, items, error, onRetry, emptyText, chosenIds, onPick }) {
  if (status === 'loading') {
    return (
      <div role="status" aria-label={`Loading ${label.toLowerCase()}`} className="flex gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-28 w-20 animate-pulse rounded-control bg-surface-raised sm:w-24" aria-hidden="true" />
        ))}
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
        <span>{error}</span>
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (!items.length) return <p className="text-sm text-text-muted">{emptyText}</p>;
  return (
    <ul aria-label={label} className="flex flex-wrap gap-3">
      {items.map((game) => (
        <Choice key={game.id} game={game} chosen={chosenIds.has(game.id)} onPick={onPick} />
      ))}
    </ul>
  );
}

// Inline picker for one favourite slot: search the catalog, or pick from your own library. It sits inside the
// profile form, so Enter in the search box must never submit that form (the search runs by itself while you
// type). Escape clears the search text first, and closes the picker when the box is already empty.
export function FavouritePicker({ slot, chosenIds, onPick, onClose }) {
  const titleId = useId();
  const inputId = useId();
  const [query, setQuery] = useState('');
  const live = query.trim();
  const debounced = useDebounced(live, DEBOUNCE_MS);
  const wantsResults = live.length >= MIN_QUERY; // what the user has typed right now
  const searching = debounced.length >= MIN_QUERY; // what the pending request is for
  const pending = live !== debounced; // typed since the last request: the list below is not for this text yet

  const loadSearch = useCallback(
    (signal) => (searching ? searchGames({ q: debounced, limit: 8 }, { signal }) : Promise.resolve({ items: [] })),
    [debounced, searching],
  );
  const loadLibrary = useCallback((signal) => listLibrary({ limit: 12 }, { signal }), []);
  const search = useAsync(loadSearch);
  const library = useAsync(loadLibrary);

  const searchStatus = pending ? 'loading' : search.status;
  const results = search.data?.items ?? [];

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (e.target.id === inputId && query) {
        e.preventDefault(); // keep the browser's own "clear search field" from also running
        setQuery('');
      } else {
        onClose();
      }
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-4 rounded-card border border-accent/40 bg-bg/70 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={titleId} className="text-sm font-semibold">
          Choose favourite {slot + 1}
        </h3>
        <Button variant="ghost" onClick={onClose} aria-label="Close picker" className="px-3">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="relative max-w-md">
        <label htmlFor={inputId} className="sr-only">
          Search the catalog
        </label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault(); // the form around the picker would save the whole profile
          }}
          placeholder="Search the catalog"
          className="h-11 w-full rounded-control border border-border bg-surface pl-9 pr-3 text-sm text-text placeholder:text-text-muted"
        />
      </div>

      {/* one polite announcement of how many results there are, once they are for the current text */}
      <p role="status" aria-live="polite" className="sr-only">
        {wantsResults && !pending && search.status === 'success' ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : ''}
      </p>

      {wantsResults && (
        <section aria-label="Search results" aria-busy={searchStatus === 'loading'} className="flex flex-col gap-2">
          <ChoiceList
            label="Search results"
            status={searchStatus}
            items={results}
            error={search.error?.message}
            onRetry={search.retry}
            emptyText={`No games match "${debounced}".`}
            chosenIds={chosenIds}
            onPick={onPick}
          />
        </section>
      )}

      <section aria-label="From your library" className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">From your library</h4>
        <ChoiceList
          label="Library games"
          status={library.status}
          items={(library.data?.items ?? []).map((e) => e.game).filter(Boolean)}
          error={library.error?.message}
          onRetry={library.retry}
          emptyText="Games you add to your library show up here."
          chosenIds={chosenIds}
          onPick={onPick}
        />
      </section>
    </div>
  );
}

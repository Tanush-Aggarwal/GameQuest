import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, FolderPlus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import { addCollectionItem, getCollection, listCollections, removeCollectionItem } from '@/services/collectionsApi.js';

// Adds a library entry to one of the caller's manual collections (smart ones fill themselves).
// Each collection is a one-click toggle row: no native <select>, which renders as an unstyled OS list.
export function AddToCollection({ entryId }) {
  const load = useCallback((signal) => listCollections({ type: 'manual', limit: 50 }, { signal }), []);
  const { status, data, error, retry } = useAsync(load);
  const [busyId, setBusyId] = useState(null);
  // collection id -> item id of this entry inside it (present = the game is in that collection)
  const [members, setMembers] = useState(() => new Map());

  // Work out which collections already hold this game, so each row starts in the right state.
  useEffect(() => {
    if (status !== 'success' || !data.items.length) return undefined;
    let alive = true;
    (async () => {
      const found = await Promise.allSettled(
        data.items.map(async (c) => {
          const detail = await getCollection(c.id);
          const item = (detail?.items ?? []).find((i) => i.entry?.id === entryId);
          return item ? [c.id, item.id] : null;
        }),
      );
      if (alive) setMembers(new Map(found.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value)));
    })();
    return () => {
      alive = false;
    };
  }, [status, data, entryId]);

  // One click toggles: adds the game, or takes it out again.
  async function handleToggle(target) {
    if (busyId) return;
    setBusyId(target.id);
    const itemId = members.get(target.id);
    try {
      if (itemId) {
        await removeCollectionItem(target.id, itemId);
        setMembers((m) => {
          const next = new Map(m);
          next.delete(target.id);
          return next;
        });
        toast.success(`Removed from "${target.name}"`);
      } else {
        const item = await addCollectionItem(target.id, { entryId });
        setMembers((m) => new Map(m).set(target.id, item?.id ?? true));
        toast.success(`Added to "${target.name}"`);
      }
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
        <FolderPlus className="h-4 w-4 text-text-muted" aria-hidden="true" /> Add to collection
      </h3>
      {status === 'loading' && <Skeleton className="h-11 w-full" role="status" aria-label="Loading collections" />}
      {status === 'error' && <ErrorState message={error.message} onRetry={retry} />}
      {status === 'success' && data.items.length === 0 && (
        <p className="text-sm text-text-muted">
          You have no manual collections yet.{' '}
          <Link to="/collections?new=1" className="font-semibold text-[var(--accent-text)] underline">Create one</Link>
        </p>
      )}
      {status === 'success' && data.items.length > 0 && (
        <ul aria-label="Collections" className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-control border border-border bg-bg p-1">
          {data.items.map((c) => {
            const done = members.has(c.id);
            const busy = busyId === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => handleToggle(c)}
                  disabled={busy}
                  aria-pressed={done}
                  aria-label={done ? `Remove from ${c.name}` : `Add to ${c.name}`}
                  title={done ? 'Click to remove' : 'Click to add'}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-[6px] px-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text ${
                    done ? 'bg-text text-bg' : 'text-text hover:bg-surface-raised'
                  } disabled:opacity-60`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-current opacity-80">
                    {done ? <><Check className="h-4 w-4" aria-hidden="true" /> Added</> : busy ? 'Saving…' : <Plus className="h-4 w-4" aria-hidden="true" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

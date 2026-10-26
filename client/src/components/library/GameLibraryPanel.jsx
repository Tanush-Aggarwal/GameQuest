import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { StatusBadge } from '@/components/library/StatusBadge.jsx';
import { MoveStatusSelect } from '@/components/library/MoveStatusSelect.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import { addToLibrary, changeStatus, listLibrary } from '@/services/libraryApi.js';
import { STATUS_META } from '@/lib/libraryStatus.js';

const ADD_OPTIONS = [
  ['backlog', 'Add to backlog'],
  ['wishlist', 'Add to wishlist'],
  ['playing', 'Start playing'],
];

// Library controls on the game page: add the game, or move it along the status state machine.
export function GameLibraryPanel({ game }) {
  const load = useCallback(async (signal) => (await listLibrary({ gameId: game.id, limit: 1 }, { signal })).items[0] ?? null, [game.id]);
  const { status, data, error, retry } = useAsync(load);

  // `local` holds an entry changed on this page; it is only valid for the data it was derived from.
  const [local, setLocal] = useState({ source: undefined, entry: null });
  const entry = local.source === data ? local.entry : data;
  const setEntry = (next) => setLocal({ source: data, entry: next });
  const [busy, setBusy] = useState(false);

  async function add(initial) {
    setBusy(true);
    try {
      const created = await addToLibrary({ gameId: game.id, status: initial });
      setEntry(created);
      toast.success(`${game.title} added to your ${STATUS_META[initial].label.toLowerCase()}`);
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function move(current, to) {
    const previous = current;
    setEntry({ ...current, status: to }); // optimistic
    setBusy(true);
    try {
      setEntry(await changeStatus(current.id, to));
      toast.success(`Moved to ${STATUS_META[to].label}`);
    } catch (err) {
      setEntry(previous);
      toast.error(getErrorInfo(err).message);
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') return <Skeleton className="h-24 w-full max-w-xs" aria-label="Loading library status" role="status" />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;

  return (
    <div className="flex max-w-xs flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Your library</h2>
      {entry ? (
        <>
          <StatusBadge status={entry.status} />
          <MoveStatusSelect entry={{ ...entry, game }} onMove={move} disabled={busy} />
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {ADD_OPTIONS.map(([s, label], i) => (
            <Button key={s} variant={i === 0 ? 'primary' : 'secondary'} onClick={() => add(s)} disabled={busy}>
              {label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

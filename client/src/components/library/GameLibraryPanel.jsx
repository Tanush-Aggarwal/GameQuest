import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { StatusBadge } from '@/components/library/StatusBadge.jsx';
import { MoveStatusSelect } from '@/components/library/MoveStatusSelect.jsx';
import { getErrorInfo } from '@/services/api.js';
import { addToLibrary, changeStatus } from '@/services/libraryApi.js';
import { STATUS_META } from '@/lib/libraryStatus.js';

// Library controls in the game page hero: add the game (one primary action, two quieter ones), or show where it is
// and move it along the status state machine. `state` is the result of useLibraryEntry, shared with the page so the
// "Your progress" tab sees the same entry.
export function GameLibraryPanel({ game, state }) {
  const { status, entry, setEntry, error, retry } = state;
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

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading library status">
        <Skeleton className="h-11 w-48" />
      </div>
    );
  }
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;

  return (
    <div aria-label="Your library" role="group" className="flex flex-wrap items-center gap-2">
      {entry ? (
        <>
          <span className="rounded-full bg-bg px-3 py-1.5">
            <StatusBadge status={entry.status} />
          </span>
          <div className="w-44">
            <MoveStatusSelect entry={{ ...entry, game }} onMove={move} disabled={busy} />
          </div>
          <Link to={`/library/${entry.id}`} className={buttonVariants({ variant: 'secondary' })}>
            Open in library
          </Link>
        </>
      ) : (
        <>
          <Button onClick={() => add('backlog')} disabled={busy}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add to backlog
          </Button>
          <Button variant="secondary" onClick={() => add('wishlist')} disabled={busy}>
            Wishlist
          </Button>
          <Button variant="secondary" onClick={() => add('playing')} disabled={busy}>
            Start playing
          </Button>
        </>
      )}
    </div>
  );
}

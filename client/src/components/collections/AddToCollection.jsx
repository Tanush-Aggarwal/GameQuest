import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import { addCollectionItem, listCollections } from '@/services/collectionsApi.js';

// Adds a library entry to one of the caller's manual collections (smart ones fill themselves).
export function AddToCollection({ entryId }) {
  const id = useId();
  const load = useCallback((signal) => listCollections({ type: 'manual', limit: 50 }, { signal }), []);
  const { status, data, error, retry } = useAsync(load);
  const [selected, setSelected] = useState('');
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    const target = data.items.find((c) => c.id === selected);
    if (!target) return;
    setAdding(true);
    try {
      await addCollectionItem(target.id, { entryId });
      toast.success(`Added to "${target.name}"`);
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Add to collection</h2>
      {status === 'loading' && <Skeleton className="h-11 w-full" role="status" aria-label="Loading collections" />}
      {status === 'error' && <ErrorState message={error.message} onRetry={retry} />}
      {status === 'success' && data.items.length === 0 && (
        <p className="text-sm text-text-muted">
          You have no manual collections yet. <Link to="/collections?new=1" className="text-accent underline">Create one</Link>
        </p>
      )}
      {status === 'success' && data.items.length > 0 && (
        <div className="flex gap-2">
          <label htmlFor={`${id}-pick`} className="sr-only">Collection</label>
          <select
            id={`${id}-pick`}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-control border border-border bg-surface px-2 text-sm text-text"
          >
            <option value="">Choose a collection…</option>
            {data.items.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <Button onClick={handleAdd} disabled={!selected || adding}>{adding ? 'Adding…' : 'Add'}</Button>
        </div>
      )}
    </div>
  );
}

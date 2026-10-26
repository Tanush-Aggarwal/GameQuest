import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layers, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { CollectionForm } from '@/components/collections/CollectionForm.jsx';
import { CollectionCard } from '@/components/collections/CollectionCard.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import { createCollection, listCollections } from '@/services/collectionsApi.js';

export default function Collections() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const creating = params.get('new') === '1';

  const load = useCallback((signal) => listCollections({ limit: 50 }, { signal }), []);
  const { status, data, error, retry } = useAsync(load);

  const setCreating = (on) => setParams(on ? { new: '1' } : {}, { replace: true });

  async function handleCreate(payload) {
    try {
      const created = await createCollection(payload);
      toast.success(`Created "${created.name}"`);
      navigate(`/collections/${created.id}`);
    } catch (err) {
      const info = getErrorInfo(err);
      throw new Error(info.message);
    }
  }

  const items = data?.items ?? [];

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Collections</h1>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New collection
          </Button>
        )}
      </div>

      {creating && <CollectionForm submitLabel="Create collection" onSubmit={handleCreate} onCancel={() => setCreating(false)} />}

      {status === 'loading' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" role="status" aria-label="Loading collections">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full" />
          ))}
        </div>
      )}

      {status === 'error' && <ErrorState message={error.message} onRetry={retry} />}

      {status === 'success' && items.length === 0 && !creating && (
        <EmptyState
          icon={Layers}
          title="No collections yet"
          description="Group games into lists like “All-time favourites”, or let rules fill a smart collection for you."
          actionLabel="Create a collection"
          actionTo="/collections?new=1"
        />
      )}

      {status === 'success' && items.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((c) => (
            <CollectionCard key={c.id} collection={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

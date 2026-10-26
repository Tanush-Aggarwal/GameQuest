import { useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Gamepad2, Layers, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { CollectionForm } from '@/components/collections/CollectionForm.jsx';
import { TypeBadge, VisibilityBadge } from '@/components/collections/badges.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import { createCollection, listCollections } from '@/services/collectionsApi.js';

// 2×2 mosaic of the first covers; a placeholder icon when there are none.
export function CoverMosaic({ covers }) {
  if (!covers.length) {
    return (
      <div className="flex aspect-square w-full items-center justify-center bg-surface-raised">
        <Gamepad2 className="h-8 w-8 text-text-muted" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="grid aspect-square w-full grid-cols-2 grid-rows-2 gap-px bg-border">
      {[0, 1, 2, 3].map((i) =>
        covers[i] ? <img key={i} src={covers[i]} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div key={i} className="bg-surface-raised" />,
      )}
    </div>
  );
}

function CollectionCard({ collection }) {
  return (
    <li>
      <Link to={`/collections/${collection.id}`} className="flex flex-col overflow-hidden rounded-card border border-border bg-surface transition-colors hover:bg-surface-raised">
        <CoverMosaic covers={collection.covers} />
        <div className="flex flex-col gap-1 p-3">
          <h3 className="line-clamp-1 text-sm font-semibold">{collection.name}</h3>
          <p className="text-xs text-text-muted tabular-nums">
            {collection.itemCount} {collection.itemCount === 1 ? 'game' : 'games'}
          </p>
          <div className="flex gap-3">
            <TypeBadge type={collection.type} />
            <VisibilityBadge visibility={collection.visibility} />
          </div>
        </div>
      </Link>
    </li>
  );
}

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

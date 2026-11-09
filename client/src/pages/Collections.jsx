import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Grid2x2, Layers, LayoutPanelLeft, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { ArtHeader } from '@/components/art/ArtPanel.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { CollectionForm } from '@/components/collections/CollectionForm.jsx';
import { CollectionCard } from '@/components/collections/CollectionCard.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import { addCollectionItem, createCollection, listCollections } from '@/services/collectionsApi.js';

const ART_KEY = 'gq.collections.art';

export default function Collections() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const creating = params.get('new') === '1';

  const load = useCallback((signal) => listCollections({ limit: 50 }, { signal }), []);
  const { status, data, error, retry } = useAsync(load);

  const setCreating = (on) => setParams(on ? { new: '1' } : {}, { replace: true });

  async function handleCreate(payload, { entryIds = [] } = {}) {
    try {
      const created = await createCollection(payload);
      // Games picked in the form go in one by one, in the order they were picked; one failure does not stop the rest.
      let added = 0;
      for (const entryId of entryIds) {
        try {
          await addCollectionItem(created.id, { entryId });
          added += 1;
        } catch {
          // skipped
        }
      }
      toast.success(added ? `Created "${created.name}" with ${added} game${added === 1 ? '' : 's'}` : `Created "${created.name}"`);
      navigate(`/collections/${created.id}`);
    } catch (err) {
      const info = getErrorInfo(err);
      throw new Error(info.message);
    }
  }

  const items = data?.items ?? [];
  const [kind, setKind] = useState('all');
  const [art, setArt] = useState(() => {
    try {
      return localStorage.getItem(ART_KEY) === 'feature' ? 'feature' : 'mosaic';
    } catch {
      return 'mosaic';
    }
  });
  const chooseArt = (v) => {
    setArt(v);
    try {
      localStorage.setItem(ART_KEY, v);
    } catch {
      /* not remembered in private mode */
    }
  };
  const shown = kind === 'all' ? items : items.filter((c) => c.type === kind);
  const totalGames = items.reduce((sum, c) => sum + (c.itemCount ?? 0), 0);
  const subtitle =
    status === 'success' && items.length
      ? `${items.length} ${items.length === 1 ? 'collection' : 'collections'} · ${totalGames} ${totalGames === 1 ? 'game' : 'games'}`
      : 'Your game lists, hand-picked or filled automatically by rules.';

  return (
    <section className="flex flex-col gap-6">
      <ArtHeader
        title="Collections"
        subtitle={subtitle}
        seed="collections"
        art={items[0]?.covers?.[0] ? { cover: items[0].covers[0] } : undefined}
        actions={
          !creating && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New collection
            </Button>
          )
        }
      />

      {creating && <CollectionForm submitLabel="Create collection" onSubmit={handleCreate} onCancel={() => setCreating(false)} />}

      {status === 'loading' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="status" aria-label="Loading collections">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/4] w-full" />
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
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {items.some((c) => c.type === 'smart') && items.some((c) => c.type === 'manual') ? (
              <div role="radiogroup" aria-label="Show" className="flex w-fit rounded-full border border-border bg-surface p-0.5">
                {[
                  ['all', 'All'],
                  ['manual', 'Hand-picked'],
                  ['smart', 'Smart'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={kind === value}
                    onClick={() => setKind(value)}
                    className={`h-8 rounded-full px-3.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text ${kind === value ? 'bg-text text-bg' : 'text-text-muted hover:text-text'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <span />
            )}
            <div role="radiogroup" aria-label="Card style" className="flex rounded-full border border-border bg-surface p-0.5">
              {[
                ['mosaic', '2×2 covers', Grid2x2],
                ['feature', 'One big cover', LayoutPanelLeft],
              ].map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={art === value}
                  aria-label={label}
                  title={label}
                  onClick={() => chooseArt(value)}
                  className={`flex h-8 w-9 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text ${art === value ? 'bg-text text-bg' : 'text-text-muted hover:text-text'}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
          <ul className={art === 'feature' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5'}>
            {shown.map((c) => (
              <CollectionCard key={c.id} collection={c} headingLevel="h2" art={art} />
            ))}
            {!creating && (
              <li>
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className={`flex h-full w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border text-sm font-semibold text-text-muted transition-colors hover:border-text hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text ${art === 'feature' ? 'min-h-[8rem] sm:min-h-[16rem]' : 'aspect-square'}`}
                >
                  <Plus className="h-6 w-6" aria-hidden="true" />
                  Start another collection
                </button>
              </li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}

import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, Layers, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { RULE_FIELDS, OPERATOR_LABELS } from '@gamequest/shared';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { BackdropHero } from '@/components/art/BackdropHero.jsx';
import { GameCover } from '@/components/games/GameCard.jsx';
import { StatusBadge } from '@/components/library/StatusBadge.jsx';
import { CollectionForm } from '@/components/collections/CollectionForm.jsx';
import { TypeBadge, VisibilityBadge } from '@/components/collections/badges.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import {
  deleteCollection,
  getCollection,
  moveCollectionItem,
  removeCollectionItem,
  updateCollection,
} from '@/services/collectionsApi.js';

const PAGE_SIZE = 50;

const ruleText = (r) => `${RULE_FIELDS[r.field].label} ${OPERATOR_LABELS[r.op]} ${Array.isArray(r.value) ? r.value.join(', ') : r.value}`;

function ItemRow({ item, index, count, canEdit, isSmart, busy, onMove, onRemove, dnd }) {
  const [confirming, setConfirming] = useState(false);
  const { game } = item.entry;
  const title = game?.title ?? 'Unknown game';
  return (
    <li
      draggable={canEdit && !isSmart}
      onDragStart={() => dnd.start(index)}
      onDragOver={(e) => canEdit && !isSmart && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        dnd.drop(index);
      }}
      className="flex items-center gap-3 rounded-card border border-border bg-surface p-2"
    >
      {canEdit && !isSmart && <GripVertical className="h-5 w-5 shrink-0 cursor-grab text-text-muted" aria-hidden="true" />}
      <div className="w-16 shrink-0 overflow-hidden rounded-control border border-border">{game ? <GameCover game={game} compact /> : <div className="aspect-[3/4] bg-surface-raised" />}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link to={canEdit ? `/library/${item.entry.id}` : `/games/${game?.slug ?? ''}`} className="line-clamp-1 text-sm font-semibold hover:underline">
          {title}
        </Link>
        <StatusBadge status={item.entry.status} />
        {item.note && <p className="line-clamp-2 text-xs text-text-muted">{item.note}</p>}
      </div>
      {canEdit && !isSmart && (
        <div className="flex shrink-0 items-center">
          <Button variant="ghost" aria-label={`Move ${title} up`} disabled={busy || index === 0} onClick={() => onMove(index, index - 1)}>
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" aria-label={`Move ${title} down`} disabled={busy || index === count - 1} onClick={() => onMove(index, index + 1)}>
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </Button>
          {confirming ? (
            <div className="flex gap-1" role="group" aria-label={`Confirm removing ${title}`}>
              <Button variant="secondary" onClick={() => onRemove(item)}>Remove</Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="ghost" aria-label={`Remove ${title} from collection`} onClick={() => setConfirming(true)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading collection">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-1/2" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

export default function Collection() {
  const { id } = useParams();
  const navigate = useNavigate();
  const load = useCallback((signal) => getCollection(id, { limit: PAGE_SIZE }, { signal }), [id]);
  const { status, data, error, retry } = useAsync(load);

  // Local edits (reorder, remove, rename, more pages) layer over the loaded data and reset when it reloads.
  const [local, setLocal] = useState({ source: null });
  const view = local.source === data && data ? local : data ? { ...data, source: data } : null;
  const edit = (patch) => setLocal({ ...view, ...patch, source: data });

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const dragFrom = useRef(null);

  const collection = view?.collection;
  const canEdit = Boolean(collection?.isOwner);
  const isSmart = collection?.type === 'smart';

  // Optimistic reorder: show the new order immediately, then ask the server for the position
  // between the new neighbours; on failure put the old order back.
  async function moveItem(from, to) {
    if (from === to || busy) return;
    const previous = view.items;
    const next = [...previous];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    edit({ items: next });
    setBusy(true);
    try {
      const result = await moveCollectionItem(collection.id, moved.id, next[to - 1]?.id ?? null);
      edit({ items: next.map((it) => (it.id === moved.id ? { ...it, position: result.position } : it)) });
    } catch (err) {
      setLocal({ ...view, items: previous, source: data });
      toast.error(`Couldn't reorder: ${getErrorInfo(err).message}`);
    } finally {
      setBusy(false);
    }
  }

  const dnd = {
    start: (index) => {
      dragFrom.current = index;
    },
    drop: (index) => {
      const from = dragFrom.current;
      dragFrom.current = null;
      if (from != null && canEdit && !isSmart) moveItem(from, index);
    },
  };

  async function removeItem(item) {
    const previous = view;
    edit({ items: view.items.filter((it) => it.id !== item.id), collection: { ...collection, itemCount: collection.itemCount - 1 } });
    try {
      await removeCollectionItem(collection.id, item.id);
      toast.success(`Removed ${item.entry.game?.title ?? 'game'} from the collection`);
    } catch (err) {
      setLocal({ ...previous, source: data });
      toast.error(getErrorInfo(err).message);
    }
  }

  async function saveEdits(patch) {
    try {
      const updated = await updateCollection(collection.id, patch);
      // Rules may change a smart collection's contents, so reload from the server.
      if (patch.rules) retry();
      else edit({ collection: { ...collection, ...updated } });
      setEditing(false);
      toast.success('Collection updated');
    } catch (err) {
      throw new Error(getErrorInfo(err).message);
    }
  }

  async function handleDelete() {
    try {
      await deleteCollection(collection.id);
      toast.success(`Deleted "${collection.name}"`);
      navigate('/collections', { replace: true });
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await getCollection(id, { limit: PAGE_SIZE, cursor: view.nextCursor });
      edit({ items: [...view.items, ...page.items], nextCursor: page.nextCursor });
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <Link to="/collections" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Collections
      </Link>

      {status === 'loading' && <DetailSkeleton />}

      {status === 'error' &&
        (error.status === 404 ? (
          <EmptyState icon={Layers} title="Collection not found" description="It may have been deleted, or it isn't shared with you." actionLabel="Your collections" actionTo="/collections" />
        ) : (
          <ErrorState message={error.message} onRetry={retry} />
        ))}

      {status === 'success' && collection && (
        <>
          {/* the art of the first game in it */}
          <BackdropHero as="header" art={view.items[0]?.entry.game} seed={collection.name} className="flex flex-col gap-2 px-5 py-8 sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="font-heading text-2xl font-bold sm:text-4xl">{collection.name}</h1>
              {canEdit && !editing && (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
                  </Button>
                  {confirmingDelete ? (
                    <div className="flex gap-2" role="group" aria-label="Confirm deleting collection">
                      <Button variant="secondary" onClick={handleDelete}>Delete</Button>
                      <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <Button variant="ghost" aria-label="Delete collection" onClick={() => setConfirmingDelete(true)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <TypeBadge type={collection.type} />
              <VisibilityBadge visibility={collection.visibility} />
              <span className="text-xs text-text-muted tabular-nums">{collection.itemCount} {collection.itemCount === 1 ? 'game' : 'games'}</span>
              {!canEdit && collection.owner && <span className="text-xs text-text-muted">by {collection.owner.username}</span>}
            </div>
            {collection.description && <p className="max-w-prose text-sm">{collection.description}</p>}
            {isSmart && (
              <p className="text-sm text-text-muted">
                Filled automatically: {collection.rules.map(ruleText).join(' · ')}
              </p>
            )}
          </BackdropHero>

          {editing && <CollectionForm initial={collection} submitLabel="Save changes" onSubmit={saveEdits} onCancel={() => setEditing(false)} />}

          {view.items.length === 0 ? (
            <EmptyState
              icon={Layers}
              title={isSmart ? 'No games match these rules yet' : 'This collection is empty'}
              description={isSmart ? 'Adjust the rules or add more games to your library.' : canEdit ? 'Open a game in your library and use “Add to collection”.' : 'The owner hasn’t added any games you can see.'}
              actionLabel={canEdit ? (isSmart ? undefined : 'Go to your library') : undefined}
              actionTo={canEdit && !isSmart ? '/library' : undefined}
            />
          ) : (
            <>
              <ol className="flex flex-col gap-2" aria-label="Games in this collection">
                {view.items.map((item, index) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    index={index}
                    count={view.items.length}
                    canEdit={canEdit}
                    isSmart={isSmart}
                    busy={busy}
                    onMove={moveItem}
                    onRemove={removeItem}
                    dnd={dnd}
                  />
                ))}
              </ol>
              {view.truncated && <p className="text-sm text-text-muted">Showing the first 500 matches.</p>}
              {view.nextCursor && (
                <Button variant="secondary" className="self-center" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

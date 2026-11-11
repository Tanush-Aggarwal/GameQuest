import { useCallback, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, Clock, GripVertical, LayoutGrid, Layers, List, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { RULE_FIELDS, OPERATOR_LABELS } from '@gamequest/shared';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { BackdropHero } from '@/components/art/BackdropHero.jsx';
import { CoverImage, GameCover } from '@/components/games/GameCard.jsx';
import { GamePicker } from '@/components/collections/GamePicker.jsx';
import { StatusBadge } from '@/components/library/StatusBadge.jsx';
import { CollectionForm } from '@/components/collections/CollectionForm.jsx';
import { TypeBadge, VisibilityBadge } from '@/components/collections/badges.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import {
  addCollectionItem,
  deleteCollection,
  getCollection,
  moveCollectionItem,
  removeCollectionItem,
  updateCollection,
} from '@/services/collectionsApi.js';

const PAGE_SIZE = 50;

const ruleText = (r) => `${RULE_FIELDS[r.field].label} ${OPERATOR_LABELS[r.op]} ${Array.isArray(r.value) ? r.value.join(', ') : r.value}`;

const hoursOf = (entry) => Math.round((entry.ownerships ?? []).reduce((sum, o) => sum + (o.playtimeMin ?? 0), 0) / 60);
const VIEW_KEY = 'gq.collection.view';
const readView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
};

// Remove, with an inline confirm. `onDark` styles it for the cover overlay.
function RemoveControl({ title, onRemove, onDark = false }) {
  const [confirming, setConfirming] = useState(false);
  const ghost = onDark ? 'h-8 w-8 rounded-full bg-black/55 p-0 text-white backdrop-blur-sm hover:bg-black/75' : '';
  return confirming ? (
    <div className="flex gap-1" role="group" aria-label={`Confirm removing ${title}`}>
      <Button variant="secondary" className={onDark ? 'h-8 px-2.5 text-xs' : ''} onClick={onRemove}>Remove</Button>
      <Button variant="ghost" className={onDark ? 'h-8 px-2 text-xs text-white hover:bg-black/60' : ''} onClick={() => setConfirming(false)}>Cancel</Button>
    </div>
  ) : (
    <Button variant="ghost" className={ghost} aria-label={`Remove ${title} from collection`} onClick={() => setConfirming(true)}>
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}

// Shared by both views: drag to reorder (manual collections you own).
const dragProps = (draggable, index, dnd) => ({
  draggable,
  onDragStart: () => dnd.start(index),
  onDragOver: (e) => draggable && e.preventDefault(),
  onDrop: (e) => {
    e.preventDefault();
    dnd.drop(index);
  },
});

// Grid view: covers in order, each with its place, status and (for the owner) move/remove on hover.
function ItemCard({ item, index, count, canEdit, isSmart, busy, onMove, onRemove, dnd }) {
  const { game } = item.entry;
  const title = game?.title ?? 'Unknown game';
  const editable = canEdit && !isSmart;
  const hours = hoursOf(item.entry);
  const progress = item.entry.manualProgress ?? 0;
  const href = canEdit ? `/library/${item.entry.id}` : `/games/${game?.slug ?? ''}`;
  const overlayBtn = 'h-8 w-8 rounded-full bg-black/55 p-0 text-white backdrop-blur-sm hover:bg-black/75 disabled:opacity-40';
  return (
    <li {...dragProps(editable, index, dnd)} className={`group relative flex min-w-0 flex-col gap-2 ${editable ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-[10px] bg-surface-raised ring-1 ring-border">
        <CoverImage cover={game?.cover} title={title} alt="" sizes="(min-width: 1024px) 200px, 45vw" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
        <span aria-hidden="true" className="absolute left-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-bg px-2 font-heading text-xs font-bold tabular-nums text-text">
          {index + 1}
        </span>
        <span className="absolute bottom-2 left-2 rounded-full bg-bg px-2 py-1">
          <StatusBadge status={item.entry.status} />
        </span>
        {progress > 0 && item.entry.status === 'playing' && (
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
            <span className="block h-full bg-[var(--status-completed)]" style={{ width: `${progress}%` }} />
          </span>
        )}
        {editable && (
          <div className="absolute right-2 top-2 z-10 flex gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
            <Button variant="ghost" className={overlayBtn} aria-label={`Move ${title} up`} disabled={busy || index === 0} onClick={() => onMove(index, index - 1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" className={overlayBtn} aria-label={`Move ${title} down`} disabled={busy || index === count - 1} onClick={() => onMove(index, index + 1)}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <RemoveControl title={title} onRemove={() => onRemove(item)} onDark />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <Link to={href} className="line-clamp-1 text-sm font-semibold hover:underline">
          {title}
        </Link>
        {(hours > 0 || item.note) && (
          <p className="line-clamp-2 text-xs text-text-muted">
            {hours > 0 && <span className="tabular-nums">{hours}h played</span>}
            {hours > 0 && item.note && ' · '}
            {item.note}
          </p>
        )}
      </div>
    </li>
  );
}

// List view: a numbered row per game with its status, playtime and progress.
function ItemRow({ item, index, count, canEdit, isSmart, busy, onMove, onRemove, dnd }) {
  const { game } = item.entry;
  const title = game?.title ?? 'Unknown game';
  const editable = canEdit && !isSmart;
  const hours = hoursOf(item.entry);
  const progress = item.entry.manualProgress ?? 0;
  return (
    <li {...dragProps(editable, index, dnd)} className="group flex items-center gap-3 rounded-card border border-border bg-surface p-2 pr-3 transition-colors hover:border-[color-mix(in_srgb,var(--text)_30%,var(--border))]">
      {editable && <GripVertical className="h-5 w-5 shrink-0 cursor-grab text-text-muted" aria-hidden="true" />}
      <span aria-hidden="true" className="w-6 shrink-0 text-center font-heading text-lg font-bold tabular-nums text-text-muted/60">{index + 1}</span>
      <div className="w-12 shrink-0 overflow-hidden rounded-[6px] ring-1 ring-border">{game ? <GameCover game={game} compact /> : <div className="aspect-[3/4] bg-surface-raised" />}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link to={canEdit ? `/library/${item.entry.id}` : `/games/${game?.slug ?? ''}`} className="line-clamp-1 text-sm font-semibold hover:underline">
          {title}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
          <StatusBadge status={item.entry.status} />
          {hours > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />{hours}h played
            </span>
          )}
          {progress > 0 && <span className="tabular-nums">{progress}% done</span>}
        </div>
        {item.note && <p className="line-clamp-2 text-xs text-text-muted">{item.note}</p>}
      </div>
      {(game?.genres ?? []).length > 0 && <span className="hidden max-w-[16rem] truncate text-xs text-text-muted lg:block">{game.genres.slice(0, 3).join(' · ')}</span>}
      {editable && (
        <div className="flex shrink-0 items-center">
          <Button variant="ghost" aria-label={`Move ${title} up`} disabled={busy || index === 0} onClick={() => onMove(index, index - 1)}>
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" aria-label={`Move ${title} down`} disabled={busy || index === count - 1} onClick={() => onMove(index, index + 1)}>
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </Button>
          <RemoveControl title={title} onRemove={() => onRemove(item)} />
        </div>
      )}
    </li>
  );
}

// A small fan of the first covers, on the right of the header.
function CoverFan({ items }) {
  const covers = items.map((it) => it.entry.game).filter(Boolean).slice(0, 4);
  if (!covers.length) return null;
  const angles = [-10, -3.5, 3.5, 10].slice(0, covers.length);
  return (
    <div aria-hidden="true" className="relative hidden h-48 w-72 shrink-0 md:block lg:h-56 lg:w-80">
      {covers.map((g, i) => (
        <div
          key={g.id ?? i}
          className="absolute bottom-0 left-1/2 w-[112px] overflow-hidden lg:w-[128px] rounded-[8px] ring-2 ring-black/30"
          style={{ transform: `translateX(calc(-50% + ${(i - (covers.length - 1) / 2) * 48}px)) rotate(${angles[i]}deg)`, zIndex: i }}
        >
          <CoverImage cover={g.cover} title={g.title} compact alt="" sizes="128px" className="aspect-[3/4] w-full object-cover" />
        </div>
      ))}
    </div>
  );
}

// Pick games from your library to add to a manual collection.
function AddGamesDialog({ open, onOpenChange, collection, existing, onAdded }) {
  const [picked, setPicked] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  async function add() {
    setSaving(true);
    const results = await Promise.allSettled([...picked].map((entryId) => addCollectionItem(collection.id, { entryId })));
    setSaving(false);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    if (ok) toast.success(`Added ${ok} ${ok === 1 ? 'game' : 'games'} to ${collection.name}`);
    if (ok < results.length) toast.error(`${results.length - ok} couldn't be added`);
    setPicked(new Set());
    onOpenChange(false);
    if (ok) onAdded();
  }
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-card border border-border bg-surface p-5 text-text shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-heading text-lg font-bold">Add games to {collection.name}</Dialog.Title>
              <Dialog.Description className="text-sm text-text-muted">Pick from your library. Games already in it are not shown.</Dialog.Description>
            </div>
            <Dialog.Close className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-surface-raised hover:text-text" aria-label="Close">
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <GamePicker selected={picked} onChange={setPicked} exclude={existing} legend="Your library" optional={false} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={add} disabled={saving || !picked.size}>
              {saving ? 'Adding…' : picked.size ? `Add ${picked.size} ${picked.size === 1 ? 'game' : 'games'}` : 'Add games'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading collection">
      <Skeleton className="h-48 w-full" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-full" />
        ))}
      </div>
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
  const [adding, setAdding] = useState(false);
  const [layout, setLayout] = useState(readView);
  const dragFrom = useRef(null);
  const chooseLayout = (v) => {
    setLayout(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  };

  const collection = view?.collection;
  const canEdit = Boolean(collection?.isOwner);
  const isSmart = collection?.type === 'smart';
  const items = useMemo(() => view?.items ?? [], [view?.items]);
  const existing = useMemo(() => new Set(items.map((it) => it.entry.id)), [items]);
  const completed = items.filter((it) => it.entry.status === 'completed').length;
  const totalHours = items.reduce((sum, it) => sum + hoursOf(it.entry), 0);
  // the header art: the first game in it that has any
  const heroArt = items.map((it) => it.entry.game).find((g) => g && (g.heroOverride?.url || g.steamHero || g.backdrop || g.screenshots?.length || g.artworks?.length)) ?? items[0]?.entry.game;

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
          {/* the art of the first game in it that has some, with a fan of its covers on the right */}
          <BackdropHero as="header" art={heroArt} seed={collection.name} className="flex flex-col gap-6 px-5 py-8 sm:px-10 sm:pb-10 sm:pt-20 md:flex-row md:items-end md:justify-between lg:pt-24">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3 [&_span]:text-white/80">
                <TypeBadge type={collection.type} />
                <VisibilityBadge visibility={collection.visibility} />
                {!canEdit && collection.owner && <span className="text-xs">by {collection.owner.username}</span>}
              </div>
              <h1 className="break-words font-heading text-3xl font-bold leading-tight sm:text-[44px] lg:text-5xl">{collection.name}</h1>
              {collection.description && <p className="max-w-prose text-sm text-white/85">{collection.description}</p>}
              {isSmart && <p className="max-w-prose text-sm text-white/75">Filled automatically: {collection.rules.map(ruleText).join(' · ')}</p>}
              <dl className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
                {[
                  ['Games', collection.itemCount],
                  ['Completed', items.length ? `${completed} of ${items.length}` : '0'],
                  ['Played', `${totalHours}h`],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/60">{label}</dt>
                    <dd className="font-heading text-xl font-bold tabular-nums text-white">{value}</dd>
                  </div>
                ))}
              </dl>
              {canEdit && !editing && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {!isSmart && (
                    <Button onClick={() => setAdding(true)} className="bg-white text-[#151713] hover:bg-white/90">
                      <Plus className="h-4 w-4" aria-hidden="true" /> Add games
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => setEditing(true)} className="border-white/25 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20">
                    <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
                  </Button>
                  {confirmingDelete ? (
                    <div className="flex gap-2" role="group" aria-label="Confirm deleting collection">
                      <Button variant="secondary" onClick={handleDelete}>Delete</Button>
                      <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <Button variant="ghost" aria-label="Delete collection" className="text-white/80 hover:bg-white/10 hover:text-white" onClick={() => setConfirmingDelete(true)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              )}
            </div>
            <CoverFan items={items} />
          </BackdropHero>

          {editing && <CollectionForm initial={collection} submitLabel="Save changes" onSubmit={saveEdits} onCancel={() => setEditing(false)} />}
          {canEdit && !isSmart && <AddGamesDialog open={adding} onOpenChange={setAdding} collection={collection} existing={existing} onAdded={retry} />}

          {view.items.length === 0 ? (
            <EmptyState
              icon={Layers}
              title={isSmart ? 'No games match these rules yet' : 'This collection is empty'}
              description={isSmart ? 'Adjust the rules or add more games to your library.' : canEdit ? 'Use “Add games” above to pick from your library.' : 'The owner hasn’t added any games you can see.'}
              actionLabel={canEdit ? (isSmart ? undefined : 'Go to your library') : undefined}
              actionTo={canEdit && !isSmart ? '/library' : undefined}
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-text-muted">
                  {canEdit && !isSmart ? 'Drag to reorder, or use the arrows.' : isSmart ? 'Kept up to date from your library.' : `${collection.itemCount} ${collection.itemCount === 1 ? 'game' : 'games'}`}
                </p>
                <div role="radiogroup" aria-label="View" className="flex rounded-full border border-border bg-surface p-0.5">
                  {[
                    ['grid', 'Grid', LayoutGrid],
                    ['list', 'List', List],
                  ].map(([value, label, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={layout === value}
                      onClick={() => chooseLayout(value)}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text ${layout === value ? 'bg-text text-bg' : 'text-text-muted hover:text-text'}`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
                    </button>
                  ))}
                </div>
              </div>
              <ol
                aria-label="Games in this collection"
                className={layout === 'grid' ? 'grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6' : 'flex flex-col gap-2'}
              >
                {view.items.map((item, index) => {
                  const Item = layout === 'grid' ? ItemCard : ItemRow;
                  return (
                    <Item
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
                  );
                })}
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

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { compileRules } from '../utils/smartRules.js';
import { toEntryDto } from './libraryService.js';

const MAX_ITEMS = 500; // per manual collection; also the cap on a smart collection's computed result
const MIN_GAP = 1e-9; // below this, midpoints stop being distinguishable and the list is renumbered
const COVER_COUNT = 4;

const NO_SOCIAL = { isFriend: async () => false, isBlocked: async () => false };

// Business rules for collections: ownership, privacy, manual ordering and smart-rule evaluation.
// `social` answers friendship/block questions (provided by the friend service); until then nobody is a friend.
export function createCollectionService({
  Collection,
  CollectionItem,
  LibraryEntry,
  Game,
  User,
  eventBus,
  logger,
  social = NO_SOCIAL,
}) {
  // ── privacy ────────────────────────────────────────────────────────────────

  async function canView(viewerId, collection) {
    const ownerId = String(collection.ownerId);
    if (String(viewerId) === ownerId) return true;
    if (await social.isBlocked(viewerId, ownerId)) return false;
    if (collection.visibility === 'public') return true;
    if (collection.visibility === 'friends') return social.isFriend(viewerId, ownerId);
    return false;
  }

  // A collection the viewer may not see does not exist as far as they can tell.
  async function loadVisible(viewerId, id) {
    const collection = await Collection.findOne({ _id: id }).lean();
    if (!collection || !(await canView(viewerId, collection))) throw new NotFoundError('Collection not found');
    return collection;
  }

  // Mutations: the owner passes; someone who can see it gets 403; everyone else gets 404.
  async function loadOwned(userId, id) {
    const collection = await loadVisible(userId, id);
    if (String(collection.ownerId) !== String(userId)) throw new ForbiddenError('Only the owner can change this collection');
    return collection;
  }

  // ── reading items ──────────────────────────────────────────────────────────

  const visibleTo = (entry, ownerView) => ownerView || !entry.hiddenFromFriends;

  async function gamesById(gameIds) {
    if (!gameIds.length) return new Map();
    const games = await Game.find({ _id: { $in: gameIds } }).lean();
    return new Map(games.map((g) => [String(g._id), g]));
  }

  // Every item of a manual collection with its entry and game, in position order.
  async function manualPairs(collection, ownerView) {
    const items = await CollectionItem.find({ collectionId: collection._id }).sort({ position: 1 }).limit(MAX_ITEMS).lean();
    if (!items.length) return [];
    const entries = await LibraryEntry.find({ _id: { $in: items.map((i) => i.entryId) } }).lean();
    const entryById = new Map(entries.map((e) => [String(e._id), e]));
    const kept = items.filter((i) => {
      const entry = entryById.get(String(i.entryId));
      return entry && visibleTo(entry, ownerView);
    });
    const games = await gamesById(kept.map((i) => entryById.get(String(i.entryId)).gameId));
    return kept.map((i) => {
      const entry = entryById.get(String(i.entryId));
      return { id: String(i._id), position: i.position, note: i.note ?? '', entry, game: games.get(String(entry.gameId)) ?? null };
    });
  }

  // Smart collections store no items: the owner's library is filtered by the compiled rules on every read.
  async function smartPairs(ownerId, compiled, ownerView) {
    const filter = { userId: ownerId, ...compiled.entry };
    if (!ownerView) filter.hiddenFromFriends = { $ne: true };
    const entries = await LibraryEntry.find(filter).sort({ _id: -1 }).limit(MAX_ITEMS).lean();
    if (!entries.length) return { pairs: [], truncated: false };
    const gameFilter = { _id: { $in: entries.map((e) => e.gameId) }, ...compiled.game };
    const games = await Game.find(gameFilter).lean();
    const byId = new Map(games.map((g) => [String(g._id), g]));
    const pairs = entries
      .filter((e) => byId.has(String(e.gameId)))
      .map((e) => ({ id: String(e._id), position: null, note: '', entry: e, game: byId.get(String(e.gameId)) }));
    return { pairs, truncated: entries.length >= MAX_ITEMS };
  }

  async function pairsFor(collection, ownerView) {
    if (collection.type === 'smart') return smartPairs(collection.ownerId, compileRules(collection.rules), ownerView);
    return { pairs: await manualPairs(collection, ownerView), truncated: false };
  }

  const toItemDto = (p) => ({ id: p.id, position: p.position, note: p.note, entry: toEntryDto(p.entry, p.game) });

  async function toDto(collection, viewerId, pairs, owner) {
    const ownerView = String(viewerId) === String(collection.ownerId);
    const covers = pairs.slice(0, COVER_COUNT).map((p) => p.game?.cover).filter(Boolean);
    if (collection.coverGameId) {
      const [cover] = (await Game.find({ _id: collection.coverGameId }).lean()).map((g) => g.cover).filter(Boolean);
      if (cover) covers.unshift(cover);
    }
    return {
      id: String(collection._id),
      ownerId: String(collection.ownerId),
      owner: owner ? { id: String(owner._id), username: owner.username } : null,
      name: collection.name,
      description: collection.description ?? '',
      visibility: collection.visibility,
      type: collection.type,
      rules: (collection.rules ?? []).map((r) => ({ field: r.field, op: r.op, value: r.value })),
      coverGameId: collection.coverGameId ? String(collection.coverGameId) : null,
      itemCount: pairs.length,
      covers: covers.slice(0, COVER_COUNT),
      isOwner: ownerView,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
  }

  async function summarise(collection, viewerId) {
    const ownerView = String(viewerId) === String(collection.ownerId);
    const { pairs } = await pairsFor(collection, ownerView);
    return toDto(collection, viewerId, pairs, null);
  }

  // ── public API ─────────────────────────────────────────────────────────────

  return {
    async create(userId, input) {
      if (input.type === 'smart') compileRules(input.rules); // reject bad rules before saving anything
      else if (input.rules?.length) throw new ValidationError('Only smart collections have rules');
      const collection = await Collection.create({
        ownerId: userId,
        name: input.name,
        description: input.description ?? '',
        visibility: input.visibility ?? 'private',
        type: input.type ?? 'manual',
        rules: input.type === 'smart' ? input.rules : [],
        coverGameId: input.coverGameId ?? null,
      });
      eventBus?.emit('collection.created', {
        userId: String(userId),
        collectionId: String(collection._id),
        name: collection.name,
        type: collection.type,
        visibility: collection.visibility,
        at: new Date(),
      });
      return summarise(collection, userId);
    },

    async listMine(userId, { type, cursor, limit = 24 } = {}) {
      const filter = { ownerId: userId };
      if (type) filter.type = type;
      if (cursor) filter._id = { $lt: cursor };
      const rows = await Collection.find(filter)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean();
      const page = rows.slice(0, limit);
      return {
        items: await Promise.all(page.map((c) => summarise(c, userId))),
        nextCursor: rows.length > limit ? String(page[page.length - 1]._id) : null,
      };
    },

    // Collections of `ownerId` that `viewerId` may see (profile pages). Blocks override everything.
    async listVisibleFor(viewerId, ownerId, { limit = 24 } = {}) {
      const isOwner = String(viewerId) === String(ownerId);
      let visibilities = ['public'];
      if (isOwner) visibilities = ['public', 'friends', 'private'];
      else if (await social.isBlocked(viewerId, ownerId)) return [];
      else if (await social.isFriend(viewerId, ownerId)) visibilities = ['public', 'friends'];
      const rows = await Collection.find({ ownerId, visibility: { $in: visibilities } })
        .sort({ _id: -1 })
        .limit(limit)
        .lean();
      return Promise.all(rows.map((c) => summarise(c, viewerId)));
    },

    async get(viewerId, id, { cursor, limit = 50 } = {}) {
      const collection = await loadVisible(viewerId, id);
      const ownerView = String(viewerId) === String(collection.ownerId);
      const { pairs, truncated } = await pairsFor(collection, ownerView);

      let start = 0;
      if (cursor) {
        // manual cursors are positions, smart cursors are entry ids
        start =
          collection.type === 'smart'
            ? pairs.findIndex((p) => p.id === cursor) + 1
            : pairs.findIndex((p) => p.position > Number(cursor));
        if (collection.type === 'manual' && !Number.isFinite(Number(cursor))) throw new ValidationError('Invalid cursor');
        if (start === -1) start = pairs.length;
      }
      const page = pairs.slice(start, start + limit);
      const last = page[page.length - 1];
      const hasMore = start + limit < pairs.length;
      const owner = await User.findOne({ _id: collection.ownerId }).lean();
      return {
        collection: await toDto(collection, viewerId, pairs, owner),
        items: page.map(toItemDto),
        nextCursor: hasMore ? (collection.type === 'smart' ? last.id : String(last.position)) : null,
        truncated,
      };
    },

    async update(userId, id, patch) {
      const collection = await loadOwned(userId, id);
      const $set = {};
      for (const key of ['name', 'description', 'visibility']) if (patch[key] !== undefined) $set[key] = patch[key];
      if (patch.coverGameId !== undefined) $set.coverGameId = patch.coverGameId;
      if (patch.rules !== undefined) {
        if (collection.type !== 'smart') throw new ValidationError('Only smart collections have rules');
        compileRules(patch.rules);
        $set.rules = patch.rules;
      }
      const updated = await Collection.findOneAndUpdate({ _id: id, ownerId: userId }, { $set }, { returnDocument: 'after' });
      if (!updated) throw new NotFoundError('Collection not found');
      return summarise(updated, userId);
    },

    async remove(userId, id) {
      await loadOwned(userId, id);
      await Collection.deleteOne({ _id: id, ownerId: userId });
      await CollectionItem.deleteMany({ collectionId: id });
    },

    async addItem(userId, id, { entryId, note = '' }) {
      const collection = await loadOwned(userId, id);
      if (collection.type === 'smart') throw new ConflictError('Smart collections fill themselves from their rules');
      const entry = await LibraryEntry.findOne({ _id: entryId, userId }).lean();
      if (!entry) throw new NotFoundError('Library entry not found');
      if ((await CollectionItem.countDocuments({ collectionId: id })) >= MAX_ITEMS) {
        throw new ConflictError(`A collection holds at most ${MAX_ITEMS} games`);
      }
      const [last] = await CollectionItem.find({ collectionId: id }).sort({ position: -1 }).limit(1).lean();
      let item;
      try {
        item = await CollectionItem.create({ collectionId: id, entryId, position: (last?.position ?? 0) + 1, note });
      } catch (err) {
        if (err?.code === 11000) throw new ConflictError('That game is already in this collection');
        throw err;
      }
      await Collection.updateOne({ _id: id }, { $set: { updatedAt: new Date() } });
      const game = await Game.findOne({ _id: entry.gameId }).lean();
      return toItemDto({ id: String(item._id), position: item.position, note: item.note ?? '', entry, game });
    },

    async removeItem(userId, id, itemId) {
      const collection = await loadOwned(userId, id);
      if (collection.type === 'smart') throw new ConflictError('Smart collections fill themselves from their rules');
      const { deletedCount } = await CollectionItem.deleteOne({ _id: itemId, collectionId: id });
      if (!deletedCount) throw new NotFoundError('Item not found in this collection');
    },

    // Place `itemId` directly after `afterItemId` (null = top) by writing the midpoint of its new neighbours.
    async moveItem(userId, id, itemId, afterItemId) {
      const collection = await loadOwned(userId, id);
      if (collection.type === 'smart') throw new ConflictError('Smart collections fill themselves from their rules');
      if (afterItemId && String(afterItemId) === String(itemId)) throw new ValidationError("An item can't be placed after itself");

      const all = await CollectionItem.find({ collectionId: id }).sort({ position: 1 }).limit(MAX_ITEMS).lean();
      const moving = all.find((i) => String(i._id) === String(itemId));
      if (!moving) throw new NotFoundError('Item not found in this collection');
      const rest = all.filter((i) => i !== moving);
      const prevIndex = afterItemId ? rest.findIndex((i) => String(i._id) === String(afterItemId)) : -1;
      if (afterItemId && prevIndex === -1) throw new NotFoundError('Target item not found in this collection');

      let prev = prevIndex >= 0 ? rest[prevIndex] : null;
      let next = rest[prevIndex + 1] ?? null;
      if (prev && next && next.position - prev.position < MIN_GAP) {
        // Gap exhausted by repeated midpoints: renumber everything once, then take a fresh midpoint.
        await Promise.all(rest.map((item, i) => CollectionItem.updateOne({ _id: item._id }, { $set: { position: i + 1 } })));
        rest.forEach((item, i) => {
          item.position = i + 1;
        });
        prev = rest[prevIndex];
        next = rest[prevIndex + 1] ?? null;
        logger?.info({ collectionId: String(id) }, 'renormalised collection positions');
      }

      let position = 1;
      if (prev && next) position = (prev.position + next.position) / 2;
      else if (prev) position = prev.position + 1;
      else if (next) position = next.position - 1;

      await CollectionItem.updateOne({ _id: itemId, collectionId: id }, { $set: { position } });
      return { id: String(itemId), position };
    },

    // Evaluates unsaved rules against the caller's own library (live preview in the rule builder).
    async preview(userId, { rules }) {
      const { pairs, truncated } = await smartPairs(userId, compileRules(rules), true);
      return { total: pairs.length, truncated, items: pairs.slice(0, 24).map(toItemDto) };
    },

    // Called by the event-bus subscriber when a library entry is deleted.
    async forgetEntry(entryId) {
      await CollectionItem.deleteMany({ entryId });
    },
  };
}

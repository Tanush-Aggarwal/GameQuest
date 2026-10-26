import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';

const MAX_RELATION_ROWS = 2000;

// The pair is always stored sorted, so (A,B) and (B,A) are the same document.
const pairOf = (a, b) => {
  const [userA, userB] = [String(a), String(b)].sort();
  return { userA, userB };
};
const otherOf = (doc, me) => (String(doc.userA) === String(me) ? String(doc.userB) : String(doc.userA));
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toUserDto = (u) => ({ id: String(u._id), username: u.username });

// Friendships are mutual (request → accept) and blocks override everything: a blocked pair can't
// request, search, see or be seen by each other. This service also answers `isFriend`/`isBlocked`
// for the other services' privacy filters.
export function createFriendService({ Friendship, Block, User, eventBus, now = () => new Date() }) {
  async function isBlocked(a, b) {
    const hit = await Block.findOne({ $or: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] }).lean();
    return Boolean(hit);
  }

  async function isFriend(a, b) {
    if (String(a) === String(b)) return false;
    const hit = await Friendship.findOne({ ...pairOf(a, b), status: 'accepted' }).lean();
    return Boolean(hit);
  }

  // Everything the viewer has with other people, in two queries.
  async function loadRelations(userId) {
    const [friendships, blocks] = await Promise.all([
      Friendship.find({ $or: [{ userA: userId }, { userB: userId }] }).limit(MAX_RELATION_ROWS).lean(),
      Block.find({ $or: [{ blockerId: userId }, { blockedId: userId }] }).limit(MAX_RELATION_ROWS).lean(),
    ]);
    const rel = { friends: new Map(), incoming: new Map(), outgoing: new Map(), blockedByMe: new Set(), blockedMe: new Set() };
    for (const f of friendships) {
      const other = otherOf(f, userId);
      if (f.status === 'accepted') rel.friends.set(other, f);
      else if (String(f.requestedBy) === String(userId)) rel.outgoing.set(other, f);
      else rel.incoming.set(other, f);
    }
    for (const b of blocks) {
      if (String(b.blockerId) === String(userId)) rel.blockedByMe.add(String(b.blockedId));
      else rel.blockedMe.add(String(b.blockerId));
    }
    return rel;
  }

  const relationOf = (rel, otherId) => {
    if (rel.blockedByMe.has(otherId)) return 'blocked';
    if (rel.friends.has(otherId)) return 'friend';
    if (rel.outgoing.has(otherId)) return 'pending_out';
    if (rel.incoming.has(otherId)) return 'pending_in';
    return 'none';
  };

  async function usersById(ids) {
    if (!ids.length) return new Map();
    const users = await User.find({ _id: { $in: ids } }).lean();
    return new Map(users.map((u) => [String(u._id), u]));
  }

  // Loads a friendship the caller takes part in; anything else does not exist for them.
  async function loadMine(userId, id) {
    const doc = await Friendship.findOne({ _id: id }).lean();
    if (!doc || (String(doc.userA) !== String(userId) && String(doc.userB) !== String(userId))) {
      throw new NotFoundError('Friend request not found');
    }
    if (await isBlocked(userId, otherOf(doc, userId))) throw new NotFoundError('Friend request not found');
    return doc;
  }

  return {
    isFriend,
    isBlocked,

    async friendIds(userId) {
      const rel = await loadRelations(userId);
      return [...rel.friends.keys()];
    },

    async relation(viewerId, otherId) {
      if (String(viewerId) === String(otherId)) return 'self';
      return relationOf(await loadRelations(viewerId), String(otherId));
    },

    async searchUsers(viewerId, { q, limit = 10 }) {
      const prefix = escapeRegex(q.trim().toLowerCase());
      const [rows, rel] = await Promise.all([
        User.find({ usernameLower: { $regex: `^${prefix}` } })
          .limit(limit + 1 + 20)
          .lean(),
        loadRelations(viewerId),
      ]);
      return rows
        .filter((u) => String(u._id) !== String(viewerId) && !rel.blockedMe.has(String(u._id)))
        .slice(0, limit)
        .map((u) => ({ ...toUserDto(u), relation: relationOf(rel, String(u._id)) }));
    },

    async sendRequest(userId, { username }) {
      const target = await User.findOne({ usernameLower: username.toLowerCase() }).lean();
      // Someone who blocked you, or who doesn't exist, look the same.
      if (!target || (await Block.findOne({ blockerId: target._id, blockedId: userId }).lean())) {
        throw new NotFoundError('No player with that username');
      }
      const targetId = String(target._id);
      if (targetId === String(userId)) throw new ValidationError("You can't send a friend request to yourself");
      if (await Block.findOne({ blockerId: userId, blockedId: targetId }).lean()) {
        throw new ForbiddenError('Unblock this player before sending a friend request');
      }

      const existing = await Friendship.findOne(pairOf(userId, targetId)).lean();
      if (existing) {
        if (existing.status === 'accepted') throw new ConflictError(`You and ${target.username} are already friends`);
        if (String(existing.requestedBy) === String(userId)) throw new ConflictError('You already sent this player a request');
        // Crossed requests: they already asked you, so asking back is accepting.
        const accepted = await Friendship.findOneAndUpdate(
          { _id: existing._id, status: 'pending' },
          { $set: { status: 'accepted', acceptedAt: now() } },
          { returnDocument: 'after' },
        );
        if (!accepted) throw new ConflictError('This request was changed elsewhere. Refresh and try again.');
        eventBus?.emit('friend.accepted', { userId: String(userId), otherId: targetId, friendshipId: String(accepted._id) });
        return { status: 'accepted', user: toUserDto(target), friendshipId: String(accepted._id) };
      }

      let friendship;
      try {
        friendship = await Friendship.create({ ...pairOf(userId, targetId), status: 'pending', requestedBy: userId });
      } catch (err) {
        if (err?.code === 11000) throw new ConflictError('A request between you two already exists');
        throw err;
      }
      eventBus?.emit('friend.requested', { userId: String(userId), otherId: targetId, friendshipId: String(friendship._id) });
      return { status: 'pending', user: toUserDto(target), friendshipId: String(friendship._id) };
    },

    async listFriends(userId) {
      const rel = await loadRelations(userId);
      const users = await usersById([...rel.friends.keys()]);
      return [...rel.friends.entries()]
        .filter(([id]) => users.has(id) && !rel.blockedMe.has(id))
        .map(([id, f]) => ({ ...toUserDto(users.get(id)), since: f.acceptedAt ?? f.updatedAt ?? null }))
        .sort((a, b) => a.username.localeCompare(b.username));
    },

    async listRequests(userId) {
      const rel = await loadRelations(userId);
      const users = await usersById([...rel.incoming.keys(), ...rel.outgoing.keys()]);
      const rows = (map) =>
        [...map.entries()]
          .filter(([id]) => users.has(id) && !rel.blockedMe.has(id) && !rel.blockedByMe.has(id))
          .map(([id, f]) => ({ id: String(f._id), user: toUserDto(users.get(id)), createdAt: f.createdAt }));
      return { incoming: rows(rel.incoming), outgoing: rows(rel.outgoing) };
    },

    async accept(userId, id) {
      const doc = await loadMine(userId, id);
      if (String(doc.requestedBy) === String(userId)) throw new ForbiddenError("You can't accept a request you sent");
      if (doc.status !== 'pending') throw new ConflictError('You are already friends');
      const accepted = await Friendship.findOneAndUpdate(
        { _id: id, status: 'pending' },
        { $set: { status: 'accepted', acceptedAt: now() } },
        { returnDocument: 'after' },
      );
      if (!accepted) throw new ConflictError('This request was changed elsewhere. Refresh and try again.');
      eventBus?.emit('friend.accepted', { userId: String(userId), otherId: otherOf(doc, userId), friendshipId: String(id) });
    },

    // The recipient declines: the request disappears and the sender may ask again later.
    async decline(userId, id) {
      const doc = await loadMine(userId, id);
      if (String(doc.requestedBy) === String(userId)) throw new ForbiddenError("You can't decline a request you sent; cancel it instead");
      if (doc.status !== 'pending') throw new ConflictError('You are already friends');
      await Friendship.deleteOne({ _id: id, status: 'pending' });
    },

    // The sender withdraws a pending request.
    async cancel(userId, id) {
      const doc = await loadMine(userId, id);
      if (String(doc.requestedBy) !== String(userId)) throw new ForbiddenError("You can only cancel requests you sent");
      if (doc.status !== 'pending') throw new ConflictError('This request was already accepted');
      await Friendship.deleteOne({ _id: id, status: 'pending' });
    },

    async unfriend(userId, otherId) {
      const { deletedCount } = await Friendship.deleteOne({ ...pairOf(userId, otherId), status: 'accepted' });
      if (!deletedCount) throw new NotFoundError('You are not friends with that player');
    },

    async block(userId, targetId) {
      if (String(userId) === String(targetId)) throw new ValidationError("You can't block yourself");
      const target = await User.findOne({ _id: targetId }).lean();
      if (!target) throw new NotFoundError('Player not found');
      try {
        await Block.create({ blockerId: userId, blockedId: targetId });
      } catch (err) {
        if (err?.code !== 11000) throw err; // already blocked: blocking is idempotent
      }
      // Blocking ends any friendship or pending request between the two.
      await Friendship.deleteMany(pairOf(userId, targetId));
      eventBus?.emit('user.blocked', { userId: String(userId), blockedId: String(targetId) });
    },

    async unblock(userId, targetId) {
      const { deletedCount } = await Block.deleteOne({ blockerId: userId, blockedId: targetId });
      if (!deletedCount) throw new NotFoundError('That player is not blocked');
    },

    async listBlocked(userId) {
      const blocks = await Block.find({ blockerId: userId }).limit(MAX_RELATION_ROWS).lean();
      const users = await usersById(blocks.map((b) => String(b.blockedId)));
      return blocks.filter((b) => users.has(String(b.blockedId))).map((b) => toUserDto(users.get(String(b.blockedId))));
    },
  };
}

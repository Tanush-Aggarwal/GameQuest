import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { buildIcs } from '../utils/ics.js';

const MIN_MS = 60_000;
const START_GRACE_MS = MIN_MS; // a start time "now" typed a moment ago is still fine

const toIso = (d) => new Date(d).toISOString();

// Planned play sessions: who may see them, who is going, and the calendar file.
//  - visibility 'friends': the host's friends can see and join it; 'invite': only invitees (and the host).
//  - the host always counts as going; maxPlayers includes the host.
//  - blocks override everything: a blocked pair can't see each other's sessions.
export function createSessionService({ GameSession, Rsvp, Game, User, social, eventBus, now = () => new Date() }) {
  // ── access ─────────────────────────────────────────────────────────────────

  async function canView(viewerId, session) {
    const viewer = String(viewerId);
    const host = String(session.hostId);
    if (viewer === host) return true;
    if (await social.isBlocked(viewer, host)) return false;
    // Everyone else must still be the host's friend: an invitation does not outlive an unfriend.
    if (!(await social.isFriend(viewer, host))) return false;
    return session.visibility === 'friends' || (session.invitees ?? []).some((i) => String(i) === viewer);
  }

  async function loadVisible(viewerId, id) {
    const session = await GameSession.findOne({ _id: id }).lean();
    if (!session || !(await canView(viewerId, session))) throw new NotFoundError('Session not found');
    return session;
  }

  // Someone who can see the session but isn't the host gets 403; everyone else 404.
  async function loadHosted(userId, id) {
    const session = await loadVisible(userId, id);
    if (String(session.hostId) !== String(userId)) throw new ForbiddenError('Only the host can change this session');
    return session;
  }

  // Sessions created before the counter existed get it filled in from the real RSVPs, once.
  async function ensureGoingCount(session) {
    if (session.goingCount !== undefined) return;
    const going = await Rsvp.countDocuments({ sessionId: session._id, response: 'going' });
    await GameSession.updateOne({ _id: session._id, goingCount: { $exists: false } }, { $set: { goingCount: going } });
  }

  const hasEnded = (session) =>new Date(session.endsAt).getTime() <= now().getTime();

  async function assertInvitable(hostId, inviteeIds) {
    if (!inviteeIds.length) return;
    const friends = new Set(await social.friendIds(hostId));
    const strangers = inviteeIds.filter((id) => !friends.has(String(id)));
    if (strangers.length) throw new ValidationError('You can only invite your friends');
  }

  // ── presentation ───────────────────────────────────────────────────────────

  async function lookups(sessions) {
    const hostIds = [...new Set(sessions.map((s) => String(s.hostId)))];
    const gameIds = [...new Set(sessions.map((s) => String(s.gameId)))];
    const sessionIds = sessions.map((s) => String(s._id));
    const [hosts, games, rsvps] = await Promise.all([
      hostIds.length ? User.find({ _id: { $in: hostIds } }).lean() : [],
      gameIds.length ? Game.find({ _id: { $in: gameIds } }).lean() : [],
      sessionIds.length ? Rsvp.find({ sessionId: { $in: sessionIds } }).lean() : [],
    ]);
    return {
      hostById: new Map(hosts.map((u) => [String(u._id), u])),
      gameById: new Map(games.map((g) => [String(g._id), g])),
      rsvpsBySession: rsvps.reduce((map, r) => map.set(String(r.sessionId), [...(map.get(String(r.sessionId)) ?? []), r]), new Map()),
    };
  }

  function summarise(session, viewerId, { hostById, gameById, rsvpsBySession }) {
    const rsvps = rsvpsBySession.get(String(session._id)) ?? [];
    const going = rsvps.filter((r) => r.response === 'going').length + 1; // + the host
    const mine = rsvps.find((r) => String(r.userId) === String(viewerId));
    const isHost = String(session.hostId) === String(viewerId);
    const host = hostById.get(String(session.hostId));
    const game = gameById.get(String(session.gameId));
    const invited = (session.invitees ?? []).some((i) => String(i) === String(viewerId));
    return {
      id: String(session._id),
      title: session.title || (game ? `Playing ${game.title}` : 'Play session'),
      customTitle: session.title ?? '',
      game: game ? { id: String(game._id), slug: game.slug, title: game.title, cover: game.cover ?? null, backdrop: game.backdrop ?? game.screenshots?.[0] ?? game.artworks?.[0] ?? null } : null, // wide art for the session banner
      host: host ? { id: String(host._id), username: host.username } : null,
      startsAt: toIso(session.startsAt),
      endsAt: toIso(session.endsAt),
      durationMin: session.durationMin,
      platform: session.platform ?? '',
      discordInviteUrl: session.discordInviteUrl ?? null,
      maxPlayers: session.maxPlayers,
      visibility: session.visibility,
      status: session.status,
      ended: hasEnded(session),
      isHost,
      myResponse: isHost ? 'host' : (mine?.response ?? (invited ? 'invited' : null)),
      counts: {
        going,
        maybe: rsvps.filter((r) => r.response === 'maybe').length,
        spotsLeft: Math.max(0, session.maxPlayers - going),
      },
    };
  }

  async function detail(session, viewerId) {
    const ctx = await lookups([session]);
    const dto = summarise(session, viewerId, ctx);
    // People on either side of a block never see each other, and the host sees everyone; for an
    // open session, a guest the viewer isn't friends with stays a number in the counts, not a name.
    const [blocked, friends] = await Promise.all([social.blockedIds(viewerId), social.friendIds(viewerId)]);
    const hiddenFromViewer = new Set(blocked);
    const knownToViewer = new Set(friends);
    const rsvps = (ctx.rsvpsBySession.get(String(session._id)) ?? []).filter((r) => !hiddenFromViewer.has(String(r.userId)));
    const rsvpByUser = new Map(rsvps.map((r) => [String(r.userId), r.response]));
    const inviteeIds = (session.invitees ?? []).map(String);
    // Everyone who answered, plus everyone invited who hasn't yet (for invite-only sessions only the invited count).
    const personIds = [...new Set([...inviteeIds, ...(session.visibility === 'friends' ? rsvps.map((r) => String(r.userId)) : [])])].filter(
      (pid) => !hiddenFromViewer.has(pid),
    );
    const people = personIds.length ? await User.find({ _id: { $in: personIds } }).lean() : [];
    const attendees = [
      { user: dto.host, response: 'going', role: 'host' },
      ...people
        .filter((u) => String(u._id) !== String(session.hostId))
        .filter((u) => dto.isHost || String(u._id) === String(viewerId) || inviteeIds.includes(String(u._id)) || knownToViewer.has(String(u._id)))
        .map((u) => ({
          user: { id: String(u._id), username: u.username },
          response: rsvpByUser.get(String(u._id)) ?? 'invited',
          role: inviteeIds.includes(String(u._id)) ? 'invitee' : 'guest',
        })),
    ];
    return { ...dto, inviteeIds: dto.isHost ? inviteeIds : undefined, attendees };
  }

  // ── public API ─────────────────────────────────────────────────────────────

  return {
    async create(userId, input) {
      const game = await Game.findOne({ _id: input.gameId }).lean();
      if (!game) throw new NotFoundError('Game not found');
      const startsAt = new Date(input.startsAt);
      if (startsAt.getTime() < now().getTime() - START_GRACE_MS) throw new ValidationError('Pick a start time in the future');
      const inviteeIds = input.inviteeIds ?? [];
      if (input.visibility === 'invite' && inviteeIds.length === 0) throw new ValidationError('Invite at least one friend');
      if (inviteeIds.length + 1 > input.maxPlayers) throw new ValidationError('There are more invitations than player slots');
      await assertInvitable(userId, inviteeIds);

      const session = await GameSession.create({
        hostId: userId,
        gameId: input.gameId,
        title: input.title ?? '',
        startsAt,
        endsAt: new Date(startsAt.getTime() + input.durationMin * MIN_MS),
        durationMin: input.durationMin,
        platform: input.platform ?? '',
        discordInviteUrl: input.discordInviteUrl ?? null,
        maxPlayers: input.maxPlayers,
        visibility: input.visibility,
        invitees: input.inviteeIds ?? [],
      });
      eventBus?.emit('session.created', {
        userId: String(userId),
        sessionId: String(session._id),
        gameId: String(session.gameId),
        title: session.title || `Playing ${game.title}`,
        startsAt: toIso(session.startsAt),
        visibility: session.visibility,
        inviteeIds: (session.invitees ?? []).map(String),
        at: now(),
      });
      return detail(session, userId);
    },

    // Upcoming (not ended, not cancelled) sessions I host, am invited to, or my friends open to friends.
    async listUpcoming(viewerId, { cursor, limit = 20 } = {}) {
      const [friendIds, blockedIds] = await Promise.all([social.friendIds(viewerId), social.blockedIds(viewerId)]);
      const and = [
        { status: 'scheduled' },
        { endsAt: { $gt: now() } },
        // mine, or a current friend's that is open to friends or names me as an invitee
        { $or: [{ hostId: viewerId }, { hostId: { $in: friendIds }, $or: [{ visibility: 'friends' }, { invitees: viewerId }] }] },
      ];
      if (blockedIds.length) and.push({ hostId: { $nin: blockedIds } });
      if (cursor) {
        const [ms, id] = cursor.split(':');
        const at = new Date(Number(ms));
        and.push({ $or: [{ startsAt: { $gt: at } }, { startsAt: at, _id: { $gt: id } }] });
      }
      const rows = await GameSession.find({ $and: and })
        .sort({ startsAt: 1, _id: 1 })
        .limit(limit + 1)
        .lean();
      const page = rows.slice(0, limit);
      const ctx = await lookups(page);
      const last = page[page.length - 1];
      return {
        items: page.map((s) => summarise(s, viewerId, ctx)),
        nextCursor: rows.length > limit ? `${new Date(last.startsAt).getTime()}:${last._id}` : null,
      };
    },

    async get(viewerId, id) {
      return detail(await loadVisible(viewerId, id), viewerId);
    },

    async update(userId, id, patch) {
      const session = await loadHosted(userId, id);
      if (session.status === 'cancelled') throw new ConflictError('This session was cancelled');
      if (hasEnded(session)) throw new ConflictError('This session has already ended');

      const $set = {};
      for (const key of ['title', 'platform', 'visibility', 'maxPlayers']) if (patch[key] !== undefined) $set[key] = patch[key];
      if (patch.discordInviteUrl !== undefined) $set.discordInviteUrl = patch.discordInviteUrl;
      if (patch.startsAt !== undefined || patch.durationMin !== undefined) {
        const startsAt = new Date(patch.startsAt ?? session.startsAt);
        const moved = patch.startsAt !== undefined && startsAt.getTime() !== new Date(session.startsAt).getTime();
        if (moved && startsAt.getTime() < now().getTime() - START_GRACE_MS) {
          throw new ValidationError('Pick a start time in the future');
        }
        const durationMin = patch.durationMin ?? session.durationMin;
        Object.assign($set, { startsAt, durationMin, endsAt: new Date(startsAt.getTime() + durationMin * MIN_MS) });
      }
      if (patch.inviteeIds !== undefined) {
        await assertInvitable(userId, patch.inviteeIds);
        $set.invitees = patch.inviteeIds;
      }

      const visibility = $set.visibility ?? session.visibility;
      const invitees = $set.invitees ?? session.invitees ?? [];
      const maxPlayers = $set.maxPlayers ?? session.maxPlayers;
      if (visibility === 'invite' && invitees.length === 0) throw new ValidationError('Invite at least one friend');
      // Checked on every update: lowering the limit must still fit everyone who is already invited.
      if (invitees.length + 1 > maxPlayers) throw new ValidationError('There are more invitations than player slots');

      const filter = { _id: id, hostId: userId, status: 'scheduled' };
      if ($set.maxPlayers !== undefined) {
        await ensureGoingCount(session);
        const going = (await Rsvp.countDocuments({ sessionId: id, response: 'going' })) + 1;
        if (going > maxPlayers) throw new ConflictError(`${going} players are already going; you can't lower the limit below that`);
        // The same rule again, atomically: the write only applies if nobody took a seat in the meantime.
        filter.goingCount = { $lte: maxPlayers - 1 };
      }

      const updated = await GameSession.findOneAndUpdate(filter, { $set }, { returnDocument: 'after' });
      if (!updated) throw new ConflictError('This session was changed elsewhere. Refresh and try again.');
      eventBus?.emit('session.updated', { userId: String(userId), sessionId: String(id), at: now() });
      return detail(updated, userId);
    },

    async cancel(userId, id) {
      const session = await loadHosted(userId, id);
      if (session.status === 'cancelled') throw new ConflictError('This session is already cancelled');
      const updated = await GameSession.findOneAndUpdate(
        { _id: id, hostId: userId, status: 'scheduled' },
        { $set: { status: 'cancelled', cancelledAt: now() } },
        { returnDocument: 'after' },
      );
      if (!updated) throw new ConflictError('This session was changed elsewhere. Refresh and try again.');
      eventBus?.emit('session.cancelled', { userId: String(userId), sessionId: String(id), at: now() });
      return detail(updated, userId);
    },

    // RSVP is its own endpoint: it has its own rules (capacity, the host, ended/cancelled sessions).
    async rsvp(userId, id, response) {
      const session = await loadVisible(userId, id);
      if (String(session.hostId) === String(userId)) throw new ConflictError('You are hosting this session, so you are always going');
      if (session.status === 'cancelled') throw new ConflictError('This session was cancelled');
      if (hasEnded(session)) throw new ConflictError('This session has already ended');

      const was = (await Rsvp.findOne({ sessionId: id, userId }).lean())?.response;

      // Taking a seat is one conditional update on the counter (pinned to the max we read, so a
      // concurrent change of the limit makes this fail instead of oversubscribing).
      let reserved = false;
      if (response === 'going' && was !== 'going') {
        await ensureGoingCount(session);
        const seat = await GameSession.findOneAndUpdate(
          { _id: id, status: 'scheduled', maxPlayers: session.maxPlayers, goingCount: { $lt: session.maxPlayers - 1 } },
          { $inc: { goingCount: 1 } },
          { returnDocument: 'after' },
        );
        if (!seat) throw new ConflictError('This session is full');
        reserved = true;
      }
      try {
        await Rsvp.findOneAndUpdate({ sessionId: id, userId }, { $set: { response } }, { upsert: true, returnDocument: 'after' });
      } catch (err) {
        if (reserved) await GameSession.updateOne({ _id: id }, { $inc: { goingCount: -1 } }); // give the seat back
        throw err;
      }
      if (was === 'going' && response !== 'going') await GameSession.updateOne({ _id: id }, { $inc: { goingCount: -1 } });
      eventBus?.emit('session.rsvp', { userId: String(userId), sessionId: String(id), response, at: now() });
      return detail(session, userId);
    },

    // The calendar file, in UTC. Anyone who can see the session can download it.
    async ics(viewerId, id) {
      const session = await loadVisible(viewerId, id);
      const [host, game] = await Promise.all([User.findOne({ _id: session.hostId }).lean(), Game.findOne({ _id: session.gameId }).lean()]);
      return { filename: `gamequest-session-${session._id}.ics`, body: buildIcs({ session, host, game, now: now() }) };
    },
  };
}

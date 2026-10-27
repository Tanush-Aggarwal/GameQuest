import request from 'supertest';
import { jest } from '@jest/globals';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { createFriendService } from '../services/friendService.js';
import { createActivityService } from '../services/activityService.js';
import { createSessionService } from '../services/sessionService.js';
import { createEventBus } from '../events/eventBus.js';
import { registerSubscribers } from '../events/subscribers.js';
import { buildIcs, escapeText, foldLine, formatUtc } from '../utils/ics.js';
import { createFakeCollection, createFakeModels, logger, testConfig } from './helpers.js';

const NOW = new Date('2026-10-27T12:00:00Z');
const at = (hoursFromNow) => new Date(NOW.getTime() + hoursFromNow * 3_600_000).toISOString();

function setup({ subscribe = true } = {}) {
  const models = createFakeModels();
  const config = testConfig();
  const authService = createAuthService({ ...models, config, bcryptRounds: 4, reuseGraceMs: 0 });
  const { User } = models;
  const Friendship = createFakeCollection({ unique: [['userA', 'userB']] });
  const Block = createFakeCollection({ unique: [['blockerId', 'blockedId']] });
  const Game = createFakeCollection();
  const GameSession = createFakeCollection({ defaults: { invitees: [], status: 'scheduled', title: '', platform: '', discordInviteUrl: null, goingCount: 0 } });
  const Rsvp = createFakeCollection({ unique: [['sessionId', 'userId']] });
  const Activity = createFakeCollection();
  const LibraryEntry = createFakeCollection();
  const Collection = createFakeCollection();
  const eventBus = createEventBus({ logger: { error: jest.fn() } });
  const clock = { now: NOW };

  const friendService = createFriendService({ Friendship, Block, User, eventBus });
  const sessionService = createSessionService({ GameSession, Rsvp, Game, User, social: friendService, eventBus, now: () => clock.now });
  const activityService = createActivityService({ Activity, LibraryEntry, Game, User, Collection, GameSession, social: friendService, logger });
  if (subscribe) registerSubscribers({ eventBus, activityService });

  const mkUser = async (name) => (await authService.register({ username: name, email: `${name}@example.com`, password: 'correct-horse-9' })).user;
  const befriend = async (a, b) => {
    const { friendshipId } = await friendService.sendRequest(a.id, { username: b.username });
    await friendService.accept(b.id, friendshipId);
  };
  const game = Game.create({ title: 'Hades', slug: 'hades', genres: [], platforms: [], cover: 'hades.jpg', backdrop: 'hades-backdrop.jpg' });
  const tick = () => new Promise((r) => setImmediate(r));
  const input = async (over = {}) => ({
    gameId: (await game)._id,
    title: '',
    startsAt: at(48),
    durationMin: 120,
    platform: 'PC',
    maxPlayers: 4,
    visibility: 'friends',
    inviteeIds: [],
    ...over,
  });
  return {
    config, authService, eventBus, clock, models, User, Friendship, Block, Game, GameSession, Rsvp, Activity,
    friendService, sessionService, activityService, mkUser, befriend, tick, input, game,
  };
}

describe('ics builder', () => {
  const session = {
    _id: 'abc123',
    title: 'Co-op; night, "late"\nbring snacks',
    startsAt: '2026-10-29T18:30:00Z',
    endsAt: '2026-10-29T20:30:00Z',
    platform: 'PC',
    status: 'scheduled',
    discordInviteUrl: 'https://discord.gg/abc',
  };

  it('formats UTC times as YYYYMMDDTHHMMSSZ', () => {
    expect(formatUtc('2026-01-05T03:04:05.999Z')).toBe('20260105T030405Z');
  });

  it('produces a CRLF calendar with UID, DTSTAMP, UTC start/end and the required wrappers', () => {
    const ics = buildIcs({ session, host: { username: 'alex' }, game: { title: 'Hades' }, now: new Date('2026-10-27T12:00:00Z') });
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toEqual(expect.arrayContaining(['VERSION:2.0', 'BEGIN:VEVENT', 'UID:abc123@gamequest', 'DTSTAMP:20261027T120000Z', 'DTSTART:20261029T183000Z', 'DTEND:20261029T203000Z', 'STATUS:CONFIRMED', 'END:VEVENT']));
    expect(lines.at(-2)).toBe('END:VCALENDAR');
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('escapes text so a title cannot inject calendar properties', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const evil = buildIcs({ session: { ...session, title: 'x\r\nBEGIN:VEVENT\r\nSTATUS:CANCELLED' }, host: null, game: null, now: NOW });
    // structure: exactly one event and one STATUS line; the injected text stays inside SUMMARY as escaped text
    const lines = evil.split('\r\n');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(lines.filter((l) => l.startsWith('STATUS:'))).toEqual(['STATUS:CONFIRMED']);
    expect(evil).toContain('SUMMARY:x\\nBEGIN:VEVENT\\nSTATUS:CANCELLED');
  });

  it('folds long lines at 75 octets without splitting multi-byte characters', () => {
    const folded = foldLine(`SUMMARY:${'é'.repeat(100)}`);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(parts.join('').replace(/ /g, '')).toBe(`SUMMARY:${'é'.repeat(100)}`);
  });

  it('marks cancelled sessions as CANCELLED', () => {
    expect(buildIcs({ session: { ...session, status: 'cancelled' }, now: NOW })).toContain('STATUS:CANCELLED');
  });
});

describe('sessionService — create and visibility', () => {
  async function world() {
    const ctx = setup();
    const [alex, demo, zed, pal] = [await ctx.mkUser('alex'), await ctx.mkUser('demo'), await ctx.mkUser('zed'), await ctx.mkUser('pal')];
    await ctx.befriend(alex, demo);
    await ctx.befriend(alex, pal);
    return { ...ctx, alex, demo, zed, pal };
  }

  it('creates a session, stores UTC times and lists the host as the first attendee', async () => {
    const ctx = await world();
    const s = await ctx.sessionService.create(ctx.alex.id, await ctx.input({ title: 'Co-op night', discordInviteUrl: 'https://discord.gg/abc' }));
    expect(s).toMatchObject({
      title: 'Co-op night',
      startsAt: at(48),
      endsAt: at(50),
      durationMin: 120,
      isHost: true,
      myResponse: 'host',
      status: 'scheduled',
      discordInviteUrl: 'https://discord.gg/abc',
      game: { slug: 'hades', cover: 'hades.jpg', backdrop: 'hades-backdrop.jpg' }, // art for the session page
      counts: { going: 1, maybe: 0, spotsLeft: 3 },
    });
    expect(s.attendees[0]).toMatchObject({ role: 'host', response: 'going', user: { username: 'alex' } });
    expect(ctx.GameSession.docs[0].hostId).toBe(ctx.alex.id);
  });

  it('falls back to “Playing <game>” when no title is given', async () => {
    const ctx = await world();
    expect((await ctx.sessionService.create(ctx.alex.id, await ctx.input())).title).toBe('Playing Hades');
  });

  it('rejects an unknown game, a start time in the past, and bad invitations', async () => {
    const ctx = await world();
    await expect(ctx.sessionService.create(ctx.alex.id, await ctx.input({ gameId: '9'.repeat(24) }))).rejects.toMatchObject({ status: 404 });
    await expect(ctx.sessionService.create(ctx.alex.id, await ctx.input({ startsAt: at(-2) }))).rejects.toMatchObject({ status: 400 });
    // zed is not a friend of alex
    await expect(ctx.sessionService.create(ctx.alex.id, await ctx.input({ inviteeIds: [ctx.zed.id] }))).rejects.toMatchObject({ status: 400 });
    // invite-only needs somebody invited, and the invitations must fit the player slots
    await expect(ctx.sessionService.create(ctx.alex.id, await ctx.input({ visibility: 'invite', inviteeIds: [] }))).rejects.toMatchObject({ status: 400 });
    await expect(ctx.sessionService.create(ctx.alex.id, await ctx.input({ maxPlayers: 2, inviteeIds: [ctx.demo.id, ctx.pal.id] }))).rejects.toMatchObject({ status: 400 });
    expect(ctx.GameSession.docs).toHaveLength(0);
  });

  it('friends sessions are visible to the host’s friends only', async () => {
    const ctx = await world();
    const s = await ctx.sessionService.create(ctx.alex.id, await ctx.input());
    expect((await ctx.sessionService.get(ctx.demo.id, s.id)).isHost).toBe(false);
    await expect(ctx.sessionService.get(ctx.zed.id, s.id)).rejects.toMatchObject({ status: 404 });
  });

  it('invite-only sessions are visible to invitees only, even among friends', async () => {
    const ctx = await world();
    const s = await ctx.sessionService.create(ctx.alex.id, await ctx.input({ visibility: 'invite', inviteeIds: [ctx.demo.id] }));
    expect((await ctx.sessionService.get(ctx.demo.id, s.id)).myResponse).toBe('invited');
    await expect(ctx.sessionService.get(ctx.pal.id, s.id)).rejects.toMatchObject({ status: 404 }); // a friend, but not invited
    await expect(ctx.sessionService.ics(ctx.pal.id, s.id)).rejects.toMatchObject({ status: 404 });
  });

  it('a block hides the session both ways, even from an invitee', async () => {
    const ctx = await world();
    const s = await ctx.sessionService.create(ctx.alex.id, await ctx.input({ inviteeIds: [ctx.demo.id] }));
    await ctx.friendService.block(ctx.demo.id, ctx.alex.id);
    await expect(ctx.sessionService.get(ctx.demo.id, s.id)).rejects.toMatchObject({ status: 404 });
    await expect(ctx.sessionService.rsvp(ctx.demo.id, s.id, 'going')).rejects.toMatchObject({ status: 404 });
    expect((await ctx.sessionService.listUpcoming(ctx.demo.id)).items).toEqual([]);
  });

  it('emits session.created', async () => {
    const ctx = await world();
    const seen = [];
    ctx.eventBus.on('session.created', (e) => seen.push(e));
    const s = await ctx.sessionService.create(ctx.alex.id, await ctx.input({ visibility: 'invite', inviteeIds: [ctx.demo.id] }));
    await ctx.tick();
    expect(seen).toEqual([expect.objectContaining({ userId: ctx.alex.id, sessionId: s.id, visibility: 'invite', inviteeIds: [ctx.demo.id] })]);
  });
});

describe('sessionService — listing', () => {
  async function world() {
    const ctx = setup();
    const [alex, demo, zed] = [await ctx.mkUser('alex'), await ctx.mkUser('demo'), await ctx.mkUser('zed')];
    await ctx.befriend(alex, demo);
    return { ...ctx, alex, demo, zed };
  }

  it('lists mine, friends’ and ones I’m invited to — soonest first — and nothing else', async () => {
    const ctx = await world();
    const friends = await ctx.sessionService.create(ctx.alex.id, await ctx.input({ title: 'friends', startsAt: at(30) }));
    await ctx.sessionService.create(ctx.alex.id, await ctx.input({ title: 'invite-only (not me)', visibility: 'invite', inviteeIds: [], startsAt: at(31) }).catch(async () => ({}))).catch(() => {});
    const mine = await ctx.sessionService.create(ctx.demo.id, await ctx.input({ title: 'mine', startsAt: at(10) }));
    await ctx.sessionService.create(ctx.zed.id, await ctx.input({ title: 'stranger', startsAt: at(5) }));
    const list = await ctx.sessionService.listUpcoming(ctx.demo.id);
    expect(list.items.map((s) => s.title)).toEqual(['mine', 'friends']);
    expect(list.items[0].id).toBe(mine.id);
    expect(list.items[1].id).toBe(friends.id);
    expect((await ctx.sessionService.listUpcoming(ctx.zed.id)).items.map((s) => s.title)).toEqual(['stranger']);
  });

  it('includes invite-only sessions for invitees and hides them from other friends', async () => {
    const ctx = await world();
    const pal = await ctx.mkUser('pal');
    await ctx.befriend(ctx.alex, pal);
    await ctx.sessionService.create(ctx.alex.id, await ctx.input({ title: 'secret', visibility: 'invite', inviteeIds: [ctx.demo.id] }));
    expect((await ctx.sessionService.listUpcoming(ctx.demo.id)).items.map((s) => s.title)).toEqual(['secret']);
    expect((await ctx.sessionService.listUpcoming(pal.id)).items).toEqual([]);
  });

  it('hides sessions that ended or were cancelled', async () => {
    const ctx = await world();
    const soon = await ctx.sessionService.create(ctx.alex.id, await ctx.input({ title: 'soon', startsAt: at(1), durationMin: 60 }));
    const doomed = await ctx.sessionService.create(ctx.alex.id, await ctx.input({ title: 'doomed', startsAt: at(5) }));
    await ctx.sessionService.cancel(ctx.alex.id, doomed.id);
    expect((await ctx.sessionService.listUpcoming(ctx.demo.id)).items.map((s) => s.title)).toEqual(['soon']);
    ctx.clock.now = new Date(NOW.getTime() + 3 * 3_600_000); // after "soon" ended
    expect((await ctx.sessionService.listUpcoming(ctx.demo.id)).items).toEqual([]);
    expect((await ctx.sessionService.get(ctx.demo.id, soon.id)).ended).toBe(true);
  });

  it('pages with a cursor and keeps sessions that start at the same moment in a stable order', async () => {
    const ctx = await world();
    for (const title of ['a', 'b', 'c']) await ctx.sessionService.create(ctx.alex.id, await ctx.input({ title, startsAt: at(24) }));
    await ctx.sessionService.create(ctx.alex.id, await ctx.input({ title: 'd', startsAt: at(26) }));
    const p1 = await ctx.sessionService.listUpcoming(ctx.demo.id, { limit: 2 });
    expect(p1.items.map((s) => s.title)).toEqual(['a', 'b']);
    const p2 = await ctx.sessionService.listUpcoming(ctx.demo.id, { limit: 2, cursor: p1.nextCursor });
    expect(p2.items.map((s) => s.title)).toEqual(['c', 'd']);
    expect(p2.nextCursor).toBeNull();
  });
});

describe('sessionService — RSVP', () => {
  async function world(over = {}) {
    const ctx = setup();
    const [alex, demo, pal, zed] = [await ctx.mkUser('alex'), await ctx.mkUser('demo'), await ctx.mkUser('pal'), await ctx.mkUser('zed')];
    await ctx.befriend(alex, demo);
    await ctx.befriend(alex, pal);
    const session = await ctx.sessionService.create(alex.id, await ctx.input({ inviteeIds: [demo.id], ...over }));
    return { ...ctx, alex, demo, pal, zed, session };
  }

  it('records a response, updates counts and attendees, and replaces an earlier answer', async () => {
    const ctx = await world();
    const going = await ctx.sessionService.rsvp(ctx.demo.id, ctx.session.id, 'going');
    expect(going).toMatchObject({ myResponse: 'going', counts: { going: 2, maybe: 0, spotsLeft: 2 } });
    const maybe = await ctx.sessionService.rsvp(ctx.demo.id, ctx.session.id, 'maybe');
    expect(maybe).toMatchObject({ myResponse: 'maybe', counts: { going: 1, maybe: 1 } });
    expect(ctx.Rsvp.docs).toHaveLength(1); // one answer per person
    expect(maybe.attendees.find((a) => a.user.username === 'demo')).toMatchObject({ response: 'maybe', role: 'invitee' });
  });

  it('shows invitees who have not answered as invited, and non-invited friends who join as guests', async () => {
    const ctx = await world();
    const before = await ctx.sessionService.get(ctx.alex.id, ctx.session.id);
    expect(before.attendees.map((a) => [a.user.username, a.response])).toEqual([['alex', 'going'], ['demo', 'invited']]);
    await ctx.sessionService.rsvp(ctx.pal.id, ctx.session.id, 'going');
    const after = await ctx.sessionService.get(ctx.alex.id, ctx.session.id);
    expect(after.attendees.find((a) => a.user.username === 'pal')).toMatchObject({ response: 'going', role: 'guest' });
  });

  it('refuses when the session is full, but lets an existing "going" stay going', async () => {
    const ctx = await world({ maxPlayers: 3 }); // host + 2
    await ctx.sessionService.rsvp(ctx.demo.id, ctx.session.id, 'going');
    await ctx.sessionService.rsvp(ctx.pal.id, ctx.session.id, 'going');
    const third = await ctx.mkUser('third');
    await ctx.befriend(ctx.alex, third);
    await expect(ctx.sessionService.rsvp(third.id, ctx.session.id, 'going')).rejects.toMatchObject({ status: 409, message: 'This session is full' });
    expect((await ctx.sessionService.rsvp(third.id, ctx.session.id, 'maybe')).myResponse).toBe('maybe'); // maybe still allowed
    expect((await ctx.sessionService.rsvp(ctx.demo.id, ctx.session.id, 'going')).myResponse).toBe('going'); // re-confirming is fine
    await ctx.sessionService.rsvp(ctx.pal.id, ctx.session.id, 'declined'); // frees a spot
    expect((await ctx.sessionService.rsvp(third.id, ctx.session.id, 'going')).myResponse).toBe('going');
  });

  it('the host cannot RSVP, strangers cannot see it, and invite-only keeps non-invitees out', async () => {
    const ctx = await world();
    await expect(ctx.sessionService.rsvp(ctx.alex.id, ctx.session.id, 'declined')).rejects.toMatchObject({ status: 409 });
    await expect(ctx.sessionService.rsvp(ctx.zed.id, ctx.session.id, 'going')).rejects.toMatchObject({ status: 404 });
    const secret = await ctx.sessionService.create(ctx.alex.id, await ctx.input({ visibility: 'invite', inviteeIds: [ctx.demo.id] }));
    await expect(ctx.sessionService.rsvp(ctx.pal.id, secret.id, 'going')).rejects.toMatchObject({ status: 404 });
  });

  it('closes RSVPs once the session is cancelled or has ended', async () => {
    const ctx = await world();
    ctx.clock.now = new Date(NOW.getTime() + 49 * 3_600_000); // inside the session
    expect((await ctx.sessionService.rsvp(ctx.demo.id, ctx.session.id, 'going')).myResponse).toBe('going'); // in progress: still open
    ctx.clock.now = new Date(NOW.getTime() + 51 * 3_600_000);
    await expect(ctx.sessionService.rsvp(ctx.demo.id, ctx.session.id, 'maybe')).rejects.toMatchObject({ status: 409 });
    const other = await ctx.sessionService.create(ctx.alex.id, await ctx.input({ startsAt: at(100) }));
    await ctx.sessionService.cancel(ctx.alex.id, other.id);
    await expect(ctx.sessionService.rsvp(ctx.demo.id, other.id, 'going')).rejects.toMatchObject({ status: 409 });
  });

  it('emits session.rsvp', async () => {
    const ctx = await world();
    const seen = [];
    ctx.eventBus.on('session.rsvp', (e) => seen.push(e.response));
    await ctx.sessionService.rsvp(ctx.demo.id, ctx.session.id, 'going');
    await ctx.tick();
    expect(seen).toEqual(['going']);
  });
});

describe('sessionService — update, cancel and calendar', () => {
  async function world() {
    const ctx = setup();
    const [alex, demo, zed] = [await ctx.mkUser('alex'), await ctx.mkUser('demo'), await ctx.mkUser('zed')];
    await ctx.befriend(alex, demo);
    const session = await ctx.sessionService.create(alex.id, await ctx.input({ title: 'Original' }));
    return { ...ctx, alex, demo, zed, session };
  }

  it('only the host can update or cancel: 403 for someone who can see it, 404 for everyone else', async () => {
    const ctx = await world();
    await expect(ctx.sessionService.update(ctx.demo.id, ctx.session.id, { title: 'mine now' })).rejects.toMatchObject({ status: 403 });
    await expect(ctx.sessionService.cancel(ctx.demo.id, ctx.session.id)).rejects.toMatchObject({ status: 403 });
    await expect(ctx.sessionService.update(ctx.zed.id, ctx.session.id, { title: 'x' })).rejects.toMatchObject({ status: 404 });
    await expect(ctx.sessionService.cancel(ctx.zed.id, ctx.session.id)).rejects.toMatchObject({ status: 404 });
    expect(ctx.GameSession.docs[0]).toMatchObject({ title: 'Original', status: 'scheduled' });
  });

  it('updates fields and recomputes the end time from the new start and duration', async () => {
    const ctx = await world();
    const updated = await ctx.sessionService.update(ctx.alex.id, ctx.session.id, { title: 'Renamed', startsAt: at(72), durationMin: 60, platform: 'Switch' });
    expect(updated).toMatchObject({ customTitle: 'Renamed', startsAt: at(72), endsAt: at(73), durationMin: 60, platform: 'Switch' });
    const longer = await ctx.sessionService.update(ctx.alex.id, ctx.session.id, { durationMin: 180 });
    expect(longer.endsAt).toBe(at(75));
  });

  it('sets and removes the Discord invite', async () => {
    const ctx = await world();
    expect((await ctx.sessionService.update(ctx.alex.id, ctx.session.id, { discordInviteUrl: 'https://discord.gg/abc' })).discordInviteUrl).toBe('https://discord.gg/abc');
    expect((await ctx.sessionService.update(ctx.alex.id, ctx.session.id, { discordInviteUrl: null })).discordInviteUrl).toBeNull();
  });

  it('rejects a past start, strangers as invitees, and lowering the limit below who is going', async () => {
    const ctx = await world();
    await expect(ctx.sessionService.update(ctx.alex.id, ctx.session.id, { startsAt: at(-5) })).rejects.toMatchObject({ status: 400 });
    await expect(ctx.sessionService.update(ctx.alex.id, ctx.session.id, { inviteeIds: [ctx.zed.id] })).rejects.toMatchObject({ status: 400 });
    await expect(ctx.sessionService.update(ctx.alex.id, ctx.session.id, { visibility: 'invite' })).rejects.toMatchObject({ status: 400 }); // nobody invited
    await ctx.sessionService.rsvp(ctx.demo.id, ctx.session.id, 'going');
    await expect(ctx.sessionService.update(ctx.alex.id, ctx.session.id, { maxPlayers: 2 })).resolves.toBeTruthy(); // host + demo = 2, fits
    const third = await ctx.mkUser('third');
    await ctx.befriend(ctx.alex, third);
    await ctx.sessionService.update(ctx.alex.id, ctx.session.id, { maxPlayers: 3 });
    await ctx.sessionService.rsvp(third.id, ctx.session.id, 'going');
    await expect(ctx.sessionService.update(ctx.alex.id, ctx.session.id, { maxPlayers: 2 })).rejects.toMatchObject({ status: 409 });
  });

  it('cancels once, keeps the record, and refuses further changes', async () => {
    const ctx = await world();
    const cancelled = await ctx.sessionService.cancel(ctx.alex.id, ctx.session.id);
    expect(cancelled.status).toBe('cancelled');
    expect(ctx.GameSession.docs).toHaveLength(1); // soft delete: invitees can still see it was cancelled
    expect((await ctx.sessionService.get(ctx.demo.id, ctx.session.id)).status).toBe('cancelled');
    await expect(ctx.sessionService.cancel(ctx.alex.id, ctx.session.id)).rejects.toMatchObject({ status: 409 });
    await expect(ctx.sessionService.update(ctx.alex.id, ctx.session.id, { title: 'x' })).rejects.toMatchObject({ status: 409 });
  });

  it('returns a calendar file for anyone who can see the session', async () => {
    const ctx = await world();
    const { filename, body } = await ctx.sessionService.ics(ctx.demo.id, ctx.session.id);
    expect(filename).toBe(`gamequest-session-${ctx.session.id}.ics`);
    expect(body).toContain(`UID:${ctx.session.id}@gamequest`);
    expect(body).toContain('DTSTART:20261029T120000Z');
    expect(body).toContain('DTEND:20261029T140000Z');
    expect(body).toContain('DTSTAMP:20261027T120000Z');
    expect(body).toContain('SUMMARY:Original');
    await expect(ctx.sessionService.ics(ctx.zed.id, ctx.session.id)).rejects.toMatchObject({ status: 404 });
    await ctx.sessionService.cancel(ctx.alex.id, ctx.session.id);
    expect((await ctx.sessionService.ics(ctx.demo.id, ctx.session.id)).body).toContain('STATUS:CANCELLED');
  });
});


describe('sessionService — capacity, access and attendee privacy', () => {
  async function world(over = {}) {
    const ctx = setup();
    const [alex, a, b, c, zed] = [await ctx.mkUser('alex'), await ctx.mkUser('ann'), await ctx.mkUser('bob'), await ctx.mkUser('cat'), await ctx.mkUser('zed')];
    for (const u of [a, b, c]) await ctx.befriend(alex, u);
    const session = await ctx.sessionService.create(alex.id, await ctx.input({ maxPlayers: 2, ...over })); // host + one seat
    return { ...ctx, alex, a, b, c, zed, session };
  }

  it('never oversubscribes when several people take the last seat at once', async () => {
    const ctx = await world();
    const results = await Promise.allSettled([ctx.a, ctx.b, ctx.c].map((u) => ctx.sessionService.rsvp(u.id, ctx.session.id, 'going')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected').every((r) => r.reason.status === 409)).toBe(true);
    expect(ctx.Rsvp.docs.filter((r) => r.response === 'going')).toHaveLength(1);
    expect(ctx.GameSession.docs[0].goingCount).toBe(1);
  });

  it('keeps the counter right when people leave and re-join', async () => {
    const ctx = await world({ maxPlayers: 3 });
    await ctx.sessionService.rsvp(ctx.a.id, ctx.session.id, 'going');
    await ctx.sessionService.rsvp(ctx.b.id, ctx.session.id, 'going');
    await expect(ctx.sessionService.rsvp(ctx.c.id, ctx.session.id, 'going')).rejects.toMatchObject({ status: 409 });
    await ctx.sessionService.rsvp(ctx.a.id, ctx.session.id, 'maybe');
    expect(ctx.GameSession.docs[0].goingCount).toBe(1);
    await ctx.sessionService.rsvp(ctx.a.id, ctx.session.id, 'going'); // 1 → 2, within the limit
    expect(ctx.GameSession.docs[0].goingCount).toBe(2);
    await ctx.sessionService.rsvp(ctx.a.id, ctx.session.id, 'going'); // already going: no second seat
    expect(ctx.GameSession.docs[0].goingCount).toBe(2);
  });

  it('fills in the counter for a session that predates it', async () => {
    const ctx = await world({ maxPlayers: 3 });
    await ctx.sessionService.rsvp(ctx.a.id, ctx.session.id, 'going');
    delete ctx.GameSession.docs[0].goingCount; // as if created before the counter existed
    await ctx.sessionService.rsvp(ctx.b.id, ctx.session.id, 'going');
    expect(ctx.GameSession.docs[0].goingCount).toBe(2);
    await expect(ctx.sessionService.rsvp(ctx.c.id, ctx.session.id, 'going')).rejects.toMatchObject({ status: 409 });
  });

  it('refuses to lower the limit below who is going, atomically', async () => {
    const ctx = await world({ maxPlayers: 4 });
    await ctx.sessionService.rsvp(ctx.a.id, ctx.session.id, 'going');
    await ctx.sessionService.rsvp(ctx.b.id, ctx.session.id, 'going');
    await expect(ctx.sessionService.update(ctx.alex.id, ctx.session.id, { maxPlayers: 2 })).rejects.toMatchObject({ status: 409 });
    expect((await ctx.sessionService.update(ctx.alex.id, ctx.session.id, { maxPlayers: 3 })).maxPlayers).toBe(3);
  });

  it('checks invitations against the limit on every update, not only when invitees change', async () => {
    const ctx = await world({ maxPlayers: 4, inviteeIds: undefined });
    const invited = await ctx.sessionService.create(ctx.alex.id, await ctx.input({ maxPlayers: 4, inviteeIds: [ctx.a.id, ctx.b.id, ctx.c.id] }));
    await expect(ctx.sessionService.update(ctx.alex.id, invited.id, { maxPlayers: 3 })).rejects.toMatchObject({ status: 400 });
  });

  it('an invitation or friends-session access ends when the host unfriends you', async () => {
    const ctx = await world({ maxPlayers: 4 });
    const secret = await ctx.sessionService.create(ctx.alex.id, await ctx.input({ visibility: 'invite', inviteeIds: [ctx.a.id] }));
    expect((await ctx.sessionService.get(ctx.a.id, secret.id)).myResponse).toBe('invited');
    expect((await ctx.sessionService.listUpcoming(ctx.a.id)).items.map((s) => s.id)).toContain(secret.id);
    await ctx.friendService.unfriend(ctx.alex.id, ctx.a.id);
    await expect(ctx.sessionService.get(ctx.a.id, secret.id)).rejects.toMatchObject({ status: 404 });
    await expect(ctx.sessionService.rsvp(ctx.a.id, secret.id, 'going')).rejects.toMatchObject({ status: 404 });
    await expect(ctx.sessionService.get(ctx.a.id, ctx.session.id)).rejects.toMatchObject({ status: 404 });
    expect((await ctx.sessionService.listUpcoming(ctx.a.id)).items).toEqual([]);
  });

  it('hides people on either side of a block from the attendee list', async () => {
    const ctx = await world({ maxPlayers: 5 });
    await ctx.befriend(ctx.a, ctx.b);
    await ctx.sessionService.rsvp(ctx.a.id, ctx.session.id, 'going');
    await ctx.sessionService.rsvp(ctx.b.id, ctx.session.id, 'maybe');
    await ctx.friendService.block(ctx.b.id, ctx.a.id); // bob blocks ann (this also ends their friendship)
    const names = async (viewer) => (await ctx.sessionService.get(viewer.id, ctx.session.id)).attendees.map((x) => x.user.username).sort();
    expect(await names(ctx.a)).toEqual(['alex', 'ann']); // ann can't see bob
    expect(await names(ctx.b)).toEqual(['alex', 'bob']); // bob can't see ann
    expect(await names(ctx.alex)).toEqual(['alex', 'ann', 'bob']); // the host sees everyone
  });

  it('shows guests who are not the viewer’s friends only as a number', async () => {
    const ctx = await world({ maxPlayers: 5 });
    await ctx.sessionService.rsvp(ctx.a.id, ctx.session.id, 'going');
    await ctx.sessionService.rsvp(ctx.b.id, ctx.session.id, 'going');
    const forAnn = await ctx.sessionService.get(ctx.a.id, ctx.session.id);
    expect(forAnn.attendees.map((x) => x.user.username).sort()).toEqual(['alex', 'ann']); // bob is alex's friend, not ann's
    expect(forAnn.counts.going).toBe(3); // but he still counts
    await ctx.befriend(ctx.a, ctx.b);
    expect((await ctx.sessionService.get(ctx.a.id, ctx.session.id)).attendees.map((x) => x.user.username)).toContain('bob');
  });
});
describe('sessions in the activity feed', () => {
  async function world() {
    const ctx = setup();
    const [alex, demo] = [await ctx.mkUser('alex'), await ctx.mkUser('demo')];
    await ctx.befriend(alex, demo);
    return { ...ctx, alex, demo };
  }

  it('a friends session shows up for friends; cancelling it removes it', async () => {
    const ctx = await world();
    const s = await ctx.sessionService.create(ctx.alex.id, await ctx.input({ title: 'Co-op night' }));
    await ctx.tick();
    const feed = await ctx.activityService.feed(ctx.demo.id);
    expect(feed.items).toEqual([expect.objectContaining({ type: 'session.created', actor: { id: ctx.alex.id, username: 'alex' }, data: expect.objectContaining({ sessionId: s.id, title: 'Co-op night' }) })]);
    await ctx.sessionService.cancel(ctx.alex.id, s.id);
    expect((await ctx.activityService.feed(ctx.demo.id)).items).toEqual([]);
  });

  it('an invite-only session leaves no activity', async () => {
    const ctx = await world();
    await ctx.sessionService.create(ctx.alex.id, await ctx.input({ visibility: 'invite', inviteeIds: [ctx.demo.id] }));
    await ctx.tick();
    expect(ctx.Activity.docs).toHaveLength(0);
  });
});

describe('/api/v1/sessions', () => {
  function setupApp() {
    const ctx = setup({ subscribe: false });
    const app = createApp({
      config: ctx.config,
      logger,
      authService: ctx.authService,
      eventBus: ctx.eventBus,
      friendService: ctx.friendService,
      sessionService: ctx.sessionService,
      activityService: ctx.activityService,
    });
    return { app, ...ctx };
  }
  const login = async (app, name) => {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/register').send({ username: name, email: `${name}@example.com`, password: 'correct-horse-9' });
    return { agent, id: res.body.user.id };
  };
  // The route layer checks the start time against the real clock, so API tests use real-future dates.
  const future = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();

  it('requires authentication', async () => {
    const { app } = setupApp();
    for (const [method, url] of [['get', '/api/v1/sessions'], ['post', '/api/v1/sessions'], ['get', `/api/v1/sessions/${'1'.repeat(24)}`], ['get', `/api/v1/sessions/${'1'.repeat(24)}/ics`], ['put', `/api/v1/sessions/${'1'.repeat(24)}/rsvp`]]) {
      expect((await request(app)[method](url)).status).toBe(401);
    }
  });

  it('validates input with the shared schemas', async () => {
    const ctx = setupApp();
    const { agent } = await login(ctx.app, 'alex');
    const gameId = (await ctx.game)._id;
    const post = (body) => agent.post('/api/v1/sessions').send({ gameId, startsAt: future(24), ...body });
    expect((await post({ gameId: 'nope' })).status).toBe(400);
    expect((await post({ startsAt: 'tomorrow evening' })).status).toBe(400);
    expect((await post({ visibility: 'public' })).status).toBe(400);
    expect((await post({ durationMin: 5 })).status).toBe(400);
    expect((await post({ maxPlayers: 1 })).status).toBe(400);
    expect((await post({ visibility: 'invite' })).status).toBe(400); // nobody invited
    for (const url of ['https://evil.example/discord.gg/abc', 'https://discord.gg.evil.example/abc', 'javascript:alert(1)', 'https://discord.com/channels/1/2']) {
      const res = await post({ discordInviteUrl: url });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.error.details)).toContain('discord');
    }
    expect((await agent.put(`/api/v1/sessions/${'1'.repeat(24)}/rsvp`).send({ response: 'definitely' })).status).toBe(400);
    expect((await agent.get('/api/v1/sessions?cursor=garbage')).status).toBe(400);
    expect((await agent.get('/api/v1/sessions/not-an-id')).status).toBe(400);
  });

  it('normalises Discord invites and drops a blank one', async () => {
    const ctx = setupApp();
    const { agent } = await login(ctx.app, 'alex');
    const gameId = (await ctx.game)._id;
    const a = await agent.post('/api/v1/sessions').send({ gameId, startsAt: future(24), discordInviteUrl: 'discord.gg/AbC-1' });
    expect(a.body.session.discordInviteUrl).toBe('https://discord.gg/AbC-1');
    const b = await agent.post('/api/v1/sessions').send({ gameId, startsAt: future(25), discordInviteUrl: '' });
    expect(b.body.session.discordInviteUrl).toBeNull();
  });

  it('runs create → list → rsvp → ics → update → cancel', async () => {
    const ctx = setupApp();
    const alex = await login(ctx.app, 'alex');
    const demo = await login(ctx.app, 'demo');
    await ctx.friendService.sendRequest(alex.id, { username: 'demo' }).then((r) => ctx.friendService.accept(demo.id, r.friendshipId));
    const gameId = (await ctx.game)._id;

    const created = await alex.agent.post('/api/v1/sessions').send({ gameId, title: 'Co-op', startsAt: future(30), inviteeIds: [demo.id], maxPlayers: 3 });
    expect(created.status).toBe(201);
    const id = created.body.session.id;

    const list = await demo.agent.get('/api/v1/sessions');
    expect(list.body.items.map((s) => s.id)).toEqual([id]);
    expect(list.body.items[0]).toMatchObject({ myResponse: 'invited', host: { username: 'alex' } });

    const rsvp = await demo.agent.put(`/api/v1/sessions/${id}/rsvp`).send({ response: 'going' });
    expect(rsvp.status).toBe(200);
    expect(rsvp.body.session).toMatchObject({ myResponse: 'going', counts: { going: 2 } });

    const ics = await demo.agent.get(`/api/v1/sessions/${id}/ics`);
    expect(ics.status).toBe(200);
    expect(ics.headers['content-type']).toMatch(/^text\/calendar/);
    expect(ics.headers['content-disposition']).toContain(`gamequest-session-${id}.ics`);
    expect(ics.text).toContain('BEGIN:VCALENDAR');
    expect(ics.text).toContain(`UID:${id}@gamequest`);
    expect(ics.text).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);

    expect((await demo.agent.patch(`/api/v1/sessions/${id}`).send({ title: 'hijack' })).status).toBe(403);
    expect((await alex.agent.patch(`/api/v1/sessions/${id}`).send({ title: 'Renamed' })).body.session.customTitle).toBe('Renamed');
    expect((await demo.agent.post(`/api/v1/sessions/${id}/cancel`)).status).toBe(403);
    expect((await alex.agent.post(`/api/v1/sessions/${id}/cancel`)).body.session.status).toBe('cancelled');
    expect((await demo.agent.get('/api/v1/sessions')).body.items).toEqual([]);
  });

  it('never trusts a host from the body, and hides sessions from strangers', async () => {
    const ctx = setupApp();
    const alex = await login(ctx.app, 'alex');
    const zed = await login(ctx.app, 'zed');
    const gameId = (await ctx.game)._id;
    const res = await alex.agent.post('/api/v1/sessions').send({ gameId, startsAt: future(24), hostId: zed.id });
    expect(res.status).toBe(201);
    expect(ctx.GameSession.docs[0].hostId).toBe(alex.id);
    expect((await zed.agent.get(`/api/v1/sessions/${res.body.session.id}`)).status).toBe(404);
    expect((await zed.agent.get(`/api/v1/sessions/${res.body.session.id}/ics`)).status).toBe(404);
  });
});

import { isCatalogGame, normaliseGame } from '../adapters/content/igdb.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

const PLATFORM = 'Steam';

// New entries only; an existing entry's status is never touched by a sync.
// playing wins over completed, as in the brief: recent play means the user is still in it.
export function initialStatus({ playtime2wMin, achievements }) {
  if (playtime2wMin > 0) return 'playing';
  if (achievements?.total > 0 && achievements.unlocked === achievements.total) return 'completed';
  return 'backlog';
}

const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

// Pulls a linked user's Steam library into their one-entry-per-game library.
// Rules: manualProgress and the status of existing entries are never overwritten; synced data
// lives on ownerships[] (playtime) and achievements. Only the injected adapters call Steam/IGDB.
export function createSteamSyncService({
  User,
  Game,
  LibraryEntry,
  StatusHistory,
  steam,
  igdb,
  importGame, // (normalisedGame) -> stored Game; the catalog importer's upsert
  fillArt, // optional (game) -> Promise; Steam CDN art for games missing a cover/backdrop
  eventBus,
  logger,
  now = () => new Date(),
}) {
  const running = new Set(); // per-process lock: one sync per user at a time

  // Match owned appids to Game documents; unknown ones are looked up in IGDB and imported.
  async function matchGames(owned, report) {
    const appids = owned.map((o) => o.appid);
    const stored = [];
    for (const batch of chunk(appids, 1000)) stored.push(...(await Game.find({ 'externalIds.steam': { $in: batch } }).lean()));
    const byApp = new Map(stored.map((g) => [g.externalIds.steam, g]));

    const missing = appids.filter((a) => !byApp.has(a));
    if (missing.length && igdb?.isConfigured?.()) {
      const [lookup] = await Promise.allSettled([igdb.fetchBySteamAppIds(missing)]);
      if (lookup.status === 'rejected') {
        logger?.warn({ err: lookup.reason }, 'sync.steam: IGDB lookup failed; unknown games reported as unmatched');
        report.warnings.push('Some games could not be looked up right now and were left out. Sync again later.');
      } else {
        const resolved = await Promise.allSettled(lookup.value.map((hit) => adopt(hit, byApp)));
        resolved.forEach((r) => {
          if (r.status === 'rejected') logger?.warn({ err: r.reason }, 'sync.steam: could not import a game');
        });
      }
    }
    return byApp;
  }

  // Attach a Steam id to a game we already hold, or import a new catalog game. Never imports DLC/tools.
  async function adopt({ appid, raw }, byApp) {
    if (byApp.has(appid)) return;
    const existing = await Game.findOne({ 'externalIds.igdb': raw.id }).lean();
    if (existing) {
      try {
        await Game.updateOne({ _id: existing._id }, { $set: { 'externalIds.steam': appid } });
        byApp.set(appid, { ...existing, externalIds: { ...existing.externalIds, steam: appid } });
      } catch (err) {
        if (err?.code !== 11000) throw err; // another game already owns that Steam id
      }
      return;
    }
    if (!isCatalogGame(raw)) return; // DLC, soundtrack, tool...: reported, not added
    const [withTimes] = await igdb.withTimeToBeat([normaliseGame(raw)]);
    const game = await importGame({ ...withTimes, externalIds: { ...withTimes.externalIds, steam: appid } });
    if (game) byApp.set(appid, game);
  }

  // Several appids can map to one game (editions, regional SKUs): one entry, summed playtime.
  function groupByGame(owned, byApp, achievementsByApp, report) {
    const groups = new Map();
    for (const o of owned) {
      const game = byApp.get(o.appid);
      if (!game || game.hidden) {
        report.unmatched.push({ appid: o.appid, name: o.name, playtimeMin: o.playtimeMin });
        continue;
      }
      const key = String(game._id);
      const g = groups.get(key) ?? { game, primary: o, playtimeMin: 0, playtime2wMin: 0, lastPlayedAt: null, appids: [] };
      g.playtimeMin += o.playtimeMin;
      g.playtime2wMin += o.playtime2wMin;
      if (o.lastPlayedAt && (!g.lastPlayedAt || o.lastPlayedAt > g.lastPlayedAt)) g.lastPlayedAt = o.lastPlayedAt;
      if (o.playtimeMin > g.primary.playtimeMin) g.primary = o;
      g.appids.push(o.appid);
      groups.set(key, g);
    }
    for (const g of groups.values()) g.achievements = achievementsByApp.get(g.primary.appid) ?? null;
    report.unmatched.sort((a, b) => b.playtimeMin - a.playtimeMin);
    return [...groups.values()];
  }

  const withOwnership = (ownerships, g, at) => {
    const next = (ownerships ?? []).filter((o) => o.platform !== PLATFORM);
    next.push({ platform: PLATFORM, externalId: g.primary.appid, playtimeMin: g.playtimeMin, lastSyncedAt: at });
    return next;
  };

  async function merge(userId, groups, at) {
    const existing = [];
    for (const batch of chunk(groups.map((g) => g.game._id), 1000)) {
      existing.push(...(await LibraryEntry.find({ userId, gameId: { $in: batch } }).lean()));
    }
    const byGame = new Map(existing.map((e) => [String(e.gameId), e]));

    const updates = [];
    const inserts = [];
    for (const g of groups) {
      const entry = byGame.get(String(g.game._id));
      // null = Steam did not answer for this game, so the stored snapshot stays as it was.
      const snapshot = g.achievements ? { unlocked: g.achievements.unlocked, total: g.achievements.total, fetchedAt: at } : null;
      if (entry) {
        const $set = { ownerships: withOwnership(entry.ownerships, g, at) };
        if (snapshot) $set.achievements = snapshot;
        const update = { $set };
        if (g.lastPlayedAt) update.$max = { lastPlayedAt: g.lastPlayedAt };
        updates.push({ updateOne: { filter: { _id: entry._id, userId }, update } });
      } else {
        const status = initialStatus({ playtime2wMin: g.playtime2wMin, achievements: g.achievements });
        inserts.push({
          userId,
          gameId: g.game._id,
          status,
          manualProgress: 0,
          ownerships: withOwnership([], g, at),
          ...(snapshot && { achievements: snapshot }),
          lastPlayedAt: g.lastPlayedAt,
          completedAt: status === 'completed' ? at : null,
        });
      }
    }

    for (const ops of chunk(updates, 500)) await LibraryEntry.bulkWrite(ops, { ordered: false });

    let added = 0;
    let updated = updates.length;
    for (const docs of chunk(inserts, 500)) {
      let created;
      try {
        created = await LibraryEntry.insertMany(docs, { ordered: false });
      } catch (err) {
        // With ordered:false Mongo stores every doc that does not clash and then throws. A clash means
        // the user added that game by hand while the sync ran, so find out what landed instead of guessing.
        logger?.warn({ err }, 'sync.steam: bulk insert hit a conflict; checking what was stored');
        const rows = await LibraryEntry.find({ userId, gameId: { $in: docs.map((d) => d.gameId) } }).lean();
        const isOurs = (row) => (row.ownerships ?? []).some((o) => o.platform === PLATFORM && new Date(o.lastSyncedAt).getTime() === at.getTime());
        created = rows.filter(isOurs);
        // The hand-added ones get the same treatment as any existing entry: ownership and achievements only.
        const late = rows.filter((row) => !isOurs(row));
        const byGameId = new Map(docs.map((d) => [String(d.gameId), d]));
        const ops = late.map((row) => {
          const doc = byGameId.get(String(row.gameId));
          const $set = { ownerships: withOwnership(row.ownerships, { primary: { appid: doc.ownerships[0].externalId }, playtimeMin: doc.ownerships[0].playtimeMin }, at) };
          if (doc.achievements) $set.achievements = doc.achievements;
          return { updateOne: { filter: { _id: row._id, userId }, update: { $set } } };
        });
        if (ops.length) await LibraryEntry.bulkWrite(ops, { ordered: false });
        updated += late.length;
      }
      added += created.length;
      // Same record as a manual add, so the status history and "added" counts stay truthful.
      if (created.length) {
        await StatusHistory.insertMany(created.map((e) => ({ entryId: e._id, userId, from: null, to: e.status, at })));
      }
    }
    return { added, updated };
  }

  return {
    async syncUser(userId) {
      const user = await User.findOne({ _id: userId }).lean();
      if (!user) throw new NotFoundError('User not found');
      const steamId = user.steam?.steamId;
      if (!steamId) throw new ConflictError('Link your Steam account before syncing.');
      const key = String(userId);
      if (running.has(key)) throw new ConflictError('A Steam sync is already running. Give it a moment.');
      running.add(key);
      const started = Date.now();
      const log = (step, extra = {}) => logger?.info({ userId: key, step, ...extra }, `sync.steam: ${step}`);
      try {
        const report = { added: 0, updated: 0, unmatched: [], warnings: [] };

        const owned = await steam.getOwnedGames(steamId);
        log('owned games', { count: owned.length });

        const byApp = await matchGames(owned, report);
        const matchedApps = owned.filter((o) => byApp.get(o.appid) && !byApp.get(o.appid).hidden).map((o) => o.appid);
        log('matched', { matched: matchedApps.length, unmatched: owned.length - matchedApps.length });

        const { results, failed } = await steam.getAchievementsBatch(steamId, matchedApps, {
          onProgress: (done, total) => {
            if (done === total || done % 100 === 0) log('achievements', { done, total });
          },
        });
        if (failed) report.warnings.push(`Achievements could not be read for ${failed} game${failed === 1 ? '' : 's'}; they keep their previous values.`);

        const at = now();
        const groups = groupByGame(owned, byApp, results, report);
        const { added, updated } = await merge(userId, groups, at);
        report.added = added;
        report.updated = updated;

        if (fillArt) {
          const needArt = groups.map((g) => g.game).filter((g) => !g.cover || !g.backdrop);
          await Promise.allSettled(needArt.map((g) => fillArt(g)));
        }

        await User.updateOne(
          { _id: userId },
          { $set: { 'steam.lastSync': { at, added, updated, unmatchedCount: report.unmatched.length } } },
        );
        log('done', { added, updated, unmatched: report.unmatched.length, ms: Date.now() - started });
        eventBus?.emit('sync.completed', {
          userId: key,
          platform: PLATFORM,
          added,
          updated,
          unmatchedCount: report.unmatched.length,
          at,
        });
        return report;
      } finally {
        running.delete(key);
      }
    },
  };
}

/**
 * Insights service — dashboard stats, play-next recommendations.
 *
 * Uses plain aggregation helpers injected for testability; no direct Mongoose imports.
 * scorePlayNext is a pure function so it's fast to unit-test without any DB.
 */
import { normalizeTimeToBeat } from '../utils/timeToBeat.js';

// Hours to plan with: cleaned main, else main + extras; null for endless games or no data.
const planHours = (g) => {
  const t = normalizeTimeToBeat(g?.timeToBeat, g ?? {}, { legacySwap: true });
  return t.endless ? null : (t.main ?? t.extras);
};
// { unlocked, total, pct } for a platform achievement snapshot, or null when there is none to show.
function achievementSummary(snapshot) {
  const { unlocked, total } = snapshot ?? {};
  if (!(total > 0) || unlocked == null) return null;
  return { unlocked, total, pct: Math.round((unlocked / total) * 100) };
}

export function createInsightsService({ LibraryEntry, PlayLog, StatusHistory, Game }) {
  // ── helpers ──────────────────────────────────────────────────────────────

  function startOfYear() {
    const d = new Date();
    d.setUTCMonth(0, 1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  function monthsAgo(n) {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - n, 1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  // ── dashboard ─────────────────────────────────────────────────────────────

  async function getDashboard(userId) {
    const [entries, lastLog] = await Promise.allSettled([
      LibraryEntry.find({ userId }).lean(),
      PlayLog.find({ userId }).sort({ date: -1 }).limit(1).lean(),
      // JournalEntry is not injected; skip if absent.
    ]);

    const all = entries.status === 'fulfilled' ? entries.value : [];

    // Status counts.
    const statusCounts = { wishlist: 0, backlog: 0, playing: 0, completed: 0, dropped: 0, all: all.length };
    const genreMap = {};
    let totalMinutes = 0;
    let completedThisYear = 0;
    const thisYear = startOfYear();

    for (const e of all) {
      statusCounts[e.status] = (statusCounts[e.status] ?? 0) + 1;
      const mins = effectiveMinutes(e);
      totalMinutes += mins;
      if (e.status === 'completed' && e.completedAt && new Date(e.completedAt) >= thisYear) completedThisYear += 1;
    }

    // Top genres from backlog+playing (what they're into).
    const backlogIds = all.filter((e) => ['backlog', 'playing', 'wishlist'].includes(e.status)).map((e) => e.gameId);
    if (backlogIds.length) {
      const games = await Game.find({ _id: { $in: backlogIds } }).select('genres').lean();
      for (const g of games) {
        for (const genre of g.genres ?? []) {
          genreMap[genre] = (genreMap[genre] ?? 0) + 1;
        }
      }
    }
    const topGenres = Object.entries(genreMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Backlog hours estimate: sum timeToBeat.main for all backlog entries.
    const backlogEntries = all.filter((e) => e.status === 'backlog');
    const backlogGameIds = backlogEntries.map((e) => e.gameId);
    let backlogHours = null;
    if (backlogGameIds.length) {
      const backlogGames = await Game.find({ _id: { $in: backlogGameIds } }).select('title genres themes gameModes timeToBeat').lean();
      const ttbTotal = backlogGames.reduce((s, g) => s + (planHours(g) ?? 0), 0);
      if (ttbTotal > 0) backlogHours = ttbTotal;
    }

    // Resume card: last play log + current playing game.
    const lastLogDoc = lastLog.status === 'fulfilled' && lastLog.value?.length ? lastLog.value[0] : null;
    let resumeCard = null;
    if (lastLogDoc) {
      const playingEntry = all.find((e) => String(e.gameId) === String(lastLogDoc.gameId));
      if (playingEntry) {
        const game = await Game.findOne({ _id: lastLogDoc.gameId }).select('title slug cover backdrop heroImage bannerImage coverImage cardImage').lean();
        resumeCard = {
          entryId: String(playingEntry._id),
          gameId: String(playingEntry.gameId),
          title: game?.title ?? 'Unknown',
          slug: game?.slug ?? null,
          cover: game?.coverImage ?? game?.cover ?? null,
          backdrop: game?.heroImage ?? game?.backdrop ?? null,
          heroImage: game?.heroImage ?? game?.backdrop ?? null,
          bannerImage: game?.bannerImage ?? game?.backdrop ?? null,
          coverImage: game?.coverImage ?? game?.cover ?? null,
          cardImage: game?.cardImage ?? game?.cover ?? game?.backdrop ?? null,
          lastPlayedAt: lastLogDoc.date,
          minutesLastSession: lastLogDoc.minutes,
          note: lastLogDoc.note ?? '',
          manualProgress: playingEntry.manualProgress ?? 0,
          playtimeMinutes: effectiveMinutes(playingEntry),
          // null until a platform sync supplies a snapshot (or for games without achievements)
          achievements: achievementSummary(playingEntry.achievements),
        };
      }
    }

    return {
      statusCounts,
      totalHours: Math.round(totalMinutes / 60),
      topGenres,
      completedThisYear,
      backlogHours,
      resumeCard,
    };
  }

  // ── play next ─────────────────────────────────────────────────────────────

  async function getPlayNext(userId, { limit = 5 } = {}) {
    const allEntries = await LibraryEntry.find({ userId, status: { $in: ['backlog', 'playing'] } }).lean();
    if (!allEntries.length) return { items: [] };

    // Genres the user has played/completed (preference signal).
    const doneEntries = await LibraryEntry.find({ userId, status: { $in: ['completed', 'playing'] } }).lean();
    const doneGameIds = doneEntries.map((e) => e.gameId);
    const doneGames = doneGameIds.length ? await Game.find({ _id: { $in: doneGameIds } }).select('genres').lean() : [];
    const preferredGenres = {};
    for (const g of doneGames) for (const genre of g.genres ?? []) preferredGenres[genre] = (preferredGenres[genre] ?? 0) + 1;

    const candidateIds = allEntries.map((e) => e.gameId);
    const games = await Game.find({ _id: { $in: candidateIds } }).select('title slug cover backdrop heroImage bannerImage coverImage cardImage genres themes gameModes timeToBeat').lean();
    const gameById = Object.fromEntries(games.map((g) => [String(g._id), g]));

    const now = Date.now();
    const scored = allEntries.map((entry) => {
      const game = gameById[String(entry.gameId)] ?? {};
      return { entry, game, score: scorePlayNext(entry, game, preferredGenres, now) };
    });

    scored.sort((a, b) => b.score.total - a.score.total);

    return {
      items: scored.slice(0, limit).map(({ entry, game, score }) => ({
        entryId: String(entry._id),
        gameId: String(entry.gameId),
        title: game.title ?? 'Unknown',
        slug: game.slug ?? null,
        cover: game.coverImage ?? game.cover ?? null,
        backdrop: game.heroImage ?? game.backdrop ?? null,
        heroImage: game.heroImage ?? game.backdrop ?? null,
        bannerImage: game.bannerImage ?? game.backdrop ?? null,
        coverImage: game.coverImage ?? game.cover ?? null,
        cardImage: game.cardImage ?? game.cover ?? game.backdrop ?? null,
        status: entry.status,
        manualProgress: entry.manualProgress ?? 0,
        timeToBeatMain: planHours(game),
        score: score.total,
        reasons: score.reasons,
      })),
    };
  }

  // ── backlog health ────────────────────────────────────────────────────────

  // Last 6 months, one row per month (empty months included): games added to the library vs games finished.
  // Read from the library itself (createdAt / completedAt), so Steam imports and hand-added games both count;
  // status history fills in completions saved before completedAt existed.
  async function getBacklogHealth(userId, now = new Date()) {
    const keys = [];
    for (let i = 5; i >= 0; i -= 1) keys.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
    const since = new Date(`${keys[0]}-01T00:00:00Z`);
    const months = Object.fromEntries(keys.map((k) => [k, { added: 0, completed: 0 }]));
    const monthOf = (d) => (d ? new Date(d).toISOString().slice(0, 7) : null);

    const [entries, history] = await Promise.all([
      LibraryEntry.find({ userId }).select('_id status createdAt completedAt updatedAt').lean(),
      StatusHistory.find({ userId, to: 'completed', at: { $gte: since } }).lean(),
    ]);
    const completedFromHistory = new Map(history.map((h) => [String(h.entryId), h.at]));
    for (const e of entries) {
      const added = monthOf(e.createdAt);
      if (e.status !== 'wishlist' && months[added]) months[added].added += 1;
      if (e.status === 'completed') {
        const done = monthOf(e.completedAt ?? completedFromHistory.get(String(e._id)) ?? e.updatedAt);
        if (months[done]) months[done].completed += 1;
      }
    }
    const data = keys.map((month) => ({ month, ...months[month] }));

    const backlogCount = entries.filter((e) => e.status === 'backlog').length;
    const totalAdded = data.reduce((sum, d) => sum + d.added, 0);
    const totalCompleted = data.reduce((sum, d) => sum + d.completed, 0);
    const completedPerMonth = Math.round((totalCompleted / data.length) * 10) / 10;
    // Linear projection on finishing pace alone: how long the current backlog takes at the 6-month average.
    const projectedClearMonths = completedPerMonth > 0 ? Math.ceil(backlogCount / completedPerMonth) : null;

    return { data, backlogCount, totalAdded, totalCompleted, completedPerMonth, projectedClearMonths };
  }

  return { getDashboard, getPlayNext, getBacklogHealth };
}

// ── pure scoring function (exported for unit tests) ───────────────────────

export function scorePlayNext(entry, game, preferredGenres = {}, now = Date.now()) {
  let total = 0;
  const reasons = [];

  // Genre match with completed/playing history (0–40 pts).
  const genreScore = (game.genres ?? []).reduce((s, g) => s + (preferredGenres[g] ?? 0), 0);
  if (genreScore > 0) {
    const pts = Math.min(40, genreScore * 8);
    total += pts;
    reasons.push(`Matches your taste (${(game.genres ?? []).filter((g) => preferredGenres[g]).join(', ')})`);
  }

  // Time in backlog — prioritise long-waiters (0–20 pts).
  if (entry.createdAt) {
    const daysWaiting = (now - new Date(entry.createdAt).getTime()) / 86400000;
    const pts = Math.min(20, Math.floor(daysWaiting / 7) * 2); // 2 pts per week, cap 20
    if (pts > 0) { total += pts; reasons.push(`Waiting ${Math.round(daysWaiting)} days`); }
  }

  // Partial progress already made (0–20 pts).
  const progress = entry.manualProgress ?? 0;
  if (progress > 0 && entry.status === 'playing') {
    const pts = Math.round(progress / 5); // up to 20 pts at 100%
    total += pts;
    reasons.push(`${progress}% already done`);
  }

  // Shorter time to beat — prefer quick wins (0–20 pts).
  const ttb = planHours(game);
  if (ttb != null) {
    const pts = ttb <= 5 ? 20 : ttb <= 10 ? 15 : ttb <= 20 ? 10 : ttb <= 40 ? 5 : 0;
    if (pts > 0) { total += pts; reasons.push(`~${ttb}h to beat`); }
  }

  return { total, reasons };
}

// Effective playtime considers both hand-logged minutes and synced platform data.
export function effectiveMinutes(entry) {
  const logged = entry.loggedMinutes ?? 0;
  const synced = (entry.ownerships ?? []).reduce((s, o) => s + (o.playtimeMin ?? 0), 0);
  return Math.max(logged, synced);
}

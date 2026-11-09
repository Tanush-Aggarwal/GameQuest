import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';
import { toGameDto, steamHeroOf } from './gameService.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isIgdb = (u) => typeof u === 'string' && u.includes('images.igdb.com');
const big = (u) => (isIgdb(u) ? u.replace(/\/t_[a-z0-9_]+\//, '/t_1080p/') : u);
const thumb = (u) => (isIgdb(u) ? u.replace(/\/t_[a-z0-9_]+\//, '/t_screenshot_med/') : u);

// Everything an administrator can change from the admin pages without touching code or the database:
// catalog fixes (title, hide a DLC that slipped in, the header picture and its framing), trailers hidden as wrong,
// and who is an administrator. Every change is logged with the admin's id.
export function createAdminService({ Game, User, Review, logger }) {
  const audit = (adminId, action, details) => logger?.info?.({ adminId: String(adminId), action, ...details }, 'admin action');

  const gameRow = (g) => ({
    id: String(g._id),
    title: g.title,
    slug: g.slug,
    cover: g.cover ?? null,
    hidden: Boolean(g.hidden),
    platforms: g.platforms ?? [],
    releaseDate: g.releaseDate ?? null,
    hasCustomHeader: Boolean(g.heroOverride?.url),
    hiddenTrailers: g.hiddenTrailers ?? [],
  });

  async function findGame(id) {
    const game = await Game.findOne({ _id: id }).lean();
    if (!game) throw new NotFoundError('Game not found');
    return game;
  }

  return {
    async overview() {
      const [players, admins, visibleGames, hiddenGames, customHeaders, withHiddenTrailers, noArt, reviews] = await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ role: 'admin' }),
        Game.countDocuments({ hidden: { $ne: true } }),
        Game.countDocuments({ hidden: true }),
        Game.countDocuments({ 'heroOverride.url': { $exists: true } }),
        Game.countDocuments({ 'hiddenTrailers.0': { $exists: true } }),
        Game.countDocuments({ hidden: { $ne: true }, backdrop: { $in: [null, ''] }, 'externalIds.steam': { $in: [null, ''] } }),
        Review ? Review.countDocuments({}) : 0,
      ]);
      return { players, admins, visibleGames, hiddenGames, customHeaders, withHiddenTrailers, gamesWithoutArt: noArt, reviews };
    },

    async searchGames({ q = '', limit = 20, hidden = 'all' }) {
      const filter = {};
      if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };
      if (hidden === 'hidden') filter.hidden = true;
      if (hidden === 'visible') filter.hidden = { $ne: true };
      const rows = await Game.find(filter).sort({ popularity: -1 }).limit(limit).lean();
      return { items: rows.map(gameRow) };
    },

    async getGame(id) {
      const g = await findGame(id);
      return { game: { ...toGameDto(g), ...gameRow(g) } };
    },

    // Every picture the header editor can offer for a game, labelled, with a small preview.
    async headerOptions(id) {
      const g = await findGame(id);
      const options = [];
      const add = (url, label, source) => {
        if (!url || options.some((o) => o.url === big(url))) return;
        options.push({ url: big(url), preview: thumb(url), label, source });
      };
      add(steamHeroOf(g), 'Steam banner art', 'steam');
      if (g.backdrop && !/\/header\.jpg/.test(g.backdrop)) add(g.backdrop, 'Current backdrop', /steamstatic/.test(g.backdrop) ? 'steam' : 'igdb');
      (g.artworks ?? []).slice(0, 12).forEach((u, i) => add(u, `Artwork ${i + 1}`, 'igdb'));
      (g.screenshots ?? []).slice(0, 12).forEach((u, i) => add(u, `Screenshot ${i + 1}`, /steamstatic/.test(u) ? 'steam' : 'igdb'));
      return { current: toGameDto(g).heroOverride, options };
    },

    async updateGame(adminId, id, patch) {
      const game = await findGame(id);
      const $set = {};
      const $unset = {};
      if (patch.title !== undefined) $set.title = patch.title;
      if (patch.hidden !== undefined) $set.hidden = patch.hidden;
      if (patch.heroOverride === null) $unset.heroOverride = 1;
      else if (patch.heroOverride) $set.heroOverride = { ...patch.heroOverride, updatedBy: String(adminId), updatedAt: new Date() };
      const update = { ...(Object.keys($set).length && { $set }), ...(Object.keys($unset).length && { $unset }) };
      const updated = await Game.findOneAndUpdate({ _id: game._id }, update, { new: true });
      audit(adminId, 'game.update', { gameId: String(game._id), fields: Object.keys(patch) });
      return { game: { ...toGameDto(updated), ...gameRow(updated) } };
    },

    // "Wrong trailer?" from an administrator: hidden for everyone at once (YouTube or Steam trailers).
    async hideTrailer(adminId, slug, videoId) {
      const game = await Game.findOne({ slug }).lean();
      if (!game) throw new NotFoundError('Game not found');
      await Game.findOneAndUpdate({ _id: game._id }, { $addToSet: { hiddenTrailers: videoId } });
      audit(adminId, 'trailer.hide', { gameId: String(game._id), videoId });
      return { videoId, hidden: true };
    },

    async restoreTrailer(adminId, id, videoId) {
      const game = await findGame(id);
      await Game.findOneAndUpdate({ _id: game._id }, { $pull: { hiddenTrailers: videoId } });
      audit(adminId, 'trailer.restore', { gameId: String(game._id), videoId });
      return { videoId, hidden: false };
    },

    // The trailer ids an administrator hid for a game (an empty set when none or the game is unknown).
    async hiddenTrailersFor(slug) {
      const game = await Game.findOne({ slug }).lean();
      return new Set(game?.hiddenTrailers ?? []);
    },

    async hiddenTrailers() {
      const rows = await Game.find({ 'hiddenTrailers.0': { $exists: true } }).limit(200).lean();
      return { items: rows.map(gameRow) };
    },

    async searchUsers({ q = '', limit = 20 }) {
      const filter = q ? { $or: [{ usernameLower: { $regex: escapeRegex(q.toLowerCase()) } }, { email: { $regex: escapeRegex(q.toLowerCase()) } }] } : {};
      const rows = await User.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
      return {
        items: rows.map((u) => ({
          id: String(u._id),
          username: u.username,
          email: u.email,
          avatar: u.avatar ?? null,
          role: u.role ?? 'user',
          emailVerified: Boolean(u.emailVerified),
          google: Boolean(u.googleId),
          createdAt: u.createdAt ?? null,
        })),
      };
    },

    // Make someone an administrator or take it away. You can't change your own role (no locking yourself out),
    // and the last administrator stays one.
    async setRole(adminId, userId, role) {
      if (String(adminId) === String(userId)) throw new ValidationError('You can’t change your own role.');
      const user = await User.findOne({ _id: userId }).lean();
      if (!user) throw new NotFoundError('User not found');
      if (user.role === 'admin' && role !== 'admin' && (await User.countDocuments({ role: 'admin' })) <= 1) {
        throw new ConflictError('GameQuest needs at least one administrator.');
      }
      await User.findOneAndUpdate({ _id: user._id }, { $set: { role } });
      audit(adminId, 'user.role', { userId: String(user._id), role });
      return { id: String(user._id), role };
    },
  };
}

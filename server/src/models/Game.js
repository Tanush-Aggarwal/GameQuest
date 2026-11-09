import mongoose from 'mongoose';

const gameSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    summary: { type: String, default: '' },
    cover: { type: String, default: null },
    genres: { type: [String], default: [] },
    platforms: { type: [String], default: [] },
    releaseDate: { type: Date, default: null },
    externalIds: {
      igdb: { type: Number, sparse: true, unique: true },
      steam: { type: String, sparse: true, unique: true },
      twitch: { type: String, sparse: true, unique: true },
      speedrun: { type: String, sparse: true, unique: true },
    },
    // Steam's wide key art for banners (library hero), looked up from the Steam store by `catalog:steam-heroes`.
    // null after a lookup that found none; missing when the game was never looked up.
    steamHero: { type: String, default: undefined },
    steamHero2x: { type: String, default: undefined },
    steamHeroCheckedAt: { type: Date, default: undefined },
    // Set by an administrator in the header editor: which picture the game's headers use and how it is framed
    // (focus point in % and zoom). Missing means "pick automatically".
    heroOverride: {
      type: new mongoose.Schema(
        {
          url: { type: String, required: true },
          posX: { type: Number, default: 50 },
          posY: { type: Number, default: 30 },
          zoom: { type: Number, default: 1 },
          updatedBy: { type: String, default: null },
          updatedAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: undefined,
    },
    // Trailers an administrator hid ("Wrong trailer?"): YouTube ids or "steam-<id>". Hidden for everyone until restored.
    hiddenTrailers: { type: [String], default: undefined },
    timeToBeat: {
      main: { type: Number, default: null }, // hours
      extras: { type: Number, default: null },
      full: { type: Number, default: null },
      samples: { type: Number, default: null }, // how many IGDB reports the numbers come from
      endless: { type: Boolean, default: false }, // multiplayer-only / live service: nothing to beat
    },
    // Art: IGDB image ids resolved to full URLs by the adapter. `backdrop` is the best wide image
    // (artwork > screenshot) and is what hero/ambient views use.
    artworks: { type: [String], default: [] },
    screenshots: { type: [String], default: [] },
    videos: { type: [String], default: [] }, // YouTube video ids from IGDB
    // The same videos with IGDB's names ("Trailer", "Gameplay video"); only a hint for trailer picking.
    videoMeta: { type: [new mongoose.Schema({ id: String, name: String }, { _id: false })], default: [] },
    backdrop: { type: String, default: null },
    // Specialized image roles with fallback to cover/backdrop/artworks
    heroImage: { type: String, default: null },
    bannerImage: { type: String, default: null },
    coverImage: { type: String, default: null },
    cardImage: { type: String, default: null },
    developer: { type: [String], default: [] },
    publisher: { type: [String], default: [] },
    themes: { type: [String], default: [] },
    gameModes: { type: [String], default: [] },
    storyline: { type: String, default: '' },
    totalRating: { type: Number, default: null }, // IGDB 0-100
    totalRatingCount: { type: Number, default: 0 },
    popularity: { type: Number, default: 0 }, // blended importer score; catalog default sort (compound index below)
    gameType: { type: Number, default: null }, // IGDB game_type (0 main game, 8 remake, ...)
    // DLC / editions point at the game they belong to and are hidden from the catalog.
    parentGameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null },
    hidden: { type: Boolean, default: false, index: true },
    // Maintained atomically by the review service (Tier 3).
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    source: { type: String, enum: ['igdb', 'rawg'], default: 'igdb' },    // When the metadata was last fetched; older than the source TTL means "refresh on view".
    cachedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Catalog searches and filters
gameSchema.index({ title: 'text', summary: 'text' }, { weights: { title: 10, summary: 1 } });
gameSchema.index({ genres: 1, slug: 1 });
// Explore categories also match themes and game modes (co-op, open world...).
gameSchema.index({ themes: 1 });
gameSchema.index({ gameModes: 1 });
gameSchema.index({ platforms: 1, slug: 1 });
gameSchema.index({ 'timeToBeat.main': 1, slug: 1 });
gameSchema.index({ 'timeToBeat.endless': 1 });
gameSchema.index({ ratingAvg: -1, ratingCount: -1, slug: 1 });
gameSchema.index({ releaseDate: -1, slug: 1 });
// Default catalog order: most popular first, slug as the tiebreaker for cursor paging
gameSchema.index({ popularity: -1, slug: 1 });
gameSchema.index({ totalRating: -1, slug: 1 }); // the rating sort (Explore "Top rated")

export const Game = mongoose.models.Game ?? mongoose.model('Game', gameSchema);

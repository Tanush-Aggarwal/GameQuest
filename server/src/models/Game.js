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
    timeToBeat: {
      main: { type: Number, default: null }, // hours
      extras: { type: Number, default: null },
      full: { type: Number, default: null },
    },
    // Art: IGDB image ids resolved to full URLs by the adapter. `backdrop` is the best wide image
    // (artwork > screenshot) and is what hero/ambient views use.
    artworks: { type: [String], default: [] },
    screenshots: { type: [String], default: [] },
    videos: { type: [String], default: [] }, // YouTube video ids from IGDB
    // The same videos with IGDB's names ("Trailer", "Gameplay video"); only a hint for trailer picking.
    videoMeta: { type: [new mongoose.Schema({ id: String, name: String }, { _id: false })], default: [] },
    backdrop: { type: String, default: null },
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
gameSchema.index({ platforms: 1, slug: 1 });
gameSchema.index({ 'timeToBeat.main': 1, slug: 1 });
gameSchema.index({ ratingAvg: -1, ratingCount: -1, slug: 1 });
gameSchema.index({ releaseDate: -1, slug: 1 });
// Default catalog order: most popular first, slug as the tiebreaker for cursor paging
gameSchema.index({ popularity: -1, slug: 1 });
gameSchema.index({ totalRating: -1, slug: 1 }); // the rating sort (Explore "Top rated")

export const Game = mongoose.models.Game ?? mongoose.model('Game', gameSchema);

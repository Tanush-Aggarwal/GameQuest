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
    // Maintained atomically by the review service (Tier 3).
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    source: { type: String, enum: ['igdb', 'rawg'], default: 'igdb' },
    // When the metadata was last fetched; older than the source TTL means "refresh on view".
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

export const Game = mongoose.models.Game ?? mongoose.model('Game', gameSchema);

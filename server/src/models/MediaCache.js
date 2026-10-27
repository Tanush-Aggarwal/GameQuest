import mongoose from 'mongoose';

const mediaCacheSchema = new mongoose.Schema(
  {
    // Per-game cache entries need a game; 'catalog-import' (import progress) and 'youtube-state' (daily
    // search count and quota pause) are single global documents.
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game',
      required() {
        return this.source !== 'catalog-import' && this.source !== 'youtube-state';
      },
    },
    source: {
      type: String,
      required: true,
      enum: ['youtube', 'twitch', 'speedrun', 'igdb', 'catalog-import', 'steam-art', 'trailers', 'trailer-dismissed', 'youtube-state', 'steam-requirements', 'steam-reviews'],
    },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    fetchedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Unique cache entry per game and source
mediaCacheSchema.index({ gameId: 1, source: 1 }, { unique: true });
// TTL index: MongoDB removes expired documents automatically when expiresAt is reached
mediaCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MediaCache = mongoose.models.MediaCache ?? mongoose.model('MediaCache', mediaCacheSchema);

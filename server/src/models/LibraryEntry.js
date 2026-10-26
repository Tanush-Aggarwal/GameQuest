import mongoose from 'mongoose';
import { LIBRARY_STATUSES } from '@gamequest/shared';

const ownershipSchema = new mongoose.Schema(
  {
    platform: { type: String, required: true, trim: true },
    externalId: { type: String, default: null },
    playtimeMin: { type: Number, default: 0, min: 0 },
    lastSyncedAt: { type: Date, default: null },
  },
  { _id: false },
);

const libraryEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    status: { type: String, enum: LIBRARY_STATUSES, required: true },
    // Manual progress is the user's own number; synced achievement % and playtime live elsewhere.
    manualProgress: { type: Number, default: 0, min: 0, max: 100 },
    // One entry per user per game; owning it on several platforms adds rows here, not entries.
    ownerships: { type: [ownershipSchema], default: [] },
    // Sum of hand-logged play sessions; synced playtime lives on ownerships[].playtimeMin.
    loggedMinutes: { type: Number, default: 0, min: 0 },
    lastPlayedAt: { type: Date, default: null },
    // Latest achievement snapshot from a platform sync (null until a sync supplies one).
    achievements: {
      unlocked: { type: Number, default: null },
      total: { type: Number, default: null },
      fetchedAt: { type: Date, default: null },
    },
    completedAt: { type: Date, default: null },
    hiddenFromFriends: { type: Boolean, default: false },
  },
  { timestamps: true },
);

libraryEntrySchema.index({ userId: 1, gameId: 1 }, { unique: true });
libraryEntrySchema.index({ userId: 1, status: 1, _id: -1 });

export const LibraryEntry = mongoose.models.LibraryEntry ?? mongoose.model('LibraryEntry', libraryEntrySchema);

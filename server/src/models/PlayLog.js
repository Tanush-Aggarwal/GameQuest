import mongoose from 'mongoose';

// One hand-logged play session. Feeds playtime for games that are not synced, streaks and stats.
const playLogSchema = new mongoose.Schema(
  {
    entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryEntry', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    date: { type: Date, required: true }, // UTC midnight of the calendar day played
    minutes: { type: Number, required: true, min: 1, max: 1440 },
    note: { type: String, default: '' },
  },
  { timestamps: true },
);

playLogSchema.index({ userId: 1, date: -1 });
playLogSchema.index({ entryId: 1, date: -1 });

export const PlayLog = mongoose.models.PlayLog ?? mongoose.model('PlayLog', playLogSchema);

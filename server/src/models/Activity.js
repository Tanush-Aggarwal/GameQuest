import mongoose from 'mongoose';
import { ACTIVITY_TYPES } from '@gamequest/shared';

// Written only by event-bus subscribers (see events/subscribers.js), never by other services.
// `level` is who may see it when written (public / friends); readers re-check hiddenFromFriends
// and current collection visibility, because those can change afterwards.
const activitySchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ACTIVITY_TYPES, required: true },
  entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryEntry', default: null },
  gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  level: { type: String, enum: ['public', 'friends'], default: 'friends' },
  createdAt: { type: Date, default: Date.now },
});

activitySchema.index({ actorId: 1, createdAt: -1 });
activitySchema.index({ actorId: 1, _id: -1 });

export const Activity = mongoose.models.Activity ?? mongoose.model('Activity', activitySchema);

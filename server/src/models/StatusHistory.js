import mongoose from 'mongoose';
import { LIBRARY_STATUSES } from '@gamequest/shared';

const statusHistorySchema = new mongoose.Schema({
  entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryEntry', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // null `from` marks the entry being added to the library.
  from: { type: String, enum: [...LIBRARY_STATUSES, null], default: null },
  to: { type: String, enum: LIBRARY_STATUSES, required: true },
  at: { type: Date, default: Date.now },
});

statusHistorySchema.index({ userId: 1, at: -1 });
statusHistorySchema.index({ entryId: 1, at: -1 });

export const StatusHistory = mongoose.models.StatusHistory ?? mongoose.model('StatusHistory', statusHistorySchema);

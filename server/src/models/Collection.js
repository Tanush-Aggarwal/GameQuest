import mongoose from 'mongoose';
import { COLLECTION_TYPES, COLLECTION_VISIBILITIES } from '@gamequest/shared';

const ruleSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    op: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const collectionSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 500 },
    visibility: { type: String, enum: COLLECTION_VISIBILITIES, default: 'private' },
    type: { type: String, enum: COLLECTION_TYPES, default: 'manual' },
    // Only for smart collections; compiled from a whitelist at read time (see utils/smartRules.js).
    rules: { type: [ruleSchema], default: [] },
    coverGameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null },
  },
  { timestamps: true },
);

collectionSchema.index({ ownerId: 1, updatedAt: -1 });
collectionSchema.index({ ownerId: 1, visibility: 1 });

export const Collection = mongoose.models.Collection ?? mongoose.model('Collection', collectionSchema);

import mongoose from 'mongoose';
import { RECOMMENDATION_STATUSES } from '@gamequest/shared';

const recommendationSchema = new mongoose.Schema(
  {
    fromId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    message: { type: String, trim: true, maxlength: 500, default: '' },
    reviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', default: null },
    status: {
      type: String,
      enum: RECOMMENDATION_STATUSES,
      default: 'pending',
    },
    outcome: {
      status: { type: String, default: null },
      rating: { type: Number, default: null },
      completedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

recommendationSchema.index({ fromId: 1, toId: 1, gameId: 1 }, { unique: true });
recommendationSchema.index({ toId: 1, status: 1, createdAt: -1 });
recommendationSchema.index({ fromId: 1, createdAt: -1 });

export const Recommendation =
  mongoose.models.Recommendation ?? mongoose.model('Recommendation', recommendationSchema);

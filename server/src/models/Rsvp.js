import mongoose from 'mongoose';
import { RSVP_RESPONSES } from '@gamequest/shared';

// One answer per person per session; answering again replaces it.
const rsvpSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameSession', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    response: { type: String, enum: RSVP_RESPONSES, required: true },
  },
  { timestamps: true },
);

rsvpSchema.index({ sessionId: 1, userId: 1 }, { unique: true });
rsvpSchema.index({ userId: 1, createdAt: -1 });

export const Rsvp = mongoose.models.Rsvp ?? mongoose.model('Rsvp', rsvpSchema);

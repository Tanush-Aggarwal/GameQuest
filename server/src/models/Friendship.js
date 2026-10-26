import mongoose from 'mongoose';

// Friendships are mutual and stored once per pair: userA < userB (as strings), so (A,B) and (B,A)
// can never both exist. `requestedBy` is whichever of the two sent the request.
const friendshipSchema = new mongoose.Schema(
  {
    userA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userB: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

friendshipSchema.index({ userA: 1, userB: 1 }, { unique: true });
friendshipSchema.index({ userA: 1, status: 1 });
friendshipSchema.index({ userB: 1, status: 1 });

export const Friendship = mongoose.models.Friendship ?? mongoose.model('Friendship', friendshipSchema);

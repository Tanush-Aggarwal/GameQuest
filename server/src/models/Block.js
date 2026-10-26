import mongoose from 'mongoose';

// A block is one-directional to create, but it hides each side from the other everywhere.
const blockSchema = new mongoose.Schema(
  {
    blockerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    blockedId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
blockSchema.index({ blockedId: 1 });

export const Block = mongoose.models.Block ?? mongoose.model('Block', blockSchema);

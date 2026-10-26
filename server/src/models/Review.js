import mongoose from 'mongoose';

// One review per user per game; the pair is enforced with a unique compound index.
// ratingAvg and ratingCount on Game are kept in sync with $inc / atomic updates.
const reviewSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    body: { type: String, trim: true, maxlength: 3000, default: null },
  },
  { timestamps: true },
);

reviewSchema.index({ userId: 1, gameId: 1 }, { unique: true });
reviewSchema.index({ gameId: 1, createdAt: -1 });  // list reviews for a game
reviewSchema.index({ userId: 1, createdAt: -1 });  // list reviews by a user

export const Review = mongoose.model('Review', reviewSchema);

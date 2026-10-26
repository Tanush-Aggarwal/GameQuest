import mongoose from 'mongoose';

// One document per issued refresh token. Rotated tokens are kept (usedAt set) until they
// expire so that replaying an old token can be detected and the whole family revoked.
const refreshTokenSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  familyId: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  usedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export const RefreshToken =
  mongoose.models.RefreshToken ?? mongoose.model('RefreshToken', refreshTokenSchema);

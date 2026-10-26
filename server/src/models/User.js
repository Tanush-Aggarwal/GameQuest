import mongoose from 'mongoose';
import { PROFILE_PRIVACY } from '@gamequest/shared';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    // lowercase copy gives case-insensitive uniqueness while keeping the display casing
    usernameLower: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    avatar: { type: String, default: null },
    bio: { type: String, trim: true, maxlength: 500, default: '' },
    // Who may open /u/:username: everyone, friends only, or just the owner.
    privacy: { type: String, enum: PROFILE_PRIVACY, default: 'public' },
    favouriteGames: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Game' }],
      default: [],
      validate: [(val) => val.length <= 4, '{PATH} exceeds limit of 4'],
    },
    discord: {
      id: { type: String, default: null },
      username: { type: String, default: null },
    },
    notificationPrefs: {
      email: { type: Boolean, default: false },
      digest: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);

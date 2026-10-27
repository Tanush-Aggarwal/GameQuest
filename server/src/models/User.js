import mongoose from 'mongoose';
import { PROFILE_PRIVACY } from '@gamequest/shared';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    // lowercase copy gives case-insensitive uniqueness while keeping the display casing
    usernameLower: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Absent for people who only ever sign in with Google.
    passwordHash: { type: String, required: function needsPassword() { return !this.googleId; }, select: false },
    // Google account id ("sub"), set on sign-up with Google.
    googleId: { type: String, default: undefined },
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
    // Linked Steam account. A SteamID64 is public information, so there is no secret to encrypt here.
    // When the user last opened the notifications bell; anything newer counts as unread.
    notificationsReadAt: { type: Date, default: null },
    // When the user accepted the Terms and Privacy Policy (sent with registration).
    termsAcceptedAt: { type: Date, default: null },
    steam: {
      steamId: { type: String, default: undefined },
      personaName: { type: String, default: undefined },
      avatar: { type: String, default: undefined },
      profileUrl: { type: String, default: undefined },
      visibility: { type: String, enum: ['public', 'friends', 'private'], default: undefined },
      linkedAt: { type: Date, default: undefined },
      lastSync: {
        at: { type: Date, default: undefined },
        added: { type: Number, default: undefined },
        updated: { type: Number, default: undefined },
        unmatchedCount: { type: Number, default: undefined },
      },
    },
  },
  { timestamps: true },
);

// One Steam account links to one GameQuest user (otherwise anyone could claim someone else's library).
userSchema.index({ 'steam.steamId': 1 }, { unique: true, partialFilterExpression: { 'steam.steamId': { $type: 'string' } } });

userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);

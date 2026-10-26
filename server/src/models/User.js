import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    // lowercase copy gives case-insensitive uniqueness while keeping the display casing
    usernameLower: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  { timestamps: true },
);

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);

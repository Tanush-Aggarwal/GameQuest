import mongoose from 'mongoose';
import { SESSION_VISIBILITIES } from '@gamequest/shared';

// A planned play session. All times are UTC; the client formats them in the viewer's timezone.
const gameSessionSchema = new mongoose.Schema(
  {
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    title: { type: String, default: '', maxlength: 80 },
    startsAt: { type: Date, required: true },
    // startsAt + durationMin, stored so "still upcoming" is a single indexed comparison.
    endsAt: { type: Date, required: true },
    durationMin: { type: Number, required: true, min: 15, max: 720 },
    platform: { type: String, default: '', maxlength: 50 },
    // Validated by pattern only (discord.gg/… or discord.com/invite/…); GameQuest never calls Discord.
    discordInviteUrl: { type: String, default: null },
    maxPlayers: { type: Number, default: 4, min: 2, max: 32 },
    // People (besides the host) who answered Going. A seat is taken with one conditional update on this
    // counter, so two simultaneous last-seat RSVPs can't both succeed.
    goingCount: { type: Number, default: 0, min: 0 },
    visibility: { type: String, enum: SESSION_VISIBILITIES, default: 'friends' },
    invitees: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    status: { type: String, enum: ['scheduled', 'cancelled'], default: 'scheduled' },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

gameSessionSchema.index({ hostId: 1, startsAt: 1 });
gameSessionSchema.index({ invitees: 1, startsAt: 1 });
gameSessionSchema.index({ status: 1, endsAt: 1, startsAt: 1 });

export const GameSession = mongoose.models.GameSession ?? mongoose.model('GameSession', gameSessionSchema);

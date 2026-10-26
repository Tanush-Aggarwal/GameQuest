import mongoose from 'mongoose';

// Private "where I left off" notes per library entry. Never shown to anyone but the owner.
const journalEntrySchema = new mongoose.Schema(
  {
    entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryEntry', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true },
);

journalEntrySchema.index({ entryId: 1, createdAt: -1 });
journalEntrySchema.index({ userId: 1, createdAt: -1 });

export const JournalEntry = mongoose.models.JournalEntry ?? mongoose.model('JournalEntry', journalEntrySchema);

import mongoose from 'mongoose';

// Items live in their own collection (not an array on Collection) so reordering one item
// is a single-document write. `position` is fractional: a move writes the midpoint of its
// new neighbours, and the whole list is renumbered only when a gap gets too small.
const collectionItemSchema = new mongoose.Schema(
  {
    collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection', required: true },
    entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryEntry', required: true },
    position: { type: Number, required: true },
    note: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true },
);

collectionItemSchema.index({ collectionId: 1, entryId: 1 }, { unique: true });
collectionItemSchema.index({ collectionId: 1, position: 1 });

export const CollectionItem = mongoose.models.CollectionItem ?? mongoose.model('CollectionItem', collectionItemSchema);

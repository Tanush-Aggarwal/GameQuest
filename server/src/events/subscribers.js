// Wires domain-event subscribers. Services emit events and never call each other's side effects
// directly; anything that reacts (clean-up, activity feed, notifications) subscribes here.
export function registerSubscribers({ eventBus, collectionService }) {
  // A deleted library entry must disappear from every manual collection that held it.
  eventBus.on('library.entryRemoved', ({ entryId }) => collectionService.forgetEntry(entryId));
}

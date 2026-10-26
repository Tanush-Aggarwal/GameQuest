// Wires domain-event subscribers. Services emit events and never call each other's side effects
// directly; anything that reacts (clean-up, activity feed, notifications) subscribes here.
const ACTIVITY_EVENTS = ['library.statusChanged', 'review.created', 'library.sessionLogged', 'collection.created', 'session.created'];

export function registerSubscribers({ eventBus, collectionService, activityService }) {
  // A deleted library entry must disappear from every manual collection that held it.
  if (collectionService) eventBus.on('library.entryRemoved', ({ entryId }) => collectionService.forgetEntry(entryId));

  // The activity feed is written here and nowhere else.
  if (activityService) {
    for (const type of ACTIVITY_EVENTS) eventBus.on(type, (payload) => activityService.record(type, payload));
  }
}

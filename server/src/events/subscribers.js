// Wires domain-event subscribers. Services emit events and never call each other's side effects
// directly; anything that reacts (clean-up, activity feed, notifications) subscribes here.
const ACTIVITY_EVENTS = ['library.statusChanged', 'review.created', 'library.sessionLogged', 'collection.created', 'session.created', 'sync.completed'];

export function registerSubscribers({ eventBus, collectionService, activityService, recommendationService }) {
  // A deleted library entry must disappear from every manual collection that held it.
  if (collectionService) eventBus.on('library.entryRemoved', ({ entryId }) => collectionService.forgetEntry(entryId));

  // The activity feed is written here and nowhere else.
  if (activityService) {
    for (const type of ACTIVITY_EVENTS) eventBus.on(type, (payload) => activityService.record(type, payload));
  }

  // Recommendation outcomes update when a recipient finishes or reviews a game.
  if (recommendationService) {
    eventBus.on('library.statusChanged', (payload) => recommendationService.updateOutcomeOnStatusChange(payload));
    eventBus.on('review.created', (payload) => recommendationService.updateOutcomeOnReview(payload));
  }
}

import { EventEmitter } from 'node:events';

// Internal domain event bus. Services emit; quests, activity and notifications subscribe.
// A failing subscriber must never break the request that emitted the event.
export function createEventBus({ logger = console } = {}) {
  const emitter = new EventEmitter();
  return {
    on(event, handler) {
      emitter.on(event, async (payload) => {
        try {
          await handler(payload);
        } catch (err) {
          logger.error({ err, event }, 'event subscriber failed');
        }
      });
    },
    emit(event, payload) {
      emitter.emit(event, payload);
    },
  };
}

export const eventBus = createEventBus();

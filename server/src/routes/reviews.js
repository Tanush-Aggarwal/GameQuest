import { Router } from 'express';
import { upsertReviewSchema } from '@gamequest/shared';
import { validate } from '../middleware/validate.js';
import { createReviewController } from '../controllers/reviewController.js';

export function createReviewsRouter({ requireAuth, reviewService, LibraryEntry }) {
  const router = Router();
  const controller = createReviewController({ reviewService, LibraryEntry });

  // Protected: upsert/delete/get own review
  router.use(requireAuth);
  router.put('/:gameId', validate(upsertReviewSchema), controller.upsert);
  router.delete('/:gameId', controller.deleteReview);
  router.get('/mine/:gameId', controller.getMine);

  // Public: list reviews for a game or by a user
  // (requireAuth is already applied above — these are also authenticated,
  //  but you could move them outside requireAuth for truly public access)
  router.get('/game/:gameId', controller.listForGame);
  router.get('/user/:userId', controller.listByUser);

  return router;
}

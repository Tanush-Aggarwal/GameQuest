import { Router } from 'express';
import {
  addCollectionItemSchema,
  collectionDetailQuerySchema,
  collectionIdParamsSchema,
  collectionItemParamsSchema,
  collectionListQuerySchema,
  createCollectionSchema,
  moveCollectionItemSchema,
  previewRulesSchema,
  updateCollectionSchema,
} from '@gamequest/shared';
import { validate } from '../middleware/validate.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createCollectionController } from '../controllers/collectionController.js';

// Ownership is enforced in collectionService (requireOwnership lives there because it needs the
// collection's visibility to choose between 403 and 404).
export function createCollectionsRouter({ authService, collectionService }) {
  const router = Router();
  const controller = createCollectionController({ collectionService });
  const idParams = validate(collectionIdParamsSchema, 'params');
  const itemParams = validate(collectionItemParamsSchema, 'params');

  router.use(createRequireAuth(authService));
  router.get('/', validate(collectionListQuerySchema, 'query'), controller.list);
  router.post('/', validate(createCollectionSchema), controller.create);
  router.post('/preview', validate(previewRulesSchema), controller.preview);
  router.get('/:id', idParams, validate(collectionDetailQuerySchema, 'query'), controller.get);
  router.patch('/:id', idParams, validate(updateCollectionSchema), controller.update);
  router.delete('/:id', idParams, controller.remove);
  router.post('/:id/items', idParams, validate(addCollectionItemSchema), controller.addItem);
  router.delete('/:id/items/:itemId', itemParams, controller.removeItem);
  router.patch('/:id/items/:itemId/position', itemParams, validate(moveCollectionItemSchema), controller.moveItem);

  return router;
}

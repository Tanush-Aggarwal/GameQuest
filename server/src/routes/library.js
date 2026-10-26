import { Router } from 'express';
import {
  addToLibrarySchema,
  changeStatusSchema,
  entryIdParamsSchema,
  libraryListQuerySchema,
  visibilitySchema,
} from '@gamequest/shared';
import { validate } from '../middleware/validate.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createLibraryController } from '../controllers/libraryController.js';

// Status changes get their own endpoint (not a generic PATCH) so each runs its own rules.
export function createLibraryRouter({ authService, libraryService }) {
  const router = Router();
  const controller = createLibraryController({ libraryService });
  const idParams = validate(entryIdParamsSchema, 'params');

  router.use(createRequireAuth(authService));
  router.get('/', validate(libraryListQuerySchema, 'query'), controller.list);
  router.post('/', validate(addToLibrarySchema), controller.add);
  router.patch('/:id/status', idParams, validate(changeStatusSchema), controller.changeStatus);
  router.patch('/:id/visibility', idParams, validate(visibilitySchema), controller.setVisibility);
  router.get('/:id/history', idParams, controller.history);
  router.delete('/:id', idParams, controller.remove);

  return router;
}

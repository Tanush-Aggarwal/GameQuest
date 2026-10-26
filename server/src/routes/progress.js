import { Router } from 'express';
import { createProgressController } from '../controllers/progressController.js';
import { validate } from '../middleware/validate.js';
import { manualProgressSchema, playLogSchema, journalEntrySchema } from '@gamequest/shared';
import { z } from 'zod';

const idParams = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i) });
const logIdParams = idParams.extend({ logId: z.string().regex(/^[a-f0-9]{24}$/i) });
const noteIdParams = idParams.extend({ noteId: z.string().regex(/^[a-f0-9]{24}$/i) });

export function createProgressRouter({ requireAuth, progressService }) {
  const router = Router();
  const ctrl = createProgressController({ progressService });

  router.patch('/:id/progress', requireAuth, validate(idParams, 'params'), validate(manualProgressSchema, 'body'), ctrl.setProgress);
  router.post('/:id/playlogs', requireAuth, validate(idParams, 'params'), validate(playLogSchema, 'body'), ctrl.logSession);
  router.get('/:id/playlogs', requireAuth, validate(idParams, 'params'), ctrl.listLogs);
  router.delete('/:id/playlogs/:logId', requireAuth, validate(logIdParams, 'params'), ctrl.deleteLog);
  router.post('/:id/journal', requireAuth, validate(idParams, 'params'), validate(journalEntrySchema, 'body'), ctrl.addJournal);
  router.get('/:id/journal', requireAuth, validate(idParams, 'params'), ctrl.listJournal);
  router.delete('/:id/journal/:noteId', requireAuth, validate(noteIdParams, 'params'), ctrl.deleteJournal);

  return router;
}

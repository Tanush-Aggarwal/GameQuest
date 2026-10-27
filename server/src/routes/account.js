import { Router } from 'express';
import { deleteAccountSchema } from '@gamequest/shared';
import { validate } from '../middleware/validate.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { createAccountController } from '../controllers/accountController.js';

// /account: the signed-in user's level summary and account deletion.
// /notifications: the bell (derived notifications + mark all read).
export function createAccountRouters({ authService, accountService, notificationService, config }) {
  const controller = createAccountController({ accountService, notificationService, config });
  const requireAuth = createRequireAuth(authService);
  const deleteLimiter = createRateLimiter({ max: 5, keyGenerator: (req) => `account-delete:${req.auth.userId}` });

  const account = Router();
  account.use(requireAuth);
  account.get('/summary', controller.summary);
  account.delete('/', deleteLimiter, validate(deleteAccountSchema), controller.remove);

  const notifications = Router();
  notifications.use(requireAuth);
  notifications.get('/', controller.notifications);
  notifications.post('/read', controller.readNotifications);

  return { account, notifications };
}

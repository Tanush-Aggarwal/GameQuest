import { Router } from 'express';
import {
  friendRequestSchema,
  friendshipIdParamsSchema,
  pageQuerySchema,
  privacySchema,
  updateProfileSchema,
  userIdParamsSchema,
  userSearchQuerySchema,
  usernameParamsSchema,
} from '@gamequest/shared';
import { validate } from '../middleware/validate.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { createSocialController } from '../controllers/socialController.js';

// Four small routers (friends, blocks, users, feed) sharing one controller; all require a session.
export function createSocialRouters({ authService, friendService, profileService, activityService }) {
  const controller = createSocialController({ friendService, profileService, activityService });
  const requireAuth = createRequireAuth(authService);
  const userId = validate(userIdParamsSchema, 'params');
  const requestId = validate(friendshipIdParamsSchema, 'params');

  // Requests are the only thing that notifies another person, so they get a tight budget.
  const requestLimiter = createRateLimiter({ max: 30 });
  const searchLimiter = createRateLimiter({ max: 120 });

  const friends = Router();
  friends.use(requireAuth);
  friends.get('/', controller.listFriends);
  friends.get('/requests', controller.listRequests);
  friends.post('/requests', requestLimiter, validate(friendRequestSchema), controller.sendRequest);
  friends.post('/requests/:id/accept', requestId, controller.acceptRequest);
  friends.post('/requests/:id/decline', requestId, controller.declineRequest);
  friends.delete('/requests/:id', requestId, controller.cancelRequest);
  friends.delete('/:userId', userId, controller.unfriend);

  const blocks = Router();
  blocks.use(requireAuth);
  blocks.get('/', controller.listBlocked);
  blocks.post('/:userId', userId, controller.block);
  blocks.delete('/:userId', userId, controller.unblock);

  const users = Router();
  users.use(requireAuth);
  users.get('/search', searchLimiter, validate(userSearchQuerySchema, 'query'), controller.searchUsers);
  users.patch('/me', validate(updateProfileSchema), controller.updateProfile);
  users.patch('/me/privacy', validate(privacySchema), controller.setPrivacy);
  const username = validate(usernameParamsSchema, 'params');
  users.get('/:username', username, controller.getProfile);
  users.get('/:username/activity', username, validate(pageQuerySchema, 'query'), controller.getProfileActivity);
  users.get('/:username/collections', username, controller.getProfileCollections);

  const feed = Router();
  feed.use(requireAuth);
  feed.get('/', validate(pageQuerySchema, 'query'), controller.feed);

  return { friends, blocks, users, feed };
}

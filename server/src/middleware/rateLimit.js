import rateLimit from 'express-rate-limit';
import { RateLimitError } from '../utils/errors.js';

// `keyGenerator` defaults to the client IP; pass one that returns the authenticated user id for per-user limits.
// `skipFailedRequests` stops error responses from using up the allowance.
export function createRateLimiter({ max, windowMs = 15 * 60 * 1000, keyGenerator, skipFailedRequests = false, message }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipFailedRequests,
    ...(keyGenerator && { keyGenerator }),
    handler: (_req, _res, next) => next(new RateLimitError(message)),
  });
}

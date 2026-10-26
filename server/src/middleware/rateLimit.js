import rateLimit from 'express-rate-limit';
import { RateLimitError } from '../utils/errors.js';

export function createRateLimiter({ max, windowMs = 15 * 60 * 1000 }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new RateLimitError()),
  });
}

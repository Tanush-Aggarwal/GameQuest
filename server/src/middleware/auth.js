import { AuthError, ForbiddenError } from '../utils/errors.js';

export const ACCESS_COOKIE = 'gq_access';
export const REFRESH_COOKIE = 'gq_refresh';

// Identity comes only from the signed access cookie, never from the request body.
export function createRequireAuth(authService) {
  return function requireAuth(req, _res, next) {
    try {
      const token = req.cookies?.[ACCESS_COOKIE];
      if (!token) throw new AuthError();
      req.auth = authService.verifyAccess(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireRole(...roles) {
  return function requireRoleMiddleware(req, _res, next) {
    if (!req.auth) return next(new AuthError());
    if (!roles.includes(req.auth.role)) return next(new ForbiddenError());
    return next();
  };
}

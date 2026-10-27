import { ACCESS_COOKIE, REFRESH_COOKIE } from '../middleware/auth.js';

export function createAccountController({ accountService, notificationService, config }) {
  const sameSite = config.cookieSameSite ?? 'lax';
  const base = { httpOnly: true, secure: config.isProd || sameSite === 'none', sameSite };

  return {
    async summary(req, res) {
      res.set('Cache-Control', 'private, no-store');
      res.json(await accountService.summary(req.auth.userId));
    },

    async remove(req, res) {
      await accountService.deleteAccount(req.auth.userId, { confirmUsername: req.body.confirmUsername });
      res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
      res.clearCookie(REFRESH_COOKIE, { ...base, path: '/api/v1/auth' });
      res.status(204).end();
    },

    async notifications(req, res) {
      res.set('Cache-Control', 'private, no-store');
      res.json(await notificationService.list(req.auth.userId));
    },

    async readNotifications(req, res) {
      res.json(await notificationService.markAllRead(req.auth.userId));
    },
  };
}

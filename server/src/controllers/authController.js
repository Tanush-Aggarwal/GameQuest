import { ACCESS_COOKIE, REFRESH_COOKIE } from '../middleware/auth.js';

export function createAuthController({ authService, config }) {
  // SameSite=None + Secure in production (client and API are on different domains).
  const base = {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.isProd ? 'none' : 'lax',
  };

  function setSession(res, { accessToken, refreshToken }) {
    res.cookie(ACCESS_COOKIE, accessToken, {
      ...base,
      path: '/',
      maxAge: config.auth.accessTtlSeconds * 1000,
    });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...base,
      path: '/api/v1/auth',
      maxAge: config.auth.refreshTtlSeconds * 1000,
    });
  }

  function clearSession(res) {
    res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...base, path: '/api/v1/auth' });
  }

  return {
    async register(req, res) {
      const { user, ...tokens } = await authService.register(req.body);
      setSession(res, tokens);
      res.status(201).json({ user });
    },

    async login(req, res) {
      const { user, ...tokens } = await authService.login(req.body);
      setSession(res, tokens);
      res.json({ user });
    },

    async refresh(req, res) {
      try {
        const { user, ...tokens } = await authService.refresh(req.cookies?.[REFRESH_COOKIE]);
        setSession(res, tokens);
        res.json({ user });
      } catch (err) {
        clearSession(res);
        throw err;
      }
    },

    async logout(req, res) {
      await authService.logout(req.cookies?.[REFRESH_COOKIE]);
      clearSession(res);
      res.status(204).end();
    },

    async me(req, res) {
      res.json({ user: await authService.getMe(req.auth.userId) });
    },
  };
}

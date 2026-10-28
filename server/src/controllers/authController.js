import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../middleware/auth.js';
import { AuthError, ConflictError } from '../utils/errors.js';

const GOOGLE_PATH = '/api/v1/auth/google';
const STATE_COOKIE = 'gq_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

const sameState = (a, b) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};

export function createAuthController({ authService, googleAdapter, config }) {
  // Secure in production. SameSite comes from config: Lax by default because production traffic
  // reaches the API through the client's own domain (Vercel rewrite), so cookies are first-party.
  const sameSite = config.cookieSameSite ?? 'lax';
  const base = {
    httpOnly: true,
    secure: config.isProd || sameSite === 'none',
    sameSite,
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

  const stateCookie = { httpOnly: true, secure: config.isProd, sameSite: 'lax', path: GOOGLE_PATH };
  // The browser is mid-redirect, so failures go back to the login page as a short code the page words itself.
  const backToLogin = (res, code) => res.redirect(`${config.clientOrigin}/login?error=${code}`);

  return {
    providers(req, res) {
      res.json({ google: Boolean(googleAdapter?.isConfigured()) });
    },

    googleStart(req, res) {
      if (!googleAdapter?.isConfigured()) return backToLogin(res, 'google_unavailable');
      const state = randomBytes(24).toString('hex');
      res.cookie(STATE_COOKIE, state, { ...stateCookie, maxAge: STATE_TTL_MS });
      return res.redirect(googleAdapter.buildAuthUrl({ state }));
    },

    async googleCallback(req, res) {
      const expected = req.cookies?.[STATE_COOKIE];
      res.clearCookie(STATE_COOKIE, stateCookie);
      if (req.query.error) return backToLogin(res, 'google_cancelled');
      if (!googleAdapter?.isConfigured()) return backToLogin(res, 'google_unavailable');
      if (typeof req.query.code !== 'string' || !sameState(req.query.state, expected)) {
        return backToLogin(res, 'google_state');
      }
      try {
        const profile = await googleAdapter.exchangeCode(req.query.code);
        const { accessToken, refreshToken } = await authService.loginWithGoogle(profile);
        setSession(res, { accessToken, refreshToken });
        return res.redirect(`${config.clientOrigin}/`);
      } catch (err) {
        // Never log the query string: the one-time code in it is a secret.
        req.log?.warn({ err: { name: err.name, message: err.message } }, 'google sign-in failed');
        if (err instanceof ConflictError) return backToLogin(res, 'google_email_exists');
        if (err instanceof AuthError) return backToLogin(res, 'google_unverified');
        return backToLogin(res, 'google_failed');
      }
    },

    async register(req, res) {
      const result = await authService.register(req.body);
      if (result.accessToken && result.refreshToken) {
        setSession(res, { accessToken: result.accessToken, refreshToken: result.refreshToken });
      }
      res.status(201).json({
        user: result.user,
        ...(result.emailVerificationPending ? { emailVerificationPending: true } : {}),
      });
    },

    async verifyEmail(req, res) {
      const result = await authService.verifyEmail(req.body);
      res.json(result);
    },

    async resendVerification(req, res) {
      const result = await authService.resendVerification(req.body);
      res.json(result);
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

    async forgotPassword(req, res) {
      const result = await authService.forgotPassword(req.body);
      res.json(result);
    },

    async resetPassword(req, res) {
      const result = await authService.resetPassword(req.body);
      res.json(result);
    },
  };
}

import request from 'supertest';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { AuthError } from '../utils/errors.js';
import { createFakeModels, logger, testConfig } from './helpers.js';

const creds = { username: 'Player_One', email: 'player@example.com', password: 'correct-horse-9' };

function setup(configExtra = {}, serviceOpts = {}) {
  const config = testConfig(configExtra);
  const models = createFakeModels();
  const sentEmails = [];
  const fakeEmailService = {
    isConfigured: () => true,
    sendPasswordResetEmail: async (payload) => {
      sentEmails.push(payload);
      return { sent: true };
    },
  };
  const authService = createAuthService({
    ...models,
    config,
    emailService: fakeEmailService,
    bcryptRounds: 4,
    reuseGraceMs: 0,
    ...serviceOpts,
  });
  const app = createApp({ config, logger, authService, emailService: fakeEmailService });
  return { app, config, models, authService, sentEmails, fakeEmailService };
}

describe('Password Reset flow', () => {
  it('returns generic message for an existing account and dispatches reset email', async () => {
    const { authService, sentEmails, models } = setup();
    await authService.register(creds);

    const res = await authService.forgotPassword({ email: 'player@example.com' });
    expect(res.message).toMatch(/if an eligible account exists/i);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe('player@example.com');
    expect(sentEmails[0].token).toHaveLength(64); // 32 bytes hex

    const userInDb = models.User.docs[0];
    expect(userInDb.resetPasswordTokenHash).toBeDefined();
    expect(userInDb.resetPasswordTokenHash).not.toBe(sentEmails[0].token); // only hash is stored
    expect(new Date(userInDb.resetPasswordExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('returns identical generic message for an unknown email without dispatching email', async () => {
    const { authService, sentEmails } = setup();
    const res = await authService.forgotPassword({ email: 'unknown@example.com' });
    expect(res.message).toMatch(/if an eligible account exists/i);
    expect(sentEmails).toHaveLength(0);
  });

  it('does not dispatch reset email or set token for Google-only accounts (no password)', async () => {
    const { authService, sentEmails, models } = setup();
    await authService.loginWithGoogle({
      sub: 'google-sub-123',
      email: 'google@example.com',
      emailVerified: true,
      name: 'Google User',
    });

    const res = await authService.forgotPassword({ email: 'google@example.com' });
    expect(res.message).toMatch(/if an eligible account exists/i);
    expect(sentEmails).toHaveLength(0);
    const googleUser = models.User.docs[0];
    expect(googleUser.resetPasswordTokenHash).toBeUndefined();
  });

  it('successfully resets password with a valid token and invalidates active sessions', async () => {
    const { authService, sentEmails, models } = setup();
    await authService.register(creds);
    expect(models.RefreshToken.docs).toHaveLength(1);

    await authService.forgotPassword({ email: creds.email });
    const { token } = sentEmails[0];

    const resetRes = await authService.resetPassword({ token, password: 'new-valid-password-10' });
    expect(resetRes.success).toBe(true);

    // Refresh tokens / sessions must be wiped
    expect(models.RefreshToken.docs).toHaveLength(0);

    // Old password fails, new password succeeds
    await expect(authService.login({ email: creds.email, password: creds.password })).rejects.toBeInstanceOf(AuthError);
    const newLogin = await authService.login({ email: creds.email, password: 'new-valid-password-10' });
    expect(newLogin.user.email).toBe(creds.email);
  });

  it('rejects an invalid token', async () => {
    const { authService } = setup();
    await authService.register(creds);
    await authService.forgotPassword({ email: creds.email });

    await expect(authService.resetPassword({ token: 'wrong-token', password: 'new-password-123' })).rejects.toBeInstanceOf(AuthError);
  });

  it('rejects an expired token', async () => {
    const { authService, sentEmails, models } = setup();
    await authService.register(creds);
    await authService.forgotPassword({ email: creds.email });
    const { token } = sentEmails[0];

    // Simulate token expiration
    models.User.docs[0].resetPasswordExpiresAt = new Date(Date.now() - 1000);

    await expect(authService.resetPassword({ token, password: 'new-password-123' })).rejects.toBeInstanceOf(AuthError);
  });

  it('rejects reuse of an already-consumed token', async () => {
    const { authService, sentEmails } = setup();
    await authService.register(creds);
    await authService.forgotPassword({ email: creds.email });
    const { token } = sentEmails[0];

    // First use succeeds
    await authService.resetPassword({ token, password: 'first-new-password-1' });

    // Second use of the same token fails
    await expect(authService.resetPassword({ token, password: 'second-new-password-2' })).rejects.toBeInstanceOf(AuthError);
  });

  describe('HTTP endpoints', () => {
    it('POST /api/v1/auth/forgot-password validates email and returns 200', async () => {
      const { app } = setup();
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'bad-email' });
      expect(res.status).toBe(400);

      const okRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'anyone@example.com' });
      expect(okRes.status).toBe(200);
      expect(okRes.body.message).toMatch(/if an eligible account exists/i);
    });

    it('POST /api/v1/auth/reset-password validates input and completes reset', async () => {
      const { app, authService, sentEmails } = setup();
      await authService.register(creds);
      await authService.forgotPassword({ email: creds.email });
      const { token } = sentEmails[0];

      // Missing or short password
      const badPw = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'short' });
      expect(badPw.status).toBe(400);

      // Valid reset
      const good = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'brand-new-password-1' });
      expect(good.status).toBe(200);
      expect(good.body.success).toBe(true);

      // Subsequent attempt with same token fails with 401
      const reuse = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'brand-new-password-1' });
      expect(reuse.status).toBe(401);
    });
  });
});


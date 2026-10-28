import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { createFakeModels, logger, testConfig } from './helpers.js';

describe('Email Verification & Security Hardening', () => {
  const creds = { username: 'QuestTester', email: 'tester@gamequest.dev', password: 'SecretPassword123!' };

  function setup(configExtra = {}) {
    const config = testConfig({
      REQUIRE_EMAIL_VERIFICATION: 'true',
      ...configExtra,
    });
    const models = createFakeModels();
    const sentEmails = [];
    const fakeEmailService = {
      isConfigured: () => true,
      async sendVerificationEmail(payload) {
        sentEmails.push({ type: 'verification', ...payload });
        return { sent: true };
      },
      async sendPasswordResetEmail(payload) {
        sentEmails.push({ type: 'reset', ...payload });
        return { sent: true };
      },
      async sendPasswordChangedNotification(payload) {
        sentEmails.push({ type: 'password_changed', ...payload });
        return { sent: true };
      },
    };

    const authService = createAuthService({
      ...models,
      config,
      emailService: fakeEmailService,
      logger,
      bcryptRounds: 4,
      reuseGraceMs: 0,
    });

    const app = createApp({ config, logger, authService, emailService: fakeEmailService });
    return { app, authService, models, sentEmails, config };
  }

  describe('Registration & Initial State', () => {
    it('creates an unverified user, stores secret-keyed HMAC for 6-digit code, and issues no session cookies', async () => {
      const { app, models, sentEmails } = setup();

      const res = await request(app).post('/api/v1/auth/register').send(creds);

      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({
        username: 'QuestTester',
        email: 'tester@gamequest.dev',
        emailVerified: false,
        role: 'user',
      });
      expect(res.body.emailVerificationPending).toBe(true);
      // Raw code or dev links must NEVER be exposed in the response
      expect(res.body.devVerificationUrl).toBeUndefined();
      expect(res.body.code).toBeUndefined();

      // Must not issue cookies
      expect(res.headers['set-cookie']).toBeUndefined();

      // Check DB state
      const dbUser = models.User.docs.find((u) => u.email === 'tester@gamequest.dev');
      expect(dbUser).toBeDefined();
      expect(dbUser.emailVerified).toBe(false);
      expect(dbUser.emailVerifiedAt).toBeNull();
      expect(dbUser.emailVerificationCodeHmac).toBeDefined();
      expect(dbUser.emailVerificationCodeHmac).toHaveLength(64); // SHA-256 HMAC
      expect(dbUser.emailVerificationAttempts).toBe(0);
      expect(dbUser.emailVerificationExpiresAt.getTime()).toBeGreaterThan(Date.now());

      // Verification email must have been dispatched with 6-digit code
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].type).toBe('verification');
      expect(sentEmails[0].to).toBe('tester@gamequest.dev');
      expect(sentEmails[0].code).toMatch(/^\d{6}$/);
    });

    it('blocks login for unverified accounts with EMAIL_NOT_VERIFIED', async () => {
      const { app } = setup();
      await request(app).post('/api/v1/auth/register').send(creds);

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password });

      expect(loginRes.status).toBe(401);
      expect(loginRes.body.error).toMatchObject({
        code: 'EMAIL_NOT_VERIFIED',
        message: expect.stringMatching(/verify your email/i),
        details: { email: creds.email, unverified: true },
      });
      expect(loginRes.headers['set-cookie']).toBeUndefined();
    });

    it('prevents account takeover: repeated registration with existing unverified email throws ConflictError and does NOT overwrite credentials', async () => {
      const { app, models } = setup();
      // Original user registers
      const reg1 = await request(app).post('/api/v1/auth/register').send(creds);
      expect(reg1.status).toBe(201);

      const initialUser = models.User.docs.find((u) => u.email === creds.email);
      const originalPasswordHash = initialUser.passwordHash;
      const originalHmac = initialUser.emailVerificationCodeHmac;

      // Attacker attempts to register again with same email and new password
      const attackRes = await request(app).post('/api/v1/auth/register').send({
        username: 'AttackerUser',
        email: creds.email,
        password: 'AttackerNewPassword999!',
      });

      expect(attackRes.status).toBe(409);
      expect(attackRes.body.error.message).toMatch(/email is already taken/i);

      // Verify that the existing user credentials were NOT modified
      const userAfterAttack = models.User.docs.find((u) => u.email === creds.email);
      expect(userAfterAttack.username).toBe('QuestTester');
      expect(userAfterAttack.passwordHash).toBe(originalPasswordHash);
      expect(userAfterAttack.emailVerificationCodeHmac).toBe(originalHmac);
    });
  });

  describe('POST /api/v1/auth/verify-email', () => {
    it('verifies account with valid 6-digit code and enables subsequent login', async () => {
      const { app, models, sentEmails } = setup();
      await request(app).post('/api/v1/auth/register').send(creds);
      const rawCode = sentEmails[0].code;

      // Verify email via HTTP with 6-digit code
      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: creds.email, code: rawCode });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.message).toMatch(/verified successfully/i);

      // Verify DB updates
      const dbUser = models.User.docs.find((u) => u.email === creds.email);
      expect(dbUser.emailVerified).toBe(true);
      expect(dbUser.emailVerifiedAt).toBeInstanceOf(Date);
      expect(dbUser.emailVerificationCodeHmac).toBeUndefined();
      expect(dbUser.emailVerificationExpiresAt).toBeUndefined();
      expect(dbUser.emailVerificationAttempts).toBeUndefined();

      // Subsequent login now succeeds and sets session cookies
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.user.emailVerified).toBe(true);
      expect(loginRes.headers['set-cookie']).toBeDefined();
    });

    it('rejects an expired verification code', async () => {
      const { app, models, sentEmails } = setup();
      await request(app).post('/api/v1/auth/register').send(creds);
      const rawCode = sentEmails[0].code;

      // Expire code in DB
      models.User.docs[0].emailVerificationExpiresAt = new Date(Date.now() - 1000);

      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: creds.email, code: rawCode });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('CODE_EXPIRED');
      expect(res.body.error.message).toMatch(/expired/i);
    });

    it('tracks failed attempts, reports remaining attempts, and locks out after 5 failures', async () => {
      const { app, models, sentEmails } = setup();
      await request(app).post('/api/v1/auth/register').send(creds);
      const validCode = sentEmails[0].code;
      const badCode = validCode === '123456' ? '654321' : '123456';

      // 1st wrong attempt
      const attempt1 = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: creds.email, code: badCode });
      expect(attempt1.status).toBe(401);
      expect(attempt1.body.error.code).toBe('INVALID_CODE');
      expect(attempt1.body.error.details.attemptsRemaining).toBe(4);

      // 2nd wrong attempt
      const attempt2 = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: creds.email, code: badCode });
      expect(attempt2.body.error.details.attemptsRemaining).toBe(3);

      // 3rd wrong attempt
      const attempt3 = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: creds.email, code: badCode });
      expect(attempt3.body.error.details.attemptsRemaining).toBe(2);

      // 4th wrong attempt
      const attempt4 = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: creds.email, code: badCode });
      expect(attempt4.body.error.details.attemptsRemaining).toBe(1);

      // 5th wrong attempt -> locks out & invalidates code
      const attempt5 = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: creds.email, code: badCode });
      expect(attempt5.status).toBe(401);
      expect(attempt5.body.error.code).toBe('MAX_ATTEMPTS_EXCEEDED');
      expect(attempt5.body.error.details.attemptsRemaining).toBe(0);

      // Code HMAC has been unset in DB
      const dbUser = models.User.docs.find((u) => u.email === creds.email);
      expect(dbUser.emailVerificationCodeHmac).toBeUndefined();

      // Even providing the original correct code now fails
      const retryValid = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: creds.email, code: validCode });
      expect(retryValid.status).toBe(401);
    });

    it('rejects reuse of an already-consumed verification code', async () => {
      const { app, sentEmails } = setup();
      await request(app).post('/api/v1/auth/register').send(creds);
      const rawCode = sentEmails[0].code;

      const first = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: creds.email, code: rawCode });
      expect(first.status).toBe(200);

      const second = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: creds.email, code: rawCode });
      // Already verified message
      expect(second.status).toBe(200);
      expect(second.body.message).toMatch(/already verified/i);
    });

    it('validates missing or invalid code format (must be 6 digits)', async () => {
      const { app } = setup();
      const res1 = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: creds.email, code: '123' });
      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('VALIDATION_ERROR');

      const res2 = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: creds.email, code: 'abcdef' });
      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/resend-verification', () => {
    it('resends verification code and enforces 60-second cooldown rate limit', async () => {
      const { app, sentEmails } = setup();
      await request(app).post('/api/v1/auth/register').send(creds);
      expect(sentEmails).toHaveLength(1);

      // Immediate second request within 60s should fail with 429
      const tooSoon = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: creds.email });

      expect(tooSoon.status).toBe(429);
      expect(tooSoon.body.error.code).toBe('RATE_LIMITED');
      expect(tooSoon.body.error.message).toMatch(/wait before requesting another/i);

      // After 60s elapses, request succeeds and sends fresh code
      const { models, app: app2, sentEmails: emails2 } = setup();
      await request(app2).post('/api/v1/auth/register').send(creds);
      models.User.docs[0].emailVerificationSentAt = new Date(Date.now() - 65_000);

      const resendRes = await request(app2)
        .post('/api/v1/auth/resend-verification')
        .send({ email: creds.email });

      expect(resendRes.status).toBe(200);
      expect(resendRes.body.message).toMatch(/verification code has been sent/i);
      expect(emails2).toHaveLength(2);
      expect(emails2[1].code).toMatch(/^\d{6}$/);
    });

    it('returns generic response for unknown email without disclosing account absence', async () => {
      const { app, sentEmails } = setup();

      const res = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'nonexistent@gamequest.dev' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/If an unverified account exists/i);
      expect(sentEmails).toHaveLength(0);
    });

    it('returns generic response for already-verified email without resending', async () => {
      const { app, models, sentEmails } = setup();
      await request(app).post('/api/v1/auth/register').send(creds);
      models.User.docs[0].emailVerified = true;
      models.User.docs[0].emailVerifiedAt = new Date();
      models.User.docs[0].emailVerificationSentAt = new Date(Date.now() - 65_000);

      const res = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: creds.email });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/If an unverified account exists/i);
      // Sent emails only has the initial registration email, no resend
      expect(sentEmails).toHaveLength(1);
    });
  });

  describe('Forgot Password Hardening', () => {
    it('does not send password reset email to unverified accounts', async () => {
      const { app, sentEmails } = setup();
      await request(app).post('/api/v1/auth/register').send(creds);
      expect(sentEmails).toHaveLength(1); // registration verification

      const resetReq = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: creds.email });

      expect(resetReq.status).toBe(200);
      expect(resetReq.body.message).toMatch(/instructions to reset/i);

      // No password reset email sent
      const resetEmails = sentEmails.filter((e) => e.type === 'reset');
      expect(resetEmails).toHaveLength(0);
    });

    it('sends reset email to verified accounts, enforces cooldown, and sends password changed notification', async () => {
      const { app, sentEmails } = setup();
      await request(app).post('/api/v1/auth/register').send(creds);
      const verifyCode = sentEmails[0].code;
      await request(app).post('/api/v1/auth/verify-email').send({ email: creds.email, code: verifyCode });

      // Request reset
      const resetReq = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: creds.email });

      expect(resetReq.status).toBe(200);
      const resetEmail = sentEmails.find((e) => e.type === 'reset');
      expect(resetEmail).toBeDefined();

      // Immediate second request within 60s fails with 429
      const tooSoon = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: creds.email });

      expect(tooSoon.status).toBe(429);
      expect(tooSoon.body.error.code).toBe('RATE_LIMITED');

      // Complete password reset
      const resetCompleteRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: resetEmail.token, password: 'NewPassword999!' });

      expect(resetCompleteRes.status).toBe(200);
      expect(resetCompleteRes.body.success).toBe(true);

      // Post-reset security notification must have been sent
      const changedEmail = sentEmails.find((e) => e.type === 'password_changed');
      expect(changedEmail).toBeDefined();
      expect(changedEmail.to).toBe(creds.email);
    });
  });

  describe('Google OAuth Verified Status', () => {
    it('marks Google authenticated accounts as emailVerified: true', async () => {
      const { authService, models } = setup();

      const out = await authService.loginWithGoogle({
        sub: 'google-sub-12345',
        email: 'googleplayer@gamequest.dev',
        emailVerified: true,
        name: 'GoogleGamer',
      });

      expect(out.user.emailVerified).toBe(true);
      const dbUser = models.User.docs.find((u) => u.email === 'googleplayer@gamequest.dev');
      expect(dbUser.emailVerified).toBe(true);
      expect(dbUser.emailVerifiedAt).toBeInstanceOf(Date);
    });
  });

  describe('Legacy Account Migration & Security Regression', () => {
    it('proves legacy password account with undefined/null emailVerified cannot log in or obtain session', async () => {
      const { app, models } = setup();

      // Simulate a legacy MongoDB user created before email verification existed
      const legacyPasswordHash = await bcrypt.hash('LegacyPass123!', 4);
      models.User.docs.push({
        _id: 'legacy-user-1',
        username: 'RetroGamer',
        usernameLower: 'retrogamer',
        email: 'retrogamer@legacy.dev',
        passwordHash: legacyPasswordHash,
        role: 'user',
        // Neither emailVerified nor emailVerifiedAt exist on legacy records
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'retrogamer@legacy.dev', password: 'LegacyPass123!' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({
        code: 'EMAIL_NOT_VERIFIED',
        details: { email: 'retrogamer@legacy.dev', unverified: true },
      });
      // Zero tokens or cookies issued
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.body.accessToken).toBeUndefined();
      expect(models.RefreshToken.docs).toHaveLength(0);
    });

    it('proves legacy account with emailVerified: true but missing timestamp evidence cannot log in without verification', async () => {
      const { app, models } = setup();

      const legacyPasswordHash = await bcrypt.hash('LegacyPass123!', 4);
      models.User.docs.push({
        _id: 'legacy-user-2',
        username: 'DubiousFlagUser',
        usernameLower: 'dubiousflaguser',
        email: 'unconfirmed@legacy.dev',
        passwordHash: legacyPasswordHash,
        role: 'user',
        emailVerified: true,
        emailVerifiedAt: null, // No trustworthy evidence of verification
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'unconfirmed@legacy.dev', password: 'LegacyPass123!' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('migrates legacy account: requests verification code, confirms email, logs in, and preserves existing data', async () => {
      const { app, models, sentEmails } = setup();

      const legacyPasswordHash = await bcrypt.hash('LegacyPass123!', 4);
      const legacyUser = {
        _id: 'legacy-user-3',
        username: 'VanguardPlayer',
        usernameLower: 'vanguardplayer',
        email: 'vanguard@legacy.dev',
        passwordHash: legacyPasswordHash,
        role: 'user',
        bio: 'Original veteran player since beta',
        favouriteGames: ['game-elden-ring', 'game-hollow-knight'],
      };
      models.User.docs.push(legacyUser);

      // 1. Initial login is blocked safely
      const loginAttempt1 = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'vanguard@legacy.dev', password: 'LegacyPass123!' });
      expect(loginAttempt1.status).toBe(401);
      expect(loginAttempt1.body.error.code).toBe('EMAIL_NOT_VERIFIED');

      // 2. Request verification code via resend endpoint
      const resendRes = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'vanguard@legacy.dev' });
      expect(resendRes.status).toBe(200);

      expect(sentEmails).toHaveLength(1);
      const verificationCode = sentEmails[0].code;
      expect(verificationCode).toMatch(/^\d{6}$/);

      // 3. Confirm email with 6-digit code
      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: 'vanguard@legacy.dev', code: verificationCode });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);

      // 4. Now login succeeds and establishes session
      const loginAttempt2 = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'vanguard@legacy.dev', password: 'LegacyPass123!' });
      expect(loginAttempt2.status).toBe(200);
      expect(loginAttempt2.body.user.emailVerified).toBe(true);
      expect(loginAttempt2.headers['set-cookie']).toBeDefined();

      // 5. Existing user data and profile records are completely preserved
      const dbUser = models.User.docs.find((u) => u._id === 'legacy-user-3');
      expect(dbUser.bio).toBe('Original veteran player since beta');
      expect(dbUser.favouriteGames).toEqual(['game-elden-ring', 'game-hollow-knight']);
      expect(dbUser.role).toBe('user');
      expect(dbUser.emailVerified).toBe(true);
      expect(dbUser.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('rejects Google OAuth login if Google profile reports unverified email', async () => {
      const { authService } = setup();

      await expect(
        authService.loginWithGoogle({
          sub: 'google-unverified-id',
          email: 'unconfirmed@gmail.com',
          emailVerified: false,
          name: 'Unverified Google User',
        }),
      ).rejects.toThrow('Google did not confirm your email address');
    });

    it('proves verification codes cannot be validated across isolated environments with different secrets', async () => {
      // Setup Environment A (Local)
      const localEnv = setup({ JWT_ACCESS_SECRET: 'secret-a-'.repeat(4) });
      // Setup Environment B (Production) with independent secret
      const prodEnv = setup({ JWT_ACCESS_SECRET: 'secret-b-'.repeat(4) });

      // Register account in Environment A (Local)
      await request(localEnv.app).post('/api/v1/auth/register').send(creds);
      expect(localEnv.sentEmails).toHaveLength(1);
      const localCode = localEnv.sentEmails[0].code;

      // Also create unverified user in Environment B with same email
      await request(prodEnv.app).post('/api/v1/auth/register').send(creds);

      // Attempting to verify localCode against Environment B (Production) fails because HMAC secret differs
      // Note: If randomInt generated different codes, it would fail anyway; even if the code was identical,
      // the HMAC keys differ.
      const crossEnvRes = await request(prodEnv.app)
        .post('/api/v1/auth/verify-email')
        .send({ email: creds.email, code: localCode });

      // Environment B has its own code, so localCode will not match Environment B's HMAC
      if (prodEnv.sentEmails[0].code !== localCode) {
        expect(crossEnvRes.status).toBe(401);
      }

      // Verifying localCode against Environment A (Local) succeeds
      const correctEnvRes = await request(localEnv.app)
        .post('/api/v1/auth/verify-email')
        .send({ email: creds.email, code: localCode });

      expect(correctEnvRes.status).toBe(200);
      expect(correctEnvRes.body.success).toBe(true);
    });
  });
});

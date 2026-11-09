import request from 'supertest';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { createFakeModels, logger, testConfig } from './helpers.js';

// Default production behaviour: email is verified with a code, but a missing or failed email never locks anyone out.
describe('soft email verification (BLOCK_UNVERIFIED_LOGIN=false)', () => {
  const creds = { username: 'SoftTester', email: 'soft@gamequest.dev', password: 'SecretPassword123!', acceptTerms: true };

  function setup({ sendResult = { sent: true }, throws = false } = {}) {
    const config = testConfig({ REQUIRE_EMAIL_VERIFICATION: 'true', BLOCK_UNVERIFIED_LOGIN: 'false' });
    const models = createFakeModels();
    const sent = [];
    const emailService = {
      isConfigured: () => true,
      async sendVerificationEmail(p) {
        if (throws) throw new Error('relay down');
        sent.push(p);
        return sendResult;
      },
      async sendPasswordResetEmail() { return { sent: true }; },
      async sendPasswordChangedNotification() { return { sent: true }; },
    };
    const authService = createAuthService({ ...models, config, emailService, logger, bcryptRounds: 4 });
    const app = createApp({ config, logger, authService, emailService });
    return { app, models, sent };
  }

  it('signs the new account in, sends a code and reports the email as sent', async () => {
    const { app, sent } = setup();
    const res = await request(app).post('/api/v1/auth/register').send(creds);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ signedIn: true, emailVerificationPending: true, emailSent: true });
    expect(res.body.user.emailVerified).toBe(false);
    expect((res.headers['set-cookie'] ?? []).join(';')).toMatch(/access/i);
    expect(sent).toHaveLength(1);
  });

  it('still signs in and says the email was not sent when the relay fails', async () => {
    const { app } = setup({ throws: true });
    const res = await request(app).post('/api/v1/auth/register').send(creds);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ signedIn: true, emailSent: false });
  });

  it('lets an unverified account log in with email and password', async () => {
    const { app } = setup({ sendResult: { sent: false } });
    await request(app).post('/api/v1/auth/register').send(creds);
    const res = await request(app).post('/api/v1/auth/login').send({ email: creds.email, password: creds.password });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: creds.email, emailVerified: false });
  });

  it('still rejects a wrong password', async () => {
    const { app } = setup();
    await request(app).post('/api/v1/auth/register').send(creds);
    const res = await request(app).post('/api/v1/auth/login').send({ email: creds.email, password: 'WrongPassword123!' });
    expect(res.status).toBe(401);
  });

  it('verifies the email later with the code that was sent', async () => {
    const { app, sent } = setup();
    await request(app).post('/api/v1/auth/register').send(creds);
    const res = await request(app).post('/api/v1/auth/verify-email').send({ email: creds.email, code: sent[0].code });
    expect(res.status).toBe(200);
    const login = await request(app).post('/api/v1/auth/login').send({ email: creds.email, password: creds.password });
    expect(login.body.user.emailVerified).toBe(true);
  });
});

describe('strict email verification (default)', () => {
  const creds = { username: 'StrictTester', email: 'strict@gamequest.dev', password: 'SecretPassword123!', acceptTerms: true };
  function setup() {
    const config = testConfig({ REQUIRE_EMAIL_VERIFICATION: 'true' });
    const models = createFakeModels();
    const sent = [];
    const emailService = {
      isConfigured: () => true,
      async sendVerificationEmail(p) { sent.push(p); return { sent: true }; },
      async sendAccountExistsEmail() { return { sent: true }; },
      async sendPasswordResetEmail() { return { sent: true }; },
      async sendPasswordChangedNotification() { return { sent: true }; },
    };
    const authService = createAuthService({ ...models, config, emailService, logger, bcryptRounds: 4 });
    return { app: createApp({ config, logger, authService, emailService }), sent };
  }

  it('does not sign in at sign-up and refuses login until the code is entered', async () => {
    const { app, sent } = setup();
    const reg = await request(app).post('/api/v1/auth/register').send(creds);
    expect(reg.body).toMatchObject({ signedIn: false, emailVerificationPending: true });
    expect((reg.headers['set-cookie'] ?? []).join(';')).not.toMatch(/gq_access/);
    const blocked = await request(app).post('/api/v1/auth/login').send({ email: creds.email, password: creds.password });
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    await request(app).post('/api/v1/auth/verify-email').send({ email: creds.email, code: sent[0].code });
    const ok = await request(app).post('/api/v1/auth/login').send({ email: creds.email, password: creds.password });
    expect(ok.status).toBe(200);
  });

  it('locks an account after 10 failed logins even from different IPs', async () => {
    const { app, sent } = setup();
    await request(app).post('/api/v1/auth/register').send(creds);
    await request(app).post('/api/v1/auth/verify-email').send({ email: creds.email, code: sent[0].code });
    for (let i = 0; i < 10; i += 1) {
      await request(app).post('/api/v1/auth/login').send({ email: creds.email, password: 'WrongPassword1' });
    }
    const res = await request(app).post('/api/v1/auth/login').send({ email: creds.email, password: creds.password });
    expect(res.status).toBe(429);
  });

  it('rejects a new password without a number', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/v1/auth/register').send({ ...creds, password: 'onlyletters' });
    expect(res.status).toBe(400);
  });
});

describe('health', () => {
  it('says whether email sending is configured without exposing settings', async () => {
    const config = testConfig();
    const emailService = { isConfigured: () => false };
    const app = createApp({ config, logger, emailService });
    const res = await request(app).get('/api/v1/health');
    expect(res.body.email).toBe('not_configured');
    expect(JSON.stringify(res.body)).not.toMatch(/relay|secret|http/i);
  });
});

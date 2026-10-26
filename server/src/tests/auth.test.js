import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { jest } from '@jest/globals';
import { requireRole } from '../middleware/auth.js';
import { AuthError, ConflictError, ForbiddenError } from '../utils/errors.js';
import { createFakeModels, logger, testConfig } from './helpers.js';

const creds = { username: 'Player_One', email: 'Player@Example.com', password: 'correct-horse-9' };

function setup(configExtra, serviceOpts = {}) {
  const config = testConfig(configExtra);
  const models = createFakeModels();
  const authService = createAuthService({ ...models, config, bcryptRounds: 4, reuseGraceMs: 0, ...serviceOpts });
  const app = createApp({ config, logger, authService });
  return { app, config, models, authService };
}

const cookieValue = (res, name) => {
  const line = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));
  return line ? line.split(';')[0].slice(name.length + 1) : undefined;
};
const cookieHeader = (pairs) => Object.entries(pairs).map(([k, v]) => `${k}=${v}`);

describe('authService', () => {
  it('registers, normalises email, hashes the password and issues tokens', async () => {
    const { authService, models } = setup();
    const out = await authService.register({ ...creds, email: 'player@example.com' });
    expect(out.user).toMatchObject({ username: 'Player_One', email: 'player@example.com', role: 'user' });
    expect(out.user.passwordHash).toBeUndefined();
    expect(models.User.docs[0].passwordHash).not.toBe(creds.password);
    expect(models.RefreshToken.docs).toHaveLength(1);
  });

  it('rejects duplicate email and case-insensitive duplicate username', async () => {
    const { authService } = setup();
    await authService.register({ ...creds, email: 'player@example.com' });
    await expect(
      authService.register({ ...creds, username: 'other', email: 'player@example.com' }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      authService.register({ ...creds, username: 'PLAYER_one', email: 'x@example.com' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('login fails identically for wrong password and unknown email', async () => {
    const { authService } = setup();
    await authService.register({ ...creds, email: 'player@example.com' });
    const wrongPw = await authService.login({ email: 'player@example.com', password: 'nope-nope-1' }).catch((e) => e);
    const unknown = await authService.login({ email: 'ghost@example.com', password: 'nope-nope-1' }).catch((e) => e);
    expect(wrongPw).toBeInstanceOf(AuthError);
    expect(unknown).toBeInstanceOf(AuthError);
    expect(wrongPw.message).toBe(unknown.message);
  });

  it('rotates refresh tokens and revokes the family when an old one is replayed', async () => {
    const { authService, models } = setup();
    const first = await authService.register({ ...creds, email: 'player@example.com' });
    const second = await authService.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // replay of the already-used token → theft assumed
    await expect(authService.refresh(first.refreshToken)).rejects.toBeInstanceOf(AuthError);
    expect(models.RefreshToken.docs).toHaveLength(0);
    // the legitimately rotated token is now dead too
    await expect(authService.refresh(second.refreshToken)).rejects.toBeInstanceOf(AuthError);
  });

  it('a replay inside the grace window is a 401 but keeps the family alive (two tabs)', async () => {
    const { authService, models } = setup(undefined, { reuseGraceMs: 10_000 });
    const first = await authService.register({ ...creds, email: 'player@example.com' });
    const second = await authService.refresh(first.refreshToken);
    await expect(authService.refresh(first.refreshToken)).rejects.toBeInstanceOf(AuthError);
    expect(models.RefreshToken.docs).toHaveLength(2);
    await expect(authService.refresh(second.refreshToken)).resolves.toBeTruthy();
  });

  it('only one of two concurrent refreshes with the same token succeeds', async () => {
    const { authService } = setup(undefined, { reuseGraceMs: 10_000 });
    const { refreshToken } = await authService.register({ ...creds, email: 'player@example.com' });
    const results = await Promise.allSettled([authService.refresh(refreshToken), authService.refresh(refreshToken)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('refresh rejects tampered and expired tokens', async () => {
    const { authService, config } = setup();
    const { refreshToken } = await authService.register({ ...creds, email: 'player@example.com' });
    await expect(authService.refresh(`${refreshToken}x`)).rejects.toBeInstanceOf(AuthError);
    const expired = jwt.sign({ fam: 'f' }, config.auth.refreshSecret, { subject: 'u', jwtid: 'j', expiresIn: -10 });
    await expect(authService.refresh(expired)).rejects.toBeInstanceOf(AuthError);
    const wrongKey = jwt.sign({ fam: 'f' }, 'z'.repeat(32), { subject: 'u', jwtid: 'j' });
    await expect(authService.refresh(wrongKey)).rejects.toBeInstanceOf(AuthError);
  });

  it('refresh rejects garbage, missing and access tokens', async () => {
    const { authService } = setup();
    const { accessToken } = await authService.register({ ...creds, email: 'player@example.com' });
    await expect(authService.refresh(undefined)).rejects.toBeInstanceOf(AuthError);
    await expect(authService.refresh('garbage')).rejects.toBeInstanceOf(AuthError);
    await expect(authService.refresh(accessToken)).rejects.toBeInstanceOf(AuthError);
  });

  it('rejects an expired access token', async () => {
    const { authService, config } = setup();
    const expired = jwt.sign({ role: 'user' }, config.auth.accessSecret, { subject: 'u1', expiresIn: -10 });
    expect(() => authService.verifyAccess(expired)).toThrow(AuthError);
  });
});

describe('auth routes', () => {
  it('register sets httpOnly cookies and never returns the hash or tokens', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/v1/auth/register').send(creds);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('player@example.com');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|token/i);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toHaveLength(2);
    cookies.forEach((c) => expect(c).toMatch(/HttpOnly/i));
    expect(cookies.find((c) => c.startsWith('gq_refresh='))).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('uses Secure + SameSite=None cookies in production', async () => {
    const { app } = setup({ NODE_ENV: 'production', CLIENT_ORIGIN: 'https://app.example.com' });
    const res = await request(app).post('/api/v1/auth/register').send(creds);
    res.headers['set-cookie'].forEach((c) => {
      expect(c).toMatch(/Secure/i);
      expect(c).toMatch(/SameSite=None/i);
    });
  });

  it('validates input with the shared Zod schemas', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'x', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.path).sort()).toEqual(['email', 'password', 'username']);
  });

  it('rejects passwords over 72 bytes (bcrypt truncation)', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...creds, password: 'x'.repeat(73) });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('password');
  });

  it('requireRole blocks non-admins with 403 and unauthenticated with 401', async () => {
    const mw = requireRole('admin');
    const run = (auth) => {
      const next = jest.fn();
      mw({ auth }, {}, next);
      return next.mock.calls[0][0];
    };
    expect(run({ role: 'user' })).toBeInstanceOf(ForbiddenError);
    expect(run(undefined)).toBeInstanceOf(AuthError);
    expect(run({ role: 'admin' })).toBeUndefined();
  });

  it('ignores a role supplied in the body', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/v1/auth/register').send({ ...creds, role: 'admin' });
    expect(res.body.user.role).toBe('user');
  });

  it('/me requires a valid access cookie and returns the cookie owner', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    expect(
      (await request(app).get('/api/v1/auth/me').set('Cookie', cookieHeader({ gq_access: 'junk' }))).status,
    ).toBe(401);

    const reg = await request(app).post('/api/v1/auth/register').send(creds);
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookieHeader({ gq_access: cookieValue(reg, 'gq_access') }));
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('Player_One');
  });

  it('login → refresh → logout flow; logout kills the refresh token', async () => {
    const { app } = setup();
    await request(app).post('/api/v1/auth/register').send(creds);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: creds.email, password: creds.password });
    expect(login.status).toBe(200);

    const refreshCookie = cookieHeader({ gq_refresh: cookieValue(login, 'gq_refresh') });
    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie);
    expect(refreshed.status).toBe(200);
    expect(cookieValue(refreshed, 'gq_access')).toBeTruthy();

    const newRefresh = cookieHeader({ gq_refresh: cookieValue(refreshed, 'gq_refresh') });
    const out = await request(app).post('/api/v1/auth/logout').set('Cookie', newRefresh);
    expect(out.status).toBe(204);
    const after = await request(app).post('/api/v1/auth/refresh').set('Cookie', newRefresh);
    expect(after.status).toBe(401);
  });

  it('bad login returns 401 in the standard error shape', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@example.com', password: 'whatever-1' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'AUTH_ERROR', message: 'Invalid email or password' } });
  });

  it('rate-limits login attempts', async () => {
    const { app } = setup({ AUTH_RATE_LIMIT_MAX: '3' });
    const attempt = () =>
      request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: 'whatever-1' });
    for (let i = 0; i < 3; i += 1) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});

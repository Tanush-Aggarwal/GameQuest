import request from 'supertest';
import { jest } from '@jest/globals';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { createGoogleAdapter } from '../adapters/auth/google.js';
import { ConflictError, AuthError } from '../utils/errors.js';
import { createFakeModels, logger, testConfig } from './helpers.js';

const GOOGLE = { GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret' };
const profile = { sub: 'g-1', email: 'gamer@example.com', emailVerified: true, name: 'Gamer Girl' };

function setup({ configured = true, adapter } = {}) {
  const config = testConfig(configured ? GOOGLE : {});
  const models = createFakeModels();
  const authService = createAuthService({ ...models, config, bcryptRounds: 4 });
  const googleAdapter = adapter ?? createGoogleAdapter({ config, fetchImpl: jest.fn() });
  const app = createApp({ config, logger, authService, googleAdapter });
  return { app, config, models, authService, googleAdapter };
}

const cookieValue = (res, name) => {
  const line = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));
  return line ? line.split(';')[0].slice(name.length + 1) : undefined;
};

describe('authService.loginWithGoogle', () => {
  it('creates an account for a new Google profile and issues tokens', async () => {
    const { authService, models } = setup();
    const out = await authService.loginWithGoogle(profile);
    expect(out.user).toMatchObject({ username: 'Gamer_Girl', email: 'gamer@example.com', role: 'user' });
    expect(models.User.docs[0]).toMatchObject({ googleId: 'g-1', usernameLower: 'gamer_girl' });
    expect(models.User.docs[0].passwordHash).toBeUndefined();
    expect(out.accessToken).toBeTruthy();
    expect(models.RefreshToken.docs).toHaveLength(1);
  });

  it('signs a returning Google user into the same account', async () => {
    const { authService, models } = setup();
    const first = await authService.loginWithGoogle(profile);
    const again = await authService.loginWithGoogle({ ...profile, name: 'Renamed' });
    expect(again.user.id).toBe(first.user.id);
    expect(models.User.docs).toHaveLength(1);
  });

  it('adds a number when the username is taken', async () => {
    const { authService } = setup();
    await authService.register({ username: 'Gamer_Girl', email: 'other@example.com', password: 'correct-horse-9', acceptTerms: true });
    const out = await authService.loginWithGoogle(profile);
    expect(out.user.username).toBe('Gamer_Girl2');
  });

  it('falls back to the email name when Google gives no usable name', async () => {
    const { authService } = setup();
    const out = await authService.loginWithGoogle({ ...profile, name: '', email: 'ab@example.com' });
    expect(out.user.username).toMatch(/^[a-zA-Z0-9_]{3,24}$/);
  });

  it('refuses an email that already belongs to a password account instead of linking it', async () => {
    const { authService, models } = setup();
    await authService.register({ username: 'Existing', email: 'gamer@example.com', password: 'correct-horse-9', acceptTerms: true });
    await expect(authService.loginWithGoogle(profile)).rejects.toBeInstanceOf(ConflictError);
    expect(models.User.docs).toHaveLength(1);
    expect(models.User.docs[0].googleId).toBeUndefined();
  });

  it('refuses a profile whose email Google has not verified', async () => {
    const { authService } = setup();
    await expect(authService.loginWithGoogle({ ...profile, emailVerified: false })).rejects.toBeInstanceOf(AuthError);
    await expect(authService.loginWithGoogle({ ...profile, email: null })).rejects.toBeInstanceOf(AuthError);
  });

  it('two first sign-ins at once end in one account and both succeed', async () => {
    const { authService, models } = setup();
    const [a, b] = await Promise.all([authService.loginWithGoogle(profile), authService.loginWithGoogle(profile)]);
    expect(a.user.id).toBe(b.user.id);
    expect(models.User.docs).toHaveLength(1);
  });

  it('a Google-only account cannot log in with a password', async () => {
    const { authService } = setup();
    await authService.loginWithGoogle(profile);
    await expect(authService.login({ email: 'gamer@example.com', password: 'correct-horse-9' })).rejects.toBeInstanceOf(AuthError);
  });
});

describe('google adapter', () => {
  const config = testConfig(GOOGLE);

  it('builds the consent URL with the state, scopes and callback', () => {
    const url = new URL(createGoogleAdapter({ config }).buildAuthUrl({ state: 'abc' }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('state')).toBe('abc');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('redirect_uri')).toBe(`${config.publicApiUrl}/api/v1/auth/google/callback`);
  });

  it('exchanges a code for a normalised profile and never leaks the secret in errors', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sub: 42, email: 'A@B.com', email_verified: true, name: 'A B' }) });
    const out = await createGoogleAdapter({ config, fetchImpl }).exchangeCode('code');
    expect(out).toEqual({ sub: '42', email: 'a@b.com', emailVerified: true, name: 'A B' });

    const failing = jest.fn().mockResolvedValue({ ok: false, status: 400 });
    const err = await createGoogleAdapter({ config, fetchImpl: failing }).exchangeCode('code').catch((e) => e);
    expect(err.message).not.toContain('client-secret');
  });

  it('reports it is not configured without credentials', async () => {
    const adapter = createGoogleAdapter({ config: testConfig() });
    expect(adapter.isConfigured()).toBe(false);
    await expect(adapter.exchangeCode('code')).rejects.toThrow(/not configured/);
  });
});

describe('google routes', () => {
  it('reports whether Google sign-in is available', async () => {
    const on = await request(setup().app).get('/api/v1/auth/providers');
    expect(on.body).toEqual({ google: true });
    const off = await request(setup({ configured: false }).app).get('/api/v1/auth/providers');
    expect(off.body).toEqual({ google: false });
  });

  it('sends people back to the login page when Google is not configured', async () => {
    const { app, config } = setup({ configured: false });
    const res = await request(app).get('/api/v1/auth/google');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${config.clientOrigin}/login?error=google_unavailable`);
  });

  it('redirects to Google with a state cookie that matches the state parameter', async () => {
    const res = await request(setup().app).get('/api/v1/auth/google');
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.host).toBe('accounts.google.com');
    const state = cookieValue(res, 'gq_oauth_state');
    expect(state).toBeTruthy();
    expect(url.searchParams.get('state')).toBe(state);
    expect(res.headers['set-cookie'].find((c) => c.startsWith('gq_oauth_state='))).toMatch(/HttpOnly/i);
  });

  it('rejects a callback whose state does not match the cookie', async () => {
    const { app, config } = setup();
    const res = await request(app).get('/api/v1/auth/google/callback?code=c&state=forged').set('Cookie', 'gq_oauth_state=real');
    expect(res.headers.location).toBe(`${config.clientOrigin}/login?error=google_state`);
    expect(cookieValue(res, 'gq_access')).toBeUndefined();
    const missing = await request(app).get('/api/v1/auth/google/callback?code=c&state=forged');
    expect(missing.headers.location).toContain('google_state');
  });

  it('reports a cancelled consent screen', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/v1/auth/google/callback?error=access_denied');
    expect(res.headers.location).toContain('error=google_cancelled');
  });

  it('signs in on a valid callback: both session cookies set, redirected into the app', async () => {
    const adapter = { isConfigured: () => true, buildAuthUrl: jest.fn(), exchangeCode: jest.fn().mockResolvedValue(profile) };
    const { app, config, models } = setup({ adapter });
    const res = await request(app).get('/api/v1/auth/google/callback?code=good&state=s1').set('Cookie', 'gq_oauth_state=s1');
    expect(adapter.exchangeCode).toHaveBeenCalledWith('good');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${config.clientOrigin}/`);
    const cookies = res.headers['set-cookie'].join(';');
    expect(cookies).toMatch(/access/i);
    expect(cookies).toMatch(/refresh/i);
    expect(models.User.docs).toHaveLength(1);
  });

  it('maps an existing password account to a readable error code', async () => {
    const adapter = { isConfigured: () => true, buildAuthUrl: jest.fn(), exchangeCode: jest.fn().mockResolvedValue(profile) };
    const { app, authService } = setup({ adapter });
    await authService.register({ username: 'Existing', email: 'gamer@example.com', password: 'correct-horse-9', acceptTerms: true });
    const res = await request(app).get('/api/v1/auth/google/callback?code=good&state=s1').set('Cookie', 'gq_oauth_state=s1');
    expect(res.headers.location).toContain('error=google_email_exists');
  });

  it('maps an unverified email to its own error code', async () => {
    const adapter = {
      isConfigured: () => true,
      buildAuthUrl: jest.fn(),
      exchangeCode: jest.fn().mockResolvedValue({ ...profile, emailVerified: false }),
    };
    const { app } = setup({ adapter });
    const res = await request(app).get('/api/v1/auth/google/callback?code=good&state=s1').set('Cookie', 'gq_oauth_state=s1');
    expect(res.headers.location).toContain('error=google_unverified');
  });

  it('rejects a callback with no code, or a repeated code, and clears the state cookie', async () => {
    const adapter = { isConfigured: () => true, buildAuthUrl: jest.fn(), exchangeCode: jest.fn() };
    const { app } = setup({ adapter });
    const none = await request(app).get('/api/v1/auth/google/callback?state=s1').set('Cookie', 'gq_oauth_state=s1');
    expect(none.headers.location).toContain('error=google_state');
    const twice = await request(app).get('/api/v1/auth/google/callback?code=a&code=b&state=s1').set('Cookie', 'gq_oauth_state=s1');
    expect(twice.headers.location).toContain('error=google_state');
    expect(none.headers['set-cookie'].find((c) => c.startsWith('gq_oauth_state='))).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(adapter.exchangeCode).not.toHaveBeenCalled();
  });

  it('maps an upstream failure to a generic error code', async () => {
    const adapter = { isConfigured: () => true, buildAuthUrl: jest.fn(), exchangeCode: jest.fn().mockRejectedValue(new Error('boom')) };
    const { app } = setup({ adapter });
    const res = await request(app).get('/api/v1/auth/google/callback?code=good&state=s1').set('Cookie', 'gq_oauth_state=s1');
    expect(res.headers.location).toContain('error=google_failed');
  });
});

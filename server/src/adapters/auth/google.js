import { UpstreamError } from '../../utils/errors.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const TIMEOUT_MS = 10_000;

export const GOOGLE_CALLBACK_PATH = '/api/v1/auth/google/callback';

// Google sign-in adapter (authorization-code flow). Only this module talks to Google. The secret never leaves the
// server and is never put in an error message. `fetchImpl` is injectable for tests.
export function createGoogleAdapter({ config, fetchImpl = fetch }) {
  const { clientId, clientSecret } = config.google ?? {};
  const isConfigured = () => Boolean(clientId && clientSecret);
  const redirectUri = `${config.publicApiUrl}${GOOGLE_CALLBACK_PATH}`;

  function buildAuthUrl({ state }) {
    if (!isConfigured()) throw new UpstreamError('Google sign-in is not configured.');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `${AUTH_URL}?${params}`;
  }

  async function call(url, init) {
    let res;
    try {
      res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new UpstreamError('Could not reach Google.');
    }
    if (!res.ok) {
      // Google's error code (invalid_client, redirect_uri_mismatch, invalid_grant...) says what to fix and is not a secret.
      const body = await res.json().catch(() => ({}));
      const reason = typeof body.error === 'string' && /^[a-z_]{1,40}$/.test(body.error) ? `: ${body.error}` : '';
      throw new UpstreamError(`Google refused the request (HTTP ${res.status}${reason}).`);
    }
    try {
      return await res.json();
    } catch {
      throw new UpstreamError('Google sent an unreadable answer.');
    }
  }

  // Swaps the one-time code for the person's verified profile. The access token is used once and dropped.
  async function exchangeCode(code) {
    if (!isConfigured()) throw new UpstreamError('Google sign-in is not configured.');
    const token = await call(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!token.access_token) throw new UpstreamError('Google sent no access token.');
    const info = await call(USERINFO_URL, { headers: { authorization: `Bearer ${token.access_token}` } });
    if (!info.sub) throw new UpstreamError('Google sent no account id.');
    return {
      sub: String(info.sub),
      email: typeof info.email === 'string' ? info.email.toLowerCase() : null,
      emailVerified: info.email_verified === true,
      name: typeof info.name === 'string' ? info.name : '',
    };
  }

  return { isConfigured, buildAuthUrl, exchangeCode };
}

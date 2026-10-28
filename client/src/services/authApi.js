import { api } from './api.js';

export async function register(payload) {
  const { data } = await api.post('/auth/register', payload);
  return data;
}

export async function login(payload) {
  const { data } = await api.post('/auth/login', payload);
  return data.user;
}

export async function logout() {
  await api.post('/auth/logout');
}

export async function forgotPassword(payload) {
  const { data } = await api.post('/auth/forgot-password', payload);
  return data;
}

export async function resetPassword(payload) {
  const { data } = await api.post('/auth/reset-password', payload);
  return data;
}

export async function verifyEmail(payload) {
  const { data } = await api.post('/auth/verify-email', payload);
  return data;
}

export async function resendVerification(payload) {
  const { data } = await api.post('/auth/resend-verification', payload);
  return data;
}

// Resolves to the signed-in user, or null when there is no valid session.
// Tries the access cookie first, then one refresh; real failures (network, 5xx) still throw.
// Concurrent callers (React StrictMode runs effects twice) share one request: two parallel
// refreshes with the same single-use token would make the second one fail.
let restoring = null;
export function restoreSession() {
  restoring ??= doRestoreSession().finally(() => {
    restoring = null;
  });
  return restoring;
}

async function doRestoreSession() {
  try {
    return (await api.get('/auth/me')).data.user;
  } catch (err) {
    if (err.response?.status !== 401) throw err;
  }
  try {
    return (await api.post('/auth/refresh')).data.user;
  } catch (err) {
    if (err.response?.status === 401) return null;
    throw err;
  }
}

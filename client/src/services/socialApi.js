import { api } from './api.js';

// ── friends ──────────────────────────────────────────────────────────────────

export async function listFriends({ signal } = {}) {
  const { data } = await api.get('/friends', { signal });
  return data.items;
}

// Resolves to { incoming: [{ id, user, createdAt }], outgoing: [...] }.
export async function listRequests({ signal } = {}) {
  const { data } = await api.get('/friends/requests', { signal });
  return data;
}

// Resolves to { status: 'pending' | 'accepted', user, friendshipId } (crossed requests auto-accept).
export async function sendFriendRequest(username) {
  const { data } = await api.post('/friends/requests', { username });
  return data;
}

export const acceptRequest = (id) => api.post(`/friends/requests/${id}/accept`);
export const declineRequest = (id) => api.post(`/friends/requests/${id}/decline`);
export const cancelRequest = (id) => api.delete(`/friends/requests/${id}`);
export const unfriend = (userId) => api.delete(`/friends/${userId}`);

// ── blocks ───────────────────────────────────────────────────────────────────

export async function listBlocked({ signal } = {}) {
  const { data } = await api.get('/blocks', { signal });
  return data.items;
}
export const blockUser = (userId) => api.post(`/blocks/${userId}`);
export const unblockUser = (userId) => api.delete(`/blocks/${userId}`);

// ── users and profiles ───────────────────────────────────────────────────────

// Resolves to [{ id, username, relation }].
export async function searchUsers(q, { signal } = {}) {
  const { data } = await api.get('/users/search', { params: { q }, signal });
  return data.items;
}

// Resolves to { user, relation, restricted, stats }.
export async function getProfile(username, { signal } = {}) {
  const { data } = await api.get(`/users/${encodeURIComponent(username)}`, { signal });
  return data;
}

// Resolves to { items, nextCursor }.
export async function getProfileActivity(username, params, { signal } = {}) {
  const { data } = await api.get(`/users/${encodeURIComponent(username)}/activity`, { params, signal });
  return data;
}

export async function getProfileCollections(username, { signal } = {}) {
  const { data } = await api.get(`/users/${encodeURIComponent(username)}/collections`, { signal });
  return data.items;
}

export async function setPrivacy(privacy) {
  const { data } = await api.patch('/users/me/privacy', { privacy });
  return data.privacy;
}

// ── feed ─────────────────────────────────────────────────────────────────────

// Resolves to { items, nextCursor, friendCount }.
export async function getFeed(params, { signal } = {}) {
  const { data } = await api.get('/feed', { params, signal });
  return data;
}

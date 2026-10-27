import { api } from './api.js';

// Summary: { username, avatar, level, xp, levelStartXp, nextLevelXp, breakdown, unreadNotifications }
export async function getAccountSummary({ signal } = {}) {
  const { data } = await api.get('/account/summary', { signal });
  return data;
}

// Delete account: body { confirmUsername }
export async function deleteAccount(confirmUsername) {
  const { data } = await api.delete('/account', { data: { confirmUsername } });
  return data;
}

// Notifications: { items, unread }
export async function getNotifications({ signal } = {}) {
  const { data } = await api.get('/notifications', { signal });
  return data;
}

// Mark notifications read: POST /notifications/read
export async function markNotificationsRead() {
  const { data } = await api.post('/notifications/read');
  return data;
}

import { api } from './api.js';

// Resolves to { items, nextCursor, counts? } (counts only on the first page).
export async function listLibrary(params, { signal } = {}) {
  const { data } = await api.get('/library', { params, signal });
  return data;
}

export async function addToLibrary(payload) {
  const { data } = await api.post('/library', payload);
  return data.entry;
}

export async function changeStatus(entryId, status) {
  const { data } = await api.patch(`/library/${entryId}/status`, { status });
  return data.entry;
}

export async function setVisibility(entryId, hiddenFromFriends) {
  const { data } = await api.patch(`/library/${entryId}/visibility`, { hiddenFromFriends });
  return data.entry;
}

export async function removeFromLibrary(entryId) {
  await api.delete(`/library/${entryId}`);
}

export async function getLibraryEntry(entryId, { signal } = {}) {
  const { data } = await api.get(`/library/${entryId}`, { signal });
  return data.entry;
}

export async function getStatusHistory(entryId, { signal } = {}) {
  const { data } = await api.get(`/library/${entryId}/history`, { signal });
  return data.history;
}

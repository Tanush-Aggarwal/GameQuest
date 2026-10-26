import { api } from './api.js';

// ── progress ──────────────────────────────────────────────────────────────

export async function setProgress(entryId, manualProgress) {
  const { data } = await api.patch(`/library/${entryId}/progress`, { manualProgress });
  return data;
}

// ── play logs ─────────────────────────────────────────────────────────────

export async function logSession(entryId, payload) {
  const { data } = await api.post(`/library/${entryId}/playlogs`, payload);
  return data.log;
}

export async function listLogs(entryId, params, { signal } = {}) {
  const { data } = await api.get(`/library/${entryId}/playlogs`, { params, signal });
  return data;
}

export async function deleteLog(entryId, logId) {
  await api.delete(`/library/${entryId}/playlogs/${logId}`);
}

// ── journal ──────────────────────────────────────────────────────────────

export async function addJournalEntry(entryId, body) {
  const { data } = await api.post(`/library/${entryId}/journal`, { body });
  return data.note;
}

export async function listJournalEntries(entryId, params, { signal } = {}) {
  const { data } = await api.get(`/library/${entryId}/journal`, { params, signal });
  return data;
}

export async function deleteJournalEntry(entryId, noteId) {
  await api.delete(`/library/${entryId}/journal/${noteId}`);
}

// ── insights ─────────────────────────────────────────────────────────────

export async function getDashboard({ signal } = {}) {
  const { data } = await api.get('/insights/dashboard', { signal });
  return data;
}

export async function getPlayNext(params, { signal } = {}) {
  const { data } = await api.get('/insights/play-next', { params, signal });
  return data;
}

export async function getBacklogHealth({ signal } = {}) {
  const { data } = await api.get('/insights/backlog-health', { signal });
  return data;
}

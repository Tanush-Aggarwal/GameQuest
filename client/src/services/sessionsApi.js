import { api } from './api.js';

// Resolves to { items, nextCursor } of upcoming sessions (mine, invited, and my friends').
export async function listSessions(params, { signal } = {}) {
  const { data } = await api.get('/sessions', { params, signal });
  return data;
}

export async function getSession(id, { signal } = {}) {
  const { data } = await api.get(`/sessions/${id}`, { signal });
  return data.session;
}

export async function createSession(payload) {
  const { data } = await api.post('/sessions', payload);
  return data.session;
}

export async function updateSession(id, patch) {
  const { data } = await api.patch(`/sessions/${id}`, patch);
  return data.session;
}

export async function cancelSession(id) {
  const { data } = await api.post(`/sessions/${id}/cancel`);
  return data.session;
}

// Resolves to the updated session (counts and attendees included).
export async function rsvpSession(id, response) {
  const { data } = await api.put(`/sessions/${id}/rsvp`, { response });
  return data.session;
}

// Fetches the calendar file through the API (so the session cookie is sent and errors can be shown),
// then hands it to the browser as a download.
export async function downloadIcs(id) {
  const { data } = await api.get(`/sessions/${id}/ics`, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([data], { type: 'text/calendar' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `gamequest-session-${id}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

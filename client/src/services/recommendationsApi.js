import { api } from './api.js';

export async function sendRecommendation(payload) {
  const { data } = await api.post('/recommendations', payload);
  return data.recommendation;
}

export async function listInbox(params, { signal } = {}) {
  const { data } = await api.get('/recommendations/inbox', { params, signal });
  return data;
}

export async function listSent(params, { signal } = {}) {
  const { data } = await api.get('/recommendations/sent', { params, signal });
  return data;
}

export async function respondRecommendation(id, payload) {
  const { data } = await api.patch(`/recommendations/${id}/respond`, payload);
  return data.recommendation;
}

export async function deleteRecommendation(id) {
  await api.delete(`/recommendations/${id}`);
}

export async function getPickScore(userId, { signal } = {}) {
  const url = userId ? `/recommendations/score/${userId}` : '/recommendations/score';
  const { data } = await api.get(url, { signal });
  return data;
}

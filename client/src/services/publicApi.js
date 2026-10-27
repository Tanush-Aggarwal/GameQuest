import { api } from './api.js';

// The covers behind the sign-in pages. No account needed; resolves to [{ cover }].
export async function getPublicCovers({ signal } = {}) {
  const { data } = await api.get('/public/covers', { params: { limit: 24 }, signal });
  return data.items;
}

// Real database stats: { games, players, collections, reviews }
export async function getPublicStats({ signal } = {}) {
  const { data } = await api.get('/public/stats', { signal });
  return data;
}

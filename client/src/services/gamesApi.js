import { api } from './api.js';

// Resolves to { items, nextCursor, warnings }.
export async function searchGames(params, { signal } = {}) {
  const { data } = await api.get('/games', { params, signal });
  return data;
}

export async function getGame(slug, { signal } = {}) {
  const { data } = await api.get(`/games/${encodeURIComponent(slug)}`, { signal });
  return data.game;
}

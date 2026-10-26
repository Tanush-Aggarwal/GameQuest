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

// Up to 3 [{ videoId, label, source: 'igdb' | 'youtube' }], best first; [] when the game has no trailer.
export async function getTrailers(slug, { signal } = {}) {
  const { data } = await api.get(`/games/${encodeURIComponent(slug)}/trailer`, { signal });
  return data.trailers ?? [];
}

// "Wrong trailer?": hides that video for you (and for everyone once a second person reports it).
// Resolves to { trailers, changed, dropped }: your next list, whether the report counted, and whether
// the video is now gone for everyone.
export async function reportTrailer(slug, videoId) {
  const { data } = await api.post(`/games/${encodeURIComponent(slug)}/trailer/report`, { videoId });
  return { trailers: data.trailers ?? [], changed: Boolean(data.changed), dropped: Boolean(data.dropped) };
}

export async function getGameFriends(slug, { signal } = {}) {
  const { data } = await api.get(`/games/${encodeURIComponent(slug)}/friends`, { signal });
  return data.items ?? [];
}

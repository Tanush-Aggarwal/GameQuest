import { api } from './api.js';

// PUT /reviews/:gameId — upsert (create or replace) caller's review
export async function upsertReview(gameId, payload) {
  const { data } = await api.put(`/reviews/${gameId}`, payload);
  return data.review;
}

// DELETE /reviews/:gameId — remove caller's review
export async function deleteReview(gameId) {
  await api.delete(`/reviews/${gameId}`);
}

// GET /reviews/mine/:gameId — get the caller's review for one game (null if none)
export async function getMyReview(gameId, { signal } = {}) {
  const { data } = await api.get(`/reviews/mine/${gameId}`, { signal });
  return data.review;
}

// GET /reviews/game/:gameId — list all reviews for a game
export async function listReviewsForGame(gameId, params = {}, { signal } = {}) {
  const { data } = await api.get(`/reviews/game/${gameId}`, { params, signal });
  return data;
}

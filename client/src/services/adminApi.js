import { api } from './api.js';

// Administrator-only endpoints (the server checks the role on every call).
export const getAdminOverview = async ({ signal } = {}) => (await api.get('/admin/overview', { signal })).data;
export const searchAdminGames = async (params, { signal } = {}) => (await api.get('/admin/games', { params, signal })).data;
export const getHeaderOptions = async (gameId, { signal } = {}) => (await api.get(`/admin/games/${gameId}/header-options`, { signal })).data;
export const updateAdminGame = async (gameId, patch) => (await api.patch(`/admin/games/${gameId}`, patch)).data.game;
export const getHiddenTrailers = async ({ signal } = {}) => (await api.get('/admin/trailers', { signal })).data;
export const restoreTrailer = async (gameId, videoId) => (await api.post(`/admin/games/${gameId}/trailers/restore`, { videoId })).data;
export const searchAdminUsers = async (params, { signal } = {}) => (await api.get('/admin/users', { params, signal })).data;
export const setUserRole = async (userId, role) => (await api.patch(`/admin/users/${userId}/role`, { role })).data;

import { api } from './api.js';

// Resolves to { items, nextCursor } — each item is a collection summary (itemCount, covers, ...).
export async function listCollections(params, { signal } = {}) {
  const { data } = await api.get('/collections', { params, signal });
  return data;
}

export async function createCollection(payload) {
  const { data } = await api.post('/collections', payload);
  return data.collection;
}

// Resolves to { collection, items, nextCursor, truncated }.
export async function getCollection(id, params, { signal } = {}) {
  const { data } = await api.get(`/collections/${id}`, { params, signal });
  return data;
}

export async function updateCollection(id, patch) {
  const { data } = await api.patch(`/collections/${id}`, patch);
  return data.collection;
}

export async function deleteCollection(id) {
  await api.delete(`/collections/${id}`);
}

export async function addCollectionItem(id, payload) {
  const { data } = await api.post(`/collections/${id}/items`, payload);
  return data.item;
}

export async function removeCollectionItem(id, itemId) {
  await api.delete(`/collections/${id}/items/${itemId}`);
}

// Places the item directly after `afterItemId` (null = top).
export async function moveCollectionItem(id, itemId, afterItemId) {
  const { data } = await api.patch(`/collections/${id}/items/${itemId}/position`, { afterItemId });
  return data.item;
}

// Resolves to { total, truncated, items } for unsaved smart rules.
export async function previewRules(rules, { signal } = {}) {
  const { data } = await api.post('/collections/preview', { rules }, { signal });
  return data;
}

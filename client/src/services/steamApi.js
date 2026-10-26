import { api } from './api.js';

export async function getSteamStatus({ signal } = {}) {
  const { data } = await api.get('/steam', { signal });
  return data.steam;
}

export async function linkSteam(input) {
  const { data } = await api.post('/steam/link', { input });
  return data.steam;
}

export async function unlinkSteam() {
  await api.delete('/steam/link');
}

// A first sync of a big library reads achievements game by game, so it can take a few minutes.
export async function syncSteam() {
  const { data } = await api.post('/sync/steam', null, { timeout: 5 * 60 * 1000 });
  return data; // { added, updated, unmatched: [{ appid, name, playtimeMin }], warnings: [] }
}

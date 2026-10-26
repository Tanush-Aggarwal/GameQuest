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

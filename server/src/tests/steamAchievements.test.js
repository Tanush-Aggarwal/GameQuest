import { createSteamAdapter } from '../adapters/platforms/steam.js';

const reply = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body });
const adapter = (fetchImpl) => createSteamAdapter({ config: { steam: { apiKey: 'k' } }, fetchImpl, retryDelayMs: 1 });

describe('Steam achievements', () => {
  it('falls back to the schema + user stats when GetPlayerAchievements says "no stats"', async () => {
    const steam = adapter(async (url) => {
      const p = new URL(url).pathname;
      if (p.includes('GetPlayerAchievements')) return reply({ playerstats: { success: false } }, 400);
      if (p.includes('GetSchemaForGame')) return reply({ game: { availableGameStats: { achievements: [{}, {}, {}] } } });
      if (p.includes('GetUserStatsForGame')) return reply({ playerstats: { achievements: [{ name: 'a', achieved: 1 }] } });
      throw new Error(p);
    });
    await expect(steam.getAchievements('1', '10')).resolves.toEqual({ unlocked: 1, total: 3 });
  });

  it('retries a rate-limited game instead of dropping it', async () => {
    let calls = 0;
    const steam = adapter(async () => {
      calls += 1;
      if (calls === 1) return reply({}, 429);
      return reply({ playerstats: { success: true, achievements: [{ achieved: 1 }, { achieved: 0 }] } });
    });
    await expect(steam.getAchievements('1', '10')).resolves.toEqual({ unlocked: 1, total: 2 });
    expect(calls).toBe(2);
  });
});

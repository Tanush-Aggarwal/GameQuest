import { createSteamMediaService } from '../services/steamMediaService.js';

function fakeCache() {
  const rows = new Map();
  return {
    rows,
    findOne: (q) => ({ lean: async () => rows.get(`${q.gameId}:${q.source}`) ?? null }),
    findOneAndUpdate: async (q, u) => rows.set(`${q.gameId}:${q.source}`, { ...u.$set }),
  };
}

const game = { _id: 'g1', externalIds: { steam: '123' } };
const media = {
  header: 'https://cdn/123/header.jpg',
  background: 'https://cdn/123/bg.jpg',
  screenshots: ['https://cdn/123/s1.jpg', 'https://cdn/123/s2.jpg'],
  movies: [{ id: '9', name: 'Launch Trailer', poster: 'https://cdn/p.jpg', mp4: 'https://cdn/m.mp4', webm: null, hls: null }],
};

describe('steamMediaService', () => {
  it('puts Steam key art and screenshots first, and caches the lookup', async () => {
    let calls = 0;
    const steam = { getStoreMedia: async () => { calls += 1; return structuredClone(media); }, probeArt: async () => ({ backdrop: 'https://cdn/123/library_hero.jpg' }) };
    const svc = createSteamMediaService({ MediaCache: fakeCache(), steam });
    const dto = await svc.enrich({ backdrop: 'igdb.jpg', screenshots: ['https://cdn/123/s2.jpg', 'igdb-s.jpg'] }, game);
    expect(dto.backdrop).toBe('https://cdn/123/library_hero.jpg');
    expect(dto.screenshots).toEqual(['https://cdn/123/s1.jpg', 'https://cdn/123/s2.jpg', 'igdb-s.jpg']);
    await svc.trailers(game);
    expect(calls).toBe(1);
  });

  it('maps Steam movies to trailer entries', async () => {
    const svc = createSteamMediaService({ MediaCache: fakeCache(), steam: { getStoreMedia: async () => structuredClone(media) } });
    expect(await svc.trailers(game)).toEqual([
      { videoId: 'steam-9', label: 'Launch Trailer', source: 'steam', poster: 'https://cdn/p.jpg', mp4: 'https://cdn/m.mp4', webm: null, hls: null },
    ]);
  });

  it('leaves the game alone when Steam fails or the game has no Steam id', async () => {
    const svc = createSteamMediaService({ MediaCache: fakeCache(), steam: { getStoreMedia: async () => { throw new Error('down'); } } });
    const dto = { backdrop: 'igdb.jpg', screenshots: [] };
    expect(await svc.enrich(dto, game)).toBe(dto);
    expect(await svc.enrich(dto, { _id: 'g2', externalIds: {} })).toBe(dto);
  });
});

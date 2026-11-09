import { jest } from '@jest/globals';
import { createSteamAdapter } from '../adapters/platforms/steam.js';
import { createSteamHeroService } from '../services/steamHeroService.js';
import { steamHeroOf, toGameDto } from '../services/gameService.js';
import { createFakeCollection, testConfig } from './helpers.js';

// Shapes copied from a real IStoreBrowseService/GetItems answer (Wuthering Waves; The Quarry's "Full Game" child app).
const storeItems = {
  response: {
    store_items: [
      {
        appid: 3513350,
        success: 1,
        assets: {
          asset_url_format: 'steam/apps/3513350/${FILENAME}?t=1791864800',
          library_hero: '71dc6e3d/library_hero.jpg',
          library_hero_2x: '71dc6e3d/library_hero_2x.jpg',
          raw_page_background: '7c80b604/page_bg_raw.jpg',
        },
      },
      { appid: 1891950, success: 1, related_items: { parent_appid: 1577120 }, assets: { asset_url_format: 'steam/apps/1891950/${FILENAME}?t=1', header: 'header.jpg' } },
    ],
  },
};

describe('Steam banner art (library hero)', () => {
  it('builds the hashed asset URLs from the store answer', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => storeItems }));
    const steam = createSteamAdapter({ config: testConfig(), fetchImpl });
    const assets = await steam.getStoreAssets(['3513350', '1891950']);
    expect(assets.get('3513350')).toEqual({
      libraryHero: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3513350/71dc6e3d/library_hero.jpg?t=1791864800',
      libraryHero2x: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3513350/71dc6e3d/library_hero_2x.jpg?t=1791864800',
      pageBackground: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3513350/7c80b604/page_bg_raw.jpg?t=1791864800',
      parentAppid: null,
    });
    expect(assets.get('1891950')).toMatchObject({ libraryHero: null, parentAppid: '1577120' });
    expect(decodeURIComponent(fetchImpl.mock.calls[0][0])).toContain('"include_assets":true');
  });

  it('stores each game’s hero, falls back to the parent app, and records games without one', async () => {
    const Game = createFakeCollection();
    Game.docs.push(
      { _id: 'a', title: 'Wuthering Waves', externalIds: { steam: '3513350' } },
      { _id: 'b', title: 'The Quarry', externalIds: { steam: '1891950' } },
      { _id: 'c', title: 'Gone', externalIds: { steam: '42' } },
    );
    const steam = {
      getStoreAssets: jest.fn(async (ids) => {
        const all = new Map([
          ['3513350', { libraryHero: 'H1', libraryHero2x: 'H1x2', parentAppid: null }],
          ['1891950', { libraryHero: null, libraryHero2x: null, parentAppid: '1577120' }],
          ['1577120', { libraryHero: 'HP', libraryHero2x: null, parentAppid: null }],
        ]);
        return new Map(ids.filter((id) => all.has(String(id))).map((id) => [String(id), all.get(String(id))]));
      }),
    };
    const report = await createSteamHeroService({ Game, steam, pauseMs: 0 }).run();
    expect(report).toEqual({ checked: 3, found: 1, fromParent: 1, none: 1 });
    const by = Object.fromEntries(Game.docs.map((d) => [d._id, d]));
    expect(by.a).toMatchObject({ steamHero: 'H1', steamHero2x: 'H1x2' });
    expect(by.b.steamHero).toBe('HP');
    expect(by.c.steamHero).toBeNull();
    expect(by.c.steamHeroCheckedAt).toBeInstanceOf(Date);
  });

  it('game DTOs carry the stored hero, or the classic CDN path for games not looked up yet', () => {
    expect(steamHeroOf({ externalIds: { steam: '10' } })).toBe('https://cdn.cloudflare.steamstatic.com/steam/apps/10/library_hero.jpg');
    expect(steamHeroOf({ externalIds: { steam: '10' }, steamHeroCheckedAt: new Date(), steamHero: null })).toBeNull();
    expect(toGameDto({ _id: 'x', title: 'X', slug: 'x', externalIds: { steam: '10' }, steamHeroCheckedAt: new Date(), steamHero: 'H', steamHero2x: 'H2' })).toMatchObject({ steamHero: 'H', steamHero2x: 'H2' });
  });
});

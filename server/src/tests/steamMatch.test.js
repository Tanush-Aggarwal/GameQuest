import { createSteamMatchService, normaliseTitle } from '../services/steamMatchService.js';

const game = (over = {}) => ({ _id: 'g1', title: 'Hollow Knight', releaseDate: new Date('2017-02-24'), ...over });
const svc = (steam, taken = false) =>
  createSteamMatchService({ Game: { exists: async () => (taken ? { _id: 'other' } : null) }, steam, pauseMs: 0 });

describe('steam match', () => {
  it('normalises titles', () => {
    expect(normaliseTitle('Tom Clancy’s Rainbow Six® Siege')).toBe(normaliseTitle("Tom Clancy's Rainbow Six Siege"));
    expect(normaliseTitle('Sonic & Knuckles')).toBe(normaliseTitle('Sonic and Knuckles'));
  });

  it('matches the same game with a close release year', async () => {
    const steam = { searchStore: async () => [{ appid: '367520', name: 'Hollow Knight' }], getStoreMedia: async () => ({ type: 'game', releaseYear: 2017 }) };
    await expect(svc(steam).matchOne(game())).resolves.toEqual({ status: 'matched', appid: '367520', name: 'Hollow Knight' });
  });

  it('skips namesakes, other years, DLC and ids already used', async () => {
    const other = { searchStore: async () => [{ appid: '1', name: 'Hollow Knight: Silksong' }], getStoreMedia: async () => ({ type: 'game' }) };
    expect((await svc(other).matchOne(game())).status).toBe('none');
    const oldYear = { searchStore: async () => [{ appid: '2', name: 'Hollow Knight' }], getStoreMedia: async () => ({ type: 'game', releaseYear: 2009 }) };
    expect((await svc(oldYear).matchOne(game())).status).toBe('mismatch');
    const dlc = { searchStore: async () => [{ appid: '3', name: 'Hollow Knight' }], getStoreMedia: async () => ({ type: 'dlc', releaseYear: 2017 }) };
    expect((await svc(dlc).matchOne(game())).status).toBe('mismatch');
    const ok = { searchStore: async () => [{ appid: '4', name: 'Hollow Knight' }], getStoreMedia: async () => ({ type: 'game', releaseYear: 2017 }) };
    expect((await svc(ok, true).matchOne(game())).status).toBe('taken');
  });
});

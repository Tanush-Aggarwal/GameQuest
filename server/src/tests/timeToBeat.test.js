import { fromIgdbRow, isEndlessGame, normalizeTimeToBeat, planningHours } from '../utils/timeToBeat.js';
import { toGameDto, toUpsertUpdate } from '../services/gameService.js';

const H = 3600;

describe('time to beat', () => {
  it('maps IGDB fields: hastily = main, normally = main + extras, completely = completionist', () => {
    expect(fromIgdbRow({ hastily: 26 * H, normally: 42 * H, completely: 63 * H, count: 120 })).toEqual({
      main: 26,
      extras: 42,
      full: 63,
      samples: 120,
    });
  });

  it('never falls back from one field to another', () => {
    expect(fromIgdbRow({ normally: 40 * H })).toEqual({ main: null, extras: 40, full: null, samples: null });
  });

  it('drops values that break main <= extras <= full and out-of-range values', () => {
    expect(normalizeTimeToBeat({ main: 30, extras: 20, full: 50 })).toMatchObject({ main: 30, extras: null, full: 50 });
    expect(normalizeTimeToBeat({ main: 10, extras: 60, full: 40 })).toMatchObject({ main: 10, extras: 60, full: null });
    expect(normalizeTimeToBeat({ main: 0, extras: 5000, full: 20 })).toMatchObject({ main: null, extras: null, full: 20 });
  });

  it('repairs rows written before the fix (main and extras swapped) on read', () => {
    // Hollow Knight as stored by the old mapping: main held "normally" (36.1), extras held "hastily" (15.6)
    expect(normalizeTimeToBeat({ main: 36.1, extras: 15.6, full: 71.5 }, {}, { legacySwap: true })).toMatchObject({
      main: 15.6,
      extras: 36.1,
      full: 71.5,
    });
  });

  it('flags a small number of reports as low confidence', () => {
    expect(normalizeTimeToBeat({ main: 5, samples: 2 }).lowConfidence).toBe(true);
    expect(normalizeTimeToBeat({ main: 5, samples: 30 }).lowConfidence).toBe(false);
  });

  it('marks games with no ending as endless and clears their hours', () => {
    expect(isEndlessGame({ title: 'Fortnite' })).toBe(true);
    expect(isEndlessGame({ title: 'Some Arena', genres: ['MOBA'] })).toBe(true);
    expect(isEndlessGame({ title: 'Some Shooter', gameModes: ['Multiplayer', 'Battle Royale'] })).toBe(true);
    expect(isEndlessGame({ title: 'Valorant-like', gameModes: ['Multiplayer'] })).toBe(true);
    expect(isEndlessGame({ title: 'It Takes Two', gameModes: ['Co-operative', 'Split screen'] })).toBe(false);
    expect(isEndlessGame({ title: 'Hades', gameModes: ['Single player'] })).toBe(false);
    expect(normalizeTimeToBeat({ main: 120, extras: 400 }, { title: 'Fortnite' })).toMatchObject({
      main: null,
      extras: null,
      full: null,
      endless: true,
    });
  });

  it('plans with main, then main + extras, and never with an endless game', () => {
    expect(planningHours({ timeToBeat: { main: 8, extras: 14 } })).toBe(8);
    expect(planningHours({ timeToBeat: { main: null, extras: 14 } })).toBe(14);
    expect(planningHours({ timeToBeat: { endless: true } })).toBeNull();
  });

  it('cleans times on every catalog write and in the API DTO', () => {
    const { $set } = toUpsertUpdate({ slug: 'f', title: 'Fortnite', timeToBeat: { main: 50, extras: 80 } }, new Date());
    expect($set['timeToBeat.endless']).toBe(true);
    expect($set['timeToBeat.main']).toBeNull();
    const dto = toGameDto({ _id: 'x', title: 'Hollow Knight', slug: 'hk', timeToBeat: { main: 36.1, extras: 15.6, full: 71.5 } });
    expect(dto.timeToBeat).toMatchObject({ main: 15.6, extras: 36.1, full: 71.5, endless: false });
  });
});

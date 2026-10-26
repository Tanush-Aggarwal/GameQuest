import request from 'supertest';
import { jest } from '@jest/globals';
import { parseSteamInput } from '@gamequest/shared';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { createSteamAdapter } from '../adapters/platforms/steam.js';
import { createSteamService } from '../services/steamService.js';
import { createFakeModels, logger, testConfig } from './helpers.js';

const KEY = 'SECRETKEY1234567890';
const ID = '76561198000000001';
const OTHER_ID = '76561198000000002';

const reply = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body });

// A fake Steam: routes a request URL to a canned body.
function fakeSteam({ vanity = {}, players = {}, status = {} } = {}) {
  return jest.fn(async (url) => {
    const u = new URL(url);
    const code = status[u.pathname];
    if (code) return reply({}, code);
    if (u.pathname.includes('ResolveVanityURL')) {
      const id = vanity[u.searchParams.get('vanityurl')];
      return reply({ response: id ? { success: 1, steamid: id } : { success: 42, message: 'No match' } });
    }
    if (u.pathname.includes('GetPlayerSummaries')) {
      const p = players[u.searchParams.get('steamids')];
      return reply({ response: { players: p ? [p] : [] } });
    }
    throw new Error(`unexpected url ${u.pathname}`);
  });
}

const player = (id, extra = {}) => ({
  steamid: id,
  personaname: `Persona ${id.slice(-1)}`,
  avatarfull: 'https://avatars.steamstatic.com/a.jpg',
  profileurl: `https://steamcommunity.com/profiles/${id}/`,
  communityvisibilitystate: 3,
  ...extra,
});

describe('parseSteamInput', () => {
  it.each([
    [ID, { steamId: ID }],
    [`  ${ID}  `, { steamId: ID }],
    [`https://steamcommunity.com/profiles/${ID}`, { steamId: ID }],
    [`steamcommunity.com/profiles/${ID}/`, { steamId: ID }],
    ['https://steamcommunity.com/id/gaben', { vanity: 'gaben' }],
    ['https://www.steamcommunity.com/id/gaben/games', { vanity: 'gaben' }],
    ['gaben', { vanity: 'gaben' }],
  ])('reads %s', (input, expected) => {
    expect(parseSteamInput(input)).toEqual(expected);
  });

  it.each([
    '',
    'a',
    'two words',
    'https://evil.example/id/gaben',
    'https://steamcommunity.com.evil.example/id/gaben',
    'https://steamcommunity.com/groups/foo',
    'https://steamcommunity.com/profiles/123',
    '12345678901234567',
    'javascript:alert(1)',
  ])('rejects %j', (input) => {
    expect(parseSteamInput(input)).toBeNull();
  });
});

describe('steam adapter', () => {
  const adapter = (fetchImpl, apiKey = KEY) => createSteamAdapter({ config: testConfig({ STEAM_API_KEY: apiKey }), fetchImpl });

  it('resolves a vanity name to a SteamID64', async () => {
    const fetchImpl = fakeSteam({ vanity: { gaben: ID } });
    await expect(adapter(fetchImpl).resolveVanity('gaben')).resolves.toBe(ID);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.pathname).toContain('ResolveVanityURL');
    expect(url.searchParams.get('vanityurl')).toBe('gaben');
  });

  it('reports an unknown vanity name as 404', async () => {
    await expect(adapter(fakeSteam()).resolveVanity('nobody-here')).rejects.toMatchObject({ status: 404 });
  });

  it('reads the persona, avatar and visibility', async () => {
    const summary = await adapter(fakeSteam({ players: { [ID]: player(ID, { communityvisibilitystate: 1 }) } })).getPlayerSummary(ID);
    expect(summary).toEqual({
      steamId: ID,
      personaName: 'Persona 1',
      avatar: 'https://avatars.steamstatic.com/a.jpg',
      profileUrl: `https://steamcommunity.com/profiles/${ID}/`,
      visibility: 'private',
    });
  });

  it('returns null for an unknown SteamID64', async () => {
    await expect(adapter(fakeSteam()).getPlayerSummary(ID)).resolves.toBeNull();
  });

  it('is a clear UpstreamError without a key, and never calls Steam', async () => {
    const fetchImpl = jest.fn();
    await expect(adapter(fetchImpl, '').resolveVanity('gaben')).rejects.toMatchObject({ status: 502, message: 'Steam is not available right now. Try again later.' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never leaks the API key in errors', async () => {
    const boom = jest.fn(async (url) => {
      throw new Error(`connect failed for ${url}`);
    });
    const err = await adapter(boom).getPlayerSummary(ID).catch((e) => e);
    expect(err.status).toBe(502);
    expect(JSON.stringify({ message: err.message, details: err.details })).not.toContain(KEY);

    const rejected = await adapter(fakeSteam({ status: { '/ISteamUser/GetPlayerSummaries/v0002/': 403 } })).getPlayerSummary(ID).catch((e) => e);
    expect(rejected.status).toBe(502);
    expect(rejected.message).not.toContain(KEY);
  });

  it('maps a Steam 5xx and 429 to UpstreamError', async () => {
    const path = '/ISteamUser/GetPlayerSummaries/v0002/';
    await expect(adapter(fakeSteam({ status: { [path]: 503 } })).getPlayerSummary(ID)).rejects.toMatchObject({ status: 502 });
    await expect(adapter(fakeSteam({ status: { [path]: 429 } })).getPlayerSummary(ID)).rejects.toMatchObject({ status: 502 });
  });
});

describe('steamService.link', () => {
  function setup(steamOptions) {
    const models = createFakeModels();
    const authService = createAuthService({ ...models, config: testConfig(), bcryptRounds: 4, reuseGraceMs: 0 });
    const steam = createSteamAdapter({ config: testConfig({ STEAM_API_KEY: KEY }), fetchImpl: fakeSteam(steamOptions) });
    const service = createSteamService({ User: models.User, steam });
    const mkUser = async (name) =>
      (await authService.register({ username: name, email: `${name}@example.com`, password: 'correct-horse-9' })).user;
    return { ...models, authService, service, mkUser, steam };
  }

  it('links by SteamID64, shows the persona and starts with no sync', async () => {
    const s = setup({ players: { [ID]: player(ID) } });
    const neo = await s.mkUser('neo');
    expect(await s.service.getStatus(neo.id)).toEqual({ linked: false });
    const dto = await s.service.link(neo.id, ID);
    expect(dto).toMatchObject({ linked: true, steamId: ID, personaName: 'Persona 1', visibility: 'public', lastSync: null });
    expect(await s.service.getStatus(neo.id)).toMatchObject({ linked: true, steamId: ID });
  });

  it('links by profile URL and by vanity name', async () => {
    const s = setup({ players: { [ID]: player(ID) }, vanity: { gaben: ID } });
    const a = await s.mkUser('a');
    expect((await s.service.link(a.id, 'https://steamcommunity.com/id/gaben')).steamId).toBe(ID);
    const b = await s.mkUser('b');
    await s.service.unlink(a.id);
    expect((await s.service.link(b.id, `https://steamcommunity.com/profiles/${ID}`)).steamId).toBe(ID);
  });

  it('rejects text that is not a Steam profile', async () => {
    const s = setup();
    const neo = await s.mkUser('neo');
    await expect(s.service.link(neo.id, 'https://evil.example/x')).rejects.toMatchObject({ status: 400 });
  });

  it('404s on an unknown vanity name or SteamID64', async () => {
    const s = setup();
    const neo = await s.mkUser('neo');
    await expect(s.service.link(neo.id, 'nobody-here')).rejects.toMatchObject({ status: 404 });
    await expect(s.service.link(neo.id, ID)).rejects.toMatchObject({ status: 404 });
  });

  it('refuses a Steam account that another user already linked', async () => {
    const s = setup({ players: { [ID]: player(ID) } });
    const a = await s.mkUser('a');
    const b = await s.mkUser('b');
    await s.service.link(a.id, ID);
    await expect(s.service.link(b.id, ID)).rejects.toMatchObject({ status: 409 });
    expect(await s.service.getStatus(b.id)).toEqual({ linked: false });
  });

  it('re-linking the same account keeps linkedAt and last sync; a different account starts clean', async () => {
    const s = setup({ players: { [ID]: player(ID), [OTHER_ID]: player(OTHER_ID) } });
    const neo = await s.mkUser('neo');
    const first = await s.service.link(neo.id, ID);
    const doc = s.User.docs.find((u) => u._id === neo.id);
    doc.steam.lastSync = { at: new Date(), added: 3, updated: 1, unmatchedCount: 2 };
    const again = await s.service.link(neo.id, ID);
    expect(again.linkedAt).toEqual(first.linkedAt);
    expect(again.lastSync).toMatchObject({ added: 3, updated: 1, unmatchedCount: 2 });
    const other = await s.service.link(neo.id, OTHER_ID);
    expect(other).toMatchObject({ steamId: OTHER_ID, lastSync: null });
  });

  it('stores only https avatars and profile URLs on Steam hosts', async () => {
    const s = setup({ players: { [ID]: player(ID, { avatarfull: 'https://evil.example/a.jpg', profileurl: 'javascript:alert(1)' }) } });
    const neo = await s.mkUser('neo');
    expect(await s.service.link(neo.id, ID)).toMatchObject({ avatar: null, profileUrl: null });
  });

  it('unlinks, and unlinking twice is harmless', async () => {
    const s = setup({ players: { [ID]: player(ID) } });
    const neo = await s.mkUser('neo');
    await s.service.link(neo.id, ID);
    await s.service.unlink(neo.id);
    expect(await s.service.getStatus(neo.id)).toEqual({ linked: false });
    await expect(s.service.unlink(neo.id)).resolves.toBeUndefined();
  });
});

describe('/api/v1/steam', () => {
  function setupApp() {
    const models = createFakeModels();
    const config = testConfig({ STEAM_API_KEY: KEY });
    const authService = createAuthService({ ...models, config, bcryptRounds: 4, reuseGraceMs: 0 });
    const steam = createSteamAdapter({ config, fetchImpl: fakeSteam({ players: { [ID]: player(ID) }, vanity: { gaben: ID } }) });
    const steamService = createSteamService({ User: models.User, steam });
    return createApp({ config, logger, authService, steamService });
  }
  const register = async (app, name) => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send({ username: name, email: `${name}@example.com`, password: 'correct-horse-9' });
    return agent;
  };

  it('requires authentication', async () => {
    const app = setupApp();
    expect((await request(app).get('/api/v1/steam')).status).toBe(401);
    expect((await request(app).post('/api/v1/steam/link').send({ input: ID })).status).toBe(401);
    expect((await request(app).delete('/api/v1/steam/link')).status).toBe(401);
  });

  it('validates the body with the shared schema', async () => {
    const agent = await register(setupApp(), 'neo');
    const res = await agent.post('/api/v1/steam/link').send({ input: 'https://evil.example/x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect((await agent.post('/api/v1/steam/link').send({})).status).toBe(400);
  });

  it('links, reports status and unlinks; identity comes from the cookie, not the body', async () => {
    const agent = await register(setupApp(), 'neo');
    expect((await agent.get('/api/v1/steam')).body).toEqual({ steam: { linked: false } });
    const link = await agent.post('/api/v1/steam/link').send({ input: 'gaben', userId: 'someone-else' });
    expect(link.status).toBe(200);
    expect(link.body.steam).toMatchObject({ linked: true, steamId: ID, personaName: 'Persona 1' });
    expect(JSON.stringify(link.body)).not.toContain(KEY);
    expect((await agent.get('/api/v1/steam')).body.steam.linked).toBe(true);
    expect((await agent.delete('/api/v1/steam/link')).status).toBe(204);
    expect((await agent.get('/api/v1/steam')).body.steam.linked).toBe(false);
  });
});

import request from 'supertest';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { createInsightsService } from '../services/insightsService.js';
import { createFakeCollection, createFakeModels, logger, testConfig } from './helpers.js';

function setupInsights() {
  const Game = createFakeCollection({ unique: [['slug']] });
  const LibraryEntry = createFakeCollection({ unique: [['userId', 'gameId']], defaults: { manualProgress: 0, ownerships: [], loggedMinutes: 0 } });
  const PlayLog = createFakeCollection();
  const StatusHistory = createFakeCollection();
  const service = createInsightsService({ LibraryEntry, PlayLog, StatusHistory, Game });
  const mkGame = (title, extra = {}) =>
    Game.create({ title, slug: title.toLowerCase().replace(/\W+/g, '-'), genres: ['RPG'], cover: `https://img/${title}-cover.jpg`, backdrop: `https://img/${title}-backdrop.jpg`, ...extra });
  return { Game, LibraryEntry, PlayLog, service, mkGame };
}

describe('insights: game art for the Home sections', () => {
  it('play-next items carry the backdrop (null when the game has none), with their reasons, best first', async () => {
    const s = setupInsights();
    const withArt = await s.mkGame('With Art', { timeToBeat: { main: 4 } });
    const noArt = await s.mkGame('No Art', { backdrop: null, timeToBeat: { main: 60 } });
    await s.LibraryEntry.create({ userId: 'u1', gameId: withArt._id, status: 'backlog' });
    await s.LibraryEntry.create({ userId: 'u1', gameId: noArt._id, status: 'backlog' });

    const { items } = await s.service.getPlayNext('u1', { limit: 5 });

    expect(items.map((i) => i.title)).toEqual(['With Art', 'No Art']); // the short game scores higher
    expect(items[0]).toMatchObject({ cover: 'https://img/With Art-cover.jpg', backdrop: 'https://img/With Art-backdrop.jpg', timeToBeatMain: 4 });
    expect(items[0].reasons).toEqual(expect.arrayContaining(['~4h to beat']));
    expect(items[1].backdrop).toBeNull();
  });

  it('play-next honours the limit', async () => {
    const s = setupInsights();
    for (const n of [1, 2, 3, 4]) {
      const g = await s.mkGame(`Game ${n}`);
      await s.LibraryEntry.create({ userId: 'u1', gameId: g._id, status: 'backlog' });
    }
    expect((await s.service.getPlayNext('u1', { limit: 2 })).items).toHaveLength(2);
    expect((await s.service.getPlayNext('u1', { limit: 8 })).items).toHaveLength(4);
  });

  it('the resume card carries the backdrop', async () => {
    const s = setupInsights();
    const game = await s.mkGame('Hades');
    const entry = await s.LibraryEntry.create({ userId: 'u1', gameId: game._id, status: 'playing', manualProgress: 40 });
    await s.PlayLog.create({ userId: 'u1', gameId: game._id, date: '2026-10-26', minutes: 90, note: 'Boss fight' });

    const { resumeCard } = await s.service.getDashboard('u1');

    expect(resumeCard).toMatchObject({
      entryId: entry._id,
      title: 'Hades',
      cover: 'https://img/Hades-cover.jpg',
      backdrop: 'https://img/Hades-backdrop.jpg',
      manualProgress: 40,
    });
  });
});

describe('GET /api/v1/insights/play-next', () => {
  async function setupApp() {
    const models = createFakeModels();
    const config = testConfig();
    const authService = createAuthService({ ...models, config, bcryptRounds: 4, reuseGraceMs: 0 });
    const s = setupInsights();
    const app = createApp({ config, logger, authService, insightsService: s.service });
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/register').send({ username: 'neo', email: 'neo@example.com', password: 'correct-horse-9' });
    for (let n = 1; n <= 9; n += 1) {
      const g = await s.mkGame(`Game ${n}`);
      await s.LibraryEntry.create({ userId: res.body.user.id, gameId: g._id, status: 'backlog' });
    }
    return { app, agent };
  }

  it('requires authentication', async () => {
    const { app } = await setupApp();
    expect((await request(app).get('/api/v1/insights/play-next')).status).toBe(401);
  });

  it('defaults to 5, honours a limit up to 12, and rejects anything else with a validation error', async () => {
    const { agent } = await setupApp();
    expect((await agent.get('/api/v1/insights/play-next')).body.items).toHaveLength(5);
    expect((await agent.get('/api/v1/insights/play-next?limit=8')).body.items).toHaveLength(8);
    for (const bad of ['0', '13', 'abc', '-1', '2.5']) {
      const res = await agent.get(`/api/v1/insights/play-next?limit=${bad}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

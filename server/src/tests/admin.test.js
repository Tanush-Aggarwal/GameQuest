import request from 'supertest';
import { createApp } from '../app.js';
import { createAdminService } from '../services/adminService.js';
import { createAuthService } from '../services/authService.js';
import { createFakeCollection, createFakeModels, logger, testConfig } from './helpers.js';

function setup() {
  const models = createFakeModels();
  const Game = createFakeCollection({ unique: [['slug']] });
  const config = testConfig();
  const authService = createAuthService({ ...models, config, bcryptRounds: 4, reuseGraceMs: 0 });
  const adminService = createAdminService({ Game, User: models.User, logger });
  const app = createApp({ config, logger, authService, adminService });
  return { app, models, Game };
}
const join = async (app, name) => {
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/register').send({ username: name, email: `${name}@example.com`, password: 'correct-horse-9' });
  return agent;
};
const promote = async (app, models, agent, name) => {
  models.User.docs.find((u) => u.usernameLower === name).role = 'admin';
  await agent.post('/api/v1/auth/login').send({ email: `${name}@example.com`, password: 'correct-horse-9' });
};

describe('admin area', () => {
  it('is closed to players and open to administrators', async () => {
    const { app, models } = setup();
    expect((await request(app).get('/api/v1/admin/overview')).status).toBe(401);
    const player = await join(app, 'player');
    expect((await player.get('/api/v1/admin/overview')).status).toBe(403);
    const boss = await join(app, 'boss');
    await promote(app, models, boss, 'boss');
    const res = await boss.get('/api/v1/admin/overview');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ players: 2, admins: 1 });
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('sets a custom header with framing, offers the game’s pictures, and resets to automatic', async () => {
    const { app, models, Game } = setup();
    const game = await Game.create({
      title: 'The Quarry',
      slug: 'the-quarry',
      backdrop: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1/header.jpg',
      artworks: ['https://images.igdb.com/igdb/image/upload/t_1080p/ar1.jpg'],
      screenshots: ['https://images.igdb.com/igdb/image/upload/t_1080p/sc1.jpg'],
      externalIds: { steam: '1891950' },
      steamHero: 'https://shared.akamai.steamstatic.com/x/library_hero.jpg',
      steamHeroCheckedAt: new Date(),
    });
    const boss = await join(app, 'boss');
    await promote(app, models, boss, 'boss');

    const options = (await boss.get(`/api/v1/admin/games/${game._id}/header-options`)).body.options;
    expect(options.map((o) => o.label)).toEqual(['Steam banner art', 'Artwork 1', 'Screenshot 1']); // the 460px header.jpg is not offered
    expect(options[1].preview).toContain('/t_screenshot_med/');

    expect((await boss.patch(`/api/v1/admin/games/${game._id}`).send({ heroOverride: { url: 'http://insecure.example/a.jpg' } })).status).toBe(400);
    expect((await boss.patch(`/api/v1/admin/games/${game._id}`).send({ heroOverride: { url: options[1].url, posX: 50, posY: 20, zoom: 3 } })).status).toBe(400);
    const saved = await boss.patch(`/api/v1/admin/games/${game._id}`).send({ heroOverride: { url: options[1].url, posX: 40, posY: 20, zoom: 1.3 } });
    expect(saved.status).toBe(200);
    expect(saved.body.game.heroOverride).toEqual({ url: options[1].url, posX: 40, posY: 20, zoom: 1.3 });
    expect(Game.docs[0].heroOverride.updatedBy).toBeTruthy();

    const reset = await boss.patch(`/api/v1/admin/games/${game._id}`).send({ heroOverride: null });
    expect(reset.body.game.heroOverride).toBeNull();
  });

  it('fixes catalog entries: rename and hide/unhide, findable by title including hidden ones', async () => {
    const { app, models, Game } = setup();
    const game = await Game.create({ title: 'Hollow Knigt', slug: 'hollow-knight' });
    const boss = await join(app, 'boss');
    await promote(app, models, boss, 'boss');
    await boss.patch(`/api/v1/admin/games/${game._id}`).send({ title: 'Hollow Knight', hidden: true });
    expect(Game.docs[0]).toMatchObject({ title: 'Hollow Knight', hidden: true });
    expect((await boss.get('/api/v1/admin/games?q=hollow&hidden=hidden')).body.items.map((g) => g.title)).toEqual(['Hollow Knight']);
    expect((await boss.patch(`/api/v1/admin/games/${game._id}`).send({})).status).toBe(400);
  });

  it('manages roles but never lets an admin change their own role or remove the last admin', async () => {
    const { app, models } = setup();
    const boss = await join(app, 'boss');
    const player = await join(app, 'player');
    await promote(app, models, boss, 'boss');
    const bossId = models.User.docs.find((u) => u.usernameLower === 'boss')._id;
    const playerId = models.User.docs.find((u) => u.usernameLower === 'player')._id;

    expect((await boss.patch(`/api/v1/admin/users/${bossId}/role`).send({ role: 'user' })).status).toBe(400);
    expect((await boss.patch(`/api/v1/admin/users/${playerId}/role`).send({ role: 'admin' })).body).toEqual({ id: playerId, role: 'admin' });
    expect((await player.patch(`/api/v1/admin/users/${bossId}/role`).send({ role: 'user' })).status).toBe(403); // old session: still a player
    const users = (await boss.get('/api/v1/admin/users?q=play')).body.items;
    expect(users).toEqual([expect.objectContaining({ username: 'player', role: 'admin' })]);
    expect(users[0]).not.toHaveProperty('passwordHash');
  });

  it('lists games with hidden trailers and restores one', async () => {
    const { app, models, Game } = setup();
    const game = await Game.create({ title: 'Witcher', slug: 'witcher', hiddenTrailers: ['abcdefghijk', 'steam-1'] });
    const boss = await join(app, 'boss');
    await promote(app, models, boss, 'boss');
    expect((await boss.get('/api/v1/admin/trailers')).body.items[0].hiddenTrailers).toHaveLength(2);
    await boss.post(`/api/v1/admin/games/${game._id}/trailers/restore`).send({ videoId: 'steam-1' });
    expect(Game.docs[0].hiddenTrailers).toEqual(['abcdefghijk']);
  });
});

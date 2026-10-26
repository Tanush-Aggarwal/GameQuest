import mongoose from 'mongoose';
import { Game } from '../models/Game.js';
import { User } from '../models/User.js';
import { MediaCache } from '../models/MediaCache.js';
import { connectDb, disconnectDb } from '../config/db.js';

describe('Database schemas and configuration', () => {
  describe('Game model indexes', () => {
    const indexes = Game.schema.indexes();

    it('has a weighted text index on title and summary', () => {
      const textIndex = indexes.find(
        ([fields]) => fields.title === 'text' && fields.summary === 'text',
      );
      expect(textIndex).toBeDefined();
      expect(textIndex[1]?.weights).toMatchObject({ title: 10, summary: 1 });
    });

    it('has compound indexes for catalog filtering and sorting', () => {
      const hasIndex = (spec) =>
        indexes.some(
          ([fields]) =>
            Object.keys(spec).length === Object.keys(fields).length &&
            Object.entries(spec).every(([k, v]) => fields[k] === v),
        );

      expect(hasIndex({ genres: 1, slug: 1 })).toBe(true);
      expect(hasIndex({ platforms: 1, slug: 1 })).toBe(true);
      expect(hasIndex({ 'timeToBeat.main': 1, slug: 1 })).toBe(true);
      expect(hasIndex({ ratingAvg: -1, ratingCount: -1, slug: 1 })).toBe(true);
      expect(hasIndex({ releaseDate: -1, slug: 1 })).toBe(true);
    });
  });

  describe('User model schema fields', () => {
    it('defines avatar, bio, favouriteGames, discord, and notificationPrefs', () => {
      const paths = Object.keys(User.schema.paths);
      expect(paths).toContain('avatar');
      expect(paths).toContain('bio');
      expect(paths).toContain('favouriteGames');
      expect(paths).toContain('discord.id');
      expect(paths).toContain('discord.username');
      expect(paths).toContain('notificationPrefs.email');
      expect(paths).toContain('notificationPrefs.digest');
    });

    it('validates favouriteGames limits to maximum 4 games', async () => {
      const validUser = new User({
        username: 'gamer',
        usernameLower: 'gamer',
        email: 'gamer@example.com',
        passwordHash: 'hash123',
        favouriteGames: [
          new mongoose.Types.ObjectId(),
          new mongoose.Types.ObjectId(),
          new mongoose.Types.ObjectId(),
          new mongoose.Types.ObjectId(),
        ],
      });
      await expect(validUser.validate()).resolves.toBeUndefined();

      const invalidUser = new User({
        username: 'gamer2',
        usernameLower: 'gamer2',
        email: 'gamer2@example.com',
        passwordHash: 'hash123',
        favouriteGames: [
          new mongoose.Types.ObjectId(),
          new mongoose.Types.ObjectId(),
          new mongoose.Types.ObjectId(),
          new mongoose.Types.ObjectId(),
          new mongoose.Types.ObjectId(),
        ],
      });
      await expect(invalidUser.validate()).rejects.toThrow(/limit of 4/);
    });
  });

  describe('MediaCache model', () => {
    it('has a unique compound index on (gameId, source)', () => {
      const indexes = MediaCache.schema.indexes();
      const uniquePair = indexes.find(
        ([fields, opts]) => fields.gameId === 1 && fields.source === 1 && opts.unique === true,
      );
      expect(uniquePair).toBeDefined();
    });

    it('has a TTL index on expiresAt expiring at 0 seconds', () => {
      const indexes = MediaCache.schema.indexes();
      const ttlIndex = indexes.find(
        ([fields, opts]) => fields.expiresAt === 1 && opts.expireAfterSeconds === 0,
      );
      expect(ttlIndex).toBeDefined();
    });

    it('rejects unsupported media sources', async () => {
      const doc = new MediaCache({
        gameId: new mongoose.Types.ObjectId(),
        source: 'unsupported_source',
        payload: { test: true },
        expiresAt: new Date(Date.now() + 60000),
      });
      await expect(doc.validate()).rejects.toThrow(/is not a valid enum value/);
    });

    it('accepts supported media sources', async () => {
      const sources = ['youtube', 'twitch', 'speedrun', 'igdb'];
      for (const source of sources) {
        const doc = new MediaCache({
          gameId: new mongoose.Types.ObjectId(),
          source,
          payload: { test: true },
          expiresAt: new Date(Date.now() + 60000),
        });
        await expect(doc.validate()).resolves.toBeUndefined();
      }
    });
  });

  describe('connectDb', () => {
    it('exports connectDb and disconnectDb functions', () => {
      expect(typeof connectDb).toBe('function');
      expect(typeof disconnectDb).toBe('function');
    });
  });
});

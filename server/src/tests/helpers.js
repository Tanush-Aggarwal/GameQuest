import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { loadConfig } from '../config/index.js';

export const logger = pino({ level: 'silent' });

export function testConfig(extra = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://localhost/test',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    AUTH_RATE_LIMIT_MAX: '1000',
    ...extra,
  });
}

// Minimal in-memory stand-ins for the Mongoose models, enough for authService.
export function createFakeModels() {
  const users = [];
  const tokens = [];

  const matches = (doc, q) =>
    Object.entries(q).every(([k, v]) => {
      if (k === '$or') return v.some((sub) => matches(doc, sub));
      return doc[k] === v;
    });

  const User = {
    docs: users,
    findOne(q) {
      const found = users.find((u) => matches(u, q)) ?? null;
      const p = Promise.resolve(found);
      p.select = () => p;
      return p;
    },
    async findById(id) {
      return users.find((u) => String(u._id) === String(id)) ?? null;
    },
    async create(data) {
      if (users.some((u) => u.email === data.email || u.usernameLower === data.usernameLower)) {
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      }
      const doc = { _id: randomUUID(), role: 'user', createdAt: new Date(), ...data };
      users.push(doc);
      return doc;
    },
  };

  const RefreshToken = {
    docs: tokens,
    async create(data) {
      tokens.push({ usedAt: null, ...data });
    },
    async findOne(q) {
      return tokens.find((t) => matches(t, q)) ?? null;
    },
    async findOneAndUpdate(q, update) {
      const doc = tokens.find((t) => matches(t, q));
      if (!doc) return null;
      const before = { ...doc };
      Object.assign(doc, update);
      return before;
    },
    async deleteMany(q) {
      for (let i = tokens.length - 1; i >= 0; i -= 1) if (matches(tokens[i], q)) tokens.splice(i, 1);
    },
  };

  return { User, RefreshToken };
}

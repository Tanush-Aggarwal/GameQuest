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

const getPath = (doc, path) => path.split('.').reduce((o, k) => o?.[k], doc);
function setPath(doc, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((o, k) => (o[k] ??= {}), doc);
  parent[last] = value;
}

const OPS = {
  $in: (a, v) => (Array.isArray(a) ? a.some((x) => v.includes(x)) : v.includes(a)),
  $ne: (a, v) => a !== v,
  $gt: (a, v) => a != null && a > v,
  $gte: (a, v) => a != null && a >= v,
  $lt: (a, v) => a != null && a < v,
  $lte: (a, v) => a != null && a <= v,
};

function matchValue(actual, cond) {
  const isOps = cond && typeof cond === 'object' && !(cond instanceof Date) && Object.keys(cond).every((k) => k.startsWith('$'));
  if (isOps) return Object.entries(cond).every(([op, v]) => OPS[op](actual, v));
  return Array.isArray(actual) ? actual.includes(cond) : actual === cond;
}

function matchesQuery(doc, q) {
  return Object.entries(q).every(([k, v]) => {
    if (k === '$or') return v.some((sub) => matchesQuery(doc, sub));
    // Stand-in for a text index: every search word must appear in the title.
    if (k === '$text') return v.$search.toLowerCase().split(/\s+/).every((w) => doc.title?.toLowerCase().includes(w));
    return matchValue(getPath(doc, k), v);
  });
}

// Generic in-memory collection covering the Mongoose calls the services use.
// `unique` lists field-sets that must be unique (throws like a Mongo E11000).
export function createFakeCollection({ unique = [], defaults = {} } = {}) {
  const docs = [];
  let seq = 0;

  const query = (list) => {
    let rows = list;
    const q = {
      sort(spec) {
        const [[key, dir]] = Object.entries(spec);
        rows = [...rows].sort((a, b) => (getPath(a, key) > getPath(b, key) ? dir : -dir));
        return q;
      },
      limit(n) {
        rows = rows.slice(0, n);
        return q;
      },
      lean: () => q,
      select: () => q,
      then: (res, rej) => Promise.resolve(rows.map((r) => structuredClone(r))).then(res, rej),
    };
    return q;
  };

  const assertUnique = (doc, ignore) => {
    for (const fields of unique) {
      const clash = docs.some((d) => d !== ignore && fields.every((f) => String(getPath(d, f)) === String(getPath(doc, f))));
      if (clash) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    }
  };

  const applyUpdate = (doc, update) => {
    for (const [k, v] of Object.entries(update.$set ?? {})) setPath(doc, k, v);
    for (const [k, v] of Object.entries(update.$inc ?? {})) setPath(doc, k, (getPath(doc, k) ?? 0) + v);
    for (const [k, v] of Object.entries(update.$max ?? {})) {
      const cur = getPath(doc, k);
      if (cur == null || v > cur) setPath(doc, k, v);
    }
  };

  return {
    docs,
    async create(data) {
      seq += 1;
      // ids are shaped like ObjectIds so the shared id schemas accept them
      const doc = { _id: String(seq).padStart(24, '0'), createdAt: new Date(), updatedAt: new Date(), ...structuredClone(defaults), ...data };
      assertUnique(doc);
      docs.push(doc);
      return structuredClone(doc);
    },
    find: (q = {}) => query(docs.filter((d) => matchesQuery(d, q))),
    findOne: (q) => {
      const found = docs.find((d) => matchesQuery(d, q));
      const p = Promise.resolve(found ? structuredClone(found) : null);
      p.lean = () => p;
      return p;
    },
    async findOneAndUpdate(q, update, opts = {}) {
      let doc = docs.find((d) => matchesQuery(d, q));
      const before = doc ? structuredClone(doc) : null;
      if (!doc && opts.upsert) {
        const base = {};
        for (const [k, v] of Object.entries(q)) if (!v || typeof v !== 'object') setPath(base, k, v);
        await this.create({ ...base, ...update.$setOnInsert });
        doc = docs[docs.length - 1];
        applyUpdate(doc, update);
        return structuredClone(doc);
      }
      if (!doc) return null;
      applyUpdate(doc, update);
      doc.updatedAt = new Date();
      return structuredClone(opts.returnDocument === 'after' ? doc : before);
    },
    async countDocuments(q = {}) {
      return docs.filter((d) => matchesQuery(d, q)).length;
    },
    async deleteOne(q) {
      const i = docs.findIndex((d) => matchesQuery(d, q));
      if (i >= 0) docs.splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    },
    async deleteMany(q) {
      let n = 0;
      for (let i = docs.length - 1; i >= 0; i -= 1) {
        if (matchesQuery(docs[i], q)) {
          docs.splice(i, 1);
          n += 1;
        }
      }
      return { deletedCount: n };
    },
  };
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

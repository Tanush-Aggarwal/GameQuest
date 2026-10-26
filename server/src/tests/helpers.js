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
  $eq: (a, v) => (Array.isArray(a) ? a.some((x) => sameValue(x, v)) : sameValue(a, v)),
  $ne: (a, v) => (Array.isArray(a) ? !a.some((x) => sameValue(x, v)) : !sameValue(a, v)),
  $nin: (a, v) => (Array.isArray(a) ? !a.some((x) => v.includes(x)) : !v.includes(a)),
  $gt: (a, v) => a != null && a > v,
  $gte: (a, v) => a != null && a >= v,
  $lt: (a, v) => a != null && a < v,
  $lte: (a, v) => a != null && a <= v,
  $exists: (a, v) => (a !== undefined) === v,
  $regex: (a, v) => typeof a === 'string' && new RegExp(v).test(a),
};

const isDate = (v) => v != null && typeof v === 'object' && typeof v.getTime === 'function'; // duck-typed: structuredClone yields cross-realm Dates
const isObjectId = (v) => v != null && typeof v === 'object' && ('_bsontype' in v || v.constructor?.name === 'ObjectId');
const sameValue = (a, b) => {
  if (isDate(a) && isDate(b)) return a.getTime() === b.getTime();
  if (isObjectId(a) || isObjectId(b)) return String(a) === String(b);
  return a === b;
};

function matchValue(actual, cond) {
  const isOps = cond && typeof cond === 'object' && !isDate(cond) && Object.keys(cond).every((k) => k.startsWith('$'));
  if (isOps) return Object.entries(cond).every(([op, v]) => OPS[op](actual, v));
  return Array.isArray(actual) ? actual.some((x) => sameValue(x, cond)) : sameValue(actual, cond);
}

function matchesQuery(doc, q) {
  return Object.entries(q).every(([k, v]) => {
    if (k === '$or') return v.some((sub) => matchesQuery(doc, sub));
    if (k === '$and') return v.every((sub) => matchesQuery(doc, sub));
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
        const keys = Object.entries(spec);
        rows = [...rows].sort((a, b) => {
          for (const [key, dir] of keys) {
            const x = getPath(a, key);
            const y = getPath(b, key);
            if (x > y) return dir;
            if (x < y) return -dir;
          }
          return 0;
        });
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
    for (const k of Object.keys(update.$unset ?? {})) {
      const keys = k.split('.');
      const last = keys.pop();
      const parent = keys.reduce((o, key) => o?.[key], doc);
      if (parent) delete parent[last];
    }
    for (const [k, v] of Object.entries(update.$addToSet ?? {})) {
      const current = getPath(doc, k);
      const list = Array.isArray(current) ? current : [];
      if (!list.some((x) => sameValue(x, v))) list.push(v);
      setPath(doc, k, list);
    }
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
    // Like Mongo: ordered inserts stop at the first clash; ordered:false stores every doc that does not
    // clash and then throws, so callers must not assume a thrown insertMany stored nothing.
    async insertMany(list, { ordered = true } = {}) {
      const created = [];
      let failure = null;
      for (const data of list) {
        try {
          created.push(await this.create(data));
        } catch (err) {
          failure ??= err;
          if (ordered) break;
        }
      }
      if (failure) throw failure;
      return created;
    },
    // Only updateOne operations, which is all the services use.
    async bulkWrite(ops) {
      for (const op of ops) await this.updateOne(op.updateOne.filter, op.updateOne.update);
      return { modifiedCount: ops.length };
    },
    find: (q = {}) => query(docs.filter((d) => matchesQuery(d, q))),
    findOne: (q) => {
      const found = docs.find((d) => matchesQuery(d, q));
      const p = Promise.resolve(found ? structuredClone(found) : null);
      p.lean = () => p;
      p.select = () => p;
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
    async findOneAndDelete(q) {
      const i = docs.findIndex((d) => matchesQuery(d, q));
      if (i < 0) return null;
      const [doc] = docs.splice(i, 1);
      return structuredClone(doc);
    },
    async updateOne(q, update) {
      const doc = docs.find((d) => matchesQuery(d, q));
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      applyUpdate(doc, update);
      doc.updatedAt = new Date();
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async updateMany(q, update) {
      let count = 0;
      for (const doc of docs) {
        if (matchesQuery(doc, q)) {
          applyUpdate(doc, update);
          doc.updatedAt = new Date();
          count += 1;
        }
      }
      return { matchedCount: count, modifiedCount: count };
    },
    // Minimal aggregate: handles $match + $group with $avg/$sum
    aggregate(pipeline) {
      let rows = [...docs];
      for (const stage of pipeline) {
        if (stage.$match) rows = rows.filter((d) => matchesQuery(d, stage.$match));
        if (stage.$group) {
          const spec = stage.$group;
          const record = { _id: null };
          for (const [k, expr] of Object.entries(spec)) {
            if (k === '_id') continue;
            if (expr.$avg) {
              const vals = rows.map((d) => getPath(d, String(expr.$avg).slice(1))).filter((v) => v != null);
              record[k] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            }
            if (expr.$sum != null) {
              record[k] = typeof expr.$sum === 'number'
                ? rows.length * expr.$sum
                : rows.map((d) => getPath(d, String(expr.$sum).slice(1)) ?? 0).reduce((a, b) => a + b, 0);
            }
          }
          rows = rows.length ? [record] : [];
        }
      }
      return Promise.resolve(rows);
    },
  };
}

// Minimal in-memory stand-ins for the Mongoose models, enough for authService.
export function createFakeModels() {
  const tokens = [];

  const matches = (doc, q) =>
    Object.entries(q).every(([k, v]) => {
      if (k === '$or') return v.some((sub) => matches(doc, sub));
      return doc[k] === v;
    });

  // Users share the generic fake collection (24-hex ids, find/$in/$regex) so social tests can query them too.
  const userCollection = createFakeCollection({
    unique: [['email'], ['usernameLower']],
    defaults: {
      role: 'user',
      privacy: 'public',
      avatar: null,
      bio: '',
      favouriteGames: [],
      discord: { id: null, username: null },
      notificationPrefs: { email: false, digest: false },
    },
  });
  const baseFindOne = userCollection.findOne;
  const User = Object.assign(userCollection, {
    findOne(q) {
      const p = baseFindOne(q);
      p.select = () => p; // authService asks for +passwordHash; the fake always includes it
      return p;
    },
    async findById(id) {
      return userCollection.docs.find((u) => String(u._id) === String(id)) ?? null;
    },
  });
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

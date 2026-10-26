import { z } from 'zod';
import { LIBRARY_STATUSES } from './library.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const COLLECTION_VISIBILITIES = ['public', 'friends', 'private'];
export const COLLECTION_TYPES = ['manual', 'smart'];

// Smart-collection rules compile to a Mongo filter ONLY from this whitelist. `source` says which
// document the field lives on: the user's LibraryEntry or the catalog Game.
export const RULE_FIELDS = {
  status: { source: 'entry', kind: 'enum', label: 'Status', options: LIBRARY_STATUSES },
  genres: { source: 'game', kind: 'string', label: 'Genre' },
  platforms: { source: 'game', kind: 'string', label: 'Platform' },
  'timeToBeat.main': { source: 'game', kind: 'number', label: 'Hours to beat' },
  manualProgress: { source: 'entry', kind: 'number', label: 'Progress %' },
  ratingAvg: { source: 'game', kind: 'number', label: 'Average rating' },
  lastPlayedAt: { source: 'entry', kind: 'date', label: 'Last played' },
  releaseDate: { source: 'game', kind: 'date', label: 'Release date' },
};

export const RULE_OPERATORS = ['eq', 'ne', 'in', 'nin', 'gt', 'gte', 'lt', 'lte'];
export const OPERATORS_BY_KIND = {
  enum: ['eq', 'ne', 'in', 'nin'],
  string: ['eq', 'ne', 'in', 'nin'],
  number: ['eq', 'ne', 'in', 'nin', 'gt', 'gte', 'lt', 'lte'],
  date: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'],
};
export const OPERATOR_LABELS = {
  eq: 'is',
  ne: 'is not',
  in: 'is any of',
  nin: 'is none of',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
};

const scalar = z.union([z.string().trim().min(1).max(100), z.number().finite()]);

export const ruleSchema = z
  .object({
    field: z.enum(Object.keys(RULE_FIELDS)),
    op: z.enum(RULE_OPERATORS),
    value: z.union([scalar, z.array(scalar).min(1).max(20)]),
  })
  .strict()
  .superRefine((rule, ctx) => {
    const def = RULE_FIELDS[rule.field];
    if (!OPERATORS_BY_KIND[def.kind].includes(rule.op)) {
      ctx.addIssue({ code: 'custom', path: ['op'], message: `"${rule.op}" can't be used with ${def.label}` });
      return;
    }
    const multi = rule.op === 'in' || rule.op === 'nin';
    if (multi !== Array.isArray(rule.value)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: multi ? 'Expected a list of values' : 'Expected a single value' });
      return;
    }
    const values = multi ? rule.value : [rule.value];
    const ok = values.every((v) => {
      if (def.kind === 'number') return typeof v === 'number';
      if (def.kind === 'date') return typeof v === 'string' && !Number.isNaN(Date.parse(v));
      if (def.kind === 'enum') return def.options.includes(v);
      return typeof v === 'string';
    });
    if (!ok) ctx.addIssue({ code: 'custom', path: ['value'], message: `Invalid value for ${def.label}` });
  });

export const rulesSchema = z.array(ruleSchema).max(10);

const name = z.string().trim().min(1).max(80);
const description = z.string().trim().max(500);

export const createCollectionSchema = z
  .object({
    name,
    description: description.default(''),
    visibility: z.enum(COLLECTION_VISIBILITIES).default('private'),
    type: z.enum(COLLECTION_TYPES).default('manual'),
    rules: rulesSchema.default([]),
    coverGameId: objectId.optional(),
  })
  .superRefine((c, ctx) => {
    if (c.type === 'smart' && c.rules.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['rules'], message: 'A smart collection needs at least one rule' });
    }
    if (c.type === 'manual' && c.rules.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['rules'], message: 'Only smart collections have rules' });
    }
  });

// The type of a collection never changes after creation.
export const updateCollectionSchema = z
  .object({
    name: name.optional(),
    description: description.optional(),
    visibility: z.enum(COLLECTION_VISIBILITIES).optional(),
    rules: rulesSchema.optional(),
    coverGameId: objectId.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const previewRulesSchema = z.object({ rules: rulesSchema.min(1) });

export const collectionIdParamsSchema = z.object({ id: objectId });
export const collectionItemParamsSchema = z.object({ id: objectId, itemId: objectId });

export const addCollectionItemSchema = z.object({
  entryId: objectId,
  note: z.string().trim().max(500).default(''),
});

// Place the item directly after `afterItemId`; null moves it to the top.
export const moveCollectionItemSchema = z.object({ afterItemId: objectId.nullable() });

export const collectionListQuerySchema = z.object({
  type: z.enum(COLLECTION_TYPES).optional(),
  cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

export const collectionDetailQuerySchema = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

import { OPERATORS_BY_KIND, RULE_FIELDS } from '@gamequest/shared';
import { ValidationError } from './errors.js';

const MONGO_OPS = { eq: '$eq', ne: '$ne', in: '$in', nin: '$nin', gt: '$gt', gte: '$gte', lt: '$lt', lte: '$lte' };
const MAX_RULES = 10;

function coerce(kind, value, field) {
  if (kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new ValidationError(`${field} needs a number`);
    return value;
  }
  if (kind === 'date') {
    const d = typeof value === 'string' ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) throw new ValidationError(`${field} needs a valid date`);
    return d;
  }
  // enum / string: only plain strings; objects (e.g. { $gt: '' }) can never reach Mongo as a value.
  if (typeof value !== 'string' || !value) throw new ValidationError(`${field} needs a text value`);
  return value;
}

// Compiles user-supplied rules into Mongo filters. Anything outside the whitelist of fields,
// operators and value types throws ValidationError, so no user text becomes a field name or operator.
// Returns { entry, game }: filters for the owner's LibraryEntry docs and for the catalog Game docs.
export function compileRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) throw new ValidationError('A smart collection needs at least one rule');
  if (rules.length > MAX_RULES) throw new ValidationError(`At most ${MAX_RULES} rules are allowed`);

  const clauses = { entry: [], game: [] };
  for (const rule of rules) {
    const field = typeof rule?.field === 'string' && Object.hasOwn(RULE_FIELDS, rule.field) ? rule.field : null;
    if (!field) throw new ValidationError(`Unknown rule field "${String(rule?.field)}"`);
    const def = RULE_FIELDS[field];
    const op = typeof rule.op === 'string' && Object.hasOwn(MONGO_OPS, rule.op) ? rule.op : null;
    if (!op || !OPERATORS_BY_KIND[def.kind].includes(op)) {
      throw new ValidationError(`"${String(rule.op)}" can't be used with ${def.label}`);
    }

    const multi = op === 'in' || op === 'nin';
    if (multi !== Array.isArray(rule.value)) throw new ValidationError(multi ? `${def.label} needs a list` : `${def.label} needs a single value`);
    const value = multi ? rule.value.map((v) => coerce(def.kind, v, def.label)) : coerce(def.kind, rule.value, def.label);
    if (def.kind === 'enum') {
      for (const v of multi ? value : [value]) if (!def.options.includes(v)) throw new ValidationError(`Invalid ${def.label}: ${v}`);
    }
    clauses[def.source].push({ [field]: { [MONGO_OPS[op]]: value } });
  }

  return {
    entry: clauses.entry.length ? { $and: clauses.entry } : {},
    game: clauses.game.length ? { $and: clauses.game } : {},
  };
}

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { OPERATORS_BY_KIND, OPERATOR_LABELS, RULE_FIELDS, ruleSchema } from '@gamequest/shared';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { getErrorInfo } from '@/services/api.js';
import { previewRules } from '@/services/collectionsApi.js';

const MAX_RULES = 10;
const PREVIEW_DEBOUNCE_MS = 400;
const FIELD_KEYS = Object.keys(RULE_FIELDS);
const selectClass = 'min-h-11 rounded-control border border-border bg-surface px-2 text-sm text-text';

const isMulti = (op) => op === 'in' || op === 'nin';
const blankRow = () => ({ field: 'status', op: 'eq', raw: 'backlog' });

function toRow(rule) {
  return { field: rule.field, op: rule.op, raw: Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value) };
}

// Turns what the user typed into a typed rule, or null while it is incomplete/invalid.
function toRule(row) {
  const def = RULE_FIELDS[row.field];
  const parts = isMulti(row.op) ? row.raw.split(',').map((s) => s.trim()).filter(Boolean) : [row.raw.trim()];
  if (!parts.length || parts.some((p) => !p)) return null;
  const typed = parts.map((p) => (def.kind === 'number' ? Number(p) : p));
  const rule = { field: row.field, op: row.op, value: isMulti(row.op) ? typed : typed[0] };
  return ruleSchema.safeParse(rule).success ? rule : null;
}

function ValueInput({ row, onChange, label }) {
  const def = RULE_FIELDS[row.field];
  if (def.kind === 'enum' && !isMulti(row.op)) {
    return (
      <select aria-label={`${label} value`} className={selectClass} value={row.raw} onChange={(e) => onChange(e.target.value)}>
        {def.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  const multi = isMulti(row.op);
  return (
    <Input
      aria-label={`${label} value`}
      type={def.kind === 'number' && !multi ? 'number' : def.kind === 'date' ? 'date' : 'text'}
      placeholder={multi ? 'Comma-separated' : def.kind === 'string' ? 'e.g. Indie' : ''}
      value={row.raw}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1"
    />
  );
}

function Preview({ rules, valid }) {
  // Debounce on the serialised rules, then derive loading/error from which key the result belongs to
  // (no synchronous setState inside effects).
  const key = valid && rules.length ? JSON.stringify(rules) : null;
  const [debounced, setDebounced] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null });

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(key), key ? PREVIEW_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [key]);

  const requestKey = debounced ? `${attempt}:${debounced}` : null;
  useEffect(() => {
    if (!requestKey) return undefined;
    let cancelled = false;
    previewRules(JSON.parse(debounced)).then(
      (data) => !cancelled && setResult({ key: requestKey, data, error: null }),
      (err) => !cancelled && setResult({ key: requestKey, data: null, error: getErrorInfo(err).message }),
    );
    return () => {
      cancelled = true;
    };
  }, [requestKey, debounced]);

  if (!key) return <p className="text-sm text-text-muted">Complete every rule to see which games match.</p>;
  if (!requestKey || result.key !== requestKey || key !== debounced) {
    return <Skeleton className="h-12 w-full" role="status" aria-label="Loading preview" />;
  }
  if (result.error) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 text-sm">
        <span>{result.error}</span>
        <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
          Retry
        </Button>
      </div>
    );
  }
  const { total, truncated, items } = result.data;
  return (
    <div aria-live="polite" className="flex flex-col gap-1 text-sm">
      <p className="font-medium">
        {total === 0 ? 'No games in your library match these rules yet.' : `${truncated ? 'At least ' : ''}${total} ${total === 1 ? 'game matches' : 'games match'}`}
      </p>
      {items.length > 0 && <p className="text-text-muted">{items.slice(0, 5).map((i) => i.entry.game?.title ?? 'Unknown game').join(' · ')}{total > 5 ? ' …' : ''}</p>}
    </div>
  );
}

// Field / operator / value rows with a live preview. Reports typed rules and whether every row is valid.
export function RuleBuilder({ initialRules = [], onChange }) {
  const [rows, setRows] = useState(() => (initialRules.length ? initialRules.map(toRow) : [blankRow()]));
  const rules = useMemo(() => rows.map(toRule), [rows]);
  const valid = rules.every(Boolean);
  const typed = useMemo(() => rules.filter(Boolean), [rules]);

  useEffect(() => {
    onChange?.({ rules: typed, valid: valid && typed.length > 0 });
  }, [typed, valid, onChange]);

  function update(index, patch) {
    setRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        const kind = RULE_FIELDS[next.field].kind;
        if (patch.field) {
          // A new field resets operator and value to something valid for its kind.
          next.op = 'eq';
          next.raw = kind === 'enum' ? RULE_FIELDS[next.field].options[0] : '';
        } else if (patch.op && !OPERATORS_BY_KIND[kind].includes(next.op)) {
          next.op = OPERATORS_BY_KIND[kind][0];
        }
        if (patch.op && RULE_FIELDS[next.field].kind === 'enum' && isMulti(patch.op) !== isMulti(row.op)) {
          next.raw = isMulti(patch.op) ? row.raw : RULE_FIELDS[next.field].options[0];
        }
        return next;
      }),
    );
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">Rules (all must match)</legend>
      {rows.map((row, i) => {
        const label = `Rule ${i + 1}`;
        const kind = RULE_FIELDS[row.field].kind;
        return (
          <div key={i} className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
            <select aria-label={`${label} field`} className={selectClass} value={row.field} onChange={(e) => update(i, { field: e.target.value })}>
              {FIELD_KEYS.map((f) => (
                <option key={f} value={f}>
                  {RULE_FIELDS[f].label}
                </option>
              ))}
            </select>
            <select aria-label={`${label} operator`} className={selectClass} value={row.op} onChange={(e) => update(i, { op: e.target.value })}>
              {OPERATORS_BY_KIND[kind].map((op) => (
                <option key={op} value={op}>
                  {OPERATOR_LABELS[op]}
                </option>
              ))}
            </select>
            <ValueInput row={row} label={label} onChange={(raw) => update(i, { raw })} />
            <Button
              variant="ghost"
              aria-label={`Remove ${label.toLowerCase()}`}
              disabled={rows.length === 1}
              onClick={() => setRows((current) => current.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        );
      })}
      <div>
        <Button variant="secondary" disabled={rows.length >= MAX_RULES} onClick={() => setRows((r) => [...r, blankRow()])}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add rule
        </Button>
      </div>
      <Preview rules={typed} valid={valid} />
    </fieldset>
  );
}

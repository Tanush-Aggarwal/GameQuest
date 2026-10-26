import { useCallback, useId, useState } from 'react';
import { createCollectionSchema } from '@gamequest/shared';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { RuleBuilder } from './RuleBuilder.jsx';
import { VISIBILITY_OPTIONS } from './badges.jsx';

const selectClass = 'min-h-11 w-full rounded-control border border-border bg-surface px-2 text-sm text-text';

// Create (type is chosen) or edit (type is fixed) a collection. Validates with the shared schema before submitting.
export function CollectionForm({ initial, submitLabel, onSubmit, onCancel }) {
  const editing = Boolean(initial);
  const id = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [visibility, setVisibility] = useState(initial?.visibility ?? 'private');
  const [type, setType] = useState(initial?.type ?? 'manual');
  const [ruleState, setRuleState] = useState({ rules: initial?.rules ?? [], valid: Boolean(initial?.rules?.length) });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleRules = useCallback((next) => setRuleState(next), []);

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = { name, description, visibility, type, rules: type === 'smart' ? ruleState.rules : [] };
    const parsed = createCollectionSchema.safeParse(payload);
    if (!parsed.success || (type === 'smart' && !ruleState.valid)) {
      const next = {};
      for (const issue of parsed.error?.issues ?? []) next[issue.path[0]] ??= issue.message;
      if (type === 'smart' && !ruleState.valid) next.rules = 'Complete every rule before saving';
      setErrors(next);
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit(editing ? { name: parsed.data.name, description: parsed.data.description, visibility, ...(type === 'smart' && { rules: parsed.data.rules }) } : parsed.data);
    } catch (err) {
      setFormError(err.message ?? 'Could not save the collection');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4" aria-label={editing ? 'Edit collection' : 'New collection'}>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">Name</label>
        <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} maxLength={80} />
        {errors.name && <p className="text-sm text-danger">{errors.name}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-desc`} className="text-sm font-medium">Description <span className="text-text-muted">(optional)</span></label>
        <textarea
          id={`${id}-desc`}
          rows={2}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-text"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-vis`} className="text-sm font-medium">Who can see it</label>
          <select id={`${id}-vis`} className={selectClass} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            {VISIBILITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {!editing && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-type`} className="text-sm font-medium">Type</label>
            <select id={`${id}-type`} className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="manual">Manual — I pick the games</option>
              <option value="smart">Smart — filled by rules</option>
            </select>
          </div>
        )}
      </div>

      {type === 'smart' && (
        <div>
          <RuleBuilder initialRules={initial?.rules} onChange={handleRules} />
          {errors.rules && <p className="mt-1 text-sm text-danger">{errors.rules}</p>}
        </div>
      )}

      {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : submitLabel}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

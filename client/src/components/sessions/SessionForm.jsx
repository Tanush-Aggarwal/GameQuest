import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, MonitorSmartphone, Pencil, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar.jsx';
import { SESSION_DURATIONS, createSessionSchema, updateSessionSchema } from '@gamequest/shared';
import { FancySelect } from '@/components/ui/FancySelect.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { defaultStart, fromLocalInput, toLocalInput, viewerTimeZone } from '@/lib/sessionTime.js';
import { listFriends } from '@/services/socialApi.js';

// The datetime input has minute precision, so compare to the minute.
const sameMinute = (a, b) => Math.floor(new Date(a).getTime() / 60_000) === Math.floor(new Date(b).getTime() / 60_000);

const selectClass = 'w-full';
const hourLabel = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
};

function Field({ id, label, hint, error, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

// Create (pass `gameId`) or edit (pass `initial`) a session. Times are typed in the viewer's own
// timezone and sent to the API as UTC; the shared schemas validate before anything is submitted.
export function SessionForm({ gameId, initial, submitLabel, onSubmit, onCancel }) {
  const editing = Boolean(initial);
  const id = useId();
  const [title, setTitle] = useState(initial?.customTitle ?? '');
  const [start, setStart] = useState(initial ? toLocalInput(initial.startsAt) : defaultStart());
  const [durationMin, setDurationMin] = useState(initial?.durationMin ?? 120);
  const [platform, setPlatform] = useState(initial?.platform ?? '');
  const [maxPlayers, setMaxPlayers] = useState(String(initial?.maxPlayers ?? 4));
  const [visibility, setVisibility] = useState(initial?.visibility ?? 'friends');
  const [inviteeIds, setInviteeIds] = useState(initial?.inviteeIds ?? []);
  const [discord, setDiscord] = useState(initial?.discordInviteUrl ?? '');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadFriends = useCallback((signal) => listFriends({ signal }), []);
  const friends = useAsync(loadFriends);

  const toggleInvitee = (friendId) =>
    setInviteeIds((current) => (current.includes(friendId) ? current.filter((x) => x !== friendId) : [...current, friendId]));

  async function handleSubmit(e) {
    e.preventDefault();
    const startsAt = fromLocalInput(start);
    const fields = { title, startsAt, durationMin: Number(durationMin), platform, maxPlayers: Number(maxPlayers), visibility, inviteeIds, discordInviteUrl: discord };
    const parsed = editing ? updateSessionSchema.safeParse(fields) : createSessionSchema.safeParse({ gameId, ...fields });
    const next = {};
    if (!parsed.success) for (const issue of parsed.error.issues) next[issue.path[0]] ??= issue.message;
    const startChanged = !editing || !sameMinute(startsAt, initial.startsAt);
    if (startsAt && startChanged && new Date(startsAt).getTime() < Date.now() - 60_000) next.startsAt = 'Pick a start time in the future';
    // The shared schema checks these too, but skips them while another field has an error; show everything at once.
    if (visibility === 'invite' && inviteeIds.length === 0) next.inviteeIds ??= 'Invite at least one friend';
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      // An unchanged start time isn't re-sent, so a session already under way can still be edited.
      const { startsAt: _unchanged, ...rest } = parsed.data;
      await onSubmit(editing && !startChanged ? rest : parsed.data);
    } catch (err) {
      setFormError(err.message ?? 'Could not save the session');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5" aria-label={editing ? 'Edit session' : 'New session'}>
      <Section icon={Pencil} title="Details" subtitle="Give it a name your friends will recognise.">
        <Field id={`${id}-title`} label="Title" hint="Optional — defaults to “Playing <game>”." error={errors.title}>
          <Input id={`${id}-title`} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Boss rush night" />
        </Field>
      </Section>

      <Section icon={Clock} title="When" subtitle={`Times are in your timezone (${viewerTimeZone()}).`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-start`} label="Starts" error={errors.startsAt}>
            <Input id={`${id}-start`} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={Boolean(errors.startsAt)} />
          </Field>
          <Field id={`${id}-dur`} label="Length" error={errors.durationMin}>
            <FancySelect id={`${id}-dur`} className={selectClass} value={durationMin} onChange={(e) => setDurationMin(e.target.value)}>
              {SESSION_DURATIONS.map((m) => (
                <option key={m} value={m}>{hourLabel(m)}</option>
              ))}
            </FancySelect>
          </Field>
        </div>
      </Section>

      <Section icon={Users} title="Who" subtitle="Choose who can join and invite friends directly.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-vis`} label="Who can join" error={errors.visibility}>
            <FancySelect id={`${id}-vis`} className={selectClass} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="friends">All my friends</option>
              <option value="invite">Only people I invite</option>
            </FancySelect>
          </Field>
          <Field id={`${id}-max`} label="Players (including you)" error={errors.maxPlayers}>
            <Input id={`${id}-max`} type="number" min={2} max={32} value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} aria-invalid={Boolean(errors.maxPlayers)} />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">
            Invite friends {visibility === 'invite' ? '' : <span className="text-text-muted">(optional)</span>}
            {inviteeIds.length > 0 && <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-xs font-semibold text-text">{inviteeIds.length} invited</span>}
          </legend>
          {friends.status === 'loading' && <Skeleton className="h-16 w-full" role="status" aria-label="Loading friends" />}
          {friends.status === 'error' && <ErrorState message={friends.error.message} onRetry={friends.retry} />}
          {friends.status === 'success' && friends.data.length === 0 && (
            <p className="text-sm text-text-muted">
              You have no friends yet. <Link to="/friends?tab=find" className="text-accent underline">Find people</Link> to invite them.
            </p>
          )}
          {friends.status === 'success' && friends.data.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {friends.data.map((f) => {
                const on = inviteeIds.includes(f.id);
                return (
                  <li key={f.id}>
                    <label
                      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-text ${
                        on ? 'border-text bg-text text-bg' : 'border-border bg-bg text-text hover:border-text'
                      }`}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggleInvitee(f.id)} className="sr-only" />
                      <Avatar user={f} size={32} />
                      <span>{f.username}</span>
                      {on && <Check className="h-4 w-4" aria-hidden="true" />}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {errors.inviteeIds && <p className="text-sm text-danger">{errors.inviteeIds}</p>}
        </fieldset>
      </Section>

      <Section icon={MonitorSmartphone} title="Where" subtitle="Optional: the platform and a voice channel.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-platform`} label="Platform" hint="Optional" error={errors.platform}>
            <Input id={`${id}-platform`} value={platform} maxLength={50} onChange={(e) => setPlatform(e.target.value)} placeholder="PC, Switch, PS5…" />
          </Field>
          <Field id={`${id}-discord`} label="Discord invite" hint="Optional — a discord.gg/… or discord.com/invite/… link." error={errors.discordInviteUrl}>
            <Input id={`${id}-discord`} value={discord} maxLength={100} onChange={(e) => setDiscord(e.target.value)} placeholder="https://discord.gg/your-code" aria-invalid={Boolean(errors.discordInviteUrl)} />
          </Field>
        </div>
      </Section>

      {formError && <p role="alert" className="rounded-card border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-3 text-sm text-danger">{formError}</p>}

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
        <p className="px-1 text-xs text-text-muted">Friends you invite get a notification.</p>
        <div className="flex gap-2">
          {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
          <Button type="submit" disabled={submitting} className="px-6">{submitting ? 'Saving…' : submitLabel}</Button>
        </div>
      </div>
    </form>
  );
}

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-sm">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-text" aria-hidden="true">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-heading text-base font-bold text-text">{title}</h2>
          {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

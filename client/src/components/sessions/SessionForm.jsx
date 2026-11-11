import { useCallback, useContext, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '@/components/ui/Avatar.jsx';
import { SESSION_DURATIONS, createSessionSchema, updateSessionSchema } from '@gamequest/shared';
import { Input } from '@/components/ui/input.jsx';
import { DatePicker } from '@/components/ui/DatePicker.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { GameCover } from '@/components/games/GameCard.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { cn } from '@/lib/utils.js';
import { defaultStart, fromLocalInput, toLocalInput, viewerTimeZone } from '@/lib/sessionTime.js';
import { listFriends } from '@/services/socialApi.js';
import { AuthContext } from '@/features/auth/AuthContext.jsx';
import { BackdropHero } from '@/components/art/BackdropHero.jsx';

// The date picker has minute precision, so compare to the minute.
const sameMinute = (a, b) => Math.floor(new Date(a).getTime() / 60_000) === Math.floor(new Date(b).getTime() / 60_000);

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 32;
const lengthLabel = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m === 30 ? `${h}½ h` : `${h} h`;
};

// A white card of settings rows, separated by hairlines (like a phone's settings screen).
function Group({ title, lead, children, footer }) {
  return (
    <section className="flex flex-col border-t border-text/15 pt-6 first:border-t-0 first:pt-0">
      {title && (
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 className="font-heading text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-text">{title}</h2>
          {lead && <p className="text-[15px] text-text-muted">{lead}</p>}
        </div>
      )}
      {/* rows sit straight on the page, split by hairlines: no box around them */}
      <div className="flex flex-col divide-y divide-border">{children}</div>
      {footer && <p className="pt-2 text-[13px] text-text-muted">{footer}</p>}
    </section>
  );
}

// One row: the name on the left, the control on the right; `stack` puts the control under the name.
function Row({ id, label, sub, error, children, stack = false, inline = false, as: Tag = 'div' }) {
  const Label = Tag === 'fieldset' ? 'legend' : 'label';
  return (
    <Tag className={cn('flex min-w-0 gap-3 py-4', stack ? 'flex-col' : inline ? 'flex-row items-center justify-between' : 'flex-col sm:flex-row sm:items-center sm:justify-between')}>
      <div className="min-w-0 sm:shrink-0">
        <Label {...(Label === 'label' ? { htmlFor: id } : {})} className="float-left text-[15px] font-semibold text-text">
          {label}
        </Label>
        {sub && <p className="clear-left text-[13px] leading-snug text-text-muted">{sub}</p>}
      </div>
      <div className={cn('flex min-w-0 flex-col gap-1.5', inline ? 'shrink-0 items-end' : !stack && 'sm:max-w-[60%] sm:items-end')}>
        {children}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Tag>
  );
}

function Segmented({ label, value, onChange, options }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full flex-wrap gap-1 rounded-[6px] bg-surface-raised p-1">
      {options.map((o) => {
        const on = String(o.value) === String(value);
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-9 flex-1 whitespace-nowrap rounded-[4px] px-1 text-xs font-semibold tabular-nums sm:px-2 sm:text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text',
              on ? 'bg-surface text-text ring-1 ring-border' : 'text-text-muted hover:text-text',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// An on/off switch.
function Switch({ id, checked, onChange }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        checked ? 'bg-text' : 'bg-text/20',
      )}
    >
      <span className={cn('absolute left-0 top-1 h-5 w-5 rounded-full bg-surface transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}

function Stepper({ id, value, onChange, invalid }) {
  const n = Number(value) || MIN_PLAYERS;
  const btn = 'h-9 w-9 rounded-[4px] font-heading text-lg text-text hover:bg-surface disabled:text-text-muted/40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text';
  return (
    <div className={cn('inline-flex w-fit items-center gap-1 rounded-[6px] bg-surface-raised p-1', invalid && 'ring-1 ring-danger')}>
      <button type="button" className={btn} aria-label="Fewer players" disabled={n <= MIN_PLAYERS} onClick={() => onChange(String(n - 1))}>
        −
      </button>
      <input
        id={id}
        type="number"
        min={MIN_PLAYERS}
        max={MAX_PLAYERS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        className="w-10 !rounded-none border-0 bg-transparent text-center font-heading text-lg font-bold tabular-nums text-text !shadow-none focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" className={btn} aria-label="More players" disabled={n >= MAX_PLAYERS} onClick={() => onChange(String(n + 1))}>
        +
      </button>
    </div>
  );
}

const pad2 = (n) => String(n).padStart(2, '0');
const dayKey = (x) => `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
const TIME_PICKS = [17, 18, 19, 20, 21, 22, 23];
const hourLabel = (h, m = 0) => new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: m ? '2-digit' : undefined });

// This week as seven tiles, like picking a show date in a booking app. Any other date goes through the "Starts" picker.
function DayStrip({ value, onPick }) {
  const days = useMemo(() => {
    const t = new Date();
    return Array.from({ length: 7 }, (_, i) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + i));
  }, []);
  const chosen = value ? value.slice(0, 10) : '';
  const todayKey = dayKey(new Date());
  return (
    <div role="radiogroup" aria-label="Day" className="grid grid-cols-7 gap-1">
      {days.map((d) => {
        const on = dayKey(d) === chosen;
        return (
          <button
            key={dayKey(d)}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            onClick={() => onPick(d)}
            className={cn(
              'flex min-w-0 flex-col items-center rounded-[6px] py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text',
              on ? 'bg-text text-bg' : 'text-text hover:bg-surface-raised',
            )}
          >
            <span className={cn('max-w-full truncate text-[9px] font-bold uppercase sm:text-[11px]', on ? 'text-bg/70' : 'text-text-muted')}>
              {dayKey(d) === todayKey ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })}
            </span>
            <span className={cn('font-heading text-base font-semibold tabular-nums leading-tight sm:text-lg', on ? '!text-bg' : '!text-text')}>{d.getDate()}</span>
            <span className={cn('text-[11px] font-semibold', on ? 'text-bg/70' : 'text-text-muted')}>{d.toLocaleDateString(undefined, { month: 'short' })}</span>
          </button>
        );
      })}
    </div>
  );
}

// Evening start times in one tap; past ones (today) are disabled.
function TimePicks({ value, onPick }) {
  const d = value ? new Date(value) : null;
  const now = new Date();
  return (
    <div role="radiogroup" aria-label="Start time" className="flex flex-wrap gap-1.5">
      {TIME_PICKS.map((h) => {
        const on = d && d.getHours() === h && d.getMinutes() === 0;
        const past = d && dayKey(d) === dayKey(now) && h <= now.getHours();
        return (
          <button
            key={h}
            type="button"
            role="radio"
            aria-checked={Boolean(on)}
            disabled={past}
            onClick={() => onPick(h)}
            className={cn(
              'h-10 rounded-[6px] px-4 text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text disabled:cursor-not-allowed disabled:opacity-35',
              on ? 'bg-text text-bg' : 'bg-surface-raised text-text hover:bg-text/10',
            )}
          >
            {hourLabel(h)}
          </button>
        );
      })}
    </div>
  );
}

// The party: you, the friends you invited, then open spots, as seats in a row.
function Seat({ children, name, host }) {
  return (
    <li className="flex w-16 flex-col items-center gap-1.5">
      {children}
      <span className={cn('w-full break-words text-center text-xs leading-tight', host ? 'font-bold text-text' : name ? 'font-semibold text-text' : 'text-text-muted')}>{name ?? 'Open'}</span>
    </li>
  );
}

function Lineup({ me, invited, max }) {
  const seats = Math.max(Number(max) || 0, 1 + invited.length);
  const open = Math.max(0, seats - 1 - invited.length);
  const shownOpen = Math.min(open, 8);
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Lineup" className="flex flex-wrap gap-x-2 gap-y-3">
        <Seat name="You" host>
          <span className="rounded-full ring-2 ring-text ring-offset-2 ring-offset-surface">
            <Avatar user={me ?? { username: 'You' }} size={48} />
          </span>
        </Seat>
        {invited.map((f) => (
          <Seat key={f.id} name={f.username}>
            <Avatar user={f} size={48} />
          </Seat>
        ))}
        {Array.from({ length: shownOpen }, (_, i) => (
          <Seat key={i}>
            <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-text/25 font-heading text-lg text-text-muted/60">+</span>
          </Seat>
        ))}
        {open > shownOpen && (
          <li className="flex h-12 items-center text-sm font-semibold text-text-muted">+{open - shownOpen} more</li>
        )}
      </ul>
      <p className="text-xs text-text-muted">
        {invited.length} invited · {open} open {open === 1 ? 'spot' : 'spots'}
      </p>
    </div>
  );
}

const rowInput = 'h-9 w-full rounded-[6px] border-transparent bg-surface-raised text-sm focus:border-text sm:w-72';

// Create (pass `gameId` and `game`) or edit (pass `initial`) a session. Times are picked in the viewer's own
// timezone and sent to the API as UTC; the shared schemas validate before anything is submitted.
// With `game`, the page is two columns: the form, and a live preview of the invite with the actions under it.
export function SessionForm({ gameId, game, onChangeGame, initial, submitLabel, onSubmit, onCancel }) {
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

  const me = useContext(AuthContext)?.user ?? null;
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

  // The game's platforms as one-click suggestions, in the short names people use ("PC", not "PC (Microsoft Windows)").
  const platformSuggestions = [...new Set((game?.platforms ?? []).map((p) => p.replace(/\s*\(.*\)$/, '')))].slice(0, 5);
  const d = start ? new Date(start) : null;
  const validStart = d && !Number.isNaN(d.getTime());
  const end = validStart ? new Date(d.getTime() + Number(durationMin) * 60_000) : null;
  const invited = (friends.data ?? []).filter((f) => inviteeIds.includes(f.id));
  const fmtTime = (x) => x.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const pickDay = (day) => {
    const base = validStart ? d : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 21, 0);
    setStart(toLocalInput(new Date(day.getFullYear(), day.getMonth(), day.getDate(), base.getHours(), base.getMinutes()).toISOString()));
  };
  const pickHour = (h) => {
    const base = validStart ? d : new Date();
    setStart(toLocalInput(new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, 0).toISOString()));
  };

  // The title, typed straight into the page; white over the game's art when there is a game.
  const titleField = (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-title`} className={cn('text-xs font-bold uppercase tracking-wider', game ? 'sr-only' : 'text-text-muted')}>
        Title
      </label>
      <textarea
        rows={1}
        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        id={`${id}-title`}
        value={title}
        maxLength={80}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={game ? `Playing ${game.title}` : 'Name your game night'}
        className={cn(
          'w-full resize-none overflow-hidden border-0 border-b-2 bg-transparent px-0 pb-1 font-heading text-3xl font-extrabold leading-[1.1] tracking-[-0.035em] [field-sizing:content] focus:outline-none sm:text-[44px] xl:text-[56px]',
          game ? 'border-white/25 text-white placeholder:text-white/45 hover:border-white/50 focus:border-white' : 'border-transparent text-text placeholder:text-text-muted/50 hover:border-border focus:border-text',
        )}
      />
      {errors.title && <p className={cn('text-sm', game ? 'font-semibold text-white' : 'text-danger')}>{errors.title}</p>}
    </div>
  );

  const main = (
    <div className="flex min-w-0 flex-col gap-8">
      {!game && titleField}

      <Group
        title="When"
        lead="Pick a day and a start time."
        footer={end ? `${validStart ? d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : ''}, ${fmtTime(d)} to ${fmtTime(end)}. Your timezone: ${viewerTimeZone()}.` : `Your timezone: ${viewerTimeZone()}.`}
      >
        {!editing && (
          <Row as="fieldset" label="Day" stack>
            <DayStrip value={start} onPick={pickDay} />
          </Row>
        )}
        {!editing && (
          <Row as="fieldset" label="Start time" stack>
            <TimePicks value={start} onPick={pickHour} />
          </Row>
        )}
        <Row id={`${id}-start`} label={editing ? 'Starts' : 'Starts'} sub={editing ? undefined : 'Or pick any date and minute'} error={errors.startsAt}>
          <DatePicker
            id={`${id}-start`}
            name="startsAt"
            withTime
            value={start}
            onChange={setStart}
            min={editing ? undefined : new Date()}
            invalid={Boolean(errors.startsAt)}
            className="w-full sm:w-72"
            triggerClassName="!min-h-9 !rounded-[6px] border-transparent bg-surface-raised"
            align="end"
          />
        </Row>
        <Row as="fieldset" label="Length" stack error={errors.durationMin}>
          <Segmented label="Length" value={durationMin} onChange={(v) => setDurationMin(Number(v))} options={SESSION_DURATIONS.map((m) => ({ value: m, label: lengthLabel(m) }))} />
        </Row>
      </Group>

      <Group title="Party" lead="Who's playing and how many can join.">
        <Row as="fieldset" label="Lineup" stack>
          <Lineup me={me} invited={invited} max={maxPlayers} />
        </Row>
        <Row inline id={`${id}-max`} label="Players, including you" error={errors.maxPlayers}>
          <Stepper id={`${id}-max`} value={maxPlayers} onChange={setMaxPlayers} invalid={Boolean(errors.maxPlayers)} />
        </Row>
        <Row inline id={`${id}-invite-only`} label="Only people I invite" sub={visibility === 'invite' ? 'Only the friends you pick can see and join it.' : 'Off: any of your friends can see it and join.'} error={errors.visibility}>
          <Switch id={`${id}-invite-only`} checked={visibility === 'invite'} onChange={(on) => setVisibility(on ? 'invite' : 'friends')} />
        </Row>
      </Group>

      <Group title="Where" lead="Both optional.">
        <Row id={`${id}-platform`} label="Platform" error={errors.platform}>
          <Input id={`${id}-platform`} value={platform} maxLength={50} onChange={(e) => setPlatform(e.target.value)} placeholder="PC, Switch, PS5…" className={rowInput} />
          {platformSuggestions.length > 0 && (
            <span className="flex flex-wrap gap-x-2 gap-y-1 text-xs sm:justify-end">
              {platformSuggestions.map((p) => (
                <button key={p} type="button" onClick={() => setPlatform(p)} className={cn('font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text', platform === p ? 'text-text underline' : 'text-text-muted')}>
                  {p}
                </button>
              ))}
            </span>
          )}
        </Row>
        <Row id={`${id}-discord`} label="Discord invite" sub="discord.gg/… or discord.com/invite/…" error={errors.discordInviteUrl}>
          <Input id={`${id}-discord`} value={discord} maxLength={100} onChange={(e) => setDiscord(e.target.value)} placeholder="https://discord.gg/your-code" className={rowInput} aria-invalid={Boolean(errors.discordInviteUrl)} />
        </Row>
      </Group>
    </div>
  );

  // The guest list: every friend with an Invite button, the invited ones first and marked.
  const guests = (
    <div role="group" aria-labelledby={`${id}-guests`} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 id={`${id}-guests`} className="font-heading text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-text">Invite friends</h2>
        <span className="text-[15px] text-text-muted">{inviteeIds.length ? `${inviteeIds.length} invited` : visibility === 'invite' ? 'Required' : 'Optional'}</span>
      </div>
      {friends.status === 'loading' && <Skeleton className="h-28 w-full" role="status" aria-label="Loading friends" />}
      {friends.status === 'error' && <ErrorState message={friends.error.message} onRetry={friends.retry} />}
      {friends.status === 'success' && friends.data.length === 0 && (
        <p className="border-y border-border py-3 text-sm text-text-muted">
          You have no friends yet. <Link to="/friends?tab=find" className="font-semibold text-text underline underline-offset-4">Find people</Link> to invite.
        </p>
      )}
      {friends.status === 'success' && friends.data.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {friends.data.map((f) => {
            const on = inviteeIds.includes(f.id);
            return (
              <li key={f.id}>
                <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2 has-[:focus-visible]:bg-surface-raised">
                  <Avatar user={f} size={32} />
                  <span className="min-w-0 flex-1 break-words text-[15px] font-semibold text-text">{f.username}</span>
                  <input type="checkbox" checked={on} onChange={() => toggleInvitee(f.id)} className="peer sr-only" />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'rounded-[6px] px-3 py-1.5 text-xs font-bold transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-text',
                      on ? 'bg-text text-bg' : 'bg-surface-raised text-text',
                    )}
                  >
                    {on ? 'Invited' : 'Invite'}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {errors.inviteeIds && <p className="text-sm text-danger">{errors.inviteeIds}</p>}
      <p className="text-xs text-text-muted">Invited friends get a notification.</p>
    </div>
  );

  const actions = (
    <div className="flex flex-col gap-3">
      {formError && <p role="alert" className="rounded-[6px] border border-[var(--danger)]/40 px-4 py-3 text-sm text-danger">{formError}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="h-12 w-full rounded-[8px] bg-text px-6 font-heading text-base font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        {submitting ? 'Saving…' : submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="self-center py-1 text-sm font-semibold text-text-muted hover:text-text">
          Cancel
        </button>
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} noValidate aria-label={editing ? 'Edit session' : 'New session'} className="flex flex-col gap-8">
      {game && (
        // the game's own art across the top, its cover as the poster, and the name typed over it
        <BackdropHero art={game} seed={game.title} className="px-5 py-8 sm:px-10 sm:pb-12 sm:pt-32 lg:pb-14 lg:pt-40">
          <div className="flex items-end gap-6 sm:gap-10">
            <div className="hidden w-36 shrink-0 overflow-hidden rounded-[8px] ring-1 ring-white/20 sm:block sm:w-44 lg:w-56 xl:w-60">
              <GameCover game={game} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
                <span className="font-semibold text-white">New session</span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-white">{game.title}</span>
                {onChangeGame && (
                  <button type="button" onClick={onChangeGame} aria-label="Change game" className="font-semibold text-white/70 underline underline-offset-4 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    Change
                  </button>
                )}
              </p>
              {titleField}
              <dl className="mt-2 grid grid-cols-2 gap-y-4 border-t border-white/20 pt-4 xl:grid-cols-[1fr_1.7fr_0.8fr_1fr]">
                {[
                  ['Date', validStart ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Pick a day'],
                  ['Time', validStart ? `${fmtTime(d)} to ${fmtTime(end)}` : '?'],
                  ['Players', `${1 + inviteeIds.length} of ${Number(maxPlayers) || '?'}`],
                  ['Open to', visibility === 'invite' ? 'Invited only' : 'All friends'],
                ].map(([k, v], i) => (
                  <div key={k} className={cn('min-w-0 pr-4', i % 2 === 1 && 'border-l border-white/20 pl-4 sm:pl-4', i === 2 && 'xl:border-l xl:border-white/20 xl:pl-4')}>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">{k}</dt>
                    <dd className="mt-1 break-words font-heading leading-tight text-lg font-bold tabular-nums sm:text-xl tracking-[-0.02em] text-white">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </BackdropHero>
      )}

      <div className={game ? 'grid items-start gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_320px]' : 'flex max-w-2xl flex-col gap-7'}>
        {main}
        <aside className={cn('flex flex-col gap-6', game && 'lg:sticky lg:top-24')}>
          {guests}
          {actions}
        </aside>
      </div>
    </form>
  );
}


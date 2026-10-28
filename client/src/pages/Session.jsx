import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CalendarPlus, Check, CircleHelp, Clock, Gamepad2, Globe, Lock, MonitorSmartphone, Pencil, Users, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar.jsx';
import { ProgressBar } from '@/components/ui/ProgressBar.jsx';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { BackdropHero } from '@/components/art/BackdropHero.jsx';
import { ResponseBadge } from '@/components/sessions/responses.jsx';
import { SessionForm } from '@/components/sessions/SessionForm.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useAuth } from '@/hooks/useAuth.js';
import { useLayered } from '@/hooks/useLayered.js';
import { fullWhen } from '@/lib/sessionTime.js';
import { getErrorInfo } from '@/services/api.js';
import { cancelSession, downloadIcs, getSession, rsvpSession, updateSession } from '@/services/sessionsApi.js';

const RSVP_OPTIONS = [
  ['going', 'Going', Check],
  ['maybe', 'Maybe', CircleHelp],
  ['declined', 'Can’t make it', X],
];

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading session">
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

// Apply an RSVP to the local copy at once: own response, the going/maybe counts and own row in the list.
function withMyResponse(session, response, me) {
  // me is { id, username } of the viewer
  const was = session.myResponse;
  const delta = (r, n) => (was === r ? -n : 0) + (response === r ? n : 0);
  const going = session.counts.going + delta('going', 1);
  const maybe = session.counts.maybe + delta('maybe', 1);
  const attendees = session.attendees.map((a) => (a.user.id === me.id ? { ...a, response } : a));
  if (!attendees.some((a) => a.user.id === me.id)) attendees.push({ user: me, response, role: 'guest' });
  return { ...session, myResponse: response, counts: { going, maybe, spotsLeft: Math.max(0, session.maxPlayers - going) }, attendees };
}

// "Starts in 3h", "Live now", "Ended": the first thing a player wants to know about a session.
function startsLabel(session) {
  if (session.status === 'cancelled') return 'Cancelled';
  if (session.ended) return 'Ended';
  const ms = new Date(session.startsAt).getTime() - Date.now();
  if (ms <= 0) return 'Live now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `Starts in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `Starts in ${hours}h`;
  return `In ${Math.round(hours / 24)} days`;
}

function Detail({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-text-muted" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-text-muted">{label}</dt>
        <dd className="font-medium text-text">{children}</dd>
      </div>
    </div>
  );
}

export default function Session() {
  const { id } = useParams();
  const { user } = useAuth();
  const load = useCallback((signal) => getSession(id, { signal }), [id]);
  const { status, data, error, retry } = useAsync(load);
  const [session, setSession] = useLayered(data);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [calendarBusy, setCalendarBusy] = useState(false);

  const open = session && session.status === 'scheduled' && !session.ended;
  const spotsLeft = session?.counts.spotsLeft ?? 0;

  async function respond(response) {
    if (busy || response === session.myResponse) return;
    const previous = session;
    setSession(withMyResponse(session, response, { id: user.id, username: user.username }));
    setBusy(true);
    try {
      setSession(await rsvpSession(session.id, response)); // the server's answer replaces the guess
      toast.success(`You’re ${response === 'declined' ? 'not going' : response}`);
    } catch (err) {
      setSession(previous);
      toast.error(getErrorInfo(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdits(patch) {
    try {
      setSession(await updateSession(session.id, patch));
      setEditing(false);
      toast.success('Session updated');
    } catch (err) {
      throw new Error(getErrorInfo(err).message);
    }
  }

  async function cancel() {
    setConfirmingCancel(false);
    try {
      setSession(await cancelSession(session.id));
      toast.success('Session cancelled');
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    }
  }

  async function addToCalendar() {
    setCalendarBusy(true);
    try {
      await downloadIcs(session.id);
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setCalendarBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-6 pb-12">
      <Link to="/sessions" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Sessions
      </Link>

      {status === 'loading' && <DetailSkeleton />}

      {status === 'error' &&
        (error.status === 404 ? (
          <EmptyState icon={CalendarDays} title="Session not found" description="It may have been removed, or it isn't shared with you." actionLabel="Your sessions" actionTo="/sessions" />
        ) : (
          <ErrorState message={error.message} onRetry={retry} />
        ))}

      {status === 'success' && session && (
        <>
          {session.status === 'cancelled' && (
            <p role="status" className="rounded-card border border-border bg-surface p-3 text-sm">
              <X className="mr-2 inline h-4 w-4 text-danger" aria-hidden="true" />
              <strong>This session was cancelled.</strong> It won’t happen.
            </p>
          )}
          {session.status === 'scheduled' && session.ended && (
            <p role="status" className="rounded-card border border-border bg-surface p-3 text-sm">This session has ended.</p>
          )}

          <BackdropHero as="header" art={session.game} seed={session.id} className="px-5 py-8 sm:px-10 sm:py-10">
            <div className="flex min-h-[220px] flex-col justify-between gap-6 md:flex-row md:items-end">
              <div className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white ring-1 ring-white/20 backdrop-blur-sm">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> {startsLabel(session)}
                  </span>
                  <span className="rounded-full bg-[#fbf8f1] px-3 py-1 shadow">
                    <ResponseBadge response={session.myResponse} />
                  </span>
                </div>
                <h1 className="font-heading text-3xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl">{session.title}</h1>
                <ul className="flex flex-wrap gap-2 text-sm">
                  {session.game && (
                    <li>
                      <Link to={`/games/${session.game.slug}`} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-medium text-white ring-1 ring-white/15 backdrop-blur-sm hover:bg-white/20">
                        <Gamepad2 className="h-4 w-4" aria-hidden="true" /> {session.game.title}
                      </Link>
                    </li>
                  )}
                  {session.platform && <li className="rounded-full bg-white/10 px-3 py-1.5 font-medium text-white ring-1 ring-white/15 backdrop-blur-sm">{session.platform}</li>}
                  <li className="rounded-full bg-white/10 px-3 py-1.5 text-white ring-1 ring-white/15 backdrop-blur-sm">
                    Hosted by {session.isHost ? <strong>you</strong> : <Link to={`/u/${session.host?.username}`} className="font-semibold hover:underline">{session.host?.username}</Link>}
                  </li>
                  <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-white ring-1 ring-white/15 backdrop-blur-sm">
                    {session.visibility === 'friends' ? <Globe className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
                    {session.visibility === 'friends' ? 'Open to friends' : 'Invite only'}
                  </li>
                </ul>
              </div>

              {/* Date tile: the day at a glance, with the exact time range under it */}
              <div className="flex shrink-0 items-stretch overflow-hidden rounded-[14px] bg-[#fbf8f1] text-[#151713] shadow-2xl">
                <div className="flex w-20 flex-col items-center justify-center bg-[#151713] px-3 py-3 text-white">
                  <span className="text-xs font-bold uppercase tracking-widest">{new Date(session.startsAt).toLocaleDateString(undefined, { month: 'short' })}</span>
                  <span className="font-heading text-4xl font-bold leading-none">{new Date(session.startsAt).getDate()}</span>
                </div>
                <div className="flex flex-col justify-center gap-0.5 px-4 py-3">
                  <span className="text-sm font-bold">{new Date(session.startsAt).toLocaleDateString(undefined, { weekday: 'long' })}</span>
                  <time dateTime={session.startsAt} className="max-w-[16rem] text-xs leading-5 text-[#625b4f]">{fullWhen(session)}</time>
                </div>
              </div>
            </div>
          </BackdropHero>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={addToCalendar} disabled={calendarBusy}>
              <CalendarPlus className="h-4 w-4" aria-hidden="true" /> {calendarBusy ? 'Preparing…' : 'Add to calendar'}
            </Button>
            {session.discordInviteUrl && open && (
              <a
                href={session.discordInviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-[#5865F2] px-4 text-sm font-semibold text-white hover:bg-[#4752c4]"
              >
                Join Discord<span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
            {session.isHost && open && !editing && (
              <>
                <Button variant="ghost" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
                </Button>
                {confirmingCancel ? (
                  <div className="flex gap-2" role="group" aria-label="Confirm cancelling the session">
                    <Button variant="secondary" onClick={cancel}>Cancel session</Button>
                    <Button variant="ghost" onClick={() => setConfirmingCancel(false)}>Keep it</Button>
                  </div>
                ) : (
                  <Button variant="ghost" onClick={() => setConfirmingCancel(true)} aria-label="Cancel this session">
                    <X className="h-4 w-4" aria-hidden="true" /> Cancel
                  </Button>
                )}
              </>
            )}
          </div>

          {editing && <SessionForm initial={session} submitLabel="Save changes" onSubmit={saveEdits} onCancel={() => setEditing(false)} />}

          {!session.isHost && open && (
            <section aria-labelledby="rsvp-title" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-sm">
              <h2 id="rsvp-title" className="font-heading text-base font-bold">Will you play?</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Your response">
                {RSVP_OPTIONS.map(([value, label, Icon]) => (
                  <Button
                    key={value}
                    variant={session.myResponse === value ? 'primary' : 'secondary'}
                    aria-pressed={session.myResponse === value}
                    disabled={busy || (value === 'going' && spotsLeft === 0 && session.myResponse !== 'going')}
                    onClick={() => respond(value)}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                  </Button>
                ))}
              </div>
              {spotsLeft === 0 && session.myResponse !== 'going' && <p className="text-sm text-text-muted">This session is full.</p>}
            </section>
          )}

          <section aria-labelledby="who-title" className="flex flex-col gap-3 rounded-card border border-border bg-surface/60 p-5">
            <h2 id="who-title" className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4" aria-hidden="true" /> Who’s in
              <span className="font-normal text-text-muted tabular-nums">{session.counts.going}/{session.maxPlayers} going{session.counts.maybe ? ` · ${session.counts.maybe} maybe` : ''}</span>
            </h2>
            <ProgressBar value={(session.counts.going / Math.max(1, session.maxPlayers)) * 100} label="Spots filled" />
            <ul className="grid gap-2 sm:grid-cols-2">
              {session.attendees.map((a) => (
                <li key={a.user.id} className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-3 shadow-sm">
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar user={a.user} size={40} />
                    <Link to={`/u/${a.user.username}`} className="min-h-6 truncate font-semibold text-text hover:underline">{a.user.username}</Link>
                  </span>
                  <ResponseBadge response={a.role === 'host' ? 'host' : a.response} />
                </li>
              ))}
              {Array.from({ length: Math.max(0, Math.min(4, (session.counts.spotsLeft ?? 0))) }, (_, i) => (
                <li key={`open-${i}`} aria-hidden="true" className="flex items-center gap-3 rounded-card border border-dashed border-border p-3 text-sm text-text-muted">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-border">+</span>
                  Open spot
                </li>
              ))}
            </ul>
          </section>
            </div>

          {/* Side card: everything about the session at a glance */}
          <aside className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-sm lg:sticky lg:top-24">
            <h2 className="text-xs font-bold uppercase tracking-widest text-text-muted">Session details</h2>
            <dl className="flex flex-col gap-3 text-sm">
              <Detail icon={CalendarDays} label="When"><time dateTime={session.startsAt}>{fullWhen(session)}</time></Detail>
              {session.durationMin && <Detail icon={Clock} label="Length">{session.durationMin >= 60 ? `${Math.floor(session.durationMin / 60)} h${session.durationMin % 60 ? ` ${session.durationMin % 60} min` : ''}` : `${session.durationMin} min`}</Detail>}
              {session.game && <Detail icon={Gamepad2} label="Game">{session.game.title}</Detail>}
              {session.platform && <Detail icon={MonitorSmartphone} label="Platform">{session.platform}</Detail>}
              <Detail icon={Users} label="Players">{session.counts.going} of {session.maxPlayers} going</Detail>
              <Detail icon={session.visibility === 'friends' ? Globe : Lock} label="Who can join">{session.visibility === 'friends' ? 'All friends' : 'Invite only'}</Detail>
            </dl>
          </aside>
          </div>
        </>
      )}
    </section>
  );
}

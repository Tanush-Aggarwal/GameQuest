import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CalendarPlus, Check, CircleHelp, Gamepad2, Globe, Lock, Pencil, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
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

          <header className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-2xl font-bold">{session.title}</h1>
              <ResponseBadge response={session.myResponse} />
            </div>
            <p className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4 text-text-muted" aria-hidden="true" />
              <time dateTime={session.startsAt}>{fullWhen(session)}</time>
            </p>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted">
              {session.game && (
                <Link to={`/games/${session.game.slug}`} className="inline-flex items-center gap-1 hover:underline">
                  <Gamepad2 className="h-4 w-4" aria-hidden="true" /> {session.game.title}
                </Link>
              )}
              {session.platform && <span>{session.platform}</span>}
              <span>Hosted by {session.isHost ? 'you' : <Link to={`/u/${session.host?.username}`} className="hover:underline">{session.host?.username}</Link>}</span>
              <span className="inline-flex items-center gap-1">
                {session.visibility === 'friends' ? <Globe className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
                {session.visibility === 'friends' ? 'Open to friends' : 'Invite only'}
              </span>
            </p>
          </header>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={addToCalendar} disabled={calendarBusy}>
              <CalendarPlus className="h-4 w-4" aria-hidden="true" /> {calendarBusy ? 'Preparing…' : 'Add to calendar'}
            </Button>
            {session.discordInviteUrl && open && (
              <a
                href={session.discordInviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 text-sm font-medium text-accent-fg hover:brightness-110"
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
            <section aria-labelledby="rsvp-title" className="flex flex-col gap-2">
              <h2 id="rsvp-title" className="text-sm font-semibold">Will you play?</h2>
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

          <section aria-labelledby="who-title" className="flex flex-col gap-2">
            <h2 id="who-title" className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4" aria-hidden="true" /> Who’s in
              <span className="font-normal text-text-muted tabular-nums">{session.counts.going}/{session.maxPlayers} going{session.counts.maybe ? ` · ${session.counts.maybe} maybe` : ''}</span>
            </h2>
            <ul className="flex flex-col gap-2">
              {session.attendees.map((a) => (
                <li key={a.user.id} className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-3">
                  <Link to={`/u/${a.user.username}`} className="min-h-6 font-medium hover:underline">{a.user.username}</Link>
                  <ResponseBadge response={a.role === 'host' ? 'host' : a.response} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}

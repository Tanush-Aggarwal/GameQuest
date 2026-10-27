import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, Check, Search, UserMinus, UserPlus, Users, X, ShieldBan } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { ArtHeader, ArtPanel } from '@/components/art/ArtPanel.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useLayered } from '@/hooks/useLayered.js';
import { getErrorInfo } from '@/services/api.js';
import {
  acceptRequest,
  blockUser,
  cancelRequest,
  declineRequest,
  listFriends,
  listRequests,
  searchUsers,
  sendFriendRequest,
  unfriend,
} from '@/services/socialApi.js';

import { RecommendationsTab } from '@/components/recommendations/RecommendationsTab.jsx';

const TABS = [
  ['friends', 'Friends'],
  ['requests', 'Requests'],
  ['recommendations', 'Recommendations'],
  ['find', 'Find people'],
];
const SEARCH_DEBOUNCE_MS = 300;

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

// A person's row sits on their currently playing game art (or art picked from their name), so the lists are never flat grey cards.
const Row = ({ children, art, seed }) => (
  <ArtPanel as="li" art={art} seed={seed} className="flex flex-wrap items-center justify-between gap-3 p-3">
    {children}
  </ArtPanel>
);
const PlayerLink = ({ username }) => (
  <Link to={`/u/${username}`} className="flex min-h-11 items-center gap-3 rounded-control font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/25 text-sm uppercase">
      {username.slice(0, 1)}
    </span>
    {username}
  </Link>
);

// A destructive action asks once, inline, before it runs.
function ConfirmButton({ label, confirmLabel, icon: Icon, onConfirm, ariaLabel }) {
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <div className="flex gap-1" role="group" aria-label={`Confirm: ${ariaLabel}`}>
        <Button variant="secondary" onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</Button>
        <Button variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
      </div>
    );
  }
  return (
    <Button variant="ghost" aria-label={ariaLabel} onClick={() => setAsking(true)}>
      <Icon className="h-4 w-4" aria-hidden="true" /> {label}
    </Button>
  );
}

function FriendsTab() {
  const load = useCallback((signal) => listFriends({ signal }), []);
  const { status, data, error, retry } = useAsync(load);
  const [friends, setFriends] = useLayered(data);

  // Optimistic: the row disappears at once; on failure it comes back with a toast.
  async function remove(friend, action, done) {
    const previous = friends;
    setFriends(friends.filter((f) => f.id !== friend.id));
    try {
      await action(friend.id);
      toast.success(done);
    } catch (err) {
      setFriends(previous);
      toast.error(getErrorInfo(err).message);
    }
  }

  if (status === 'loading') return <ListSkeleton />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;
  if (friends.length === 0) {
    return <EmptyState icon={Users} title="No friends yet" description="Find people by username and send a request." actionLabel="Find people" actionTo="/friends?tab=find" />;
  }
  return (
    <ul className="flex flex-col gap-2">
      {friends.map((f) => (
        <Row key={f.id} art={f.currentlyPlaying} seed={f.username}>
          <div className="flex min-w-0 items-center gap-3">
            <PlayerLink username={f.username} />
            {f.currentlyPlaying && (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-bg/70 px-2.5 py-0.5 text-xs text-text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-status-playing animate-pulse" aria-hidden="true" />
                <span className="truncate max-w-[140px] md:max-w-[200px]">Playing {f.currentlyPlaying.title}</span>
              </span>
            )}
          </div>
          <div className="flex gap-1">
            <ConfirmButton label="Unfriend" confirmLabel="Unfriend" icon={UserMinus} ariaLabel={`Unfriend ${f.username}`} onConfirm={() => remove(f, unfriend, `You and ${f.username} are no longer friends`)} />
            <ConfirmButton label="Block" confirmLabel="Block" icon={ShieldBan} ariaLabel={`Block ${f.username}`} onConfirm={() => remove(f, blockUser, `Blocked ${f.username}`)} />
          </div>
        </Row>
      ))}
    </ul>
  );
}

function RequestsTab() {
  const load = useCallback((signal) => listRequests({ signal }), []);
  const { status, data, error, retry } = useAsync(load);
  const [requests, setRequests] = useLayered(data);

  async function resolve(request, direction, action, done) {
    const previous = requests;
    setRequests({ ...requests, [direction]: requests[direction].filter((r) => r.id !== request.id) });
    try {
      await action(request.id);
      toast.success(done);
    } catch (err) {
      setRequests(previous);
      toast.error(getErrorInfo(err).message);
    }
  }

  if (status === 'loading') return <ListSkeleton />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;
  if (requests.incoming.length === 0 && requests.outgoing.length === 0) {
    return <EmptyState icon={UserPlus} title="No pending requests" description="Requests you send or receive appear here." actionLabel="Find people" actionTo="/friends?tab=find" />;
  }
  return (
    <div className="flex flex-col gap-6">
      {requests.incoming.length > 0 && (
        <section aria-labelledby="incoming-title" className="flex flex-col gap-2">
          <h2 id="incoming-title" className="text-sm font-semibold text-text-muted">Received</h2>
          <ul className="flex flex-col gap-2">
            {requests.incoming.map((r) => (
              <Row key={r.id} seed={r.user.username}>
                <PlayerLink username={r.user.username} />
                <div className="flex gap-1">
                  <Button onClick={() => resolve(r, 'incoming', acceptRequest, `You and ${r.user.username} are now friends`)} aria-label={`Accept ${r.user.username}`}>
                    <Check className="h-4 w-4" aria-hidden="true" /> Accept
                  </Button>
                  <Button variant="ghost" onClick={() => resolve(r, 'incoming', declineRequest, 'Request declined')} aria-label={`Decline ${r.user.username}`}>
                    <X className="h-4 w-4" aria-hidden="true" /> Decline
                  </Button>
                </div>
              </Row>
            ))}
          </ul>
        </section>
      )}
      {requests.outgoing.length > 0 && (
        <section aria-labelledby="outgoing-title" className="flex flex-col gap-2">
          <h2 id="outgoing-title" className="text-sm font-semibold text-text-muted">Sent</h2>
          <ul className="flex flex-col gap-2">
            {requests.outgoing.map((r) => (
              <Row key={r.id} seed={r.user.username}>
                <PlayerLink username={r.user.username} />
                <Button variant="ghost" onClick={() => resolve(r, 'outgoing', cancelRequest, 'Request cancelled')} aria-label={`Cancel request to ${r.user.username}`}>
                  <X className="h-4 w-4" aria-hidden="true" /> Cancel
                </Button>
              </Row>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const RELATION_LABEL = { friend: 'Friends', pending_out: 'Request sent', pending_in: 'Wants to be friends', blocked: 'Blocked' };

function FindTab() {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const searchable = query.length >= 2;
  const load = useCallback((signal) => (searchable ? searchUsers(query, { signal }) : Promise.resolve([])), [query, searchable]);
  const { status, data, error, retry } = useAsync(load);
  const [results, setResults] = useLayered(data);

  async function add(user) {
    const previous = results;
    setResults(results.map((u) => (u.id === user.id ? { ...u, relation: 'pending_out' } : u)));
    try {
      const sent = await sendFriendRequest(user.username);
      // A request that crosses theirs is accepted on the spot.
      if (sent.status === 'accepted') setResults(previous.map((u) => (u.id === user.id ? { ...u, relation: 'friend' } : u)));
      toast.success(sent.status === 'accepted' ? `You and ${user.username} are now friends` : `Request sent to ${user.username}`);
    } catch (err) {
      setResults(previous);
      toast.error(getErrorInfo(err).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <Input type="search" aria-label="Search players by username" placeholder="Search by username" className="pl-9" value={text} onChange={(e) => setText(e.target.value)} />
      </div>

      {!searchable && <p className="text-sm text-text-muted">Type at least 2 letters of a username.</p>}
      {searchable && status === 'loading' && <ListSkeleton />}
      {searchable && status === 'error' && <ErrorState message={error.message} onRetry={retry} />}
      {searchable && status === 'success' && results.length === 0 && (
        <EmptyState icon={Search} title={`No players found for “${query}”`} description="Check the spelling, or ask your friend for their exact username." />
      )}
      {searchable && status === 'success' && results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((u) => (
            <Row key={u.id} seed={u.username}>
              <PlayerLink username={u.username} />
              {u.relation === 'none' ? (
                <Button onClick={() => add(u)} aria-label={`Add ${u.username} as a friend`}>
                  <UserPlus className="h-4 w-4" aria-hidden="true" /> Add friend
                </Button>
              ) : u.relation === 'pending_in' ? (
                <Link to="/friends?tab=requests" className="text-sm text-accent underline">{RELATION_LABEL.pending_in}</Link>
              ) : (
                <span className="text-sm text-text-muted">{RELATION_LABEL[u.relation]}</span>
              )}
            </Row>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Friends() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([key]) => key === params.get('tab')) ? params.get('tab') : 'friends';

  // Badge on the Requests tab: how many people are waiting for an answer.
  const loadCount = useCallback((signal) => listRequests({ signal }), []);
  const { status: countStatus, data: counts } = useAsync(loadCount);
  const waiting = countStatus === 'success' ? counts.incoming.length : 0;

  return (
    <section className="flex flex-col gap-6">
      <ArtHeader
        title="Friends"
        seed="friends"
        actions={
          <Link to="/sessions" className={buttonVariants({ variant: 'secondary' })}>
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> Sessions
          </Link>
        }
      />
      <nav aria-label="Friends sections" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={key === tab}
            onClick={() => setParams(key === 'friends' ? {} : { tab: key })}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control border px-3 text-sm ${key === tab ? 'border-accent bg-surface-raised text-text' : 'border-border text-text-muted hover:text-text'}`}
          >
            {label}
            {key === 'requests' && waiting > 0 && <span className="rounded-full bg-accent px-2 text-xs text-accent-fg tabular-nums" aria-label={`${waiting} waiting`}>{waiting}</span>}
          </button>
        ))}
      </nav>
      {tab === 'friends' && <FriendsTab />}
      {tab === 'requests' && <RequestsTab />}
      {tab === 'recommendations' && <RecommendationsTab />}
      {tab === 'find' && <FindTab />}
    </section>
  );
}

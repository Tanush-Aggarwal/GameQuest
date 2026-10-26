import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Layers, Lock, ShieldBan, UserMinus, UserPlus, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ActivityList } from '@/components/feed/ActivityList.jsx';
import { CollectionCard } from '@/components/collections/CollectionCard.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useLayered } from '@/hooks/useLayered.js';
import { getErrorInfo } from '@/services/api.js';
import { blockUser, getProfile, getProfileActivity, getProfileCollections, sendFriendRequest, unfriend } from '@/services/socialApi.js';

const STAT_LABELS = [
  ['games', 'Games'],
  ['playing', 'Playing'],
  ['completed', 'Completed'],
  ['hours', 'Hours played'],
  ['reviews', 'Reviews'],
];

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading profile">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

// Add friend / Unfriend / Block, depending on how the viewer and this player are related.
function RelationActions({ profile, setProfile }) {
  const { user, relation } = profile;
  const [asking, setAsking] = useState(null); // 'unfriend' | 'block'

  async function run(next, action, done) {
    const previous = profile;
    setProfile({ ...profile, relation: next });
    setAsking(null);
    try {
      const result = await action();
      if (result?.status === 'accepted') setProfile({ ...previous, relation: 'friend' });
      toast.success(done(result));
    } catch (err) {
      setProfile(previous);
      toast.error(getErrorInfo(err).message);
    }
  }

  if (relation === 'self') {
    return <Link to="/profile" className={buttonVariants({ variant: 'secondary' })}>Edit my profile</Link>;
  }
  if (asking) {
    const isBlock = asking === 'block';
    return (
      <div className="flex gap-2" role="group" aria-label={isBlock ? `Confirm blocking ${user.username}` : `Confirm unfriending ${user.username}`}>
        <Button
          variant="secondary"
          onClick={() => (isBlock ? run('blocked', () => blockUser(user.id), () => `Blocked ${user.username}`) : run('none', () => unfriend(user.id), () => `You and ${user.username} are no longer friends`))}
        >
          {isBlock ? 'Block' : 'Unfriend'}
        </Button>
        <Button variant="ghost" onClick={() => setAsking(null)}>Cancel</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {relation === 'none' && (
        <Button onClick={() => run('pending_out', () => sendFriendRequest(user.username), (r) => (r.status === 'accepted' ? `You and ${user.username} are now friends` : `Request sent to ${user.username}`))}>
          <UserPlus className="h-4 w-4" aria-hidden="true" /> Add friend
        </Button>
      )}
      {relation === 'pending_out' && <span className="inline-flex min-h-11 items-center text-sm text-text-muted">Request sent</span>}
      {relation === 'pending_in' && <Link to="/friends?tab=requests" className={buttonVariants()}>Respond to request</Link>}
      {relation === 'friend' && (
        <Button variant="ghost" onClick={() => setAsking('unfriend')} aria-label={`Unfriend ${user.username}`}>
          <UserMinus className="h-4 w-4" aria-hidden="true" /> Friends · Unfriend
        </Button>
      )}
      {relation !== 'blocked' && (
        <Button variant="ghost" onClick={() => setAsking('block')} aria-label={`Block ${user.username}`}>
          <ShieldBan className="h-4 w-4" aria-hidden="true" /> Block
        </Button>
      )}
      {relation === 'blocked' && <span className="inline-flex min-h-11 items-center text-sm text-text-muted">Blocked</span>}
    </div>
  );
}

function PublicCollections({ username }) {
  const load = useCallback((signal) => getProfileCollections(username, { signal }), [username]);
  const { status, data, error, retry } = useAsync(load);
  if (status === 'loading') return <Skeleton className="h-40 w-full" role="status" aria-label="Loading collections" />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;
  if (data.length === 0) return <EmptyState icon={Layers} title="No collections to show" description={`${username} hasn’t shared any collections with you.`} />;
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {data.map((c) => (
        <CollectionCard key={c.id} collection={c} />
      ))}
    </ul>
  );
}

export default function UserProfile() {
  const { username } = useParams();
  const load = useCallback((signal) => getProfile(username, { signal }), [username]);
  const { status, data, error, retry } = useAsync(load);
  const [profile, setProfile] = useLayered(data);
  const loadActivity = useCallback((params, opts) => getProfileActivity(username, params, opts), [username]);

  return (
    <section className="flex flex-col gap-6 pb-12">
      <Link to="/friends" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Friends
      </Link>

      {status === 'loading' && <ProfileSkeleton />}

      {status === 'error' &&
        (error.status === 404 ? (
          <EmptyState icon={UserX} title="Player not found" description="There’s no player with that username, or they’re not available to you." actionLabel="Find people" actionTo="/friends?tab=find" />
        ) : (
          <ErrorState message={error.message} onRetry={retry} />
        ))}

      {status === 'success' && profile && (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{profile.user.username}</h1>
              <p className="text-sm text-text-muted">
                Member since {new Date(profile.user.memberSince).toLocaleDateString(undefined, { dateStyle: 'long' })}
              </p>
            </div>
            <RelationActions profile={profile} setProfile={setProfile} />
          </header>

          {profile.restricted ? (
            <EmptyState icon={Lock} title="This profile is private" description={`${profile.user.username} only shares their profile with ${profile.relation === 'none' ? 'friends' : 'approved players'}.`} />
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {STAT_LABELS.map(([key, label]) => (
                  <div key={key} className="rounded-card border border-border bg-surface p-3">
                    <dd className="text-xl font-semibold tabular-nums">{profile.stats[key]}</dd>
                    <dt className="text-xs text-text-muted">{label}</dt>
                  </div>
                ))}
              </dl>

              <section aria-labelledby="recent-title" className="flex flex-col gap-3">
                <h2 id="recent-title" className="text-lg font-semibold font-heading">Recent activity</h2>
                <ActivityList
                  loadPage={loadActivity}
                  showActor={false}
                  renderEmpty={() => <EmptyState title="No activity to show" description={`When ${profile.user.username} plays, finishes or reviews a game, it appears here.`} />}
                />
              </section>

              <section aria-labelledby="collections-title" className="flex flex-col gap-3">
                <h2 id="collections-title" className="text-lg font-semibold font-heading">Collections</h2>
                <PublicCollections username={profile.user.username} />
              </section>
            </>
          )}
        </>
      )}
    </section>
  );
}

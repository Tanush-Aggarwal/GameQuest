import { useCallback, useId } from 'react';
import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { PROFILE_PRIVACY } from '@gamequest/shared';
import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useAuth } from '@/hooks/useAuth.js';
import { useAsync } from '@/hooks/useAsync.js';
import { useLayered } from '@/hooks/useLayered.js';
import { getErrorInfo } from '@/services/api.js';
import { getProfile, listBlocked, setPrivacy, unblockUser } from '@/services/socialApi.js';

const PRIVACY_LABELS = {
  public: 'Public — anyone signed in can view my profile',
  friends: 'Friends only',
  private: 'Private — only me',
};

function PrivacySetting({ username }) {
  const id = useId();
  const load = useCallback((signal) => getProfile(username, { signal }), [username]);
  const { status, data, error, retry } = useAsync(load);
  const [profile, setProfile] = useLayered(data);

  async function change(next) {
    const previous = profile;
    setProfile({ ...profile, user: { ...profile.user, privacy: next } });
    try {
      await setPrivacy(next);
      toast.success('Profile privacy updated');
    } catch (err) {
      setProfile(previous);
      toast.error(getErrorInfo(err).message);
    }
  }

  if (status === 'loading') return <Skeleton className="h-16 w-full max-w-md" role="status" aria-label="Loading privacy" />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;
  return (
    <div className="flex max-w-md flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">Who can see my profile</label>
      <select
        id={id}
        value={profile.user.privacy}
        onChange={(e) => change(e.target.value)}
        className="min-h-11 rounded-control border border-border bg-surface px-2 text-sm text-text"
      >
        {PROFILE_PRIVACY.map((p) => (
          <option key={p} value={p}>{PRIVACY_LABELS[p]}</option>
        ))}
      </select>
      <p className="text-xs text-text-muted">Games you hide from friends stay hidden at every level.</p>
    </div>
  );
}

function BlockedPlayers() {
  const load = useCallback((signal) => listBlocked({ signal }), []);
  const { status, data, error, retry } = useAsync(load);
  const [blocked, setBlocked] = useLayered(data);

  async function unblock(user) {
    const previous = blocked;
    setBlocked(blocked.filter((u) => u.id !== user.id));
    try {
      await unblockUser(user.id);
      toast.success(`Unblocked ${user.username}`);
    } catch (err) {
      setBlocked(previous);
      toast.error(getErrorInfo(err).message);
    }
  }

  if (status === 'loading') return <Skeleton className="h-16 w-full max-w-md" role="status" aria-label="Loading blocked players" />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;
  if (blocked.length === 0) return <p className="text-sm text-text-muted">You haven’t blocked anyone.</p>;
  return (
    <ul className="flex max-w-md flex-col gap-2">
      {blocked.map((u) => (
        <li key={u.id} className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-3">
          <span className="font-medium">{u.username}</span>
          <Button variant="secondary" onClick={() => unblock(u)} aria-label={`Unblock ${u.username}`}>
            <ShieldOff className="h-4 w-4" aria-hidden="true" /> Unblock
          </Button>
        </li>
      ))}
    </ul>
  );
}

export default function Profile() {
  const { user } = useAuth();
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Profile</h1>
        {user && (
          <Link to={`/u/${user.username}`} className={buttonVariants({ variant: 'secondary' })}>
            View my public profile
          </Link>
        )}
      </div>
      <dl className="grid max-w-md gap-4 rounded-card border border-border bg-surface p-6 text-sm">
        <div>
          <dt className="text-text-muted">Username</dt>
          <dd className="font-medium">{user?.username}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Email</dt>
          <dd className="font-medium">{user?.email}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Member since</dt>
          <dd className="font-medium">
            {user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : '—'}
          </dd>
        </div>
      </dl>

      {user && (
        <section aria-labelledby="privacy-title" className="flex flex-col gap-3">
          <h2 id="privacy-title" className="text-lg font-semibold font-heading">Privacy</h2>
          <PrivacySetting username={user.username} />
        </section>
      )}

      <section aria-labelledby="blocked-title" className="flex flex-col gap-3">
        <h2 id="blocked-title" className="text-lg font-semibold font-heading">Blocked players</h2>
        <BlockedPlayers />
      </section>
    </section>
  );
}

import { useAuth } from '@/hooks/useAuth.js';

export default function Profile() {
  const { user } = useAuth();
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Profile</h1>
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
    </section>
  );
}

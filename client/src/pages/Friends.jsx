import { Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/states.jsx';

export default function Friends() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Friends</h1>
      <EmptyState
        icon={Users}
        title="No friends yet"
        description="Friends, recommendations and play sessions arrive in the social tier."
        actionLabel="Back to home"
        actionTo="/"
      />
    </section>
  );
}

import { Gamepad2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/states.jsx';
import { useAuth } from '@/hooks/useAuth.js';

export default function Home() {
  const { user } = useAuth();
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Welcome back, {user?.username}</h1>
      <EmptyState
        icon={Gamepad2}
        title="Nothing to play yet"
        description="Your 'what to play next' picks will show up here once you've added games to your library."
        actionLabel="Find games"
        actionTo="/explore"
      />
    </section>
  );
}

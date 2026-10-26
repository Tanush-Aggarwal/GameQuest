import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/states.jsx';

export default function Explore() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Explore</h1>
      <EmptyState
        icon={Compass}
        title="Game search is coming next"
        description="You'll be able to search the catalog and add games to your library from here."
        actionLabel="Back to home"
        actionTo="/"
      />
    </section>
  );
}

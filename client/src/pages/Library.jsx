import { Library as LibraryIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui/states.jsx';

export default function Library() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Library</h1>
      <EmptyState
        icon={LibraryIcon}
        title="Your library is empty"
        description="Games from every platform will live together here."
        actionLabel="Find games"
        actionTo="/explore"
      />
    </section>
  );
}

import { SearchX } from 'lucide-react';
import { EmptyState } from '@/components/ui/states.jsx';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <EmptyState
        headingLevel="h1"
        icon={SearchX}
        title="Page not found"
        description="That page doesn't exist or has moved."
        actionLabel="Go home"
        actionTo="/"
      />
    </div>
  );
}

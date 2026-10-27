import { CoverImage } from '@/components/games/GameCard.jsx';
import { ArtPanel } from '@/components/art/ArtPanel.jsx';
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { listInbox } from '@/services/recommendationsApi.js';

export function RecommendationWidget() {
  const load = useCallback((signal) => listInbox({ status: 'pending', limit: 1 }, { signal }), []);
  const { status, data } = useAsync(load);

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading recommendation">
        <Skeleton className="h-[6.25rem] w-full rounded-card" />
      </div>
    );
  }
  if (status !== 'success' || !data?.items?.length) return null;

  const rec = data.items[0];

  return (
    <ArtPanel as="div" art={rec.game} seed="home-recommendation" className="gq-editorial-panel gq-recommendation flex flex-col gap-3 p-4 rounded-card border border-[#DCD5C6] bg-surface shadow-2xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-[var(--secondary-accent)]">
          <Sparkles className="h-3.5 w-3.5" /> Recommendation
        </div>
        <Link
          to="/friends?tab=recommendations"
          className="flex items-center gap-0.5 text-xs font-semibold text-text hover:underline"
        >
          View all <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <CoverImage
          cover={rec.game?.cover}
          title={rec.game?.title}
          alt={rec.game?.title}
          compact
          className="h-16 w-12 shrink-0 rounded-control shadow-xs object-cover"
        />
        <div className="flex-1 min-w-0">
          <p className="font-heading text-sm font-bold truncate text-text">{rec.game?.title}</p>
          <p className="text-xs text-text-muted mt-0.5">
            Recommended by <span className="font-semibold text-text">@{rec.from.username}</span>
          </p>
          {rec.message && (
            <p className="mt-1 text-xs text-text-muted line-clamp-1 italic">
              &ldquo;{rec.message}&rdquo;
            </p>
          )}
        </div>
      </div>
    </ArtPanel>
  );
}

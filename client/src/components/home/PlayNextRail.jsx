import { Link } from 'react-router-dom';
import { Clock, Gamepad2, TrendingUp } from 'lucide-react';
import { ArtPanel } from '@/components/art/ArtPanel.jsx';
import { useAmbient } from '@/components/art/ambientContext.js';
import { CoverImage } from '@/components/games/GameCard.jsx';
import { StatusBadge } from '@/components/library/StatusBadge.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { STATUS_META } from '@/lib/libraryStatus.js';

const SHOWN = 6;

const progressOf = (item) => (item.status === 'playing' && item.manualProgress > 0 ? item.manualProgress : 0);
// Shorter wording for the cards ("Matches your taste (RPG, Indie)" → "Your taste: RPG, Indie").
const shortReason = (r) => r.replace(/^Matches your taste \((.+)\)$/, 'Your taste: $1').replace(/^Waiting (\d+) days$/, 'Waiting $1 days');
// The time to beat has its own line, and "40% already done" is shown by the progress bar, so neither is repeated.
const reasonsOf = (item) =>
  (item.reasons ?? []).filter((r) => !(item.timeToBeatMain != null && /to beat$/.test(r)) && !(progressOf(item) > 0 && /already done$/.test(r)));

function SectionSkeleton() {
  return (
    <div role="status" aria-label="Loading suggestions" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: SHOWN }, (_, i) => (
        <div key={i} className="flex gap-3 rounded-card border border-border bg-surface p-3" aria-hidden="true">
          <div className="h-[104px] w-[78px] shrink-0 animate-pulse rounded-[8px] bg-surface-raised" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <div className="h-4 w-3/4 animate-pulse rounded-control bg-surface-raised" />
            <div className="h-3 w-1/3 animate-pulse rounded-control bg-surface-raised" />
            <div className="h-3 w-5/6 animate-pulse rounded-control bg-surface-raised" />
          </div>
        </div>
      ))}
    </div>
  );
}

// One suggestion, ranked: its place in the order, the cover, then the title, status, time to beat and why.
// The whole card is one link (stretched over the card), named by what matters: status, title and progress.
export function PlayNextCard({ item, rank }) {
  const { previewGame, clearPreview } = useAmbient();
  const progress = progressOf(item);
  const reasons = reasonsOf(item).map(shortReason);
  const name = `${STATUS_META[item.status]?.label ?? item.status} ${item.title}${progress > 0 ? `, ${progress}% done` : ''}`;
  return (
    <li
      className="gq-play-next-card group relative flex min-w-0 items-stretch gap-3 rounded-card border border-border bg-surface p-3 transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--text)_35%,var(--border))] focus-within:border-text"
      onMouseEnter={() => previewGame(item)}
      onFocus={() => previewGame(item)}
      onMouseLeave={clearPreview}
      onBlur={clearPreview}
    >
      {rank != null && (
        <span
          aria-hidden="true"
          className={`w-7 shrink-0 self-center text-center font-heading text-2xl font-bold tabular-nums ${rank === 1 ? 'text-text' : 'text-text-muted/50'}`}
        >
          {rank}
        </span>
      )}
      <span className="relative h-[104px] w-[78px] shrink-0 overflow-hidden rounded-[8px] bg-surface-raised">
        <CoverImage cover={item.cover} title={item.title} compact alt="" sizes="78px" className="h-full w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.04]" />
        {progress > 0 && (
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
            <span className="block h-full bg-[var(--status-completed)]" style={{ width: `${progress}%` }} />
          </span>
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
        <Link
          to={`/library/${item.entryId}`}
          aria-label={name}
          title={item.title}
          className="truncate text-sm font-bold text-text after:absolute after:inset-0 after:rounded-card group-hover:text-[var(--accent-text)] focus-visible:outline-none"
        >
          {item.title}
        </Link>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-text-muted">
          <StatusBadge status={item.status} />
          {progress > 0 && <span className="font-semibold tabular-nums text-text">{progress}%</span>}
          {item.timeToBeatMain != null && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />~{item.timeToBeatMain}h
            </span>
          )}
        </div>
        {reasons.length > 0 && (
          <ul aria-label={`Why ${item.title}`} className="mt-auto flex flex-col text-xs leading-snug text-text-muted">
            {reasons.map((r) => (
              <li key={r} className="line-clamp-2" title={r}>
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

// "What to play next": a ranked shortlist. Numbered cards in a grid (three across on wide screens, two on tablets,
// one on phones), in the same light card style as the stats strip above. Nothing scrolls sideways or gets cut off.
// `playNext` is a useAsync result.
export function PlayNextSection({ playNext }) {
  const items = playNext.data?.items ?? [];
  const shown = items.slice(0, SHOWN);

  return (
    <ArtPanel aria-labelledby="play-next-title" art={items[0]} seed="home-next" className="gq-editorial-panel gq-play-next-section flex flex-col gap-4 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="play-next-title" className="flex items-center gap-2 font-heading text-lg font-bold text-text">
            <TrendingUp size={18} className="text-[var(--secondary-accent)]" aria-hidden="true" />
            What to play next
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">Ranked from your library by your taste, progress and how long each game takes.</p>
        </div>
        {items.length > SHOWN && (
          <Link to="/library?status=backlog" className="text-sm font-semibold text-text-muted hover:text-text">
            See your backlog
          </Link>
        )}
      </div>

      {playNext.status === 'loading' && <SectionSkeleton />}

      {playNext.status === 'error' && <ErrorState message="Couldn't load your suggestions." onRetry={playNext.retry} />}

      {playNext.status === 'success' && items.length === 0 && (
        <EmptyState
          icon={Gamepad2}
          title="Nothing to recommend yet"
          description="Add games to your backlog and we'll suggest what to play next."
          actionLabel="Find games"
          actionTo="/explore"
          suggestions
          headingLevel="h3"
        />
      )}

      {playNext.status === 'success' && items.length > 0 && (
        <ol aria-label="Suggested games" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((item, i) => (
            <PlayNextCard key={item.entryId} item={item} rank={i + 1} />
          ))}
        </ol>
      )}
    </ArtPanel>
  );
}

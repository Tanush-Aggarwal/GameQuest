import { CoverImage } from '@/components/games/GameCard.jsx';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, Heart, Inbox, Send, Sparkles, Star, ThumbsDown, Trophy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import {
  deleteRecommendation,
  getPickScore,
  listInbox,
  listSent,
  respondRecommendation,
} from '@/services/recommendationsApi.js';

export function RecommendationsTab() {
  const [activeView, setActiveView] = useState('inbox'); // 'inbox' | 'sent'
  const [statusFilter, setStatusFilter] = useState('all');

  const loadInbox = useCallback(
    (signal) => listInbox({ status: statusFilter }, { signal }),
    [statusFilter],
  );
  const loadSent = useCallback(
    (signal) => listSent({}, { signal }),
    [],
  );
  const loadScore = useCallback(
    (signal) => getPickScore(null, { signal }),
    [],
  );

  const inboxAsync = useAsync(loadInbox);
  const sentAsync = useAsync(loadSent);
  const scoreAsync = useAsync(loadScore);

  const currentList = activeView === 'inbox' ? inboxAsync : sentAsync;

  async function handleRespond(recId, status, libraryStatus) {
    try {
      await respondRecommendation(recId, { status, libraryStatus });
      toast.success(
        status === 'accepted'
          ? `Added to your ${libraryStatus}!`
          : 'Recommendation dismissed',
      );
      inboxAsync.retry();
      scoreAsync.retry();
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    }
  }

  async function handleDelete(recId) {
    try {
      await deleteRecommendation(recId);
      toast.success('Recommendation removed');
      currentList.retry();
      scoreAsync.retry();
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Pick Score Header Card */}
      <PickScoreCard scoreData={scoreAsync.data} loading={scoreAsync.status === 'loading'} />

      {/* Navigation Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div className="flex gap-2">
          <Button
            variant={activeView === 'inbox' ? 'primary' : 'secondary'}
            onClick={() => setActiveView('inbox')}
            className="flex items-center gap-1.5"
          >
            <Inbox className="h-4 w-4" /> Inbox
          </Button>
          <Button
            variant={activeView === 'sent' ? 'primary' : 'secondary'}
            onClick={() => setActiveView('sent')}
            className="flex items-center gap-1.5"
          >
            <Send className="h-4 w-4" /> Sent Picks
          </Button>
        </div>

        {activeView === 'inbox' && (
          <div className="flex items-center gap-1 text-xs">
            {['all', 'pending', 'accepted', 'declined'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-[var(--radius-control)] px-2.5 py-1 capitalize transition-colors ${
                  statusFilter === st
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-semibold'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-raised)]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {currentList.status === 'loading' && <ListSkeleton />}
      {currentList.status === 'error' && (
        <ErrorState
          title="Could not load recommendations"
          description={currentList.error?.message}
          retry={currentList.retry}
        />
      )}
      {currentList.status === 'success' && (
        <>
          {currentList.data.items.length === 0 ? (
            <EmptyState
              title={activeView === 'inbox' ? 'No recommendations received' : 'No recommendations sent yet'}
              description={
                activeView === 'inbox'
                  ? 'When friends recommend games to you, they will appear here with reviews and notes.'
                  : 'Find games you love on Explore or in your Library, and use "Recommend" to suggest them to friends!'
              }
              actionLabel={activeView === 'sent' ? 'Explore Games' : undefined}
              actionTo={activeView === 'sent' ? '/explore' : undefined}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-4" role="list">
              {currentList.data.items.map((item) => (
                <RecommendationCard
                  key={item.id}
                  item={item}
                  isInbox={activeView === 'inbox'}
                  onRespond={handleRespond}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ── Pick Score Card ──────────────────────────────────────────────────────────

function PickScoreCard({ scoreData, loading }) {
  if (loading) {
    return <div className="h-20 w-full rounded-[var(--radius-card)] bg-[var(--surface)] animate-pulse" />;
  }

  const { totalSent = 0, acceptedCount = 0, completedCount = 0, averageRating } = scoreData ?? {};
  const acceptRate = totalSent > 0 ? Math.round((acceptedCount / totalSent) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--reward)]/15 text-[var(--reward)]">
          <Sparkles className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-bold font-heading text-base">Your Recommendation Pick Score</h2>
          <p className="text-xs text-[var(--text-muted)]">
            How well your taste resonates with friends
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6 text-sm">
        <div className="flex flex-col items-center">
          <span className="font-bold tabular-nums text-lg text-[var(--text)]">{totalSent}</span>
          <span className="text-xs text-[var(--text-muted)]">Picks Sent</span>
        </div>
        <div className="h-8 w-px bg-[var(--border)]" />
        <div className="flex flex-col items-center">
          <span className="font-bold tabular-nums text-lg text-[var(--accent)]">{acceptRate}%</span>
          <span className="text-xs text-[var(--text-muted)]">Accept Rate</span>
        </div>
        <div className="h-8 w-px bg-[var(--border)]" />
        <div className="flex flex-col items-center">
          <span className="font-bold tabular-nums text-lg text-[var(--success)]">{completedCount}</span>
          <span className="text-xs text-[var(--text-muted)]">Finished by Friends</span>
        </div>
        {averageRating && (
          <>
            <div className="h-8 w-px bg-[var(--border)]" />
            <div className="flex flex-col items-center">
              <span className="font-bold tabular-nums text-lg text-[var(--reward)] flex items-center gap-0.5">
                {averageRating} <Star className="h-3.5 w-3.5 fill-current" />
              </span>
              <span className="text-xs text-[var(--text-muted)]">Avg Rating</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Recommendation Card ──────────────────────────────────────────────────────

function RecommendationCard({ item, isInbox, onRespond, onDelete }) {
  const otherUser = isInbox ? item.from : item.to;
  const { game } = item;

  return (
    <li className="flex flex-col sm:flex-row gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--surface-raised)] transition-colors">
      {/* Game Thumbnail */}
      <Link to={game ? `/games/${game.slug}` : '#'} className="shrink-0">
        <CoverImage
          cover={game?.cover}
          title={game?.title}
          alt={game?.title}
          compact
          className="h-28 w-20 rounded-[var(--radius-control)] shadow"
        />
      </Link>

      {/* Main Info */}
      <div className="flex flex-1 flex-col justify-between gap-3 min-w-0">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              to={game ? `/games/${game.slug}` : '#'}
              className="text-base font-bold font-heading hover:text-[var(--accent)] transition-colors truncate"
            >
              {game?.title ?? 'Unknown Game'}
            </Link>

            {/* Status Chip */}
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                item.status === 'accepted'
                  ? 'bg-[var(--success)]/15 text-[var(--success)] border border-[var(--success)]/30'
                  : item.status === 'declined'
                  ? 'bg-[var(--danger)]/15 text-[var(--danger)] border border-[var(--danger)]/30'
                  : 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30'
              }`}
            >
              {item.status}
            </span>
          </div>

          <p className="text-xs text-[var(--text-muted)] mt-1">
            {isInbox ? 'Recommended by' : 'Sent to'}{' '}
            <Link to={`/u/${otherUser.username}`} className="font-semibold hover:underline text-[var(--text)]">
              @{otherUser.username}
            </Link>
          </p>

          {/* Personal message */}
          {item.message && (
            <p className="mt-2 text-sm text-[var(--text)] italic bg-[var(--bg)]/60 rounded-[var(--radius-control)] p-2.5 border border-[var(--border)]/50">
              &ldquo;{item.message}&rdquo;
            </p>
          )}

          {/* Attached Review Snippet */}
          {item.review && (
            <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span className="flex items-center text-[var(--reward)] font-semibold">
                {item.review.rating} <Star className="h-3 w-3 fill-current ml-0.5" />
              </span>
              <span>their review:</span>
              <span className="line-clamp-1 italic text-[var(--text)]">
                &ldquo;{item.review.body}&rdquo;
              </span>
            </div>
          )}

          {/* Recipient's current status if in their library */}
          {item.recipientStatus && (
            <div className="mt-2 text-xs text-[var(--info)] flex items-center gap-1">
              <Clock className="h-3 w-3" /> Already in library ({item.recipientStatus})
            </div>
          )}

          {/* Outcome Badge if game finished or rated */}
          {item.outcome?.status === 'completed' && (
            <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[var(--success)]">
              <Trophy className="h-3.5 w-3.5" /> Finished by recipient!
              {item.outcome.rating && (
                <span className="flex items-center text-[var(--reward)]">
                  · Rated {item.outcome.rating}★
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons for Pending Inbox Items */}
        {isInbox && item.status === 'pending' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--border)]/50">
            <Button
              variant="primary"
              size="sm"
              onClick={() => onRespond(item.id, 'accepted', 'backlog')}
              className="text-xs"
            >
              <Check className="h-3.5 w-3.5 mr-1" /> Add to Backlog
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onRespond(item.id, 'accepted', 'wishlist')}
              className="text-xs"
            >
              <Heart className="h-3.5 w-3.5 mr-1" /> Add to Wishlist
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRespond(item.id, 'declined')}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--danger)]"
            >
              <ThumbsDown className="h-3.5 w-3.5 mr-1" /> Not for me
            </Button>
          </div>
        )}

        {/* Delete button for sender or responded inbox */}
        {(!isInbox || item.status !== 'pending') && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--danger)] flex items-center gap-1 transition-colors"
            >
              <Trash2 className="h-3 w-3" /> Remove
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-28 rounded-[var(--radius-card)] bg-[var(--surface)] animate-pulse" />
      ))}
    </div>
  );
}

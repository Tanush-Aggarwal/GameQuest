import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, MessageSquare, Star, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { StatusBadge } from '@/components/library/StatusBadge.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getGameFriends } from '@/services/gamesApi.js';
import { listReviewsForGame } from '@/services/reviewApi.js';

export function TimeToBeatCard({ timeToBeat }) {
  const tiers = [
    { label: 'Main Story', hours: timeToBeat?.main, desc: 'Straightforward campaign' },
    { label: 'Main + Extras', hours: timeToBeat?.extras, desc: 'Side quests & exploration' },
    { label: 'Completionist', hours: timeToBeat?.full, desc: '100% all trophies & secrets' },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-accent" aria-hidden="true" />
        <h3 className="font-heading text-sm font-semibold tracking-wide uppercase text-text-muted">
          Time to Beat
        </h3>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiers.map((t) => (
          <div
            key={t.label}
            className="flex flex-col rounded-control border border-border/60 bg-surface-raised/40 p-3"
          >
            <span className="text-xs text-text-muted">{t.label}</span>
            <span className="mt-1 text-xl font-bold tabular-nums text-text">
              {t.hours != null ? `${t.hours} h` : '—'}
            </span>
            <span className="text-xs text-text-muted">{t.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StarRating({ rating }) {
  return (
    <div role="img" className="flex items-center gap-1" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden="true"
          className={`h-4 w-4 ${star <= rating ? 'fill-accent text-accent' : 'fill-border text-border'}`}
        />
      ))}
    </div>
  );
}

export function ReviewsSection({ gameId }) {
  const load = useCallback((signal) => listReviewsForGame(gameId, {}, { signal }), [gameId]);
  const { status, data, error, retry } = useAsync(load);
  const loading = status === 'loading';
  const reviews = data?.items ?? [];

  if (loading) {
    return (
      <div role="status" aria-label="Loading reviews" className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) return <ErrorState message="Couldn't load community reviews." onRetry={retry} />;

  if (!reviews.length) {
    return (
      <div className="rounded-card border border-dashed border-border p-8 text-center">
        <MessageSquare className="mx-auto h-8 w-8 text-text-muted/60" aria-hidden="true" />
        <h3 className="mt-2 text-sm font-semibold">No reviews yet</h3>
        <p className="mt-1 text-xs text-text-muted">
          Add this game to your library to write the first review!
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {reviews.map((r) => (
        <article
          key={r.id}
          className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised font-bold text-xs uppercase text-accent">
                {r.username ? r.username[0] : 'U'}
              </div>
              <span className="text-sm font-semibold">{r.username ?? 'Anonymous'}</span>
            </div>
            <StarRating rating={r.rating} />
          </div>
          {r.body && <p className="text-sm leading-relaxed text-text/90">{r.body}</p>}
          <span className="text-xs text-text-muted">
            {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
          </span>
        </article>
      ))}
    </div>
  );
}

export function FriendsSection({ slug }) {
  const load = useCallback((signal) => getGameFriends(slug, { signal }), [slug]);
  const { status, data, retry } = useAsync(load);
  const loading = status === 'loading';
  const friends = data ?? [];

  if (loading) {
    return (
      <div role="status" aria-label="Loading friends" className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (status === 'error') return <ErrorState message="Couldn't load your friends' activity." onRetry={retry} />;

  if (!friends.length) {
    return (
      <div className="rounded-card border border-dashed border-border p-8 text-center">
        <Users className="mx-auto h-8 w-8 text-text-muted/60" aria-hidden="true" />
        <h3 className="mt-2 text-sm font-semibold">No friends playing yet</h3>
        <p className="mt-1 text-xs text-text-muted">
          None of your friends have this in their library. Use Recommend above to tell them about it!
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {friends.map((f) => (
        <div
          key={f.userId}
          className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised font-bold text-sm uppercase text-accent">
              {f.username ? f.username[0] : 'F'}
            </div>
            <div className="min-w-0">
              <Link
                to={`/u/${f.username}`}
                className="truncate block text-sm font-semibold hover:text-accent"
              >
                {f.username}
              </Link>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <StatusBadge status={f.status} />
                {f.status === 'playing' && f.manualProgress > 0 && (
                  <span>{f.manualProgress}% done</span>
                )}
                {f.status === 'completed' && (
                  <span className="flex items-center gap-1 text-text">
                    <CheckCircle2 className="h-3 w-3 text-[var(--status-completed)]" aria-hidden="true" /> Beat it
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

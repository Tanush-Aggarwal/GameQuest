import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarPlus,
  Clock,
  MessageSquare,
  Sparkles,
  Star,
  Users,
  Gamepad2,
  CheckCircle2,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { GameCover, getHighResCover } from '@/components/games/GameCard.jsx';
import { TrailerPlayer } from '@/components/games/TrailerPlayer.jsx';
import { GameLibraryPanel } from '@/components/library/GameLibraryPanel.jsx';
import { StatusBadge } from '@/components/library/StatusBadge.jsx';
import { RecommendationModal } from '@/components/recommendations/RecommendationModal.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getGame, getGameFriends } from '@/services/gamesApi.js';
import { listReviewsForGame } from '@/services/reviewApi.js';

function TimeToBeatCard({ timeToBeat }) {
  const tiers = [
    { label: 'Main Story', hours: timeToBeat?.main, desc: 'Straightforward campaign' },
    { label: 'Main + Extras', hours: timeToBeat?.extras, desc: 'Side quests & exploration' },
    { label: 'Completionist', hours: timeToBeat?.full, desc: '100% all trophies & secrets' },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
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
            <span className="text-[11px] text-text-muted/80">{t.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StarRating({ rating }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= rating
              ? 'fill-[var(--reward)] text-[var(--reward)]'
              : 'fill-border text-border'
          }`}
        />
      ))}
    </div>
  );
}

function ReviewsSection({ gameId }) {
  const load = useCallback((signal) => listReviewsForGame(gameId, {}, { signal }), [gameId]);
  const { status, data, error } = useAsync(load);
  const loading = status === 'loading';
  const reviews = data?.items ?? [];

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-text-muted">Could not load community reviews.</p>;
  }

  if (!reviews.length) {
    return (
      <div className="rounded-card border border-dashed border-border p-8 text-center">
        <MessageSquare className="mx-auto h-8 w-8 text-text-muted/60" aria-hidden="true" />
        <h4 className="mt-2 text-sm font-semibold">No reviews yet</h4>
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
          <span className="text-[11px] text-text-muted">
            {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
          </span>
        </article>
      ))}
    </div>
  );
}

function FriendsSection({ slug }) {
  const load = useCallback((signal) => getGameFriends(slug, { signal }), [slug]);
  const { status, data } = useAsync(load);
  const loading = status === 'loading';
  const friends = data ?? [];

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!friends.length) {
    return (
      <div className="rounded-card border border-dashed border-border p-8 text-center">
        <Users className="mx-auto h-8 w-8 text-text-muted/60" aria-hidden="true" />
        <h4 className="mt-2 text-sm font-semibold">No friends playing yet</h4>
        <p className="mt-1 text-xs text-text-muted">
          None of your friends have this in their library. Click Recommend below to tell them about it!
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
                  <span className="flex items-center gap-1 text-[var(--reward)]">
                    <CheckCircle2 className="h-3 w-3" /> Beat it
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

function GameSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading game">
      <Skeleton className="h-8 w-32" />
      <div className="flex flex-col gap-6 md:flex-row">
        <Skeleton className="aspect-[3/4] w-56 shrink-0 rounded-card" />
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-28 w-full" />
          <div className="flex gap-3">
            <Skeleton className="h-11 w-32" />
            <Skeleton className="h-11 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Game() {
  const { slug } = useParams();
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'reviews' | 'friends'

  const load = useCallback((signal) => getGame(slug, { signal }), [slug]);
  const { status, data: game, error, retry } = useAsync(load);

  const year = game?.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;

  return (
    <section className="relative flex flex-col gap-8 pb-12">
      {/* Ambient Cover Tint Backdrop (PS5 / Steam dynamic hero glow) */}
      {status === 'success' && (game?.backdrop || game?.cover) && (
        <div
          className="pointer-events-none absolute -inset-x-8 -top-8 h-96 overflow-hidden opacity-25 select-none"
          aria-hidden="true"
        >
          <img
            src={game.backdrop ?? getHighResCover(game.cover)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover blur-3xl scale-125"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--bg)]/80 to-[var(--bg)]" />
        </div>
      )}

      {/* Back button */}
      <Link
        to="/explore"
        className="relative z-10 inline-flex min-h-11 w-fit items-center gap-2 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Explore
      </Link>

      {status === 'loading' && <GameSkeleton />}

      {status === 'error' &&
        (error.status === 404 ? (
          <EmptyState
            headingLevel="h1"
            title="Game not found"
            description="This game isn't in the catalog yet. Try searching for it."
            actionLabel="Search games"
            actionTo="/explore"
          />
        ) : (
          <ErrorState message={error.message} onRetry={retry} />
        ))}

      {status === 'success' && game && (
        <div className="relative z-10 flex flex-col gap-8">
          {/* Hero Header */}
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            {/* Crisp High-Res Poster */}
            <div className="w-48 sm:w-56 shrink-0 overflow-hidden rounded-card border border-border shadow-2xl bg-surface">
              <GameCover game={game} />
            </div>

            {/* Title & Metadata */}
            <div className="flex flex-1 flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {year && (
                    <span className="text-xs uppercase tracking-wider text-text-muted font-medium">
                      {year}
                    </span>
                  )}
                  {game.ratingAvg > 0 && (
                    <div className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2.5 py-0.5 text-xs font-semibold text-[var(--reward)]">
                      <Star className="h-3.5 w-3.5 fill-[var(--reward)]" />
                      <span>{game.ratingAvg.toFixed(1)}</span>
                      <span className="text-text-muted font-normal">
                        ({game.ratingCount})
                      </span>
                    </div>
                  )}
                </div>

                <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl text-text">
                  {game.title}
                </h1>

                {/* Genre chips */}
                {game.genres.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {game.genres.map((g) => (
                      <span
                        key={g}
                        className="rounded-full border border-border bg-surface/80 px-2.5 py-0.5 text-xs text-text-muted"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Supported Platforms */}
              {game.platforms.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <Gamepad2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="line-clamp-1">{game.platforms.join(' · ')}</span>
                </div>
              )}

              {/* Action Strip: Library Panel + Quick Buttons */}
              <div className="mt-2 flex flex-col gap-3">
                <GameLibraryPanel game={game} />

                <div className="flex flex-wrap gap-2.5">
                  <Button
                    variant="secondary"
                    onClick={() => setRecommendOpen(true)}
                    className="gap-2"
                  >
                    <Sparkles className="h-4 w-4 text-[var(--reward)]" aria-hidden="true" />
                    Recommend to Friend
                  </Button>
                  <Link
                    to={`/sessions/new?game=${game.slug}`}
                    className={buttonVariants({ variant: 'secondary' }) + ' gap-2'}
                  >
                    <CalendarPlus className="h-4 w-4 text-accent" aria-hidden="true" />
                    Schedule a Session
                  </Link>
                </div>
              </div>

              <RecommendationModal
                game={game}
                isOpen={recommendOpen}
                onClose={() => setRecommendOpen(false)}
              />
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                activeTab === 'overview'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reviews')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                activeTab === 'reviews'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              Community Reviews
              {game.ratingCount > 0 && (
                <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs tabular-nums text-text-muted">
                  {game.ratingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('friends')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                activeTab === 'friends'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              <Users className="h-4 w-4" /> Friends Activity
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="flex flex-col gap-6">
              {/* Trailer: IGDB video first, YouTube search as fallback; hidden when there is none */}
              <TrailerPlayer slug={game.slug} title={game.title} />

              {/* Synopsis */}
              <div className="rounded-card border border-border bg-surface p-5">
                <h3 className="font-heading text-sm font-semibold tracking-wide uppercase text-text-muted mb-2">
                  About
                </h3>
                <p className="max-w-prose text-sm leading-relaxed text-text/90">
                  {game.summary || 'No description available yet.'}
                </p>
              </div>

              {/* Time to Beat Breakdown */}
              {game.timeToBeat && <TimeToBeatCard timeToBeat={game.timeToBeat} />}
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="flex flex-col gap-4">
              <ReviewsSection gameId={game.id} />
            </div>
          )}

          {activeTab === 'friends' && (
            <div className="flex flex-col gap-4">
              <FriendsSection slug={game.slug} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

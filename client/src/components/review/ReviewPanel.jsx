import { useState, useCallback } from 'react';
import { Avatar } from '@/components/ui/Avatar.jsx';
import { Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import { getMyReview, listReviewsForGame, upsertReview, deleteReview } from '@/services/reviewApi.js';

export function ReviewPanel({ gameId, status }) {
  const [refreshKey, setRefreshKey] = useState(0);

  const loadMine = useCallback((signal) => getMyReview(gameId, { signal }), [gameId, refreshKey]); // eslint-disable-line
  const loadAll = useCallback((signal) => listReviewsForGame(gameId, {}, { signal }), [gameId, refreshKey]); // eslint-disable-line

  const mine = useAsync(loadMine);
  const all = useAsync(loadAll);

  const canReview = status && status !== 'wishlist';

  function onSaved() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <h3 className="font-semibold text-sm">Reviews</h3>
      </div>
      <div className="p-4 flex flex-col gap-5">
        {/* Own review */}
        {canReview && mine.status !== 'loading' && (
          <MyReview
            gameId={gameId}
            existing={mine.status === 'success' ? mine.data : null}
            onSaved={onSaved}
          />
        )}
        {!canReview && (
          <p className="text-sm text-[var(--text-muted)]">Add this game beyond your wishlist to write a review.</p>
        )}

        {/* Community reviews */}
        <CommunityReviews all={all} />
      </div>
    </div>
  );
}

// ── Star picker ──────────────────────────────────────────────────────────────

function StarPicker({ value, onChange, disabled }) {
  const [hover, setHover] = useState(0);
  const displayed = hover || value;
  return (
    <div className="flex gap-1" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className="p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
        >
          <Star
            size={20}
            className="transition-colors"
            style={{ color: n <= displayed ? 'var(--reward)' : 'var(--border)', fill: n <= displayed ? 'var(--reward)' : 'transparent' }}
          />
        </button>
      ))}
    </div>
  );
}

// ── Own review form ──────────────────────────────────────────────────────────

function MyReview({ gameId, existing, onSaved }) {
  const [editing, setEditing] = useState(!existing);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [body, setBody] = useState(existing?.body ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    if (!rating) return toast.error('Please pick a star rating.');
    setSaving(true);
    try {
      await upsertReview(gameId, { rating, body: body.trim() || undefined });
      toast.success(existing ? 'Review updated' : 'Review submitted');
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete your review?')) return;
    try {
      await deleteReview(gameId);
      toast.success('Review deleted');
      setRating(0);
      setBody('');
      setEditing(true);
      onSaved();
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    }
  }

  // Collapsed view when review exists and not editing
  if (existing && !editing) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Your review</p>
        <ReviewCard review={existing} isOwn onEdit={() => setEditing(true)} onDelete={handleDelete} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
        {existing ? 'Edit your review' : 'Write a review'}
      </p>
      <StarPicker value={rating} onChange={setRating} disabled={saving} />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={3000}
        placeholder="What did you think? (optional)"
        className="w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm resize-y focus:outline-none focus:border-[var(--accent)]"
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={saving || !rating}>{saving ? 'Saving…' : 'Submit'}</Button>
        {existing && (
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
        )}
      </div>
    </form>
  );
}

// ── Community reviews ────────────────────────────────────────────────────────

function CommunityReviews({ all }) {
  if (all.status === 'loading') return <div className="h-16 rounded-lg bg-[var(--surface-raised)] animate-pulse" />;
  if (all.status === 'error') return null;

  const items = all.data?.items ?? [];
  if (!items.length) return <p className="text-sm text-[var(--text-muted)]">No community reviews yet.</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Community</p>
      {items.map((r) => <ReviewCard key={r.id} review={r} />)}
    </div>
  );
}

function ReviewCard({ review, isOwn, onEdit, onDelete }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Avatar user={{ username: review.username ?? '?', avatar: review.avatar }} size={28} />
          <span className="text-sm font-medium">{review.username ?? 'Unknown'}</span>
          {isOwn && <span className="text-xs px-1.5 py-0.5 rounded bg-surface-raised text-text">You</span>}
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                size={12}
                style={{ color: n <= review.rating ? 'var(--reward)' : 'var(--border)', fill: n <= review.rating ? 'var(--reward)' : 'transparent' }}
              />
            ))}
          </div>
        </div>
        {isOwn && (
          <div className="flex gap-1">
            <button onClick={onEdit} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors px-1">Edit</button>
            <button onClick={onDelete} className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors p-1" aria-label="Delete review">
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
      {review.body && <p className="text-sm text-[var(--text-muted)] leading-relaxed">{review.body}</p>}
      <p className="text-xs text-[var(--text-muted)]">{new Date(review.createdAt).toLocaleDateString()}</p>
    </div>
  );
}

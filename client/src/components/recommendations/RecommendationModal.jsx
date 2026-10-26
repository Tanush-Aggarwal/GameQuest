import { useCallback, useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { listFriends } from '@/services/socialApi.js';
import { sendRecommendation } from '@/services/recommendationsApi.js';
import { getErrorInfo } from '@/services/api.js';

export function RecommendationModal({ game, isOpen, onClose }) {
  const loadFriends = useCallback((signal) => listFriends({ signal }), []);
  const { status, data } = useAsync(loadFriends);
  const friends = data?.friends ?? [];

  const [selectedFriendId, setSelectedFriendId] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const activeFriendId = selectedFriendId || (friends.length > 0 ? friends[0].id : '');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!activeFriendId) {
      toast.error('Pick a friend to recommend this game to');
      return;
    }

    setSubmitting(true);
    try {
      const friend = friends.find((f) => f.id === activeFriendId);
      await sendRecommendation({
        toId: activeFriendId,
        gameId: game.id,
        message: message.trim(),
      });
      toast.success(`Recommended ${game.title} to ${friend?.username ?? 'your friend'}!`);
      onClose();
      setMessage('');
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recommend-title"
    >
      <div className="relative w-full max-w-md rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)] transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-[var(--reward)]" aria-hidden="true" />
          <h2 id="recommend-title" className="text-lg font-bold font-heading">
            Recommend {game.title}
          </h2>
        </div>

        {status === 'loading' ? (
          <div className="flex flex-col gap-3 py-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : friends.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-sm text-[var(--text-muted)] mb-4">
              You haven&apos;t added any friends yet. Add friends first to send recommendations!
            </p>
            <Button variant="secondary" onClick={onClose}>
              Got it
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="friend-select">Send to</Label>
              <select
                id="friend-select"
                value={activeFriendId}
                onChange={(e) => setSelectedFriendId(e.target.value)}
                disabled={submitting}
                className="w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              >
                {friends.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.username}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recommend-msg">Why should they play it? (Optional)</Label>
              <textarea
                id="recommend-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="e.g. You loved Hollow Knight, this has the same combat feel!"
                disabled={submitting}
                className="w-full resize-none rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
              />
              <span className="text-xs text-[var(--text-muted)] text-right">
                {message.length}/500
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                <Send className="h-4 w-4 mr-1.5" />
                {submitting ? 'Sending...' : 'Send Recommendation'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

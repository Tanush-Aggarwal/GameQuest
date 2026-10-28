import { useCallback, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Search, Send, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Avatar } from '@/components/ui/Avatar.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { CoverImage } from '@/components/games/GameCard.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { listFriends } from '@/services/socialApi.js';
import { sendRecommendation } from '@/services/recommendationsApi.js';
import { getErrorInfo } from '@/services/api.js';
import { cn } from '@/lib/utils.js';

const QUICK_NOTES = ['You’d love the story', 'Perfect for a co-op night', 'Short and worth it', 'Same vibe as what you’re playing'];
const MAX = 500;

// "Recommend to a friend": the game at the top, friends as picture cards (pick one or several), an optional note.
export function RecommendationModal({ game, isOpen, onClose }) {
  // Mounted only while open, so every opening starts with nothing picked.
  return isOpen ? <RecommendationDialog game={game} onClose={onClose} /> : null;
}

function RecommendationDialog({ game, onClose }) {
  const isOpen = true;
  const loadFriends = useCallback((signal) => (isOpen ? listFriends({ signal }) : Promise.resolve([])), [isOpen]);
  const { status, data } = useAsync(loadFriends);
  const friends = Array.isArray(data) ? data : data?.friends ?? data?.items ?? [];

  const [picked, setPicked] = useState([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const shown = friends.filter((f) => f.username.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!picked.length) {
      toast.error('Pick at least one friend');
      return;
    }
    setSubmitting(true);
    const results = await Promise.allSettled(picked.map((toId) => sendRecommendation({ toId, gameId: game.id, message: message.trim() })));
    setSubmitting(false);
    const names = (ids) => ids.map((id) => friends.find((f) => f.id === id)?.username).filter(Boolean).join(', ');
    const sent = picked.filter((_, i) => results[i].status === 'fulfilled');
    const failed = picked.filter((_, i) => results[i].status === 'rejected');
    if (sent.length) toast.success(`Recommended ${game.title} to ${names(sent)}`);
    if (failed.length) {
      const reason = getErrorInfo(results.find((r) => r.status === 'rejected').reason).message;
      toast.error(`Not sent to ${names(failed)}: ${reason}`);
      setPicked(failed);
      return;
    }
    onClose();
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && !submitting && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[18px] border border-border bg-surface text-text shadow-2xl focus:outline-none">
          {/* Game header */}
          <div className="relative flex items-center gap-4 bg-[#111311] p-5 text-white">
            {game.cover && (
              <span className="w-14 shrink-0 overflow-hidden rounded-[8px] ring-1 ring-white/20">
                <CoverImage cover={game.cover} title={game.title} compact className="aspect-[3/4] h-full w-full object-cover" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-white/60">
                <Sparkles className="h-3.5 w-3.5 text-[var(--reward)]" aria-hidden="true" /> Recommend to friends
              </p>
              <Dialog.Title className="truncate font-heading text-xl font-bold" style={{ color: '#fff' }}>{game.title}</Dialog.Title>
              <Dialog.Description className="text-xs text-white/60">They’ll find it in their Recommendations inbox.</Dialog.Description>
            </div>
            <Dialog.Close className="self-start rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Close">
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          {status === 'loading' ? (
            <div className="grid grid-cols-3 gap-2 p-5">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : friends.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-text-muted">Add friends first, then you can send them games.</p>
              <Button variant="secondary" onClick={onClose}>Got it</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
                <fieldset className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <legend className="text-sm font-semibold">Send to</legend>
                    <span className="text-xs text-text-muted">{picked.length ? `${picked.length} selected` : 'Pick one or more'}</span>
                  </div>
                  {friends.length > 6 && (
                    <label className="relative">
                      <span className="sr-only">Search friends</span>
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search friends" className="w-full rounded-control border border-border bg-bg py-2 pl-9 pr-3 text-sm focus:border-text focus:outline-none" />
                    </label>
                  )}
                  <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto p-0.5 sm:grid-cols-4">
                    {shown.map((f) => {
                      const on = picked.includes(f.id);
                      return (
                        <label
                          key={f.id}
                          className={cn(
                            'relative flex cursor-pointer flex-col items-center gap-1.5 rounded-card border p-3 text-center transition-colors focus-within:ring-2 focus-within:ring-text',
                            on ? 'border-text bg-surface-raised' : 'border-border bg-bg/60 hover:border-text/40',
                          )}
                        >
                          <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(f.id)} disabled={submitting} />
                          <Avatar user={f} size={44} />
                          <span className="w-full truncate text-xs font-semibold">{f.username}</span>
                          {on && (
                            <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-text text-bg" aria-hidden="true">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </label>
                      );
                    })}
                    {!shown.length && <p className="col-span-full py-4 text-center text-xs text-text-muted">No friend matches “{query}”.</p>}
                  </div>
                </fieldset>

                <div className="flex flex-col gap-2">
                  <label htmlFor="recommend-msg" className="text-sm font-semibold">Add a note <span className="font-normal text-text-muted">(optional)</span></label>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_NOTES.map((note) => (
                      <button key={note} type="button" onClick={() => setMessage(note)} className="rounded-full border border-border px-2.5 py-1 text-xs text-text-muted hover:border-text/40 hover:text-text">
                        {note}
                      </button>
                    ))}
                  </div>
                  <textarea
                    id="recommend-msg"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={MAX}
                    rows={3}
                    placeholder="Why should they play it?"
                    disabled={submitting}
                    className="w-full resize-none rounded-control border border-border bg-bg px-3 py-2 text-sm placeholder:text-text-muted focus:border-text focus:outline-none"
                  />
                  <span className="self-end text-[11px] tabular-nums text-text-muted">{message.length}/{MAX}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border bg-bg/60 px-5 py-3">
                <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
                <Button type="submit" disabled={submitting || !picked.length}>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {submitting ? 'Sending…' : picked.length > 1 ? `Send to ${picked.length} friends` : 'Send'}
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Film, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getTrailers } from '@/services/gamesApi.js';
import { TrailerPlayer } from './TrailerPlayer.jsx';

const VIDEO_ID = /^[\w-]{11}$/;

function TrailerModalContent({ slug, title, onClose, triggerRef }) {
  const closeBtnRef = useRef(null);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Lock background scroll while modal is open, and cleanly restore on close/unmount
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus close button on mount
    closeBtnRef.current?.focus();

    const triggerElement = triggerRef?.current;
    return () => {
      document.body.style.overflow = originalOverflow;
      // Restore focus to the trigger element that opened the modal
      if (triggerElement && typeof triggerElement.focus === 'function') {
        triggerElement.focus();
      }
    };
  }, [triggerRef]);

  const load = useCallback((signal) => (slug ? getTrailers(slug, { signal }) : Promise.resolve([])), [slug]);
  const { status, data, retry } = useAsync(load);

  const validTrailers = (data ?? []).filter((t) => VIDEO_ID.test(t.videoId));
  const hasNoTrailers = (status === 'success' && validTrailers.length === 0) || status === 'error';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} Trailer`}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden rounded-[14px] border border-white/10 bg-[#161816] p-5 sm:p-6 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0 pr-4">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            <h3 className="font-heading text-base sm:text-lg font-bold text-white truncate">
              {title} — Official Trailer
            </h3>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close trailer"
            className="shrink-0 rounded-full bg-white/10 p-2 text-gray-300 hover:bg-white/20 hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="w-full flex-1 overflow-y-auto pt-4">
          {status === 'loading' && (
            <div role="status" aria-label="Loading trailer" className="flex flex-col gap-3">
              <Skeleton className="aspect-video w-full rounded-[10px] bg-white/10" />
            </div>
          )}

          {hasNoTrailers && (
            <div className="flex flex-col items-center justify-center py-14 text-center px-4">
              <Film className="h-12 w-12 text-gray-500 mb-3" aria-hidden="true" />
              <p className="text-base font-semibold text-gray-200">No trailer available for {title}</p>
              <p className="text-xs text-gray-400 mt-1 max-w-md">
                An official trailer hasn&apos;t been verified for this game yet. Check back soon or explore game details.
              </p>
              <div className="mt-5 flex gap-3">
                {status === 'error' && (
                  <button
                    type="button"
                    onClick={retry}
                    className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full bg-[var(--accent)] px-5 py-1.5 text-xs font-bold text-[var(--accent-fg)] hover:scale-105 transition-transform"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {status === 'success' && validTrailers.length > 0 && (
            <TrailerPlayer slug={slug} title={title} />
          )}
        </div>
      </div>
    </div>
  );
}

export function TrailerModal({ slug, title, isOpen, onClose, triggerRef }) {
  if (!isOpen || !slug) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <TrailerModalContent slug={slug} title={title} onClose={onClose} triggerRef={triggerRef} />,
    document.body,
  );
}

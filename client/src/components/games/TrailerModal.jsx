import { useCallback, useEffect } from 'react';
import { Film, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getTrailers } from '@/services/gamesApi.js';
import { TrailerPlayer } from './TrailerPlayer.jsx';

const VIDEO_ID = /^[\w-]{11}$/;

function TrailerModalContent({ slug, title, onClose }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const load = useCallback((signal) => getTrailers(slug, { signal }), [slug]);
  const { status, data } = useAsync(load);

  const validTrailers = (data ?? []).filter((t) => VIDEO_ID.test(t.videoId));
  const hasNoTrailers = status === 'success' && validTrailers.length === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} Trailer`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl overflow-hidden rounded-[14px] border border-white/10 bg-[#161816] p-5 text-white shadow-2xl">
        <div className="flex items-center justify-between pb-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            <h3 className="font-heading text-lg font-bold text-white">{title} — Official Trailer</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trailer"
            className="rounded-full bg-white/10 p-1.5 text-gray-400 hover:bg-white/20 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="w-full">
          {status === 'loading' && (
            <div role="status" aria-label="Loading trailer">
              <Skeleton className="aspect-video w-full rounded-[10px]" />
            </div>
          )}
          {hasNoTrailers && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Film className="h-10 w-10 text-gray-500 mb-3" aria-hidden="true" />
              <p className="text-sm font-semibold text-gray-200">No trailer available for {title}</p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm">
                An official trailer hasn&apos;t been verified for this game yet. Check back soon or explore game details.
              </p>
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

export function TrailerModal({ slug, title, isOpen, onClose }) {
  if (!isOpen || !slug) return null;
  return <TrailerModalContent slug={slug} title={title} onClose={onClose} />;
}

import { useCallback, useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getTrailer } from '@/services/gamesApi.js';

const VIDEO_ID = /^[\w-]{11}$/;

// The player stays a still thumbnail until it is clicked: the YouTube iframe (and its cookies and
// scripts) is only created then, from the privacy-friendly youtube-nocookie.com domain.
function Player({ videoId, title }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-card border border-border bg-surface-raised">
      {playing ? (
        <iframe
          title={`${title} trailer`}
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play trailer for ${title}`}
          className="group absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <img
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span className="absolute inset-0 bg-black/30 transition-colors group-hover:bg-black/10" aria-hidden="true" />
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg motion-safe:transition-transform motion-safe:group-hover:scale-105">
            <Play className="h-7 w-7 translate-x-0.5" fill="currentColor" aria-hidden="true" />
          </span>
        </button>
      )}
    </div>
  );
}

// Trailer section of the game page. Renders nothing when the game has no video.
export function TrailerPlayer({ slug, title }) {
  const load = useCallback((signal) => getTrailer(slug, { signal }), [slug]);
  const { status, data: trailer, retry } = useAsync(load);

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading trailer">
        <Skeleton className="aspect-video w-full" />
      </div>
    );
  }
  if (status === 'error') {
    // Scoped to this section; the rest of the page is unaffected.
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4 text-sm">
        <span>Could not load the trailer.</span>
        <Button variant="secondary" onClick={retry}>
          Retry
        </Button>
      </div>
    );
  }
  if (!trailer || !VIDEO_ID.test(trailer.videoId)) return null;

  return (
    <section aria-label="Trailer" className="flex flex-col gap-2">
      <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-text-muted">Trailer</h3>
      <Player key={trailer.videoId} videoId={trailer.videoId} title={title} />
    </section>
  );
}

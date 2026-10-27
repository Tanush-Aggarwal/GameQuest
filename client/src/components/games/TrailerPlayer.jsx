import { useCallback, useState } from 'react';
import { Flag, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useLayered } from '@/hooks/useLayered.js';
import { getErrorInfo } from '@/services/api.js';
import { getTrailers, reportTrailer } from '@/services/gamesApi.js';

const VIDEO_ID = /^[\w-]{11}$/;

// English interface and captions off by default; autoplay because the viewer just clicked play.
const embedUrl = (videoId) =>
  `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&hl=en&cc_lang_pref=en&cc_load_policy=0`;

// Tab labels: "Trailer", "Trailer 2" when the same label appears more than once.
function tabLabels(trailers) {
  const total = {};
  for (const t of trailers) total[t.label] = (total[t.label] ?? 0) + 1;
  const seen = {};
  return trailers.map((t) => {
    seen[t.label] = (seen[t.label] ?? 0) + 1;
    return total[t.label] > 1 ? `${t.label} ${seen[t.label]}` : t.label;
  });
}

// The player stays a still thumbnail until it is clicked: the YouTube iframe (and its cookies and
// scripts) is only created then, from the privacy-friendly youtube-nocookie.com domain.
function Player({ videoId, title }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-card border border-border bg-surface-raised">
      {playing ? (
        <iframe
          title={`${title} trailer`}
          src={embedUrl(videoId)}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
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

// Trailer section of the game page: the best trailer, small tabs for the others, and "Wrong trailer?".
// Renders nothing when the game has no (more) trailers.
export function TrailerPlayer({ slug, title }) {
  const load = useCallback((signal) => getTrailers(slug, { signal }), [slug]);
  const { status, data, retry } = useAsync(load);
  const [trailers, setTrailers] = useLayered(data);
  const [selected, setSelected] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function wrongTrailer(videoId) {
    setReporting(true);
    try {
      const result = await reportTrailer(slug, videoId);
      setTrailers(result.trailers);
      setSelected(null);
      if (!result.changed) toast.info('That video was already removed.');
      else if (result.dropped) toast.success('Thanks, that video was removed for everyone.');
      else toast.success(result.trailers.length ? 'Thanks, we hid that video for you. Here is the next one.' : 'Thanks, we hid that video for you.');
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setReporting(false);
      setConfirming(false);
    }
  }

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
  const list = (trailers ?? []).filter((t) => VIDEO_ID.test(t.videoId));
  if (!list.length) return null;

  const current = list.find((t) => t.videoId === selected) ?? list[0];
  const labels = tabLabels(list);

  return (
    <section aria-label="Trailer" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-text-muted">Trailer</h2>
        {list.length > 1 && (
          <div role="group" aria-label="Choose a trailer" className="flex flex-wrap gap-1">
            {list.map((t, i) => (
              <button
                key={t.videoId}
                type="button"
                aria-pressed={t.videoId === current.videoId}
                onClick={() => setSelected(t.videoId)}
                className={`min-h-11 rounded-control border px-3 text-xs font-semibold transition-colors ${
                  t.videoId === current.videoId
                    ? 'border-accent bg-accent/15 text-text'
                    : 'border-border bg-surface text-text-muted hover:bg-surface-raised hover:text-text'
                }`}
              >
                {labels[i]}
              </button>
            ))}
          </div>
        )}
      </div>
      <Player key={current.videoId} videoId={current.videoId} title={title} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {confirming ? (
          <div role="group" aria-label="Confirm wrong trailer" className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted">Hide this video?</span>
            <Button variant="secondary" onClick={() => wrongTrailer(current.videoId)} disabled={reporting}>
              {reporting ? 'Hiding…' : 'Yes, it is wrong'}
            </Button>
            {/* The safe choice takes focus, so the dialog-less confirm doesn't drop keyboard users */}
            <Button variant="ghost" autoFocus onClick={() => setConfirming(false)} disabled={reporting}>
              Cancel
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-xs text-text-muted underline-offset-2 hover:text-text hover:underline"
          >
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            Wrong trailer?
          </button>
        )}
      </div>
    </section>
  );
}

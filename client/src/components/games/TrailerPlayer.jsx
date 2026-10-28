import { useCallback, useState } from 'react';
import { Flag, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useLayered } from '@/hooks/useLayered.js';
import { getErrorInfo } from '@/services/api.js';
import { getTrailers, reportTrailer } from '@/services/gamesApi.js';
import { isPlayableTrailer, isSteamTrailer, trailerThumb } from '@/lib/trailers.js';
import { SteamVideo } from './SteamVideo.jsx';


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
    <div className="relative aspect-video w-full overflow-hidden rounded-[12px] bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
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
          className="group absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text"
        >
          <img
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            srcSet={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg 480w, https://i.ytimg.com/vi/${videoId}/sddefault.jpg 640w`}
            sizes="(min-width: 1024px) 900px, 100vw"
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full scale-[1.34] object-cover transition-transform duration-700 ease-out group-hover:scale-[1.38]"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20" aria-hidden="true" />
          <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white text-[#111311] shadow-[0_0_0_10px_rgba(255,255,255,0.15)] motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-110">
            <Play className="h-8 w-8 translate-x-0.5" fill="currentColor" aria-hidden="true" />
          </span>
          <span className="absolute bottom-4 left-5 text-sm font-semibold text-white/90" aria-hidden="true">Click to play</span>
        </button>
      )}
    </div>
  );
}

// Steam trailer: the poster with a play button until clicked, then the video itself.
function SteamPoster({ trailer, title }) {
  const [playing, setPlaying] = useState(false);
  if (playing) return <SteamVideo trailer={trailer} title={title} />;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[12px] bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
      <button type="button" onClick={() => setPlaying(true)} aria-label={`Play trailer for ${title}`} className="group absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text">
        {trailer.poster && <img src={trailer.poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" />}
        <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20" aria-hidden="true" />
        <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white text-[#111311] shadow-[0_0_0_10px_rgba(255,255,255,0.15)] motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-110">
          <Play className="h-8 w-8 translate-x-0.5" fill="currentColor" aria-hidden="true" />
        </span>
        <span className="absolute bottom-4 left-5 text-sm font-semibold text-white/90" aria-hidden="true">Click to play</span>
      </button>
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
  const list = (trailers ?? []).filter(isPlayableTrailer);
  if (!list.length) return null;

  const current = list.find((t) => t.videoId === selected) ?? list[0];
  const labels = tabLabels(list);

  return (
    <section aria-label="Trailer" className={`grid gap-5 ${list.length > 1 ? 'lg:grid-cols-[minmax(0,1fr)_260px]' : ''}`}>
      <div className="flex min-w-0 flex-col gap-3">
        {isSteamTrailer(current) ? (
          // Steam trailers start only when picked (autoplay), so the first card stays a thumbnail until clicked
          <SteamPoster key={current.videoId} trailer={current} title={title} />
        ) : (
          <Player key={current.videoId} videoId={current.videoId} title={title} />
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold" style={{ color: '#fff' }}>
            {labels[list.indexOf(current)]}
            <span className="ml-2 font-normal" style={{ color: 'rgba(255,255,255,0.55)' }}>· {isSteamTrailer(current) ? 'Steam' : 'YouTube'}</span>
          </p>
          {isSteamTrailer(current) ? null : confirming ? (
            <div role="group" aria-label="Confirm wrong trailer" className="flex flex-wrap items-center gap-2">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>Hide this video?</span>
              <Button variant="secondary" onClick={() => wrongTrailer(current.videoId)} disabled={reporting}>
                {reporting ? 'Hiding…' : 'Yes, it is wrong'}
              </Button>
              {/* The safe choice takes focus, so the dialog-less confirm doesn't drop keyboard users */}
              <Button variant="ghost" autoFocus onClick={() => setConfirming(false)} disabled={reporting} className="text-white hover:bg-white/10">
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-xs transition-colors hover:bg-white/10"
              style={{ color: 'rgba(255,255,255,0.6)' }}
            >
              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
              Wrong trailer?
            </button>
          )}
        </div>
      </div>

      {list.length > 1 && (
        // A playlist of the other videos: a column beside the player on wide screens, a scrolling row below on small ones.
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {list.length} videos
          </h2>
          <div role="group" aria-label="Choose a trailer" className="flex gap-2.5 overflow-x-auto p-1 lg:max-h-[440px] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
            {list.map((t, i) => {
              const active = t.videoId === current.videoId;
              return (
                <button
                  key={t.videoId}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(t.videoId)}
                  className={`group flex w-44 shrink-0 flex-col gap-1.5 rounded-[10px] p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60 lg:w-full lg:flex-row lg:items-center lg:gap-3 ${
                    active ? 'bg-white/10 ring-1 ring-inset ring-white/35' : 'hover:bg-white/8'
                  }`}
                >
                  <span className="relative block aspect-video w-full shrink-0 overflow-hidden rounded-[7px] bg-black lg:w-28">
                    {trailerThumb(t, 'mq') && <img src={trailerThumb(t, 'mq')} alt="" loading="lazy" className="h-full w-full object-cover" />}
                    {active && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/45" aria-hidden="true">
                        <Play className="h-5 w-5 text-white" fill="currentColor" />
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 text-xs font-semibold leading-snug" style={{ color: active ? '#fff' : 'rgba(255,255,255,0.75)' }}>
                    {labels[i]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

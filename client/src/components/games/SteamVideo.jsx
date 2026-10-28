import { useEffect, useRef, useState } from 'react';

// hls.js is only needed for Steam trailers that come as HLS (most newer ones) in browsers without native
// HLS (Chrome, Firefox, Edge). It is loaded from a CDN on first play, so it costs nothing until then.
const HLS_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
let hlsLoading = null;
function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (!hlsLoading) {
    hlsLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = HLS_URL;
      script.async = true;
      script.onload = () => resolve(window.Hls);
      script.onerror = () => {
        hlsLoading = null;
        reject(new Error('Could not load the video player'));
      };
      document.head.appendChild(script);
    });
  }
  return hlsLoading;
}

// An official Steam trailer, played from Steam's CDN. Prefers mp4/webm, falls back to HLS.
export function SteamVideo({ trailer, title }) {
  const ref = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || trailer.mp4 || trailer.webm || !trailer.hls) return undefined;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = trailer.hls;
      return undefined;
    }
    let hls;
    let cancelled = false;
    loadHls()
      .then((Hls) => {
        if (cancelled) return;
        if (!Hls?.isSupported()) throw new Error('This browser cannot play this trailer');
        hls = new Hls({ capLevelToPlayerSize: true });
        hls.loadSource(trailer.hls);
        hls.attachMedia(video);
        video.play().catch(() => {});
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [trailer]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[12px] bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
      <video
        ref={ref}
        title={`${title} trailer`}
        poster={trailer.poster ?? undefined}
        controls
        autoPlay
        playsInline
        preload="metadata"
        className="absolute inset-0 h-full w-full"
      >
        {trailer.webm && <source src={trailer.webm} type="video/webm" />}
        {trailer.mp4 && <source src={trailer.mp4} type="video/mp4" />}
      </video>
      {error && <p className="absolute inset-x-0 bottom-0 bg-black/70 p-3 text-center text-sm text-white">{error}</p>}
    </div>
  );
}

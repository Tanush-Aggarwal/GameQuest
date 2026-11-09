import { useEffect, useState } from 'react';

// Candidate order for a wide game header, most reliable first:
//   1. Steam's library hero: key art Steam requires to be logo-free and drawn for wide banners;
//   2. a Steam-hosted backdrop (the store page background), never Steam's small header.jpg;
//   3. screenshots: real in-game scenes, which are never a title logo;
//   4. the stored IGDB backdrop and artworks last: these are often the title logo or a poster, which looks
//      awful stretched across a banner (GTA VI's, The Quarry's and Phasmophobia's are all logos).
export function heroCandidates(art) {
  if (!art) return [];
  const steamBackdrop = typeof art.backdrop === 'string' && /steamstatic\.com/.test(art.backdrop) && !/\/header\.jpg/.test(art.backdrop) ? art.backdrop : null;
  return [
    art.steamHero,
    steamBackdrop,
    ...(art.screenshots ?? []).slice(0, 4),
    steamBackdrop ? null : art.backdrop,
    ...(art.artworks ?? []).slice(0, 3),
  ].filter(Boolean);
}

// Picks the best picture for a wide header from a game's candidates (Steam's banner art, the stored backdrop,
// artworks, screenshots). Catalog art is mixed: some "artworks" are just the title logo on black, some backdrops are
// Steam's 460px header strip, and a portrait or 16:9 image cropped to a very wide banner cuts faces off. So each
// candidate is looked at once, as a tiny thumbnail drawn to a 64x24 canvas, and scored:
//   - rejected: failed to load, wrong shape (narrower than 1.3:1 or wider than 3.3:1), a near-blank image, a title
//     logo on a flat background, or (Steam only) a low-resolution image;
//   - otherwise: detail and colour variety count for it, one colour filling most of the frame counts against it,
//     and a shape close to a banner wins ties. Steam's library hero gets a bonus: it is drawn for banners.
// Results are cached for the session, so the same game's art is measured once across pages.

const CORS_HOSTS = /(^|\.)(igdb\.com|steamstatic\.com|akamaihd\.net)$/;
const cache = new Map(); // url -> Promise<metrics | null>
const MEASURE_TIMEOUT_MS = 2500;

export const isSteamHero = (url) => typeof url === 'string' && /steamstatic\.com\/.*library_hero/.test(url);
const isIgdb = (url) => typeof url === 'string' && url.includes('images.igdb.com');

// A small version to measure (IGDB serves sizes; other hosts have one size).
const thumbFor = (url) => (isIgdb(url) ? url.replace(/\/t_[a-z0-9_]+\//, '/t_screenshot_med/') : url);

const corsSafe = (url) => {
  try {
    return CORS_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

// The browser can measure pixels (a real canvas; jsdom in tests cannot, and then the order of candidates decides).
const canMeasure = () =>
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !/jsdom/i.test(navigator.userAgent) &&
  typeof document?.createElement === 'function';

export function measureArt(url) {
  if (!url || !corsSafe(url) || !canMeasure()) return Promise.resolve(null);
  if (cache.has(url)) return cache.get(url);
  const job = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const done = (value) => resolve(value);
    const timer = setTimeout(() => done({ failed: true }), MEASURE_TIMEOUT_MS * 2);
    img.onerror = () => {
      clearTimeout(timer);
      done({ failed: true });
    };
    img.onload = () => {
      clearTimeout(timer);
      try {
        const W = 64;
        const H = 24;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, W, H);
        const d = ctx.getImageData(0, 0, W, H).data;
        const n = W * H;
        const buckets = new Map();
        const lum = new Float32Array(n);
        let sum = 0;
        let sq = 0;
        let sat = 0;
        for (let i = 0, p = 0; i < d.length; i += 4, p += 1) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
          const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          lum[p] = l;
          sum += l;
          sq += l * l;
          const max = Math.max(r, g, b);
          sat += max ? (max - Math.min(r, g, b)) / max : 0;
        }
        let edges = 0;
        for (let y = 0; y < H; y += 1) for (let x = 0; x < W - 1; x += 1) if (Math.abs(lum[y * W + x] - lum[y * W + x + 1]) > 60) edges += 1;
        const shares = [...buckets.values()].map((v) => v / n).sort((a, b) => b - a);
        done({
          width: img.naturalWidth,
          ratio: img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0,
          top: shares[0] ?? 1,
          colours: shares.filter((s) => s > 0.01).length,
          contrast: Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2)),
          saturation: sat / n,
          edges: edges / (H * (W - 1)),
        });
      } catch {
        done(null); // unreadable pixels: no verdict, the candidate keeps its place in the order
      }
    };
    img.src = thumbFor(url);
  });
  cache.set(url, job);
  return job;
}

// Higher is better; -Infinity means "never use this one".
export function scoreArt(m, { index = 0, url = '' } = {}) {
  if (m === null) return 1 - index * 0.05; // couldn't measure: trust the order
  if (m.failed) return -Infinity;
  if (m.ratio > 3.3 || m.ratio < 1.3) return -Infinity;
  if (!isIgdb(url) && m.width < 1000) return -Infinity; // e.g. Steam's 460px header.jpg
  if (m.top >= 0.9) return -Infinity; // almost one colour: a blank strip or a solid card
  if (m.top >= 0.75 && m.saturation < 0.15 && m.edges > 0.06) return -Infinity; // a title logo on a flat background
  return (
    (isSteamHero(url) ? 0.8 : 0) +
    Math.min(m.contrast / 70, 1) +
    Math.min(m.colours / 20, 1) +
    Math.min(m.edges * 8, 1) -
    Math.max(0, m.top - 0.55) * 2 -
    Math.abs(Math.log(m.ratio / 2.6)) * 0.4 -
    index * 0.05
  );
}

// { url, settled }: the best candidate once they are measured (or MEASURE_TIMEOUT_MS has passed, then the best so far).
// `skip` holds URLs that failed to display, so the next best takes over.
export function useBestArt(candidates, skip) {
  const list = [...new Set(candidates.filter(Boolean))];
  const key = list.join('|');
  const [result, setResult] = useState({ key: null, url: null, settled: false });

  useEffect(() => {
    if (!list.length) return undefined;
    let alive = true;
    const measured = new Array(list.length);
    const pick = (final) => {
      if (!alive) return;
      // The candidate order is the preference (see heroCandidates); measuring only throws out bad pictures.
      // One that wasn't measured in time is trusted.
      const best = list.find((url, index) => measured[index] === undefined || scoreArt(measured[index], { index, url }) > -Infinity);
      setResult({ key, url: best ?? null, settled: final });
    };
    const timer = setTimeout(() => pick(true), MEASURE_TIMEOUT_MS);
    Promise.all(
      list.map((url, i) =>
        measureArt(url).then((m) => {
          measured[i] = m;
        }),
      ),
    ).then(() => {
      clearTimeout(timer);
      pick(true);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // `key` stands for the list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!list.length) return { url: null, settled: true };
  if (!canMeasure()) {
    // tests / no canvas: first candidate that hasn't failed
    return { url: list.find((u) => !skip?.has(u)) ?? null, settled: true };
  }
  if (result.key !== key) return { url: null, settled: false };
  if (result.url && skip?.has(result.url)) return { url: list.find((u) => !skip.has(u) && u !== result.url) ?? null, settled: true };
  return { url: result.url, settled: result.settled };
}

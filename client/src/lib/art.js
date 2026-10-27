// Helpers for the game art that sits behind sections.

// IGDB serves one image in many sizes. A backdrop is shown behind a panel, never full size, so ask for the
// 889x500 variant instead of the 1080p one (a fraction of the bytes); a cover used as a blurred backdrop
// only needs the regular size. Other hosts (Steam CDN) have a single size.
export function artImageUrl(url, kind = 'backdrop') {
  if (typeof url !== 'string' || !url) return null;
  if (kind === 'backdrop') return url.replace('/t_1080p/', '/t_screenshot_big/');
  return url.replace('/t_cover_big_2x/', '/t_cover_big/');
}

// Stable small number for a string, so a section always gets the same art.
export function hashOf(text) {
  let hash = 0;
  for (const ch of String(text)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}

// What shows when there is no art at all: a hue taken from the seed, never flat grey.
export function fallbackGradient(seed) {
  const hue = hashOf(seed || 'gamequest') % 360;
  return `linear-gradient(135deg, hsl(${hue} 45% 22%), hsl(${(hue + 60) % 360} 50% 12%))`;
}

// One game from the pool for a section key: prefers games that have a wide backdrop, and the same
// seed always picks the same game while the pool is unchanged.
export function pickArt(pool, seed) {
  const wide = pool.filter((g) => g.backdrop);
  const list = wide.length ? wide : pool;
  return list.length ? list[hashOf(seed) % list.length] : null;
}

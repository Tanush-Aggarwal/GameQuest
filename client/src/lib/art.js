// Helpers for the game art that sits behind sections.

// IGDB serves one image in many sizes. A backdrop is shown behind a panel, never full size, so ask for the
// 889x500 variant instead of the 1080p one (a fraction of the bytes); a cover used as a blurred backdrop
// only needs the regular size. Other hosts (Steam CDN) have a single size.
export function artImageUrl(url, kind = 'backdrop') {
  if (typeof url !== 'string' || !url) return null;
  // A full-width hero always asks IGDB for its 1080p version, whatever smaller size the catalog stored.
  if (kind === 'hero') return url.replace(/\/t_(screenshot_big|screenshot_med|screenshot_huge|720p|thumb|original)\//, '/t_1080p/');
  if (kind === 'backdrop') return url.replace('/t_1080p/', '/t_screenshot_big/');
  return url.replace('/t_cover_big_2x/', '/t_cover_big/');
}

// Responsive srcSet for hero images. Phones get IGDB's 889px screenshot size, normal screens the 1080p one, and
// large or high-DPI screens (a 1440p monitor, Windows at 125-150% scaling, Retina) the original upload, so a
// full-width banner stays sharp instead of being stretched from 1920px. Heroes span the page minus the sidebar.
export const HERO_SIZES = '(max-width: 640px) 100vw, calc(100vw - 160px)';
export function artImageSrcSet(url, _kind = 'hero') {
  if (typeof url !== 'string' || !url) return null;
  if (url.includes('/t_1080p/')) {
    const mobile = url.replace('/t_1080p/', '/t_screenshot_big/');
    const original = url.replace('/t_1080p/', '/t_original/');
    return {
      srcSet: `${mobile} 889w, ${url} 1920w, ${original} 3840w`,
      sizes: HERO_SIZES,
    };
  }
  // Steam's banner art from the store (hashed folder): its 2x version sits next to it, 3840 wide.
  if (url.includes('store_item_assets') && url.includes('/library_hero.jpg')) {
    return {
      srcSet: `${url} 1920w, ${url.replace('/library_hero.jpg', '/library_hero_2x.jpg')} 3840w`,
      sizes: HERO_SIZES,
    };
  }
  if (url.includes('/t_cover_big/') || url.includes('/t_cover_big_2x/')) {
    const mobile = url.replace('/t_cover_big_2x/', '/t_cover_big/');
    const desktop = url.replace('/t_cover_big/', '/t_cover_big_2x/');
    return {
      srcSet: `${mobile} 264w, ${desktop} 528w`,
      sizes: '(max-width: 640px) 100vw, 528px',
    };
  }
  return null;
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

// Screenshots are stored at 1080p. A gallery thumbnail only needs the medium size; the lightbox shows the full one.
export const screenshotThumb = (url) => (typeof url === 'string' ? url.replace('/t_1080p/', '/t_screenshot_med/') : null);
export const screenshotFull = (url) => (typeof url === 'string' ? url.replace(/\/t_screenshot_(?:med|big|huge)\//, '/t_1080p/') : null);
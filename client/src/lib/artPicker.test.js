import { describe, expect, it } from 'vitest';
import { scoreArt } from './artPicker.js';

// Numbers measured from real catalog art (64x24 thumbnails).
const scene = { width: 1920, ratio: 1920 / 1080, top: 0.2, colours: 21, contrast: 54, saturation: 0.62, edges: 0.06 };
const steamHero = { width: 1920, ratio: 1920 / 620, top: 0.39, colours: 15, contrast: 65, saturation: 0.4, edges: 0.054 };
const titleLogo = { width: 1920, ratio: 1920 / 1080, top: 0.83, colours: 8, contrast: 71, saturation: 0, edges: 0.181 }; // Phasmophobia artwork
const steamHeader = { width: 460, ratio: 460 / 215, top: 0.49, colours: 14, contrast: 54, saturation: 0.55, edges: 0.095 }; // header.jpg
const blankStrip = { width: 1920, ratio: 1920 / 295, top: 1, colours: 1, contrast: 4, saturation: 0.01, edges: 0.001 };
const darkScene = { width: 1920, ratio: 1920 / 620, top: 0.76, colours: 8, contrast: 66, saturation: 0, edges: 0.017 }; // Limbo hero

const HERO = 'https://cdn.cloudflare.steamstatic.com/steam/apps/1/library_hero.jpg';
const HEADER = 'https://cdn.cloudflare.steamstatic.com/steam/apps/1/header.jpg';
const IGDB = 'https://images.igdb.com/igdb/image/upload/t_1080p/x.jpg';

describe('scoreArt', () => {
  it('rejects title logos, blank strips, wrong shapes and Steam’s small header', () => {
    expect(scoreArt(titleLogo, { url: IGDB })).toBe(-Infinity);
    expect(scoreArt(blankStrip, { url: IGDB })).toBe(-Infinity);
    expect(scoreArt(steamHeader, { url: HEADER })).toBe(-Infinity);
    expect(scoreArt({ ...scene, ratio: 1 }, { url: IGDB })).toBe(-Infinity);
    expect(scoreArt({ failed: true }, { url: IGDB })).toBe(-Infinity);
  });

  it('keeps dark, monochrome scenes (they are not logos) and prefers Steam’s banner art', () => {
    expect(scoreArt(darkScene, { url: HERO })).toBeGreaterThan(0);
    expect(scoreArt(steamHero, { url: HERO })).toBeGreaterThan(scoreArt(steamHero, { url: IGDB }));
  });

  it('trusts the order when pixels could not be read', () => {
    expect(scoreArt(null, { index: 0 })).toBeGreaterThan(scoreArt(null, { index: 2 }));
  });
});

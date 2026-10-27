import { useEffect, useMemo, useState } from 'react';
import { listLibrary } from '@/services/libraryApi.js';
import { searchGames } from '@/services/gamesApi.js';
import { pickArt } from '@/lib/art.js';
import { ArtContext } from './artContext.js';

const POOL_SIZE = 40;
const slim = (g) => ({ id: g.id, slug: g.slug, title: g.title, cover: g.cover ?? null, backdrop: g.backdrop ?? null });

// Loads, once for the whole signed-in app, the games whose art goes behind sections: the user's own library
// first, then the most popular games in the catalog. It never blocks the page and never shows an error: if
// either source fails the other still fills the pool, and with an empty pool sections use a gradient.
export function ArtProvider({ children }) {
  const [state, setState] = useState({ pool: [], status: 'loading' });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [library, catalog] = await Promise.allSettled([listLibrary({ limit: 24 }), searchGames({ limit: 24 })]);
      const mine = library.status === 'fulfilled' ? (library.value?.items ?? []).map((e) => e.game) : [];
      const popular = catalog.status === 'fulfilled' ? (catalog.value?.items ?? []) : [];
      const seen = new Set();
      const pool = [...mine, ...popular]
        .filter((g) => g?.id && (g.backdrop || g.cover) && !seen.has(g.id) && seen.add(g.id))
        .slice(0, POOL_SIZE)
        .map(slim);
      if (alive) setState({ pool, status: 'ready' });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo(() => ({ ...state, artFor: (seed) => pickArt(state.pool, seed) }), [state]);
  return <ArtContext.Provider value={value}>{children}</ArtContext.Provider>;
}

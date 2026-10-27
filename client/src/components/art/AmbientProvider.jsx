import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AmbientContext } from './ambientContext.js';

export const PREVIEW_DELAY_MS = 250;

// Holds the ambient game. Previewing (hover/focus on a card) and clearing it again are debounced together by one
// timer: sweeping the pointer across a row of covers only settles on the card it rests on for 250 ms, so the
// background does not flicker through every card on the way.
export function AmbientProvider({ children, delay = PREVIEW_DELAY_MS }) {
  const [base, setBaseState] = useState(null);
  const { pathname } = useLocation();
  // A preview belongs to the page it was made on: a click or Enter on a card unmounts it before blur/mouseleave
  // fire, so after any navigation the old preview (or a timer still pending) simply no longer counts.
  const [previewState, setPreviewState] = useState({ game: null, path: null });
  const preview = previewState.path === pathname ? previewState.game : null;
  const timer = useRef(null);

  const schedule = useCallback(
    (game) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPreviewState({ game, path: pathname }), delay);
    },
    [delay, pathname],
  );
  const previewGame = useCallback((game) => schedule(game ?? null), [schedule]);
  const clearPreview = useCallback(() => schedule(null), [schedule]);
  const setBase = useCallback((game) => setBaseState(game ?? null), []);
  // Only removes game if it is still the base: a page that is leaving must not blank the page that just arrived.
  const clearBase = useCallback((game) => setBaseState((prev) => (prev === game ? null : prev)), []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const value = useMemo(
    () => ({ base, preview, current: preview ?? base, setBase, clearBase, previewGame, clearPreview }),
    [base, preview, setBase, clearBase, previewGame, clearPreview],
  );
  return <AmbientContext.Provider value={value}>{children}</AmbientContext.Provider>;
}

import { createContext, useContext } from 'react';

// The game whose art tints the whole app. `base` is what a page says it is about (Home: the game you last played);
// `preview` is the game under the pointer or keyboard focus. Without a provider (tests) every call is a no-op.
export const AmbientContext = createContext({
  base: null,
  preview: null,
  current: null,
  setBase: () => {},
  clearBase: () => {},
  previewGame: () => {},
  clearPreview: () => {},
});

export const useAmbient = () => useContext(AmbientContext);

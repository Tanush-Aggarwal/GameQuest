import { useContext } from 'react';
import { ArtContext } from './artContext.js';

// { pool, status, artFor(seed) }: the games whose art can go behind sections, and a stable pick per section key.
export function useArt() {
  return useContext(ArtContext);
}

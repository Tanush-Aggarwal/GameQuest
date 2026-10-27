import { createContext } from 'react';

// Without a provider (tests, isolated components) there is simply no pool: panels fall back to a gradient.
export const ArtContext = createContext({ pool: [], status: 'idle', artFor: () => null });

import { createContext } from 'react';

// Without a provider (tests, isolated components) there is simply no pool: panels fall back to a gradient and
// empty states show no suggestions.
export const ArtContext = createContext({ pool: [], suggestions: [], status: 'idle', artFor: () => null });

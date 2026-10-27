import { useCallback, useState } from 'react';
import { useAsync } from '@/hooks/useAsync.js';
import { listLibrary } from '@/services/libraryApi.js';

// The signed-in user's library entry for one game (null when it is not in the library), with `setEntry` for changes
// made on the page. A local change is only valid for the data it was derived from, so a reload drops it.
export function useLibraryEntry(gameId) {
  const load = useCallback(async (signal) => (await listLibrary({ gameId, limit: 1 }, { signal })).items[0] ?? null, [gameId]);
  const { status, data, error, retry } = useAsync(load);
  const [local, setLocal] = useState({ source: undefined, entry: null });
  const entry = local.source === data ? local.entry : data;
  const setEntry = (next) => setLocal({ source: data, entry: next });
  return { status, entry, setEntry, error, retry };
}
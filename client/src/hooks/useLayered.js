import { useCallback, useState } from 'react';

// Local edits (optimistic changes, extra pages) layered over loaded data. They are discarded
// automatically when the data is reloaded, so there is no effect that copies props into state.
// `update(next)` accepts a value or a function of the current view.
export function useLayered(data) {
  const [local, setLocal] = useState({ source: null, value: null });
  const view = data && local.source === data ? local.value : data;
  const update = useCallback(
    (next) => setLocal({ source: data, value: typeof next === 'function' ? next(view) : next }),
    [data, view],
  );
  return [view, update];
}

import { useCallback, useEffect, useState } from 'react';
import { getErrorInfo } from '@/services/api.js';

// Runs `load(signal)` whenever `load` changes (wrap it in useCallback) or retry() is called.
// Status is derived, never set synchronously in the effect: a result only counts if it belongs
// to the current load function and attempt, so stale responses are ignored.
export function useAsync(load) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ load: null, attempt: -1, data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => setResult({ load, attempt, data, error: null }),
      (err) => {
        if (controller.signal.aborted) return;
        setResult({ load, attempt, data: null, error: { ...getErrorInfo(err), status: err.response?.status } });
      },
    );
    return () => controller.abort();
  }, [load, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = result.load === load && result.attempt === attempt;
  const status = !current ? 'loading' : result.error ? 'error' : 'success';
  return { status, data: current ? result.data : null, error: current ? result.error : null, retry };
}

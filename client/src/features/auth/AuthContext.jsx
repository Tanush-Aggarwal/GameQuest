import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import * as authApi from '@/services/authApi.js';
import { setSessionExpiredHandler } from '@/services/api.js';

// status: 'loading' (checking session) | 'authenticated' | 'anonymous' | 'error' (server unreachable)
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  const load = useCallback(async () => {
    try {
      const restored = await authApi.restoreSession();
      setUser(restored);
      setStatus(restored ? 'authenticated' : 'anonymous');
    } catch {
      setStatus('error');
    }
  }, []);

  const retry = useCallback(() => {
    setStatus('loading');
    return load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    authApi
      .restoreSession()
      .then((restored) => {
        if (cancelled) return;
        setUser(restored);
        setStatus(restored ? 'authenticated' : 'anonymous');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setStatus('anonymous');
      // Fixed id: several requests can fail together but the user sees one toast.
      toast.error('Your session expired. Please log in again.', { id: 'session-expired' });
    });
    return () => setSessionExpiredHandler(() => {});
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      retry,
      async login(payload) {
        const u = await authApi.login(payload);
        setUser(u);
        setStatus('authenticated');
      },
      async register(payload) {
        const u = await authApi.register(payload);
        setUser(u);
        setStatus('authenticated');
      },
      async logout() {
        try {
          await authApi.logout();
        } finally {
          // Even if the call failed the user asked to leave; the cookies expire on their own.
          setUser(null);
          setStatus('anonymous');
        }
      },
    }),
    [user, status, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

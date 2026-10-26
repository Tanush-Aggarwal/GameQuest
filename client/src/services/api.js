import axios from 'axios';

export const api = axios.create({
  // Production builds call the API on their own origin (/api is rewritten to Render by vercel.json),
  // so auth cookies are first-party. VITE_API_URL overrides this for any other setup.
  baseURL: import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '/api/v1' : 'http://localhost:4000/api/v1'),
  withCredentials: true,
});

let refreshing = null;
let onSessionExpired = () => {};

export function setSessionExpiredHandler(fn) {
  onSessionExpired = fn;
}

// On a 401 from a normal call, refresh the session once (shared by concurrent calls) and retry.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error;
    const isAuthCall = (config?.url ?? '').startsWith('/auth/');
    if (response?.status === 401 && config && !config._retried && !isAuthCall) {
      config._retried = true;
      try {
        refreshing ??= api.post('/auth/refresh').finally(() => {
          refreshing = null;
        });
        await refreshing;
        return api(config);
      } catch (refreshError) {
        // Only a rejected refresh token ends the session; a network blip or 5xx does not.
        if (refreshError.response?.status === 401) onSessionExpired();
      }
    }
    return Promise.reject(error);
  },
);

// Normalises any failure to the API's { code, message, details } shape.
export function getErrorInfo(error) {
  const apiError = error?.response?.data?.error;
  if (apiError) return apiError;
  if (error?.code === 'ERR_NETWORK' || !error?.response) {
    return { code: 'NETWORK_ERROR', message: 'Cannot reach the server. Check your connection and try again.' };
  }
  return { code: 'UNKNOWN', message: 'Something went wrong. Please try again.' };
}

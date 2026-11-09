import { useContext } from 'react';
import { AuthContext } from '@/features/auth/AuthContext.jsx';

// True for an administrator. Only decides what the interface offers: the server checks the role on every admin call.
export function useIsAdmin() {
  return useContext(AuthContext)?.user?.role === 'admin';
}

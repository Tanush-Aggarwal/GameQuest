import { Suspense, useMemo } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/features/auth/AuthContext.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { routes } from './routes.jsx';

export default function App() {
  const router = useMemo(() => createBrowserRouter(routes), []);
  return (
    <AuthProvider>
      <Suspense fallback={<Skeleton className="m-6 h-32" />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          },
        }}
      />
    </AuthProvider>
  );
}

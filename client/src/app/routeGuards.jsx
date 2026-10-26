import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth.js';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ErrorState } from '@/components/ui/states.jsx';

function SessionCheck({ status, retry }) {
  if (status === 'error') {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <ErrorState message="We couldn't check your session. The server may be unreachable." onRetry={retry} />
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-16" role="status" aria-label="Checking your session">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function ProtectedRoute() {
  const { status, retry } = useAuth();
  const location = useLocation();
  if (status === 'loading' || status === 'error') return <SessionCheck status={status} retry={retry} />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { status, retry } = useAuth();
  const location = useLocation();
  if (status === 'loading' || status === 'error') return <SessionCheck status={status} retry={retry} />;
  if (status === 'authenticated') return <Navigate to={location.state?.from ?? '/'} replace />;
  return <Outlet />;
}

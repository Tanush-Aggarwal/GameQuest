import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import { getSteamStatus, syncSteam } from '@/services/steamApi.js';
import { formatDateTime } from '@/lib/time.js';

// "Sync now" and the time of the last sync, for the Library header. Not linked: a link to where Steam is linked.
// Its own section: a failure here never affects the games list. `onSynced` lets the page reload its list.
export function SteamSyncControl({ onSynced }) {
  const load = useCallback((signal) => getSteamStatus({ signal }), []);
  const { status, data, retry } = useAsync(load);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(null);

  async function sync() {
    setSyncing(true);
    try {
      const result = await syncSteam();
      setJustSynced({ at: new Date().toISOString() });
      toast.success(`Steam synced: ${result.added} added, ${result.updated} updated`);
      onSynced?.(result);
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setSyncing(false);
    }
  }

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading Steam status">
        <Skeleton className="h-11 w-36" />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div role="alert" className="flex items-center gap-2 text-xs text-text-muted">
        Steam status unavailable.
        <Button variant="secondary" onClick={retry}>
          Retry
        </Button>
      </div>
    );
  }
  if (!data?.linked) {
    return (
      <Link to="/profile" className={buttonVariants({ variant: 'secondary' })}>
        <Link2 className="h-4 w-4" aria-hidden="true" /> Link Steam
      </Link>
    );
  }
  const last = justSynced ?? data.lastSync;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-xs text-text-muted">
        {last ? (
          <>
            Steam synced <time dateTime={new Date(last.at).toISOString()}>{formatDateTime(last.at)}</time>
          </>
        ) : (
          'Steam not synced yet'
        )}
      </p>
      <Button variant="secondary" onClick={sync} disabled={syncing} aria-busy={syncing}>
        <RefreshCw className={`h-4 w-4 ${syncing ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
        {syncing ? 'Syncing…' : 'Sync now'}
      </Button>
    </div>
  );
}
import { useCallback, useId, useState } from 'react';
import { ExternalLink, Gamepad2, Info, Link2, RefreshCw, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { STEAM_PRIVACY_URL } from '@gamequest/shared';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useLayered } from '@/hooks/useLayered.js';
import { getErrorInfo } from '@/services/api.js';
import { getSteamStatus, linkSteam, syncSteam, unlinkSteam } from '@/services/steamApi.js';
import { formatPlaytime } from '@/lib/steam.js';
import { formatDateTime } from '@/lib/time.js';

const VISIBILITY_LABEL = { public: 'Public profile', friends: 'Friends-only profile', private: 'Private profile' };

function PrivacyNote() {
  return (
    <p className="flex gap-2 rounded-control border border-border bg-bg p-3 text-xs text-text-muted">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
      <span>
        GameQuest can only read your games if <strong className="text-text">Game details</strong> is set to{' '}
        <strong className="text-text">Public</strong> in your Steam privacy settings.{' '}
        <a
          href={STEAM_PRIVACY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-accent underline underline-offset-2"
        >
          Open Steam privacy settings <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </span>
    </p>
  );
}

function LinkForm({ onLinked }) {
  const id = useId();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      const steam = await linkSteam(input.trim());
      toast.success(`Linked Steam account ${steam.personaName || steam.steamId}`);
      onLinked(steam);
    } catch (err) {
      setProblem(getErrorInfo(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          SteamID64 or profile URL
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={id}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="76561198… or steamcommunity.com/id/yourname"
            aria-invalid={Boolean(problem)}
            aria-describedby={problem ? `${id}-error` : undefined}
            autoComplete="off"
          />
          <Button type="submit" disabled={busy || !input.trim()} className="sm:shrink-0">
            <Link2 className="h-4 w-4" aria-hidden="true" />
            {busy ? 'Linking…' : 'Link Steam'}
          </Button>
        </div>
        {problem && (
          <p id={`${id}-error`} role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
      </div>
      <PrivacyNote />
    </form>
  );
}

function LinkedAccount({ steam, onUnlinked, onSynced }) {
  const [confirming, setConfirming] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [problem, setProblem] = useState('');

  async function sync() {
    setSyncing(true);
    setProblem('');
    try {
      const data = await syncSteam();
      setResult(data);
      onSynced({ at: new Date().toISOString(), added: data.added, updated: data.updated, unmatchedCount: data.unmatched.length });
      toast.success(`Steam synced: ${data.added} added, ${data.updated} updated`);
    } catch (err) {
      setProblem(getErrorInfo(err).message);
    } finally {
      setSyncing(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      await unlinkSteam();
      toast.success('Steam account unlinked');
      onUnlinked();
    } catch (err) {
      toast.error(getErrorInfo(err).message);
      setBusy(false);
    }
  }

  const initial = (steam.personaName || 'S').charAt(0).toUpperCase();
  const last = steam.lastSync;
  const isDefaultPlaceholder = !steam.avatar || steam.avatar.includes('fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb');
  const showImage = Boolean(steam.avatar) && !isDefaultPlaceholder && !imgError;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5 min-w-0">
          {showImage ? (
            <img
              src={steam.avatar}
              alt=""
              onError={() => setImgError(true)}
              className="h-14 w-14 rounded-full border border-border object-cover shrink-0"
              loading="lazy"
            />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border bg-[#16181D] font-heading text-lg font-bold text-white shadow-inner">
              {initial}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold">{steam.personaName || 'Steam account'}</p>
              {steam.profileUrl && (
                <a
                  href={steam.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-accent underline underline-offset-2"
                >
                  View on Steam <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </div>
            <p className="text-xs text-text-muted tabular-nums">
              SteamID64 {steam.steamId} · {VISIBILITY_LABEL[steam.visibility] ?? VISIBILITY_LABEL.private}
            </p>
            {/* Last synced on its own line under the name */}
            <p className="mt-1 text-xs text-text-muted">
              {last ? (
                <>
                  Last synced <time dateTime={new Date(last.at).toISOString()}>{formatDateTime(last.at)}</time>
                  {' · '}
                  <span className="tabular-nums">
                    {last.added} added, {last.updated} updated, {last.unmatchedCount} not matched
                  </span>
                </>
              ) : (
                'Not synced yet.'
              )}
            </p>
          </div>
        </div>

        {/* Sync now / Unlink side by side */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button onClick={sync} disabled={syncing} aria-busy={syncing} className="gap-1.5 h-9 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>

          {confirming ? (
            <div role="group" aria-label="Confirm unlink" className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-muted">Your games stay in your library.</span>
              <Button variant="secondary" onClick={unlink} disabled={busy} className="h-9 text-xs">
                {busy ? 'Unlinking…' : 'Yes, unlink'}
              </Button>
              <Button
                variant="ghost"
                autoFocus
                onClick={() => {
                  setConfirming(false);
                  setCancelled(true);
                }}
                disabled={busy}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="secondary" autoFocus={cancelled} onClick={() => setConfirming(true)} className="gap-1.5 h-9 text-xs">
              <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
              Unlink
            </Button>
          )}
        </div>
      </div>

      {steam.visibility !== 'public' && (
        <p role="status" className="text-xs text-text-muted">
          Your Steam profile is not public, so your games may not be readable.
        </p>
      )}

      {syncing && (
        <p role="status" className="text-xs text-text-muted">
          Reading your Steam library and achievements. A big library can take a few minutes; you can leave this page open.
        </p>
      )}
      {problem && (
        <p role="alert" className="rounded-control border border-border bg-bg p-3 text-sm text-danger">
          {problem}
        </p>
      )}
      {result && !syncing && (
        <div role="status" className="flex flex-col gap-2 rounded-control border border-border bg-bg p-3 text-sm">
          <p>
            <span className="font-semibold tabular-nums">{result.added}</span> added,{' '}
            <span className="font-semibold tabular-nums">{result.updated}</span> updated,{' '}
            <span className="font-semibold tabular-nums">{result.unmatched.length}</span> not matched.
          </p>
          {result.warnings?.map((w) => (
            <p key={w} className="text-xs text-text-muted">
              {w}
            </p>
          ))}
          {result.unmatched.length > 0 && (
            <details className="text-xs text-text-muted">
              <summary className="cursor-pointer font-medium text-text">Which games were not matched?</summary>
              <p className="mt-2">Tools, soundtracks, DLC and games missing from the catalog are listed here but not added to your library.</p>
              <ul className="mt-2 max-h-48 overflow-y-auto">
                {result.unmatched.map((u) => (
                  <li key={u.appid} className="flex justify-between gap-3 py-0.5">
                    <span className="truncate">{u.name || `App ${u.appid}`}</span>
                    <span className="shrink-0 tabular-nums">{formatPlaytime(u.playtimeMin)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <PrivacyNote />
    </div>
  );
}

export function SteamLinkCard() {
  const load = useCallback((signal) => getSteamStatus({ signal }), []);
  const { status, data, error, retry } = useAsync(load);
  const [steam, setSteam] = useLayered(data);

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading Steam link" className="w-full">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;

  return (
    <div className="flex w-full flex-col gap-4 rounded-card border border-border/60 bg-bg/70 p-5">
      {steam.linked ? (
        <LinkedAccount
          steam={steam}
          onUnlinked={() => setSteam({ linked: false })}
          onSynced={(lastSync) => setSteam((current) => ({ ...current, lastSync }))}
        />
      ) : (
        <>
          <p className="text-sm text-text-muted">
            Link your Steam account to bring your owned games, playtime and achievements into your library.
          </p>
          <LinkForm onLinked={setSteam} />
        </>
      )}
    </div>
  );
}

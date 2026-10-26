import { useCallback, useId, useState } from 'react';
import { ExternalLink, Gamepad2, Info, Link2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { STEAM_PRIVACY_URL } from '@gamequest/shared';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useLayered } from '@/hooks/useLayered.js';
import { getErrorInfo } from '@/services/api.js';
import { getSteamStatus, linkSteam, unlinkSteam } from '@/services/steamApi.js';

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

function LinkedAccount({ steam, onUnlinked }) {
  const [confirming, setConfirming] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        {steam.avatar ? (
          <img src={steam.avatar} alt="" className="h-14 w-14 rounded-control border border-border object-cover" loading="lazy" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-control border border-border bg-surface-raised">
            <Gamepad2 className="h-6 w-6 text-text-muted" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{steam.personaName || 'Steam account'}</p>
          <p className="text-xs text-text-muted tabular-nums">
            SteamID64 {steam.steamId} · {VISIBILITY_LABEL[steam.visibility] ?? VISIBILITY_LABEL.private}
          </p>
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
        {confirming ? (
          <div role="group" aria-label="Confirm unlink" className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted">Your games stay in your library.</span>
            <Button variant="secondary" onClick={unlink} disabled={busy}>
              {busy ? 'Unlinking…' : 'Yes, unlink'}
            </Button>
            {/* The safe choice takes focus, so the dialog-less confirm doesn't drop keyboard users */}
            <Button
              variant="ghost"
              autoFocus
              onClick={() => {
                setConfirming(false);
                setCancelled(true);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="secondary" autoFocus={cancelled} onClick={() => setConfirming(true)}>
            <Unlink className="h-4 w-4" aria-hidden="true" />
            Unlink
          </Button>
        )}
      </div>
      {steam.visibility !== 'public' && (
        <p role="status" className="text-xs text-text-muted">
          Your Steam profile is not public, so your games may not be readable.
        </p>
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
      <div role="status" aria-label="Loading Steam link" className="max-w-2xl">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;

  return (
    <div className="flex max-w-2xl flex-col gap-4 rounded-card border border-border bg-surface p-6">
      {steam.linked ? (
        <LinkedAccount steam={steam} onUnlinked={() => setSteam({ linked: false })} />
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

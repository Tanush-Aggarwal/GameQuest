import { Clock, Gamepad2, Trophy } from 'lucide-react';
import { ProgressBar } from '@/components/ui/ProgressBar.jsx';
import { achievementPercent, formatPlaytime, steamOwnership } from '@/lib/steam.js';
import { formatDateTime } from '@/lib/time.js';

// Compact Steam line for library cards: platform label (icon + text), playtime, achievement %.
export function SteamBadge({ entry }) {
  const steam = steamOwnership(entry);
  if (!steam) return null;
  const pct = achievementPercent(entry.achievements);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Steam">
      <span className="inline-flex items-center gap-1 rounded-control border border-border px-2 py-0.5 text-xs text-text-muted">
        <Gamepad2 className="h-3 w-3" aria-hidden="true" /> Steam
      </span>
      {steam.playtimeMin > 0 && (
        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-text-muted">
          <Clock className="h-3 w-3" aria-hidden="true" /> {formatPlaytime(steam.playtimeMin)}
        </span>
      )}
      {pct !== null && (
        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-text-muted">
          <Trophy className="h-3 w-3 text-reward" aria-hidden="true" /> {pct}%
          <span className="sr-only">
            {' '}
            achievements unlocked ({entry.achievements.unlocked} of {entry.achievements.total})
          </span>
        </span>
      )}
    </div>
  );
}

// Larger version for the entry page, with an achievement bar and the last sync time.
export function SteamDetails({ entry }) {
  const steam = steamOwnership(entry);
  if (!steam) return null;
  const { achievements } = entry;
  const pct = achievementPercent(achievements);
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Gamepad2 className="h-4 w-4" aria-hidden="true" /> Steam
        </span>
        <span className="text-xs tabular-nums text-text-muted">
          {steam.playtimeMin > 0 ? `${formatPlaytime(steam.playtimeMin)} played` : 'Not played yet'}
        </span>
      </div>
      {pct !== null ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="inline-flex items-center gap-1">
              <Trophy className="h-3 w-3 text-reward" aria-hidden="true" /> Achievements
            </span>
            <span className="tabular-nums">
              {achievements.unlocked} / {achievements.total} ({pct}%)
            </span>
          </div>
          <ProgressBar value={pct} tone="reward" label="Achievements unlocked" />
        </div>
      ) : (
        <p className="text-xs text-text-muted">No achievements for this game.</p>
      )}
      {steam.lastSyncedAt && (
        <p className="text-xs text-text-muted">
          Synced <time dateTime={new Date(steam.lastSyncedAt).toISOString()}>{formatDateTime(steam.lastSyncedAt)}</time>
        </p>
      )}
    </div>
  );
}

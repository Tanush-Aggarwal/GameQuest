import { useState } from 'react';
import { Lock, Trophy } from 'lucide-react';
import { ProgressBar } from '@/components/ui/ProgressBar.jsx';
import { trophySummary } from '@/lib/trophies.js';

// Trophies & milestones, worked out from the profile's real stats (see lib/trophies.js).
// Earned tracks come first; "Show all" reveals the ones not started yet.
export function TrophyShelf({ stats, isSelf = false }) {
  const [showAll, setShowAll] = useState(false);
  if (!stats) return null;
  const { states, earned, total } = trophySummary(stats);
  const sorted = [...states].sort((a, b) => b.tier - a.tier || b.pct - a.pct);
  const started = sorted.filter((s) => s.tier >= 0);
  const visible = showAll ? sorted : started.length ? started : sorted.slice(0, 3);

  return (
    <section aria-labelledby="trophies-title" className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="trophies-title" className="flex items-center gap-2 font-heading text-lg font-semibold">
            <Trophy className="h-4 w-4 text-[var(--reward)]" aria-hidden="true" /> Trophies &amp; Milestones
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">{earned} of {total} tiers earned</p>
        </div>
        <ProgressBar value={(earned / total) * 100} tone="reward" label="Trophy tiers earned" className="mt-2 w-20" />
      </div>

      <ul className="flex flex-col gap-2">
        {visible.map(({ track, value, tier, maxed, next, pct, title, tierInfo, nextTier }) => {
          const Icon = track.icon;
          const color = tierInfo?.color ?? 'var(--text-muted)';
          return (
            <li key={track.key} className={`flex items-center gap-3 rounded-card border border-border/60 p-3 ${tier < 0 ? 'bg-bg/40' : 'bg-bg/70'}`}>
              <span
                className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
                style={{ borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                {tier < 0 && <Lock className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-surface p-0.5 text-text-muted" aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold" style={tier >= 0 ? { color } : undefined}>{title}</p>
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{tierInfo ? tierInfo.name : 'Locked'}</span>
                </div>
                <ProgressBar value={pct} tone="reward" className="my-1.5 !h-1" />
                <p className="truncate text-xs tabular-nums text-text-muted">
                  {maxed
                    ? `${value.toLocaleString()} ${track.unit} · every tier earned`
                    : `${value.toLocaleString()} / ${next.toLocaleString()} ${track.unit} for ${nextTier.name}`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {sorted.length > visible.length || showAll ? (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="self-start text-xs font-semibold text-text-muted underline-offset-4 hover:text-text hover:underline">
          {showAll ? 'Show earned only' : `Show all ${sorted.length} tracks`}
        </button>
      ) : null}
      {isSelf && started.length === 0 && <p className="text-xs text-text-muted">Add games, finish them and write reviews to start earning trophies.</p>}
    </section>
  );
}

import * as Dialog from '@radix-ui/react-dialog';
import { HelpCircle, X } from 'lucide-react';
import { ProgressBar } from '@/components/ui/ProgressBar.jsx';
import { XP_RULES, levelProgress, xpForLevel } from '@/lib/levels.js';
import { cn } from '@/lib/utils.js';

// "How levels work": the XP rules, the player's own numbers and the level thresholds, in one dialog.
// `breakdown` ({ hours, completed, reviews }) is optional; without it the dialog shows only the rules.
export function LevelGuide({ level = 1, xp = 0, breakdown, onDark = false, className }) {
  const { next, toGo, pct } = levelProgress({ xp, level });
  const rows = Array.from({ length: 10 }, (_, i) => i + Math.max(1, level - 3));

  return (
    <Dialog.Root>
      <Dialog.Trigger
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2',
          onDark ? 'text-white/70 hover:bg-white/10 hover:text-white focus-visible:ring-white/60' : 'text-text-muted hover:bg-surface-raised hover:text-text focus-visible:ring-text',
          className,
        )}
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" /> How levels work
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card border border-border bg-surface p-6 text-text shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-heading text-xl font-bold">How levels work</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-text-muted">
                You earn XP only from things you actually do. XP adds up over time and never goes down.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-full p-1.5 text-text-muted hover:bg-surface-raised hover:text-text" aria-label="Close">
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="mt-5 rounded-card border border-border bg-bg/60 p-4">
            <div className="flex items-baseline justify-between">
              <p className="font-heading text-lg font-bold">Level {level}</p>
              <p className="text-sm tabular-nums text-text-muted">{xp.toLocaleString()} XP</p>
            </div>
            <ProgressBar value={pct} tone="reward" label={`Progress to level ${level + 1}`} className="my-2" />
            <p className="text-xs text-text-muted">{toGo.toLocaleString()} XP to level {level + 1} (needs {next.toLocaleString()} XP)</p>
          </div>

          <h3 className="mt-5 text-sm font-semibold">Where XP comes from</h3>
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs text-text-muted">
              <tr><th className="py-1 font-medium">Action</th><th className="py-1 text-right font-medium">XP each</th>{breakdown && <th className="py-1 text-right font-medium">You</th>}</tr>
            </thead>
            <tbody>
              {XP_RULES.map((rule) => (
                <tr key={rule.key} className="border-t border-border/60 align-top">
                  <td className="py-2 pr-2">
                    <p className="font-medium">{rule.label}</p>
                    <p className="text-xs text-text-muted">{rule.note}</p>
                  </td>
                  <td className="py-2 text-right tabular-nums">+{rule.xp}</td>
                  {breakdown && (
                    <td className="py-2 pl-2 text-right tabular-nums text-text-muted">
                      {(breakdown[rule.key] ?? 0).toLocaleString()} × {rule.xp} = <span className="font-semibold text-text">{((breakdown[rule.key] ?? 0) * rule.xp).toLocaleString()}</span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="mt-5 text-sm font-semibold">XP needed for each level</h3>
          <p className="mt-1 text-xs text-text-muted">
            Level <em>n</em> starts at 100 × (<em>n</em> − 1)² XP, so each level takes a little longer than the last.
          </p>
          <ul className="mt-2 grid grid-cols-5 gap-1.5 text-center text-xs">
            {rows.map((n) => (
              <li key={n} className={cn('rounded-control border px-1 py-1.5 tabular-nums', n === level ? 'border-text bg-text text-bg' : 'border-border text-text-muted')}>
                <span className="block font-semibold">Lv {n}</span>
                {xpForLevel(n).toLocaleString()}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-text-muted">Trophies are separate: they’re milestones on your public profile, and earning them doesn’t add XP.</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

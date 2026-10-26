import { LIBRARY_TRANSITIONS } from '@gamequest/shared';
import { STATUS_META } from '@/lib/libraryStatus.js';

// Offers only the moves the server's state machine allows from the current status.
export function MoveStatusSelect({ entry, onMove, disabled }) {
  const options = LIBRARY_TRANSITIONS[entry.status];
  return (
    <select
      aria-label={`Move ${entry.game?.title ?? 'game'} to another status`}
      className="min-h-11 w-full rounded-control border border-border bg-surface-raised px-2 text-sm text-text"
      value=""
      disabled={disabled}
      onChange={(e) => e.target.value && onMove(entry, e.target.value)}
    >
      <option value="">Move to…</option>
      {options.map((s) => (
        <option key={s} value={s}>
          {STATUS_META[s].label}
        </option>
      ))}
    </select>
  );
}

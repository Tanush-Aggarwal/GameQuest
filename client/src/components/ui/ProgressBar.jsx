// The app's one progress bar. `value` is 0-100; `tone="reward"` is for achievements; `onDark` sits over art.
export const progressLevel = (value) => (value >= 67 ? 'high' : value >= 34 ? 'mid' : 'low');

export function ProgressBar({ value = 0, tone, onDark = false, className = '', label, ...rest }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={`gq-progress ${onDark ? 'gq-progress--on-dark' : ''} ${className}`}
      {...(label
        ? { role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct }
        : { 'aria-hidden': true })}
      {...rest}
    >
      <div className="gq-progress__fill" data-level={tone ?? progressLevel(pct)} style={{ '--p': `${pct}%`, width: `${pct}%` }} />
    </div>
  );
}

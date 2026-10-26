// Times are stored in UTC and formatted here, in the viewer's own timezone and locale.

const UNITS = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

// "5 minutes ago" for recent times, a plain local date once it is older than a week.
export function timeAgo(value, now = Date.now()) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diff = now - then;
  if (diff < 60_000) return 'just now';
  if (diff > 7 * 86_400_000) return new Date(then).toLocaleDateString(undefined, { dateStyle: 'medium' });
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, ms] of UNITS) {
    if (diff >= ms) return rtf.format(-Math.floor(diff / ms), unit);
  }
  return 'just now';
}

export const formatDateTime = (value) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

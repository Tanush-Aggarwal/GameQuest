// Sessions are stored in UTC; everything shown to the viewer is formatted in their own timezone.

export const viewerTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const dayHeading = (d) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

// Groups sessions by the viewer's local calendar day, keeping the (already sorted) order.
export function groupByLocalDay(sessions) {
  const groups = [];
  for (const session of sessions) {
    const d = new Date(session.startsAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) last.sessions.push(session);
    else groups.push({ key, heading: dayHeading(d), sessions: [session] });
  }
  return groups;
}

const timeOnly = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function timeRange(session) {
  return `${timeOnly(new Date(session.startsAt))} – ${timeOnly(new Date(session.endsAt))}`;
}

// "Tue, 28 Oct, 6:30 PM – 8:30 PM IST" — date, local time range and the viewer's timezone abbreviation.
export function fullWhen(session) {
  const start = new Date(session.startsAt);
  const zone = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(start).find((p) => p.type === 'timeZoneName')?.value;
  const date = start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return `${date}, ${timeRange(session)}${zone ? ` ${zone}` : ''}`;
}

const pad = (n) => String(n).padStart(2, '0');

// <input type="datetime-local"> works in local time: ISO (UTC) → "YYYY-MM-DDTHH:mm" and back.
export function toLocalInput(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

// The next full hour, at least 30 minutes away.
export function defaultStart(now = new Date()) {
  const d = new Date(now.getTime() + 30 * 60_000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d.toISOString());
}

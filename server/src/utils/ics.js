// Builds an RFC 5545 calendar file for one session. Times are UTC ("Z"), lines end in CRLF and are
// folded at 75 octets, and text values are escaped so a title or note can't inject extra properties.

const pad = (n) => String(n).padStart(2, '0');

export function formatUtc(value) {
  const d = new Date(value);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export function escapeText(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// Folds a content line to at most 75 octets, continuing with a leading space; never splits a character.
export function foldLine(line) {
  const out = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > limit) {
      out.push(current);
      current = ' ';
      bytes = 1;
      limit = 75;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n');
}

export function buildIcs({ session, host, game, now = new Date(), prodId = '-//GameQuest//Sessions//EN' }) {
  const uid = `${session._id}@gamequest`;
  const summary = session.title || `Playing ${game?.title ?? 'a game'}`;
  const description = [
    game?.title && `Game: ${game.title}`,
    session.platform && `Platform: ${session.platform}`,
    host?.username && `Host: ${host.username}`,
    session.discordInviteUrl && `Discord: ${session.discordInviteUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
  const cancelled = session.status === 'cancelled';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatUtc(session.startsAt)}`,
    `DTEND:${formatUtc(session.endsAt)}`,
    `SUMMARY:${escapeText(summary)}`,
    description && `DESCRIPTION:${escapeText(description)}`,
    session.discordInviteUrl && `URL:${session.discordInviteUrl}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

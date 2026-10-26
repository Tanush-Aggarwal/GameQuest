import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { timeRange } from '@/lib/sessionTime.js';
import { ResponseBadge } from './responses.jsx';

export function SessionRow({ session }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-3">
      <div className="flex min-w-0 flex-col gap-1">
        <Link to={`/sessions/${session.id}`} className="line-clamp-1 font-semibold hover:underline">
          {session.title}
        </Link>
        <p className="text-sm text-text-muted">
          <time dateTime={session.startsAt}>{timeRange(session)}</time>
          {session.game && <> · {session.game.title}</>}
          {session.platform && <> · {session.platform}</>}
        </p>
        <p className="text-xs text-text-muted">Hosted by {session.isHost ? 'you' : session.host?.username}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <ResponseBadge response={session.myResponse} />
        <span className="inline-flex items-center gap-1 text-xs text-text-muted tabular-nums">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {session.counts.going}/{session.maxPlayers} going
        </span>
      </div>
    </li>
  );
}

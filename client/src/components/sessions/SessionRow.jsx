import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { ArtPanel } from '@/components/art/ArtPanel.jsx';
import { CoverImage } from '@/components/games/GameCard.jsx';
import { timeRange } from '@/lib/sessionTime.js';
import { ResponseBadge } from './responses.jsx';

// One planned session on the art of its game, with the game's cover beside the details.
export function SessionRow({ session }) {
  return (
    <ArtPanel as="li" art={session.game} seed={session.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="flex min-w-0 items-center gap-3">
        {session.game && (
          <div className="w-12 shrink-0 overflow-hidden rounded-control border border-border">
            <CoverImage cover={session.game.cover} title={session.game.title} alt="" compact className="aspect-[3/4] w-full" />
          </div>
        )}
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
      </div>
      <div className="flex flex-col items-end gap-1">
        <ResponseBadge response={session.myResponse} />
        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-text-muted">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {session.counts.going}/{session.maxPlayers} going
        </span>
      </div>
    </ArtPanel>
  );
}
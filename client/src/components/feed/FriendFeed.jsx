import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/states.jsx';
import { ArtPanel } from '@/components/art/ArtPanel.jsx';
import { getFeed } from '@/services/socialApi.js';
import { ActivityList } from './ActivityList.jsx';

// "What my friends are playing": its own section on Home, so a failure here never blanks the page.
export function FriendFeed() {
  return (
    <ArtPanel aria-labelledby="friend-feed-title" seed="home-friends" className="gq-editorial-panel flex flex-col gap-3 p-5 rounded-card border border-border bg-surface shadow-2xs">
      <div className="flex items-center justify-between gap-3">
        <h2 id="friend-feed-title" className="flex items-center gap-2 text-base font-bold font-heading text-text">
          <Users className="h-5 w-5 text-[var(--secondary-accent)]" aria-hidden="true" /> Friends’ activity
        </h2>
        <Link to="/friends" className="text-xs font-semibold text-text-muted hover:text-text">See friends</Link>
      </div>
      <div className="-mx-2 flex max-h-[460px] flex-col overflow-y-auto px-2">
      <ActivityList
        loadPage={getFeed}
        renderEmpty={(page) =>
          page.friendCount === 0 ? (
            <EmptyState icon={Users} title="No friends yet" description="Add friends to see what they’re playing, finishing and reviewing." actionLabel="Find friends" actionTo="/friends?tab=find" headingLevel="h3" />
          ) : (
            <EmptyState icon={Users} title="Nothing new from your friends" description="When they start, finish or review a game, it shows up here." headingLevel="h3" />
          )
        }
      />
      </div>
    </ArtPanel>
  );
}

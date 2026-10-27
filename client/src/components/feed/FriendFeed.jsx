import { Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/states.jsx';
import { ArtPanel } from '@/components/art/ArtPanel.jsx';
import { getFeed } from '@/services/socialApi.js';
import { ActivityList } from './ActivityList.jsx';

// "What my friends are playing": its own section on Home, so a failure here never blanks the page.
export function FriendFeed() {
  return (
    <ArtPanel aria-labelledby="friend-feed-title" seed="home-friends" className="flex flex-col gap-3 p-5">
      <h2 id="friend-feed-title" className="text-lg font-semibold font-heading">Friends’ activity</h2>
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
    </ArtPanel>
  );
}

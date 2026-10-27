import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Gamepad2,
  Layers,
  Lock,
  ShieldBan,
  Sparkles,
  Star,
  Trophy,
  UserMinus,
  UserPlus,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { EmptyState, ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { ActivityList } from '@/components/feed/ActivityList.jsx';
import { CollectionCard } from '@/components/collections/CollectionCard.jsx';
import { CoverImage } from '@/components/games/GameCard.jsx';
import { ArtPanel } from '@/components/art/ArtPanel.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useLayered } from '@/hooks/useLayered.js';
import { getErrorInfo } from '@/services/api.js';
import { blockUser, getProfile, getProfileActivity, getProfileCollections, sendFriendRequest, unfriend } from '@/services/socialApi.js';

const STAT_LABELS = [
  ['games', 'Games in Library', Gamepad2],
  ['playing', 'Currently Playing', Clock],
  ['completed', 'Completed', Trophy],
  ['hours', 'Hours Logged', Clock],
  ['reviews', 'Reviews Written', Star],
];

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading profile">
      <Skeleton className="h-44 w-full rounded-card" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-card" />
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-card" />
    </div>
  );
}

function UserAvatar({ user, size = 'lg' }) {
  const [failed, setFailed] = useState(false);
  const sizeClasses = size === 'lg' ? 'h-20 w-20 text-2xl' : 'h-12 w-12 text-base';
  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : '?';

  if (user?.avatar && !failed) {
    return (
      <img
        src={user.avatar}
        alt={user.username}
        onError={() => setFailed(true)}
        className={`${sizeClasses} rounded-full object-cover border-2 border-accent shadow-md flex-shrink-0 bg-surface-raised`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} rounded-full bg-gradient-to-br from-accent/90 to-purple-800 text-text font-bold font-heading flex items-center justify-center border-2 border-accent/40 shadow-md flex-shrink-0`}
      aria-label={`${user?.username} avatar`}
    >
      {initials}
    </div>
  );
}

// Add friend / Unfriend / Block, depending on how the viewer and this player are related.
function RelationActions({ profile, setProfile }) {
  const { user, relation } = profile;
  const [asking, setAsking] = useState(null); // 'unfriend' | 'block'

  async function run(next, action, done) {
    const previous = profile;
    setProfile({ ...profile, relation: next });
    setAsking(null);
    try {
      const result = await action();
      if (result?.status === 'accepted') setProfile({ ...previous, relation: 'friend' });
      toast.success(done(result));
    } catch (err) {
      setProfile(previous);
      toast.error(getErrorInfo(err).message);
    }
  }

  if (relation === 'self') {
    return (
      <Link to="/profile" className={buttonVariants({ variant: 'secondary' })}>
        Edit my profile
      </Link>
    );
  }
  if (asking) {
    const isBlock = asking === 'block';
    return (
      <div className="flex gap-2" role="group" aria-label={isBlock ? `Confirm blocking ${user.username}` : `Confirm unfriending ${user.username}`}>
        <Button
          variant="secondary"
          onClick={() =>
            isBlock
              ? run('blocked', () => blockUser(user.id), () => `Blocked ${user.username}`)
              : run('none', () => unfriend(user.id), () => `You and ${user.username} are no longer friends`)
          }
        >
          {isBlock ? 'Block' : 'Unfriend'}
        </Button>
        <Button variant="ghost" onClick={() => setAsking(null)}>Cancel</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {relation === 'none' && (
        <Button
          onClick={() =>
            run(
              'pending_out',
              () => sendFriendRequest(user.username),
              (r) => (r.status === 'accepted' ? `You and ${user.username} are now friends` : `Request sent to ${user.username}`)
            )
          }
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" /> Add friend
        </Button>
      )}
      {relation === 'pending_out' && (
        <span className="inline-flex min-h-11 items-center rounded-control border border-border bg-surface px-3 text-sm text-text-muted">
          Request sent
        </span>
      )}
      {relation === 'pending_in' && (
        <Link to="/friends?tab=requests" className={buttonVariants()}>
          Respond to request
        </Link>
      )}
      {relation === 'friend' && (
        <Button variant="ghost" onClick={() => setAsking('unfriend')} aria-label={`Unfriend ${user.username}`}>
          <UserMinus className="h-4 w-4" aria-hidden="true" /> Friends · Unfriend
        </Button>
      )}
      {relation !== 'blocked' && (
        <Button variant="ghost" onClick={() => setAsking('block')} aria-label={`Block ${user.username}`}>
          <ShieldBan className="h-4 w-4" aria-hidden="true" /> Block
        </Button>
      )}
      {relation === 'blocked' && (
        <span className="inline-flex min-h-11 items-center text-sm text-text-muted">Blocked</span>
      )}
    </div>
  );
}

function FavouriteShowcase({ games = [], isSelf }) {
  if (!games.length && !isSelf) return null;

  return (
    <ArtPanel aria-labelledby="favourites-title" art={games[0]} seed="profile-favourites" className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <h2 id="favourites-title" className="text-lg font-semibold font-heading flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--reward)]" aria-hidden="true" />
          Favourite 4 Showcase
        </h2>
        {isSelf && (
          <Link to="/profile" className="text-xs text-accent hover:underline">
            Manage favourites
          </Link>
        )}
      </div>

      {games.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-surface/50 p-6 text-center">
          <p className="text-sm text-text-muted mb-3">Showcase your all-time favourite games on your profile.</p>
          <Link to="/profile" className={buttonVariants({ variant: 'secondary' })}>
            Pick your favourite games
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {games.map((game) => (
            <Link
              key={game.id}
              to={`/games/${game.slug}`}
              className="group relative flex flex-col overflow-hidden rounded-card border border-border bg-surface transition-all hover:border-accent hover:shadow-lg hover:-translate-y-0.5"
            >
              <div className="aspect-[3/4] w-full overflow-hidden bg-surface-raised relative">
                <CoverImage
                  cover={game.cover}
                  title={game.title}
                  alt={game.title}
                  className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                />
                {game.ratingAvg != null && (
                  <div className="absolute top-2 right-2 rounded-full bg-black/75 px-2 py-0.5 backdrop-blur text-[11px] font-semibold text-[var(--reward)] flex items-center gap-1 shadow">
                    ★ {game.ratingAvg.toFixed(1)}
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="font-semibold text-xs truncate group-hover:text-accent transition-colors" title={game.title}>
                  {game.title}
                </p>
                {game.genres?.length > 0 && (
                  <p className="text-[11px] text-text-muted mt-0.5 truncate">
                    {game.genres.slice(0, 2).join(' · ')}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </ArtPanel>
  );
}

function TrophyShelf({ stats }) {
  if (!stats) return null;

  const trophies = [];

  // Collector
  if (stats.games >= 25) trophies.push({ title: 'Master Collector', tier: 'Platinum', color: '#B9F2FF', desc: '25+ games owned' });
  else if (stats.games >= 10) trophies.push({ title: 'Veteran Collector', tier: 'Gold', color: '#FFC14D', desc: '10+ games owned' });
  else if (stats.games >= 5) trophies.push({ title: 'Avid Collector', tier: 'Silver', color: '#C0C7D1', desc: '5+ games owned' });
  else if (stats.games >= 1) trophies.push({ title: 'Apprentice', tier: 'Bronze', color: '#CD7F32', desc: 'First game added' });

  // Finisher
  if (stats.completed >= 10) trophies.push({ title: 'Legendary Finisher', tier: 'Platinum', color: '#B9F2FF', desc: '10+ games completed' });
  else if (stats.completed >= 5) trophies.push({ title: 'Master Finisher', tier: 'Gold', color: '#FFC14D', desc: '5+ games completed' });
  else if (stats.completed >= 2) trophies.push({ title: 'Dedicated Finisher', tier: 'Silver', color: '#C0C7D1', desc: '2+ games completed' });
  else if (stats.completed >= 1) trophies.push({ title: 'First Quest Cleared', tier: 'Bronze', color: '#CD7F32', desc: '1st game finished' });

  // Hours
  if (stats.hours >= 100) trophies.push({ title: 'Century Master', tier: 'Platinum', color: '#B9F2FF', desc: '100+ hours logged' });
  else if (stats.hours >= 50) trophies.push({ title: 'Dedicated Gamer', tier: 'Gold', color: '#FFC14D', desc: '50+ hours logged' });
  else if (stats.hours >= 20) trophies.push({ title: 'Explorer', tier: 'Silver', color: '#C0C7D1', desc: '20+ hours logged' });
  else if (stats.hours >= 5) trophies.push({ title: 'Initiate', tier: 'Bronze', color: '#CD7F32', desc: '5+ hours logged' });

  // Reviews
  if (stats.reviews >= 5) trophies.push({ title: 'Master Critic', tier: 'Gold', color: '#FFC14D', desc: '5+ reviews written' });
  else if (stats.reviews >= 2) trophies.push({ title: 'Columnist', tier: 'Silver', color: '#C0C7D1', desc: '2+ reviews written' });
  else if (stats.reviews >= 1) trophies.push({ title: 'Voice of the Player', tier: 'Bronze', color: '#CD7F32', desc: '1st review posted' });

  if (!trophies.length) return null;

  return (
    <ArtPanel aria-labelledby="trophies-title" seed="profile-trophies" className="flex flex-col gap-3 p-5">
      <h2 id="trophies-title" className="text-lg font-semibold font-heading flex items-center gap-2">
        <Trophy className="h-4 w-4 text-[var(--reward)]" aria-hidden="true" />
        Trophies & Milestones
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {trophies.map((t) => (
          <div
            key={t.title}
            className="flex items-center gap-3 rounded-card border border-border/60 bg-bg/70 p-3"
          >
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border"
              style={{ borderColor: t.color, backgroundColor: `${t.color}15` }}
            >
              <Trophy className="h-5 w-5" style={{ color: t.color }} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate" style={{ color: t.color }}>{t.title}</p>
              <p className="text-[11px] text-text-muted truncate">{t.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </ArtPanel>
  );
}

function PublicCollections({ username }) {
  const load = useCallback((signal) => getProfileCollections(username, { signal }), [username]);
  const { status, data, error, retry } = useAsync(load);
  if (status === 'loading') return <Skeleton className="h-40 w-full" role="status" aria-label="Loading collections" />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;
  if (data.length === 0) return <EmptyState icon={Layers} title="No collections to show" description={`${username} hasn’t shared any collections with you.`} />;
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {data.map((c) => (
        <CollectionCard key={c.id} collection={c} />
      ))}
    </ul>
  );
}

export default function UserProfile() {
  const { username } = useParams();
  const load = useCallback((signal) => getProfile(username, { signal }), [username]);
  const { status, data, error, retry } = useAsync(load);
  const [profile, setProfile] = useLayered(data);
  const loadActivity = useCallback((params, opts) => getProfileActivity(username, params, opts), [username]);

  return (
    <section className="flex flex-col gap-6 pb-12">
      <Link to="/friends" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Friends
      </Link>

      {status === 'loading' && <ProfileSkeleton />}

      {status === 'error' &&
        (error.status === 404 ? (
          <EmptyState icon={UserX} title="Player not found" description="There’s no player with that username, or they’re not available to you." actionLabel="Find people" actionTo="/friends?tab=find" />
        ) : (
          <ErrorState message={error.message} onRetry={retry} />
        ))}

      {status === 'success' && profile && (
        <>
          {/* User Hero Banner */}
          <div className="relative overflow-hidden rounded-card border border-border bg-gradient-to-r from-surface to-surface-raised p-6 shadow-md">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 h-48 w-48 rounded-full bg-accent/10 blur-2xl pointer-events-none" />

            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <UserAvatar user={profile.user} size="lg" />
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold font-heading">{profile.user.username}</h1>
                  <p className="text-xs text-text-muted mt-0.5">
                    Member since {new Date(profile.user.memberSince).toLocaleDateString(undefined, { dateStyle: 'long' })}
                  </p>
                  {profile.user.bio && (
                    <p className="mt-2 text-sm text-text/90 italic max-w-lg leading-relaxed">
                      &ldquo;{profile.user.bio}&rdquo;
                    </p>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 self-start sm:self-center">
                <RelationActions profile={profile} setProfile={setProfile} />
              </div>
            </div>
          </div>

          {profile.restricted ? (
            <EmptyState icon={Lock} title="This profile is private" description={`${profile.user.username} only shares their profile with ${profile.relation === 'none' ? 'friends' : 'approved players'}.`} />
          ) : (
            <>
              {/* Stat Tiles */}
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {STAT_LABELS.map(([key, label, Icon]) => (
                  <div key={key} className="rounded-card border border-border bg-surface p-3.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                      <dt className="text-xs text-text-muted">{label}</dt>
                      <Icon className="h-4 w-4 text-text-muted" />
                    </div>
                    <dd className="text-2xl font-bold font-heading tabular-nums text-text">{profile.stats[key]}</dd>
                  </div>
                ))}
              </dl>

              {/* Favourite 4 Showcase */}
              <FavouriteShowcase games={profile.user.favouriteGames} isSelf={profile.relation === 'self'} />

              {/* Trophy Shelf */}
              <TrophyShelf stats={profile.stats} />

              {/* Recent Activity */}
              <section aria-labelledby="recent-title" className="flex flex-col gap-3">
                <h2 id="recent-title" className="text-lg font-semibold font-heading">Recent activity</h2>
                <ActivityList
                  loadPage={loadActivity}
                  showActor={false}
                  renderEmpty={() => <EmptyState title="No activity to show" description={`When ${profile.user.username} plays, finishes or reviews a game, it appears here.`} />}
                />
              </section>

              {/* Collections */}
              <section aria-labelledby="collections-title" className="flex flex-col gap-3">
                <h2 id="collections-title" className="text-lg font-semibold font-heading">Collections</h2>
                <PublicCollections username={profile.user.username} />
              </section>
            </>
          )}
        </>
      )}
    </section>
  );
}

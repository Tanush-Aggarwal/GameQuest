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
import { LARGE_TILE } from '@/components/profile/FavouriteTiles.jsx';
import { BackdropHero } from '@/components/art/BackdropHero.jsx';
import { TrophyShelf } from '@/components/profile/TrophyShelf.jsx';
import { LevelGuide } from '@/components/profile/LevelGuide.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { useLayered } from '@/hooks/useLayered.js';
import { getErrorInfo } from '@/services/api.js';
import { blockUser, getProfile, getProfileActivity, getProfileCollections, sendFriendRequest, unfriend } from '@/services/socialApi.js';

const STAT_LABELS = [
  ['games', 'Games in library', Gamepad2, 'var(--status-backlog)'],
  ['playing', 'Playing now', Gamepad2, 'var(--status-playing)'],
  ['completed', 'Completed', Trophy, 'var(--status-completed)'],
  ['hours', 'Hours logged', Clock, 'var(--secondary-accent)'],
  ['reviews', 'Reviews', Star, 'var(--reward)'],
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
  const sizeClasses = size === 'lg' ? 'h-24 w-24 text-3xl sm:h-28 sm:w-28' : 'h-12 w-12 text-base';
  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : '?';

  if (user?.avatar && !failed) {
    return (
      <img
        src={user.avatar}
        alt={user.username}
        onError={() => setFailed(true)}
        className={`${sizeClasses} rounded-full object-cover border-2 border-white/80 shadow-md flex-shrink-0 bg-surface-raised`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} rounded-full bg-gradient-to-br from-accent/90 to-purple-800 text-text font-bold font-heading flex items-center justify-center border-2 border-white/60 shadow-md flex-shrink-0`}
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
      <Link to="/profile" className={buttonVariants({ variant: 'secondary', className: 'border-transparent bg-white text-[#14161a] hover:bg-white/90' })}>
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
          <Sparkles className="h-4 w-4 text-[var(--secondary-accent)]" aria-hidden="true" />
          Favourite 4 Showcase
        </h2>
        {isSelf && (
          <Link to="/profile" className="inline-flex min-h-11 items-center text-xs font-semibold text-[var(--accent-text)] hover:underline">
            Manage favourites
          </Link>
        )}
      </div>

      {games.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed border-border bg-bg/50 px-4 py-3">
          <p className="text-sm text-text-muted">Showcase your all-time favourite games on your profile.</p>
          <Link to="/profile" className={buttonVariants({ variant: 'secondary' })}>
            Pick your favourite games
          </Link>
        </div>
      ) : (
        <ul className="flex flex-wrap gap-4">
          {games.map((game) => (
            <li key={game.id} className={LARGE_TILE}>
              <Link to={`/games/${game.slug}`} className="group flex flex-col gap-1.5">
                <span className="relative block aspect-[3/4] w-full overflow-hidden rounded-card border border-border bg-surface-raised transition-colors group-hover:border-text">
                  <CoverImage
                    cover={game.cover}
                    title={game.title}
                    alt=""
                    compact
                    className="h-full w-full transition-transform duration-300 motion-safe:group-hover:scale-105"
                  />
                  {game.ratingAvg > 0 && (
                    <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-xs font-semibold text-text">
                      <span aria-hidden="true" className="text-[var(--reward)]">★</span>
                      <span>
                        {game.ratingAvg.toFixed(1)}
                        <span className="sr-only"> out of 5</span>
                      </span>
                    </span>
                  )}
                </span>
                <span className="line-clamp-2 text-sm font-semibold leading-snug text-text group-hover:text-[var(--accent-text)]" title={game.title}>
                  {game.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ArtPanel>
  );
}
function PublicCollections({ username }) {
  const load = useCallback((signal) => getProfileCollections(username, { signal }), [username]);
  const { status, data, error, retry } = useAsync(load);
  if (status === 'loading') return <Skeleton className="h-40 w-full" role="status" aria-label="Loading collections" />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;
  if (data.length === 0) return <EmptyState headingLevel="h3" icon={Layers} title="No collections to show" description={`${username} hasn’t shared any collections with you.`} />;
  return (
    <ul className="grid grid-cols-2 gap-4">
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
          <EmptyState headingLevel="h1" icon={UserX} title="Player not found" description="There’s no player with that username, or they’re not available to you." actionLabel="Find people" actionTo="/friends?tab=find" />
        ) : (
          <ErrorState message={error.message} onRetry={retry} />
        ))}

      {status === 'success' && profile && (
        <>
          {/* User Hero Banner */}
          {/* Banner: the art of their first favourite game (a gradient when they have none, or the profile is private) */}
          <BackdropHero as="header" art={profile.restricted ? null : profile.user.favouriteGames?.[0]} seed={profile.user.username} className="min-h-[220px] px-5 py-8 sm:px-10 sm:py-12">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-5 sm:gap-6">
                <UserAvatar user={profile.user} size="lg" />
                <div>
                  <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-5xl">{profile.user.username}</h1>
                  {profile.stats?.level != null && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold text-white">Level {profile.stats.level}</span>
                      <LevelGuide level={profile.stats.level} xp={profile.stats.xp} onDark />
                    </div>
                  )}
                  <p className="mt-1 text-sm text-text-muted">
                    Member since {new Date(profile.user.memberSince).toLocaleDateString(undefined, { dateStyle: 'long' })}
                  </p>
                  {profile.user.bio && (
                    <p className="mt-2 text-sm text-text/90 italic max-w-lg leading-relaxed">
                      &ldquo;{profile.user.bio}&rdquo;
                    </p>
                  )}
                </div>
              </div>
              {/* a solid backing: these buttons sit at the open end of the banner, over whatever the art is */}
              <div className="flex-shrink-0 self-start rounded-card bg-bg/80 p-1 sm:self-center">
                <RelationActions profile={profile} setProfile={setProfile} />
              </div>
            </div>
          </BackdropHero>

          {profile.restricted ? (
            <EmptyState headingLevel="h2" icon={Lock} title="This profile is private" description={`${profile.user.username} only shares their profile with ${profile.relation === 'none' ? 'friends' : 'approved players'}.`} />
          ) : (
            <>
              {/* Stat Tiles */}
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {STAT_LABELS.map(([key, label, Icon, color]) => (
                  <div key={key} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-sm">
                    {/* dt and dd are direct children of the div that groups them, as a description list requires */}
                    <dt className="flex items-center gap-2 text-xs font-medium text-text-muted">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
                        <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                      </span>
                      {label}
                    </dt>
                    <dd className="font-heading text-3xl font-bold tabular-nums text-text">{profile.stats[key]}</dd>
                  </div>
                ))}
              </dl>

              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                {/* Main column: what they love and what they've been doing */}
                <div className="flex min-w-0 flex-col gap-6">
                  <FavouriteShowcase games={profile.user.favouriteGames} isSelf={profile.relation === 'self'} />

                  <section aria-labelledby="recent-title" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-sm">
                    <h2 id="recent-title" className="text-lg font-semibold font-heading">Recent activity</h2>
                    <div className="-mx-2 flex max-h-[520px] flex-col overflow-y-auto px-2">
                      <ActivityList
                        loadPage={loadActivity}
                        showActor={false}
                        renderEmpty={() => <EmptyState headingLevel="h3" title="No activity to show" description={`When ${profile.user.username} plays, finishes or reviews a game, it appears here.`} />}
                      />
                    </div>
                  </section>
                </div>

                {/* Side column: achievements and shared collections */}
                <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-24">
                  <TrophyShelf stats={profile.stats} isSelf={profile.relation === 'self'} />
                  <section aria-labelledby="collections-title" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-sm">
                    <h2 id="collections-title" className="flex items-center gap-2 text-lg font-semibold font-heading">
                      <Layers className="h-4 w-4 text-[var(--secondary-accent)]" aria-hidden="true" /> Collections
                    </h2>
                    <PublicCollections username={profile.user.username} />
                  </section>
                </aside>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

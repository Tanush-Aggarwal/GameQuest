import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ExternalLink,
  Plus,
  Save,
  Search,
  ShieldOff,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PROFILE_PRIVACY } from '@gamequest/shared';
import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { CoverImage } from '@/components/games/GameCard.jsx';
import { useAuth } from '@/hooks/useAuth.js';
import { useAsync } from '@/hooks/useAsync.js';
import { useLayered } from '@/hooks/useLayered.js';
import { getErrorInfo } from '@/services/api.js';
import { searchGames } from '@/services/gamesApi.js';
import {
  getProfile,
  listBlocked,
  setPrivacy,
  unblockUser,
  updateProfile,
} from '@/services/socialApi.js';

const PRIVACY_LABELS = {
  public: 'Public — anyone signed in can view my profile',
  friends: 'Friends only',
  private: 'Private — only me',
};

const AVATAR_PRESETS = [
  { label: 'Knight', url: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=256&h=256&q=80' },
  { label: 'Rogue', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80' },
  { label: 'Cyber', url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=256&h=256&q=80' },
  { label: 'Mystic', url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=256&h=256&q=80' },
];

function EditProfileSection({ username }) {
  const load = useCallback((signal) => getProfile(username, { signal }), [username]);
  const { status, data, error, retry } = useAsync(load);

  if (status === 'loading') return <Skeleton className="h-64 w-full" role="status" aria-label="Loading profile editor" />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;

  return <ProfileEditor initialProfile={data?.user} onSaved={retry} />;
}

function ProfileEditor({ initialProfile, onSaved }) {
  const [avatar, setAvatar] = useState(initialProfile?.avatar ?? '');
  const [bio, setBio] = useState(initialProfile?.bio ?? '');
  const [favourites, setFavourites] = useState(initialProfile?.favouriteGames ?? []);
  const [saving, setSaving] = useState(false);

  // Search for favourite games
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  async function handleSearch(q) {
    setQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await searchGames({ q: q.trim(), limit: 6 });
      setSearchResults(res.items ?? []);
    } catch {
      // silent in quick search
    } finally {
      setSearching(false);
    }
  }

  function addFavourite(game) {
    if (favourites.length >= 4) {
      toast.error('You can showcase up to 4 favourite games');
      return;
    }
    if (favourites.some((g) => g.id === game.id)) {
      toast.info('Game already in your favourites');
      return;
    }
    setFavourites([...favourites, game]);
    setQuery('');
    setSearchResults([]);
  }

  function removeFavourite(gameId) {
    setFavourites(favourites.filter((g) => g.id !== gameId));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({
        avatar: avatar.trim() || null,
        bio: bio.trim(),
        favouriteGames: favourites.map((g) => g.id),
      });
      toast.success('Profile updated successfully');
      if (onSaved) onSaved();
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 rounded-card border border-border bg-surface p-6">
      <div className="flex flex-col gap-4">
        {/* Avatar Settings */}
        <div>
          <label htmlFor="avatar-input" className="text-sm font-semibold mb-1 block">Avatar</label>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="h-16 w-16 rounded-full overflow-hidden border-2 border-accent/40 bg-surface-raised flex-shrink-0 flex items-center justify-center">
              {avatar ? (
                <img src={avatar} alt="Avatar preview" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              ) : (
                <User className="h-8 w-8 text-text-muted" />
              )}
            </div>
            <div className="flex-1 w-full space-y-2">
              <input
                id="avatar-input"
                type="url"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
                className="w-full min-h-11 rounded-control border border-border bg-bg px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-text-muted mr-1">Presets:</span>
                {AVATAR_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setAvatar(p.url)}
                    className="text-xs px-2 py-0.5 rounded-full border border-border bg-surface-raised hover:border-accent text-text-muted hover:text-text transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
                {avatar && (
                  <button
                    type="button"
                    onClick={() => setAvatar('')}
                    className="text-xs px-2 py-0.5 rounded-full text-text-muted hover:text-red-400"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bio */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label htmlFor="bio-input" className="text-sm font-semibold">About You (Bio)</label>
            <span className="text-xs text-text-muted">{bio.length}/300</span>
          </div>
          <textarea
            id="bio-input"
            rows={3}
            maxLength={300}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell your friends about your gaming tastes, favorite genres, or current goals..."
            className="w-full rounded-control border border-border bg-bg p-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent resize-none"
          />
        </div>

        {/* Favourite 4 Games */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <div>
              <span className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-[var(--reward)]" />
                Favourite 4 Showcase
              </span>
              <p className="text-xs text-text-muted mt-0.5">Pick up to 4 games to feature on your profile showcase</p>
            </div>
            <span className="text-xs font-medium text-text-muted">{favourites.length}/4</span>
          </div>

          {/* Slots */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {[0, 1, 2, 3].map((idx) => {
              const game = favourites[idx];
              if (game) {
                return (
                  <div key={game.id} className="group relative aspect-[3/4] rounded-card border border-border overflow-hidden bg-surface-raised">
                    <CoverImage cover={game.cover} title={game.title} alt={game.title} className="h-full w-full" />
                    <button
                      type="button"
                      onClick={() => removeFavourite(game.id)}
                      className="absolute top-1.5 right-1.5 rounded-full bg-black/80 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      aria-label={`Remove ${game.title}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                      <p className="text-[11px] font-semibold text-white truncate">{game.title}</p>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={`empty-${idx}`}
                  className="aspect-[3/4] rounded-card border border-dashed border-border bg-bg flex flex-col items-center justify-center p-3 text-center text-text-muted"
                >
                  <Plus className="h-6 w-6 text-border mb-1" />
                  <span className="text-[11px]">Slot {idx + 1}</span>
                </div>
              );
            })}
          </div>

          {/* Search to add */}
          {favourites.length < 4 && (
            <div className="relative">
              <div className="flex items-center rounded-control border border-border bg-bg px-3 focus-within:ring-1 focus-within:ring-accent">
                <Search className="h-4 w-4 text-text-muted mr-2 flex-shrink-0" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search catalog to add a favourite game..."
                  className="w-full min-h-11 bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none"
                />
              </div>

              {/* Suggestions dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-card border border-border bg-surface-raised shadow-xl p-1">
                  {searchResults.map((game) => (
                    <button
                      key={game.id}
                      type="button"
                      onClick={() => addFavourite(game)}
                      className="flex w-full items-center gap-3 rounded-control p-2 text-left hover:bg-surface text-sm transition-colors"
                    >
                      <CoverImage cover={game.cover} title={game.title} compact className="h-10 w-8 rounded flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-xs truncate">{game.title}</p>
                        {game.genres?.length > 0 && (
                          <p className="text-[11px] text-text-muted truncate">{game.genres.join(', ')}</p>
                        )}
                      </div>
                      <Plus className="h-4 w-4 text-accent flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {searching && (
                <p className="text-xs text-text-muted mt-1 px-1">Searching...</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button type="submit" disabled={saving}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Saving...' : 'Save Profile'}
        </Button>
      </div>
    </form>
  );
}

function PrivacySetting({ username }) {
  const id = useId();
  const load = useCallback((signal) => getProfile(username, { signal }), [username]);
  const { status, data, error, retry } = useAsync(load);
  const [profile, setProfile] = useLayered(data);

  async function change(next) {
    const previous = profile;
    setProfile({ ...profile, user: { ...profile.user, privacy: next } });
    try {
      await setPrivacy(next);
      toast.success('Profile privacy updated');
    } catch (err) {
      setProfile(previous);
      toast.error(getErrorInfo(err).message);
    }
  }

  if (status === 'loading') return <Skeleton className="h-16 w-full max-w-md" role="status" aria-label="Loading privacy" />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;
  return (
    <div className="flex max-w-md flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">Who can see my profile</label>
      <select
        id={id}
        value={profile.user.privacy}
        onChange={(e) => change(e.target.value)}
        className="min-h-11 rounded-control border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
      >
        {PROFILE_PRIVACY.map((p) => (
          <option key={p} value={p}>{PRIVACY_LABELS[p]}</option>
        ))}
      </select>
      <p className="text-xs text-text-muted">Games you hide from friends stay hidden at every level.</p>
    </div>
  );
}

function BlockedPlayers() {
  const load = useCallback((signal) => listBlocked({ signal }), []);
  const { status, data, error, retry } = useAsync(load);
  const [blocked, setBlocked] = useLayered(data);

  async function unblock(user) {
    const previous = blocked;
    setBlocked(blocked.filter((u) => u.id !== user.id));
    try {
      await unblockUser(user.id);
      toast.success(`Unblocked ${user.username}`);
    } catch (err) {
      setBlocked(previous);
      toast.error(getErrorInfo(err).message);
    }
  }

  if (status === 'loading') return <Skeleton className="h-16 w-full max-w-md" role="status" aria-label="Loading blocked players" />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;
  if (blocked.length === 0) return <p className="text-sm text-text-muted">You haven’t blocked anyone.</p>;
  return (
    <ul className="flex max-w-md flex-col gap-2">
      {blocked.map((u) => (
        <li key={u.id} className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-3">
          <span className="font-medium text-sm">{u.username}</span>
          <Button variant="secondary" onClick={() => unblock(u)} aria-label={`Unblock ${u.username}`}>
            <ShieldOff className="h-4 w-4" aria-hidden="true" /> Unblock
          </Button>
        </li>
      ))}
    </ul>
  );
}

export default function Profile() {
  const { user } = useAuth();
  return (
    <section className="flex flex-col gap-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-heading">Profile & Settings</h1>
          <p className="text-sm text-text-muted mt-0.5">Customize your public gamer identity and privacy settings</p>
        </div>
        {user && (
          <Link to={`/u/${user.username}`} className={buttonVariants({ variant: 'secondary' })}>
            View my public profile <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
          </Link>
        )}
      </div>

      {/* Profile Details & Favourite Showcase Editor */}
      {user && (
        <section aria-labelledby="edit-profile-title" className="flex flex-col gap-3">
          <h2 id="edit-profile-title" className="text-lg font-semibold font-heading">Gamer Identity</h2>
          <EditProfileSection username={user.username} />
        </section>
      )}

      {/* Account Info */}
      <section aria-labelledby="account-title" className="flex flex-col gap-3">
        <h2 id="account-title" className="text-lg font-semibold font-heading">Account Information</h2>
        <dl className="grid max-w-md gap-4 rounded-card border border-border bg-surface p-6 text-sm">
          <div>
            <dt className="text-xs text-text-muted uppercase tracking-wider">Username</dt>
            <dd className="font-medium mt-0.5">{user?.username}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted uppercase tracking-wider">Email</dt>
            <dd className="font-medium mt-0.5">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted uppercase tracking-wider">Member Since</dt>
            <dd className="font-medium mt-0.5">
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : '—'}
            </dd>
          </div>
        </dl>
      </section>

      {/* Privacy Settings */}
      {user && (
        <section aria-labelledby="privacy-title" className="flex flex-col gap-3">
          <h2 id="privacy-title" className="text-lg font-semibold font-heading">Privacy</h2>
          <PrivacySetting username={user.username} />
        </section>
      )}

      {/* Blocked Players */}
      <section aria-labelledby="blocked-title" className="flex flex-col gap-3">
        <h2 id="blocked-title" className="text-lg font-semibold font-heading">Blocked Players</h2>
        <BlockedPlayers />
      </section>
    </section>
  );
}

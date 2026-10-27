import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ExternalLink,
  Save,
  ShieldOff,
  Sparkles,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { PROFILE_PRIVACY, deleteAccountSchema } from '@gamequest/shared';
import { deleteAccount } from '@/services/accountApi.js';
import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { ErrorState } from '@/components/ui/states.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { FavouriteTiles, SLOT_COUNT } from '@/components/profile/FavouriteTiles.jsx';
import { FavouritePicker } from '@/components/profile/FavouritePicker.jsx';
import { SteamLinkCard } from '@/components/steam/SteamLinkCard.jsx';
import { ArtPanel } from '@/components/art/ArtPanel.jsx';
import { BackdropHero } from '@/components/art/BackdropHero.jsx';
import { useAuth } from '@/hooks/useAuth.js';
import { useAsync } from '@/hooks/useAsync.js';
import { useLayered } from '@/hooks/useLayered.js';
import { getErrorInfo } from '@/services/api.js';
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

// `profile` is the page's one profile (status, data, error, retry, update): the banner, the editor and the privacy
// setting all read it, and a save updates it in place, so nothing reloads, remounts or loses focus.
function EditProfileSection({ profile }) {
  const { status, data, error, retry, update } = profile;

  if (status === 'loading') return <Skeleton className="h-64 w-full" role="status" aria-label="Loading profile editor" />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;

  return <ProfileEditor initialProfile={data?.user} onSaved={(saved) => update({ ...data, user: { ...data.user, ...saved } })} />;
}

function ProfileEditor({ initialProfile, onSaved }) {
  const [avatar, setAvatar] = useState(initialProfile?.avatar ?? '');
  const [bio, setBio] = useState(initialProfile?.bio ?? '');
  // Four slots, each a game or empty. Saving keeps their order and drops the empty ones.
  const [slots, setSlots] = useState(() => Array.from({ length: SLOT_COUNT }, (_, i) => initialProfile?.favouriteGames?.[i] ?? null));
  const [openSlot, setOpenSlot] = useState(null);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const chosenIds = new Set(slots.filter(Boolean).map((g) => g.id));
  const filled = slots.filter(Boolean).length;

  // Keyboard focus: whenever a tile's button is replaced (picker closed, game picked, game removed) the focused
  // element disappears, so remember which slot's button should take focus and give it focus after the render.
  const tilesRef = useRef(null);
  const focusSlot = useRef(null);
  useEffect(() => {
    if (focusSlot.current === null) return;
    const button = tilesRef.current?.querySelector(`[data-slot-action="${focusSlot.current}"]`);
    focusSlot.current = null;
    button?.focus();
  });

  // Unsaved edits: a hint next to Save, and the browser's own "leave this page?" prompt.
  const saved = initialProfile ?? {};
  const savedIds = (saved.favouriteGames ?? []).slice(0, SLOT_COUNT).map((g) => g.id).join(',');
  const dirty =
    bio.trim() !== (saved.bio ?? '') ||
    (avatar.trim() || null) !== (saved.avatar ?? null) ||
    slots.filter(Boolean).map((g) => g.id).join(',') !== savedIds;
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function openPicker(index) {
    setOpenSlot(index);
  }

  function closePicker() {
    focusSlot.current = openSlot; // back to the tile that opened it
    setOpenSlot(null);
  }

  function chooseFavourite(game) {
    setSlots((current) => current.map((g, i) => (i === openSlot ? game : g)));
    setAnnouncement(`Added ${game.title} to favourite ${openSlot + 1}`);
    focusSlot.current = openSlot; // that tile is now filled: focus its remove button
    setOpenSlot(null);
  }

  function removeFavourite(index) {
    setAnnouncement(`Removed ${slots[index]?.title ?? 'game'} from favourites`);
    setSlots((current) => current.map((g, i) => (i === index ? null : g)));
    focusSlot.current = index; // the slot is empty now: focus its add button
  }
  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const savedUser = await updateProfile({
        avatar: avatar.trim() || null,
        bio: bio.trim(),
        favouriteGames: slots.filter(Boolean).map((g) => g.id),
      });
      toast.success('Profile updated successfully');
      if (onSaved) onSaved(savedUser);
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 rounded-card border border-border/60 bg-bg/70 p-5">
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
                    className="min-h-11 rounded-full border border-border bg-surface-raised px-3 text-xs text-text-muted transition-colors hover:border-accent hover:text-text"
                  >
                    {p.label}
                  </button>
                ))}
                {avatar && (
                  <button
                    type="button"
                    onClick={() => setAvatar('')}
                    className="min-h-11 rounded-full px-3 text-xs text-text-muted hover:text-text"
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

        {/* Favourite 4: compact cover-sized tiles, a picker opens for the slot you click */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
                Favourite 4 Showcase
              </span>
              <p className="mt-0.5 text-xs text-text-muted">Pick up to 4 games to feature on your profile</p>
            </div>
            <span className="text-xs font-medium tabular-nums text-text-muted">{filled}/{SLOT_COUNT}</span>
          </div>

          <div ref={tilesRef}>
            <FavouriteTiles slots={slots} openSlot={openSlot} onOpen={openPicker} onRemove={removeFavourite} />
          </div>
          <p role="status" aria-live="polite" className="sr-only">{announcement}</p>

          {openSlot !== null && (
            <FavouritePicker slot={openSlot} chosenIds={chosenIds} onPick={chooseFavourite} onClose={closePicker} />
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-border pt-2">
        {dirty && (
          <span role="status" className="text-xs text-text-muted">
            Unsaved changes
          </span>
        )}
        <Button type="submit" disabled={saving}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Saving...' : 'Save Profile'}
        </Button>
      </div>
    </form>
  );
}

function PrivacySetting({ profile }) {
  const id = useId();
  const { status, data: current, error, retry, update } = profile;

  async function change(next) {
    const previous = current;
    update({ ...current, user: { ...current.user, privacy: next } });
    try {
      await setPrivacy(next);
      toast.success('Profile privacy updated');
    } catch (err) {
      update(previous);
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
        value={current.user.privacy}
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

function DeleteAccountSection({ username }) {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete(e) {
    e.preventDefault();
    setError('');
    const parsed = deleteAccountSchema.safeParse({ confirmUsername: confirmInput });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Invalid username');
      return;
    }
    if (confirmInput.trim() !== username) {
      setError(`Username must match "${username}" exactly`);
      return;
    }
    setLoading(true);
    try {
      await deleteAccount(confirmInput.trim());
      toast.success('Your account has been deleted');
      await logout();
      window.location.href = '/login';
    } catch (err) {
      setError(getErrorInfo(err).message || 'Failed to delete account');
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-card border border-danger/30 bg-danger/5 p-5">
      <div>
        <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-danger">
          Danger Zone
        </h3>
        <p className="mt-1 text-xs text-text-muted">
          Permanently delete your account, game library, reviews, collections, and activity. This action is irreversible.
        </p>
      </div>

      {!open ? (
        <Button
          variant="secondary"
          onClick={() => setOpen(true)}
          className="w-fit border-danger/40 text-danger hover:bg-danger/10"
        >
          Delete account…
        </Button>
      ) : (
        <form onSubmit={handleDelete} className="flex flex-col gap-3 rounded-control border border-danger/40 bg-surface p-4">
          <p className="text-xs text-text">
            To confirm deletion, type your username <strong className="font-mono text-danger">{username}</strong> below:
          </p>
          <input
            type="text"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={username}
            autoFocus
            aria-label="Confirm username to delete account"
            className="rounded-control border border-border bg-bg px-3 py-2 text-sm text-text focus:border-danger focus:outline-none"
          />
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="submit"
              disabled={loading || confirmInput.trim() !== username}
              className="bg-danger text-white hover:bg-danger/90 disabled:opacity-50"
            >
              {loading ? 'Deleting…' : 'Permanently delete account'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => {
                setOpen(false);
                setConfirmInput('');
                setError('');
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// One settings section: a heading on game art, with the section's content inside.
function SettingsSection({ id, title, seed, children }) {
  return (
    <ArtPanel aria-labelledby={id} seed={seed} className="flex flex-col gap-3 p-5">
      <h2 id={id} className="text-lg font-semibold font-heading">{title}</h2>
      {children}
    </ArtPanel>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const username = user?.username;
  const load = useCallback((signal) => (username ? getProfile(username, { signal }) : Promise.resolve(null)), [username]);
  const loaded = useAsync(load);
  const [data, update] = useLayered(loaded.data);
  const profile = { status: loaded.status, data, error: loaded.error, retry: loaded.retry, update };
  const banner = data?.user?.favouriteGames?.[0]; // the first favourite game's art is the banner
  return (
    <section className="flex flex-col gap-6 pb-12">
      <BackdropHero as="header" art={banner} seed="profile" className="px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold sm:text-4xl">Profile &amp; Settings</h1>
            <p className="mt-1 text-sm text-text-muted">Customize your public gamer identity and privacy settings</p>
          </div>
          {user && (
            <Link to={`/u/${user.username}`} className={buttonVariants({ variant: 'secondary' })}>
              View my public profile <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      </BackdropHero>
      {/* Profile Details & Favourite Showcase Editor */}
      {user && (
        <SettingsSection id="edit-profile-title" title="Gamer Identity" seed="profile-identity">
          <EditProfileSection profile={profile} />
        </SettingsSection>
      )}

      {/* Account Info */}
      <SettingsSection id="account-title" title="Account Information" seed="profile-account">
        <dl className="grid max-w-md gap-4 rounded-card border border-border/60 bg-bg/70 p-5 text-sm">
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
      </SettingsSection>

      {/* Connected platforms */}
      <SettingsSection id="steam-title" title="Steam" seed="profile-steam">
        <SteamLinkCard />
      </SettingsSection>

      {/* Privacy Settings */}
      {user && (
        <SettingsSection id="privacy-title" title="Privacy" seed="profile-privacy">
          <PrivacySetting profile={profile} />
        </SettingsSection>
      )}

      {/* Blocked Players */}
      <SettingsSection id="blocked-title" title="Blocked Players" seed="profile-blocked">
        <BlockedPlayers />
      </SettingsSection>

      {/* Danger Zone: Delete Account */}
      {user && (
        <SettingsSection id="danger-title" title="Delete Account" seed="profile-danger">
          <DeleteAccountSection username={user.username} />
        </SettingsSection>
      )}
    </section>
  );
}

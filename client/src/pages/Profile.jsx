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
import { deleteAccount, getAccountSummary } from '@/services/accountApi.js';
import { Button } from '@/components/ui/button.jsx';
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

function EditProfileSection({ profile }) {
  const { status, data, error, retry, update } = profile;

  if (status === 'loading') return <Skeleton className="h-64 w-full" role="status" aria-label="Loading profile editor" />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;

  return <ProfileEditor initialProfile={data?.user} onSaved={(saved) => update({ ...data, user: { ...data.user, ...saved } })} />;
}

function ProfileEditor({ initialProfile, onSaved }) {
  const [avatar, setAvatar] = useState(initialProfile?.avatar ?? '');
  const [showCustomUrl, setShowCustomUrl] = useState(() => Boolean(initialProfile?.avatar && !AVATAR_PRESETS.some((p) => p.url === initialProfile.avatar)));
  const [bio, setBio] = useState(initialProfile?.bio ?? '');
  // Four slots, each a game or empty. Saving keeps their order and drops the empty ones.
  const [slots, setSlots] = useState(() => Array.from({ length: SLOT_COUNT }, (_, i) => initialProfile?.favouriteGames?.[i] ?? null));
  const [openSlot, setOpenSlot] = useState(null);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const chosenIds = new Set(slots.filter(Boolean).map((g) => g.id));
  const filled = slots.filter(Boolean).length;

  const tilesRef = useRef(null);
  const focusSlot = useRef(null);
  useEffect(() => {
    if (focusSlot.current === null) return;
    const button = tilesRef.current?.querySelector(`[data-slot-action="${focusSlot.current}"]`);
    focusSlot.current = null;
    button?.focus();
  });

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
    focusSlot.current = openSlot;
    setOpenSlot(null);
  }

  function chooseFavourite(game) {
    setSlots((current) => current.map((g, i) => (i === openSlot ? game : g)));
    setAnnouncement(`Added ${game.title} to favourite ${openSlot + 1}`);
    focusSlot.current = openSlot;
    setOpenSlot(null);
  }

  function removeFavourite(index) {
    setAnnouncement(`Removed ${slots[index]?.title ?? 'game'} from favourites`);
    setSlots((current) => current.map((g, i) => (i === index ? null : g)));
    focusSlot.current = index;
  }

  function handleDiscard() {
    setAvatar(initialProfile?.avatar ?? '');
    setBio(initialProfile?.bio ?? '');
    setSlots(Array.from({ length: SLOT_COUNT }, (_, i) => initialProfile?.favouriteGames?.[i] ?? null));
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
      <div className="flex flex-col gap-5">
        {/* Avatar Settings */}
        <div>
          <label htmlFor="avatar-input" className="text-sm font-semibold mb-2 block">Avatar</label>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Preset avatar circles */}
              {AVATAR_PRESETS.map((p) => {
                const isSelected = avatar === p.url;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setAvatar(p.url)}
                    aria-label={`Select ${p.label} avatar`}
                    title={p.label}
                    className={`group relative h-12 w-12 rounded-full overflow-hidden border-2 transition-all ${
                      isSelected
                        ? 'border-[#C8F135] ring-2 ring-[#C8F135]/40 scale-105'
                        : 'border-border/60 hover:border-text-muted opacity-80 hover:opacity-100'
                    }`}
                  >
                    <img src={p.url} alt={p.label} className="h-full w-full object-cover" />
                  </button>
                );
              })}

              {avatar && (
                <button
                  type="button"
                  onClick={() => setAvatar('')}
                  className="rounded-full border border-border px-3 py-1 text-xs text-text-muted hover:text-text hover:bg-surface-raised transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowCustomUrl((s) => !s)}
                className="text-xs font-semibold text-accent-text hover:underline inline-flex items-center gap-1"
              >
                {showCustomUrl ? 'Hide image URL field' : 'Use an image URL'}
              </button>

              {showCustomUrl && (
                <div className="mt-2 flex flex-col gap-1.5 animate-in fade-in duration-200">
                  <input
                    id="avatar-input"
                    type="url"
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="w-full min-h-11 rounded-control border border-border bg-bg px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              )}
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

        {/* Favourite 4: compact cover-sized tiles */}
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

      {/* Sticky Save Bar: appears only when something has changed */}
      {dirty && (
        <div className="sticky bottom-3 z-20 mt-4 flex items-center justify-between gap-3 rounded-[10px] border border-border bg-surface-raised/95 px-4 py-3 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
          <span role="status" className="flex items-center gap-2 text-xs font-semibold text-text">
            <span className="h-2 w-2 rounded-full bg-[var(--secondary-accent)]" aria-hidden="true" />
            Unsaved changes
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleDiscard}
              className="text-xs text-text-muted hover:text-text hover:bg-surface"
            >
              Discard
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-105 text-xs font-bold shadow-sm"
            >
              <Save className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </div>
      )}
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
  if (status === 'loading') return <Skeleton className="h-16 w-full" role="status" aria-label="Loading privacy" />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;
  return (
    <div className="flex w-full flex-col gap-1.5 rounded-card border border-border/60 bg-bg/70 p-5">
      <label htmlFor={id} className="text-sm font-semibold text-text">Who can see my profile</label>
      <select
        id={id}
        value={current.user.privacy}
        onChange={(e) => change(e.target.value)}
        className="min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
      >
        {PROFILE_PRIVACY.map((p) => (
          <option key={p} value={p}>{PRIVACY_LABELS[p]}</option>
        ))}
      </select>
      <p className="text-xs text-text-muted mt-1">Games you hide from friends stay hidden at every level.</p>
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

  if (status === 'loading') return <Skeleton className="h-16 w-full" role="status" aria-label="Loading blocked players" />;
  if (status === 'error') return <ErrorState message={error.message} onRetry={retry} />;
  if (blocked.length === 0) {
    return (
      <div className="rounded-card border border-border/60 bg-bg/70 p-5">
        <p className="text-sm text-text-muted">You haven’t blocked anyone.</p>
      </div>
    );
  }
  return (
    <div className="rounded-card border border-border/60 bg-bg/70 p-5">
      <ul className="flex w-full flex-col gap-2">
        {blocked.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-3">
            <span className="font-medium text-sm">{u.username}</span>
            <Button variant="secondary" onClick={() => unblock(u)} aria-label={`Unblock ${u.username}`}>
              <ShieldOff className="h-4 w-4" aria-hidden="true" /> Unblock
            </Button>
          </li>
        ))}
      </ul>
    </div>
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
    <div className="flex flex-col gap-3 rounded-card border border-danger/20 bg-danger/5 p-4">
      {!open ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-text-muted leading-relaxed">
            Permanently delete your account and all game data. This cannot be undone.
          </p>
          <Button
            variant="secondary"
            onClick={() => setOpen(true)}
            className="w-fit shrink-0 border-danger/40 text-danger hover:bg-danger/10 text-xs h-9"
          >
            Delete account…
          </Button>
        </div>
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
              className="bg-danger text-white hover:bg-danger/90 disabled:opacity-50 text-xs"
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
              className="text-xs"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function SettingsSection({ id, title, seed, children }) {
  return (
    <ArtPanel aria-labelledby={id} seed={seed} className="flex flex-col gap-3 p-5">
      <h2 id={id} className="text-lg font-semibold font-heading text-text">{title}</h2>
      {children}
    </ArtPanel>
  );
}

function ProfileHeaderBanner({ user, banner, profileData }) {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let active = true;
    getAccountSummary()
      .then((res) => {
        if (active) setSummary(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const username = user?.username;
  const avatarUrl = profileData?.user?.avatar || user?.avatar;
  const level = summary?.level ?? 1;
  const xp = summary?.xp ?? 0;
  const startXp = summary?.levelStartXp ?? 0;
  const nextXp = summary?.nextLevelXp ?? 100;
  const range = Math.max(1, nextXp - startXp);
  const xpPct = Math.min(100, Math.max(0, Math.round(((xp - startXp) / range) * 100)));

  return (
    <BackdropHero
      as="header"
      art={banner}
      seed="profile"
      className="relative isolate overflow-hidden rounded-[14px] border border-white/10 bg-[#111311] p-6 text-white shadow-xl sm:p-8"
    >
      {/* Dark left scrim for maximum text contrast */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-black/90 via-black/75 via-60% to-transparent"
      />

      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Profile &amp; Settings
            </h1>
            <p className="mt-1 text-xs text-[#9AA3B2]">
              Customize your public gamer identity and privacy settings
            </p>
          </div>
          {user && (
            <Link
              to={`/u/${user.username}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-4 py-2 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/25 hover:border-white/30"
            >
              View my public profile <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          {/* Avatar (large, 88px, ring) */}
          <div className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full bg-[#16181D] ring-2 ring-white/20 shadow-xl">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-heading text-3xl font-bold text-[var(--accent-fg)] bg-[var(--accent)]">
                {username?.charAt(0).toUpperCase() || 'U'}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5 min-w-0">
            <h2 className="font-heading text-xl font-bold text-white sm:text-2xl truncate">
              {username}
            </h2>

            {/* Level + thin XP progress bar */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-[var(--accent)] whitespace-nowrap">
                Level {level}
              </span>
              <div
                className="h-1.5 w-28 sm:w-36 rounded-full bg-white/20 overflow-hidden"
                role="progressbar"
                aria-valuenow={xpPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Level XP progress"
              >
                <div
                  className="h-full bg-[var(--accent)] rounded-full transition-all duration-500"
                  style={{ width: `${xpPct}%` }}
                />
              </div>
              <span className="text-[11px] tabular-nums text-[#9AA3B2] whitespace-nowrap">
                {xp} / {nextXp} XP
              </span>
            </div>

            {/* Member since */}
            <p className="text-xs text-[#9AA3B2]">
              Member since{' '}
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
                : '—'}
            </p>
          </div>
        </div>
      </div>
    </BackdropHero>
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
      <ProfileHeaderBanner user={user} banner={banner} profileData={data} />

      {/* Two-column layout on desktop (>=1024px) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)] lg:items-start">
        {/* Left column (wider): Gamer identity & Steam */}
        <div className="flex flex-col gap-6 min-w-0">
          {user && (
            <SettingsSection id="edit-profile-title" title="Gamer Identity" seed="profile-identity">
              <EditProfileSection profile={profile} />
            </SettingsSection>
          )}

          <SettingsSection id="steam-title" title="Steam" seed="profile-steam">
            <SteamLinkCard />
          </SettingsSection>
        </div>

        {/* Right column (narrower, sticky): Account information, Privacy, Blocked players, Delete account */}
        <div className="flex flex-col gap-6 min-w-0 lg:sticky lg:top-20">
          <SettingsSection id="account-title" title="Account Information" seed="profile-account">
            <dl className="grid w-full gap-4 rounded-card border border-border/60 bg-bg/70 p-5 text-sm">
              <div>
                <dt className="text-xs font-medium text-text-muted">Username</dt>
                <dd className="font-normal text-text mt-0.5">{user?.username}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-text-muted">Email</dt>
                <dd className="font-normal text-text mt-0.5">{user?.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-text-muted">Member since</dt>
                <dd className="font-normal text-text mt-0.5">
                  {user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : '—'}
                </dd>
              </div>
            </dl>
          </SettingsSection>

          {user && (
            <SettingsSection id="privacy-title" title="Privacy" seed="profile-privacy">
              <PrivacySetting profile={profile} />
            </SettingsSection>
          )}

          <SettingsSection id="blocked-title" title="Blocked Players" seed="profile-blocked">
            <BlockedPlayers />
          </SettingsSection>

          {user && (
            <SettingsSection id="danger-title" title="Delete Account" seed="profile-danger">
              <DeleteAccountSection username={user.username} />
            </SettingsSection>
          )}
        </div>
      </div>
    </section>
  );
}

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useAuth.js', () => ({ useAuth: () => ({ user: { id: 'me1', username: 'neo', email: 'neo@example.com' } }) }));
vi.mock('@/services/socialApi.js', () => ({
  listFriends: vi.fn(),
  listRequests: vi.fn(),
  getProfile: vi.fn(),
  getProfileActivity: vi.fn(),
  getProfileCollections: vi.fn(),
  listBlocked: vi.fn(),
  updateProfile: vi.fn(),
  setPrivacy: vi.fn(),
  unblockUser: vi.fn(),
  searchUsers: vi.fn(),
  sendFriendRequest: vi.fn(),
  acceptRequest: vi.fn(),
  declineRequest: vi.fn(),
  cancelRequest: vi.fn(),
  unfriend: vi.fn(),
  blockUser: vi.fn(),
}));
vi.mock('@/services/steamApi.js', () => ({ getSteamStatus: vi.fn().mockResolvedValue({ linked: false }), linkSteam: vi.fn(), unlinkSteam: vi.fn(), syncSteam: vi.fn() }));
vi.mock('@/services/gamesApi.js', () => ({ searchGames: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock('@/services/libraryApi.js', () => ({ listLibrary: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock('@/services/collectionsApi.js', () => ({
  listCollections: vi.fn(),
  getCollection: vi.fn(),
  createCollection: vi.fn(),
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
  moveCollectionItem: vi.fn(),
  removeCollectionItem: vi.fn(),
}));
vi.mock('@/services/sessionsApi.js', () => ({
  listSessions: vi.fn(),
  getSession: vi.fn(),
  rsvpSession: vi.fn(),
  updateSession: vi.fn(),
  cancelSession: vi.fn(),
  downloadIcs: vi.fn(),
}));

const social = await import('@/services/socialApi.js');
const collections = await import('@/services/collectionsApi.js');
const sessions = await import('@/services/sessionsApi.js');
const { default: Friends } = await import('./Friends.jsx');
const { default: UserProfile } = await import('./UserProfile.jsx');
const { default: Profile } = await import('./Profile.jsx');
const { default: Collections } = await import('./Collections.jsx');
const { default: Collection } = await import('./Collection.jsx');
const { default: Session } = await import('./Session.jsx');
const { SessionRow } = await import('@/components/sessions/SessionRow.jsx');
const { CollectionCard } = await import('@/components/collections/CollectionCard.jsx');
const { LARGE_TILE, TILE } = await import('@/components/profile/FavouriteTiles.jsx');

const BACKDROP = (n) => `https://images.igdb.com/igdb/image/upload/t_1080p/bd${n}.jpg`;
const fav = (n, extra = {}) => ({ id: `g${n}`, slug: `game-${n}`, title: `Game ${n}`, cover: null, backdrop: BACKDROP(n), ratingAvg: 4.2, genres: [], ...extra });

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/friends" element={<Friends />} />
        <Route path="/u/:username" element={<UserProfile />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/collections/:id" element={<Collection />} />
        <Route path="/sessions/:id" element={<Session />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  social.listRequests.mockResolvedValue({ incoming: [], outgoing: [] });
  social.getProfileActivity.mockResolvedValue({ items: [], nextCursor: null });
  social.getProfileCollections.mockResolvedValue([]);
  social.listBlocked.mockResolvedValue([]);
});

describe('public profile', () => {
  const profile = (user = {}, over = {}) => ({
    user: { id: 'a1', username: 'alex', memberSince: '2026-01-01T00:00:00Z', favouriteGames: [], ...user },
    relation: 'friend',
    restricted: false,
    stats: { games: 4, playing: 1, completed: 2, hours: 30, reviews: 3 },
    ...over,
  });

  it('the banner is the art of their first favourite game', async () => {
    social.getProfile.mockResolvedValue(profile({ favouriteGames: [fav(1), fav(2)] }));
    const { container } = renderAt('/u/alex');
    await screen.findByRole('heading', { level: 1, name: 'alex' });
    const banner = container.querySelector('header[data-hero]');
    expect(banner).toHaveAttribute('data-hero', 'art');
    expect(banner.querySelector('img')).toHaveAttribute('src', BACKDROP(1));
    expect(banner).toContainElement(screen.getByRole('heading', { level: 1 }));
  });

  it('without favourites, or when the profile is private, the banner is a gradient and shows no one\'s art', async () => {
    social.getProfile.mockResolvedValue(profile());
    const first = renderAt('/u/alex');
    await screen.findByRole('heading', { level: 1, name: 'alex' });
    expect(first.container.querySelector('header[data-hero]')).toHaveAttribute('data-hero', 'gradient');
    first.unmount();

    social.getProfile.mockResolvedValue(profile({ favouriteGames: [fav(1)] }, { restricted: true, relation: 'none' }));
    const second = renderAt('/u/alex');
    await screen.findByRole('heading', { level: 1, name: 'alex' });
    expect(second.container.querySelector('header[data-hero]')).toHaveAttribute('data-hero', 'gradient');
  });

  it('a private profile has one h1 (the name), not two', async () => {
    social.getProfile.mockResolvedValue(profile({ favouriteGames: [fav(1)] }, { restricted: true, relation: 'none' }));
    renderAt('/u/alex');
    await screen.findByText('This profile is private');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows the favourites as large covers (bigger than the editor tiles), with the rating in accent not gold', async () => {
    social.getProfile.mockResolvedValue(profile({ favouriteGames: [fav(1), fav(2), fav(3), fav(4)] }));
    renderAt('/u/alex');
    const list = (await screen.findByRole('heading', { name: /Favourite 4/ })).closest('section').querySelector('ul');
    const tiles = within(list).getAllByRole('listitem');
    expect(tiles).toHaveLength(4);
    for (const li of tiles) {
      expect(li.className).toContain(LARGE_TILE);
      expect(li.className).not.toContain(TILE);
    }
    expect(LARGE_TILE).toMatch(/sm:w-44/);
    expect(TILE).toMatch(/sm:w-28/);
    expect(list.innerHTML).not.toMatch(/text-reward/);
  });
});

describe('own profile page', () => {
  it('has a banner from the first favourite, and the banner, the editor and the privacy setting share one profile load', async () => {
    social.getProfile.mockResolvedValue({ user: { username: 'neo', avatar: null, bio: '', privacy: 'public', favouriteGames: [fav(7), fav(8)] } });
    const { container } = renderAt('/profile');
    expect(await screen.findByRole('list', { name: 'Favourite games' })).toBeInTheDocument();
    const banner = container.querySelector('header[data-hero]');
    expect(banner).toHaveAttribute('data-hero', 'art');
    expect(banner.querySelector('img')).toHaveAttribute('src', BACKDROP(7));
    expect(screen.getByRole('heading', { level: 1, name: 'Profile & Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view my public profile/i })).toHaveAttribute('href', '/u/neo');
    expect(social.getProfile).toHaveBeenCalledTimes(1);
  });

  it('keeps a gradient banner and an error with Retry in the editor when the profile cannot load', async () => {
    social.getProfile.mockRejectedValue(new Error('down'));
    const { container } = renderAt('/profile');
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0); // the editor and the privacy setting each say so
    expect(container.querySelector('header[data-hero]')).toHaveAttribute('data-hero', 'gradient');
    expect(screen.getByRole('heading', { level: 1, name: 'Profile & Settings' })).toBeInTheDocument();
  });
});

describe('saving the own profile', () => {
  it('keeps the form mounted and focused, updates the banner from the response, and does not reload', async () => {
    const user = userEvent.setup();
    social.getProfile.mockResolvedValue({ user: { username: 'neo', avatar: null, bio: '', privacy: 'public', favouriteGames: [fav(7)] } });
    social.updateProfile.mockResolvedValue({ username: 'neo', bio: 'Hello', favouriteGames: [fav(9), fav(7)] });
    const { container } = renderAt('/profile');
    const bio = await screen.findByLabelText(/bio/i);
    expect(container.querySelector('header[data-hero] img')).toHaveAttribute('src', BACKDROP(7));
    await user.type(bio, 'Hello');
    const save = screen.getByRole('button', { name: /save/i });
    save.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(social.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ bio: 'Hello' })));
    await waitFor(() => expect(container.querySelector('header[data-hero] img')).toHaveAttribute('src', BACKDROP(9)));
    expect(screen.getByLabelText(/bio/i)).toBe(bio); // the same field: nothing was remounted
    expect(screen.getByRole('button', { name: /save/i })).toHaveFocus();
    expect(screen.queryByRole('status', { name: 'Loading profile editor' })).not.toBeInTheDocument();
    expect(social.getProfile).toHaveBeenCalledTimes(1);
  });

  it('a privacy change updates the shared profile and rolls back when refused', async () => {
    const user = userEvent.setup();
    social.getProfile.mockResolvedValue({ user: { username: 'neo', avatar: null, bio: '', privacy: 'public', favouriteGames: [] } });
    social.setPrivacy.mockRejectedValueOnce(new Error('nope'));
    renderAt('/profile');
    const select = await screen.findByLabelText('Who can see my profile');
    await user.selectOptions(select, 'private');
    await waitFor(() => expect(select).toHaveValue('public')); // refused: back where it was
    social.setPrivacy.mockResolvedValue({ privacy: 'friends' });
    await user.selectOptions(select, 'friends');
    await waitFor(() => expect(social.setPrivacy).toHaveBeenLastCalledWith('friends'));
    expect(select).toHaveValue('friends');
  });
});

describe('friends rows', () => {
  it('sit on art with an initial for the avatar, and the link name is just the username', async () => {
    social.listFriends.mockResolvedValue([{ id: 'a1', username: 'alex' }]);
    const { container } = renderAt('/friends');
    const link = await screen.findByRole('link', { name: 'alex' });
    const row = link.closest('li');
    expect(row.querySelector('[data-art]')).not.toBeNull(); // the art layer of the row
    expect(within(row).getByText('a')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('li [data-art]').length).toBeGreaterThan(0);
  });
});

describe('collections', () => {
  const summary = (over = {}) => ({ id: 'c1', name: 'Faves', type: 'manual', visibility: 'public', itemCount: 3, covers: [], ...over });

  it('a collection card is its covers, with the name and size on a fade over them', () => {
    render(
      <MemoryRouter>
        <ul>
          <CollectionCard collection={summary({ covers: ['https://img/a.jpg', 'https://img/b.jpg'] })} />
        </ul>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /Faves/ });
    expect(link).toHaveAttribute('href', '/collections/c1');
    expect(within(link).getByRole('heading', { level: 3, name: 'Faves' })).toBeInTheDocument(); // h3 by default, under a section heading
    expect(link.querySelectorAll('img')).toHaveLength(2);
    const overlay = within(link).getByRole('heading', { name: 'Faves' }).parentElement;
    expect(overlay.className).toMatch(/absolute/);
    expect(overlay.className).toMatch(/from-bg\b/); // solid at the bottom, so the text keeps its contrast over any cover
    expect(within(link).getByText('3 games')).toBeInTheDocument();
  });

  it('the list header takes its art from the first collection', async () => {
    collections.listCollections.mockResolvedValue({ items: [summary({ covers: ['https://img/a.jpg'] })], nextCursor: null });
    const { container } = renderAt('/collections');
    await screen.findByRole('link', { name: /Faves/ });
    expect(container.querySelector('header [data-art="cover"]')).not.toBeNull(); // the header's art layer is the first collection's cover
  });

  it('the detail header is the art of its first game; an empty collection gets a gradient', async () => {
    const game = { id: 'g1', slug: 'hades', title: 'Hades', cover: null, backdrop: BACKDROP(1), genres: [], platforms: [] };
    collections.getCollection.mockResolvedValue({
      collection: { ...summary(), isOwner: true, rules: [], owner: { username: 'neo' } },
      items: [{ id: 'i1', position: 1, note: '', entry: { id: 'e1', status: 'backlog', game } }],
      nextCursor: null,
      truncated: false,
    });
    const first = renderAt('/collections/c1');
    await screen.findByRole('heading', { level: 1, name: 'Faves' });
    expect(first.container.querySelector('header[data-hero]')).toHaveAttribute('data-hero', 'art');
    expect(first.container.querySelector('header[data-hero] img')).toHaveAttribute('src', BACKDROP(1));
    first.unmount();

    collections.getCollection.mockResolvedValue({ collection: { ...summary({ itemCount: 0 }), isOwner: true, rules: [], owner: { username: 'neo' } }, items: [], nextCursor: null, truncated: false });
    const second = renderAt('/collections/c1');
    await screen.findByRole('heading', { level: 1, name: 'Faves' });
    expect(second.container.querySelector('header[data-hero]')).toHaveAttribute('data-hero', 'gradient');
  });
});

describe('sessions', () => {
  const session = (over = {}) => ({
    id: 's1',
    title: 'Co-op night',
    game: { id: 'g1', slug: 'hades', title: 'Hades', cover: 'https://img/cover.jpg', backdrop: BACKDROP(1) },
    host: { id: 'h1', username: 'alex' },
    startsAt: '2026-11-01T18:00:00Z',
    endsAt: '2026-11-01T20:00:00Z',
    durationMin: 120,
    platform: 'PC',
    maxPlayers: 4,
    visibility: 'friends',
    status: 'scheduled',
    isHost: false,
    myResponse: 'going',
    counts: { going: 2, maybe: 0, spotsLeft: 2 },
    attendees: [],
    ended: false,
    ...over,
  });

  it('a row shows the game cover and sits on the game art', () => {
    const { container } = render(
      <MemoryRouter>
        <ul>
          <SessionRow session={session()} />
        </ul>
      </MemoryRouter>,
    );
    const li = container.querySelector('li');
    expect(li.querySelector('[data-art="backdrop"]')).not.toBeNull(); // the art layer: the game's backdrop
    expect(li.querySelector('img[src*="cover.jpg"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Co-op night' })).toHaveAttribute('href', '/sessions/s1');
  });

  it('a row for a session without a game has no cover and still renders', () => {
    render(
      <MemoryRouter>
        <ul>
          <SessionRow session={session({ game: null })} />
        </ul>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Co-op night' })).toBeInTheDocument();
  });

  it('the detail header is the game backdrop with the title in it', async () => {
    sessions.getSession.mockResolvedValue(session());
    const { container } = renderAt('/sessions/s1');
    const title = await screen.findByRole('heading', { level: 1, name: 'Co-op night' });
    const hero = container.querySelector('header[data-hero]');
    expect(hero).toHaveAttribute('data-hero', 'art');
    expect(hero).toContainElement(title);
    expect(hero.querySelector('img')).toHaveAttribute('src', BACKDROP(1));
  });
});

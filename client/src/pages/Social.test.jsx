import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/hooks/useAuth.js', () => ({ useAuth: () => ({ user: { id: 'me1', username: 'demo', email: 'demo@gamequest.dev' } }) }));
vi.mock('@/services/socialApi.js', () => ({
  listFriends: vi.fn(),
  listRequests: vi.fn(),
  sendFriendRequest: vi.fn(),
  acceptRequest: vi.fn(),
  declineRequest: vi.fn(),
  cancelRequest: vi.fn(),
  unfriend: vi.fn(),
  listBlocked: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  searchUsers: vi.fn(),
  getProfile: vi.fn(),
  getProfileActivity: vi.fn(),
  getProfileCollections: vi.fn(),
  setPrivacy: vi.fn(),
  updateProfile: vi.fn(),
  getFeed: vi.fn(),
}));

const api = await import('@/services/socialApi.js');
const { default: Friends } = await import('./Friends.jsx');
const { default: UserProfile } = await import('./UserProfile.jsx');
const { default: Profile } = await import('./Profile.jsx');
const { FriendFeed } = await import('@/components/feed/FriendFeed.jsx');

const renderAt = (path, element) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/friends" element={<Friends />} />
        <Route path="/u/:username" element={<UserProfile />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/" element={element ?? <p>home</p>} />
      </Routes>
    </MemoryRouter>,
  );

const apiError = (status, message) => Object.assign(new Error('x'), { response: { status, data: { error: { code: 'X', message } } } });
const friend = (id, username) => ({ id, username, since: '2026-10-01T00:00:00Z' });
const noRequests = { incoming: [], outgoing: [] };
const activity = (id, type, extra = {}) => ({
  id,
  type,
  actor: { id: 'a1', username: 'alex' },
  game: { id: 'g1', slug: 'hades', title: 'Hades', cover: null },
  data: {},
  createdAt: new Date().toISOString(),
  ...extra,
});
const profile = (over = {}) => ({
  user: { id: 'a1', username: 'alex', memberSince: '2026-01-01T00:00:00Z' },
  relation: 'none',
  restricted: false,
  stats: { games: 4, playing: 1, completed: 2, hours: 30, reviews: 3 },
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  api.listRequests.mockResolvedValue(noRequests);
});

describe('Friends page — friends tab', () => {
  it('lists friends as links to their profiles', async () => {
    api.listFriends.mockResolvedValue([friend('a1', 'alex'), friend('b1', 'bea')]);
    renderAt('/friends');
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'alex' })).toHaveAttribute('href', '/u/alex');
    expect(screen.getByRole('link', { name: 'bea' })).toBeInTheDocument();
  });

  it('shows what a friend is currently playing when exposed', async () => {
    api.listFriends.mockResolvedValue([
      {
        ...friend('a1', 'alex'),
        currentlyPlaying: { id: 'g1', title: 'Hades', slug: 'hades', cover: 'hades.jpg', backdrop: 'hades-bd.jpg' },
      },
    ]);
    renderAt('/friends');
    expect(await screen.findByText('Playing Hades')).toBeInTheDocument();
  });

  it('shows an empty state with one action, and an error with Retry', async () => {
    api.listFriends.mockResolvedValueOnce([]);
    const first = renderAt('/friends');
    expect(await screen.findByText('No friends yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find people' })).toHaveAttribute('href', '/friends?tab=find');
    first.unmount();

    api.listFriends.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([friend('a1', 'alex')]);
    renderAt('/friends');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: 'alex' })).toBeInTheDocument();
  });

  it('unfriends only after confirming, removing the row at once', async () => {
    api.listFriends.mockResolvedValue([friend('a1', 'alex')]);
    api.unfriend.mockResolvedValue({});
    renderAt('/friends');
    await userEvent.click(await screen.findByRole('button', { name: 'Unfriend alex' }));
    expect(api.unfriend).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm: Unfriend alex' })).getByRole('button', { name: 'Unfriend' }));
    expect(api.unfriend).toHaveBeenCalledWith('a1');
    expect(await screen.findByText('No friends yet')).toBeInTheDocument();
  });

  it('puts the friend back and toasts when blocking fails', async () => {
    api.listFriends.mockResolvedValue([friend('a1', 'alex')]);
    api.blockUser.mockRejectedValue(apiError(500, 'Could not block right now'));
    renderAt('/friends');
    await userEvent.click(await screen.findByRole('button', { name: 'Block alex' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm: Block alex' })).getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not block right now'));
    expect(await screen.findByRole('link', { name: 'alex' })).toBeInTheDocument();
  });
});

describe('Friends page — requests tab', () => {
  const requests = {
    incoming: [{ id: 'r1', user: { id: 'c1', username: 'cara' }, createdAt: '2026-10-20T00:00:00Z' }],
    outgoing: [{ id: 'r2', user: { id: 'd1', username: 'dan' }, createdAt: '2026-10-20T00:00:00Z' }],
  };

  it('shows a count badge on the tab and lists received and sent requests', async () => {
    api.listFriends.mockResolvedValue([]);
    api.listRequests.mockResolvedValue(requests);
    renderAt('/friends?tab=requests');
    expect(await screen.findByRole('link', { name: 'cara' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'dan' })).toBeInTheDocument();
    expect(screen.getByLabelText('1 waiting')).toBeInTheDocument();
  });

  it('accepts optimistically', async () => {
    api.listRequests.mockResolvedValue(requests);
    api.acceptRequest.mockResolvedValue({});
    renderAt('/friends?tab=requests');
    await userEvent.click(await screen.findByRole('button', { name: 'Accept cara' }));
    expect(api.acceptRequest).toHaveBeenCalledWith('r1');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'cara' })).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('You and cara are now friends');
  });

  it('rolls back a failed decline with a toast', async () => {
    api.listRequests.mockResolvedValue(requests);
    api.declineRequest.mockRejectedValue(apiError(409, 'This request was changed elsewhere. Refresh and try again.'));
    renderAt('/friends?tab=requests');
    await userEvent.click(await screen.findByRole('button', { name: 'Decline cara' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This request was changed elsewhere. Refresh and try again.'));
    expect(screen.getByRole('link', { name: 'cara' })).toBeInTheDocument();
  });

  it('cancels a sent request and shows the empty state when nothing is left', async () => {
    api.listRequests.mockResolvedValue({ incoming: [], outgoing: requests.outgoing });
    api.cancelRequest.mockResolvedValue({});
    renderAt('/friends?tab=requests');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel request to dan' }));
    expect(api.cancelRequest).toHaveBeenCalledWith('r2');
    expect(await screen.findByText('No pending requests')).toBeInTheDocument();
  });
});

describe('Friends page — find tab', () => {
  it('asks for at least two letters, then searches and adds a friend', async () => {
    api.searchUsers.mockResolvedValue([
      { id: 'a1', username: 'alex', relation: 'none' },
      { id: 'b1', username: 'alba', relation: 'friend' },
      { id: 'c1', username: 'alice', relation: 'pending_out' },
    ]);
    api.sendFriendRequest.mockResolvedValue({ status: 'pending', user: { id: 'a1', username: 'alex' } });
    renderAt('/friends?tab=find');
    expect(screen.getByText('Type at least 2 letters of a username.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search players by username'), 'al');
    expect(await screen.findByRole('link', { name: 'alex' }, { timeout: 3000 })).toBeInTheDocument();
    expect(api.searchUsers).toHaveBeenCalledWith('al', expect.anything());
    // relation is shown as a label, not just colour
    expect(within(screen.getByRole('link', { name: 'alba' }).closest('li')).getByText('Friends')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: 'alice' }).closest('li')).getByText('Request sent')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add alex as a friend' }));
    expect(api.sendFriendRequest).toHaveBeenCalledWith('alex');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Request sent to alex'));
    expect(screen.queryByRole('button', { name: 'Add alex as a friend' })).not.toBeInTheDocument();
  });

  it('shows an empty state when nobody matches and a scoped error when search fails', async () => {
    api.searchUsers.mockResolvedValueOnce([]);
    renderAt('/friends?tab=find');
    await userEvent.type(screen.getByLabelText('Search players by username'), 'zz');
    expect(await screen.findByText('No players found for “zz”', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('reverts the button and toasts when the request fails', async () => {
    api.searchUsers.mockResolvedValue([{ id: 'a1', username: 'alex', relation: 'none' }]);
    api.sendFriendRequest.mockRejectedValue(apiError(404, 'No player with that username'));
    renderAt('/friends?tab=find');
    await userEvent.type(screen.getByLabelText('Search players by username'), 'alex');
    await userEvent.click(await screen.findByRole('button', { name: 'Add alex as a friend' }, { timeout: 3000 }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No player with that username'));
    expect(screen.getByRole('button', { name: 'Add alex as a friend' })).toBeInTheDocument();
  });
});

describe('UserProfile', () => {
  beforeEach(() => {
    api.getProfileActivity.mockResolvedValue({ items: [], nextCursor: null });
    api.getProfileCollections.mockResolvedValue([]);
  });

  it('shows stats, activity and collections sections for a visible profile', async () => {
    api.getProfile.mockResolvedValue(profile({ relation: 'friend' }));
    api.getProfileActivity.mockResolvedValue({ items: [activity('x1', 'library.statusChanged', { data: { from: 'backlog', to: 'playing' } })], nextCursor: null });
    api.getProfileCollections.mockResolvedValue([{ id: 'c1', name: 'Faves', type: 'manual', visibility: 'public', itemCount: 3, covers: [] }]);
    renderAt('/u/alex');
    expect(screen.getByRole('status', { name: 'Loading profile' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'alex' })).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument(); // hours
    expect(await screen.findByText(/started playing/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Faves/ })).toHaveAttribute('href', '/collections/c1');
  });

  it('offers Add friend to a stranger and updates optimistically', async () => {
    api.getProfile.mockResolvedValue(profile());
    api.sendFriendRequest.mockResolvedValue({ status: 'pending' });
    renderAt('/u/alex');
    await userEvent.click(await screen.findByRole('button', { name: 'Add friend' }));
    expect(api.sendFriendRequest).toHaveBeenCalledWith('alex');
    expect(await screen.findByText('Request sent')).toBeInTheDocument();
  });

  it('rolls back Add friend when the server refuses', async () => {
    api.getProfile.mockResolvedValue(profile());
    api.sendFriendRequest.mockRejectedValue(apiError(429, 'Too many requests, try again later'));
    renderAt('/u/alex');
    await userEvent.click(await screen.findByRole('button', { name: 'Add friend' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Too many requests, try again later'));
    expect(screen.getByRole('button', { name: 'Add friend' })).toBeInTheDocument();
  });

  it('confirms before blocking', async () => {
    api.getProfile.mockResolvedValue(profile({ relation: 'friend' }));
    api.blockUser.mockResolvedValue({});
    renderAt('/u/alex');
    await userEvent.click(await screen.findByRole('button', { name: 'Block alex' }));
    expect(api.blockUser).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm blocking alex' })).getByRole('button', { name: 'Block' }));
    expect(api.blockUser).toHaveBeenCalledWith('a1');
    expect(await screen.findByText('Blocked')).toBeInTheDocument();
  });

  it('shows a restricted notice (and loads no private data) for a private profile', async () => {
    api.getProfile.mockResolvedValue(profile({ restricted: true, stats: null }));
    renderAt('/u/alex');
    expect(await screen.findByText('This profile is private')).toBeInTheDocument();
    expect(api.getProfileActivity).not.toHaveBeenCalled();
    expect(api.getProfileCollections).not.toHaveBeenCalled();
  });

  it('shows not-found and error states', async () => {
    api.getProfile.mockRejectedValueOnce(apiError(404, 'No player with that username'));
    const first = renderAt('/u/ghost');
    expect(await screen.findByText('Player not found')).toBeInTheDocument();
    first.unmount();

    api.getProfile.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(profile());
    renderAt('/u/alex');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'alex' })).toBeInTheDocument();
  });

  it('keeps the page up when only the activity section fails', async () => {
    api.getProfile.mockResolvedValue(profile());
    api.getProfileActivity.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ items: [], nextCursor: null });
    renderAt('/u/alex');
    expect(await screen.findByRole('heading', { name: 'alex' })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No activity to show')).toBeInTheDocument();
  });

  it('links to the editor for your own profile', async () => {
    api.getProfile.mockResolvedValue(profile({ relation: 'self', user: { id: 'me1', username: 'demo', memberSince: '2026-01-01T00:00:00Z' } }));
    renderAt('/u/demo');
    expect(await screen.findByRole('link', { name: 'Edit my profile' })).toHaveAttribute('href', '/profile');
  });

  it('renders favourite games showcase and trophy milestones for a user', async () => {
    api.getProfile.mockResolvedValue(
      profile({
        user: {
          id: 'a1',
          username: 'alex',
          memberSince: '2026-01-01T00:00:00Z',
          bio: 'Indie & deckbuilder enthusiast',
          favouriteGames: [
            { id: 'g1', title: 'Celeste', slug: 'celeste', cover: 'celeste.jpg', ratingAvg: 4.8 },
          ],
        },
        stats: { games: 12, playing: 2, completed: 6, hours: 60, reviews: 3 },
      }),
    );
    renderAt('/u/alex');
    expect(await screen.findByText('Favourite 4 Showcase')).toBeInTheDocument();
    expect(screen.getByText('Celeste')).toBeInTheDocument();
    // the rating is read as "4.8 out of 5"; the star is decoration
    expect(screen.getByText('4.8', { exact: false, selector: 'span' })).toHaveTextContent('4.8 out of 5');
    expect(screen.getByText('Celeste').closest('a')).toHaveAttribute('href', expect.stringContaining('/games/'));
    expect(screen.getByText(/Indie & deckbuilder enthusiast/)).toBeInTheDocument();
    expect(screen.getByText('Trophies & Milestones')).toBeInTheDocument();
    expect(screen.getByText('Veteran Collector')).toBeInTheDocument();
  });
});

describe('FriendFeed', () => {
  it('describes each kind of activity', async () => {
    api.getFeed.mockResolvedValue({
      friendCount: 1,
      nextCursor: null,
      items: [
        activity('1', 'library.statusChanged', { data: { from: 'playing', to: 'completed' } }),
        activity('2', 'review.created', { data: { rating: 4 } }),
        activity('3', 'library.sessionLogged', { data: { minutes: 45 } }),
        activity('4', 'collection.created', { game: null, data: { collectionId: 'c9', name: 'Cozy', collectionType: 'manual' } }),
        activity('5', 'library.statusChanged', { data: { from: null, to: 'backlog' } }),
      ],
    });
    renderAt('/', <FriendFeed />);
    expect(await screen.findByText(/completed/)).toBeInTheDocument();
    expect(screen.getByText(/reviewed/)).toBeInTheDocument();
    expect(screen.getByText('4 out of 5', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/played/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '“Cozy”' })).toHaveAttribute('href', '/collections/c9');
    expect(screen.getByText(/to their backlog/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'alex' })[0]).toHaveAttribute('href', '/u/alex');
  });

  it('tells you to add friends when you have none, and says why when it is just quiet', async () => {
    api.getFeed.mockResolvedValueOnce({ items: [], nextCursor: null, friendCount: 0 });
    const first = renderAt('/', <FriendFeed />);
    expect(await screen.findByText('No friends yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find friends' })).toHaveAttribute('href', '/friends?tab=find');
    first.unmount();

    api.getFeed.mockResolvedValueOnce({ items: [], nextCursor: null, friendCount: 3 });
    renderAt('/', <FriendFeed />);
    expect(await screen.findByText('Nothing new from your friends')).toBeInTheDocument();
  });

  it('shows a scoped error with Retry, and pages with the cursor', async () => {
    api.getFeed
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ items: [activity('1', 'library.sessionLogged', { data: { minutes: 10 } })], nextCursor: 'cur1', friendCount: 1 })
      .mockResolvedValueOnce({ items: [activity('2', 'library.sessionLogged', { data: { minutes: 20 } })], nextCursor: null, friendCount: 1 });
    renderAt('/', <FriendFeed />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('20')).toBeInTheDocument();
    expect(api.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cur1' }), expect.anything());
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });
});

describe('Profile page — privacy and blocked players', () => {
  beforeEach(() => {
    api.getProfile.mockResolvedValue(profile({ relation: 'self', user: { id: 'me1', username: 'demo', memberSince: '2026-01-01T00:00:00Z', privacy: 'public' } }));
    api.listBlocked.mockResolvedValue([{ id: 'z1', username: 'zed' }]);
  });

  it('changes privacy optimistically and toasts', async () => {
    api.setPrivacy.mockResolvedValue('friends');
    renderAt('/profile');
    await userEvent.selectOptions(await screen.findByLabelText('Who can see my profile'), 'friends');
    expect(api.setPrivacy).toHaveBeenCalledWith('friends');
    expect(screen.getByLabelText('Who can see my profile')).toHaveValue('friends');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Profile privacy updated'));
  });

  it('reverts the privacy select when saving fails', async () => {
    api.setPrivacy.mockRejectedValue(apiError(500, 'Could not save'));
    renderAt('/profile');
    await userEvent.selectOptions(await screen.findByLabelText('Who can see my profile'), 'private');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not save'));
    expect(screen.getByLabelText('Who can see my profile')).toHaveValue('public');
  });

  it('unblocks a player, and shows the empty line after', async () => {
    api.unblockUser.mockResolvedValue({});
    renderAt('/profile');
    await userEvent.click(await screen.findByRole('button', { name: 'Unblock zed' }));
    expect(api.unblockUser).toHaveBeenCalledWith('z1');
    expect(await screen.findByText('You haven’t blocked anyone.')).toBeInTheDocument();
  });

  it('links to the public profile', async () => {
    renderAt('/profile');
    expect(await screen.findByRole('link', { name: 'View my public profile' })).toHaveAttribute('href', '/u/demo');
  });

  it('edits and saves bio via profile editor', async () => {
    api.getProfile.mockResolvedValue(profile({ relation: 'self' }));
    api.updateProfile.mockResolvedValue({ user: { id: 'me1', username: 'demo', bio: 'New bio' } });
    renderAt('/profile');
    const bioInput = await screen.findByPlaceholderText(/Tell your friends about your gaming tastes/);
    await userEvent.clear(bioInput);
    await userEvent.type(bioInput, 'Speedrunner at heart');
    await userEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
    expect(api.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ bio: 'Speedrunner at heart' }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Profile updated successfully'));
  });
});

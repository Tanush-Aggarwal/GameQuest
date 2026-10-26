import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/hooks/useAuth.js', () => ({ useAuth: () => ({ user: { id: 'me1', username: 'demo' } }) }));
vi.mock('@/services/sessionsApi.js', () => ({
  listSessions: vi.fn(),
  getSession: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  cancelSession: vi.fn(),
  rsvpSession: vi.fn(),
  downloadIcs: vi.fn(),
}));
vi.mock('@/services/socialApi.js', () => ({ listFriends: vi.fn() }));
vi.mock('@/services/gamesApi.js', () => ({ getGame: vi.fn(), searchGames: vi.fn() }));

const api = await import('@/services/sessionsApi.js');
const social = await import('@/services/socialApi.js');
const games = await import('@/services/gamesApi.js');
const { default: Sessions } = await import('./Sessions.jsx');
const { default: SessionNew } = await import('./SessionNew.jsx');
const { default: Session } = await import('./Session.jsx');
const { fromLocalInput, groupByLocalDay, toLocalInput } = await import('@/lib/sessionTime.js');

const hours = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
const GAME_ID = '1'.repeat(24);
const BEA_ID = '2'.repeat(24);
const CARA_ID = '3'.repeat(24);
const game = { id: GAME_ID, slug: 'hades', title: 'Hades', cover: null, genres: [], platforms: [] };
const summary = (over = {}) => ({
  id: 's1',
  title: 'Co-op night',
  customTitle: 'Co-op night',
  game,
  host: { id: 'a1', username: 'alex' },
  startsAt: hours(24),
  endsAt: hours(26),
  durationMin: 120,
  platform: 'PC',
  discordInviteUrl: null,
  maxPlayers: 4,
  visibility: 'friends',
  status: 'scheduled',
  ended: false,
  isHost: false,
  myResponse: 'invited',
  counts: { going: 2, maybe: 1, spotsLeft: 2 },
  ...over,
});
const detail = (over = {}) => ({
  ...summary(over),
  attendees: [
    { user: { id: 'a1', username: 'alex' }, response: 'going', role: 'host' },
    { user: { id: 'b1', username: 'bea' }, response: 'going', role: 'invitee' },
    { user: { id: 'me1', username: 'demo' }, response: 'invited', role: 'invitee' },
  ],
  ...over,
});
const apiError = (status, message) => Object.assign(new Error('x'), { response: { status, data: { error: { code: 'X', message } } } });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/sessions/new" element={<SessionNew />} />
        <Route path="/sessions/:id" element={<Session />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  social.listFriends.mockResolvedValue([{ id: BEA_ID, username: 'bea' }, { id: CARA_ID, username: 'cara' }]);
});

describe('time helpers', () => {
  it('round-trips a UTC instant through the local datetime input', () => {
    const iso = '2026-10-29T18:30:00.000Z';
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(fromLocalInput('not a date')).toBe('');
  });

  it('groups sessions by the viewer’s local day and keeps their order', () => {
    const groups = groupByLocalDay([
      { id: 1, startsAt: '2026-11-02T12:00:00Z' },
      { id: 2, startsAt: '2026-11-02T13:00:00Z' },
      { id: 3, startsAt: '2026-11-09T12:00:00Z' },
    ]);
    expect(groups.map((g) => g.sessions.map((s) => s.id))).toEqual([[1, 2], [3]]);
  });
});

describe('Sessions page', () => {
  it('shows a skeleton, then sessions grouped under day headings with response labels', async () => {
    api.listSessions.mockResolvedValue({
      items: [
        summary({ id: 's1', title: 'Monday co-op', startsAt: '2026-11-02T12:00:00Z', endsAt: '2026-11-02T14:00:00Z' }),
        summary({ id: 's2', title: 'Monday late', startsAt: '2026-11-02T13:00:00Z', endsAt: '2026-11-02T15:00:00Z', myResponse: 'going' }),
        summary({ id: 's3', title: 'Next week', startsAt: '2026-11-09T12:00:00Z', endsAt: '2026-11-09T14:00:00Z', isHost: true, myResponse: 'host' }),
      ],
      nextCursor: null,
    });
    renderAt('/sessions');
    expect(screen.getByRole('status', { name: 'Loading sessions' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Monday co-op' })).toHaveAttribute('href', '/sessions/s1');
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2); // two local days
    expect(screen.getByText('Invited')).toBeInTheDocument();
    expect(screen.getByText('Going')).toBeInTheDocument();
    expect(screen.getByText('Hosting')).toBeInTheDocument();
    expect(screen.getAllByText(/2\/4 going/)).toHaveLength(3);
    expect(screen.getByText(/Times shown in your timezone/)).toBeInTheDocument();
  });

  it('shows an empty state with one action, and a scoped error with Retry', async () => {
    api.listSessions.mockResolvedValueOnce({ items: [], nextCursor: null });
    const first = renderAt('/sessions');
    expect(await screen.findByText('No upcoming sessions')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Schedule a session' }).length).toBeGreaterThan(0);
    first.unmount();

    api.listSessions.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ items: [summary()], nextCursor: null });
    renderAt('/sessions');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: 'Co-op night' })).toBeInTheDocument();
  });

  it('loads the next page with the cursor', async () => {
    api.listSessions
      .mockResolvedValueOnce({ items: [summary({ id: 's1', title: 'First' })], nextCursor: '1:abc' })
      .mockResolvedValueOnce({ items: [summary({ id: 's2', title: 'Second' })], nextCursor: null });
    renderAt('/sessions');
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('link', { name: 'Second' })).toBeInTheDocument();
    expect(api.listSessions).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: '1:abc' }));
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });
});

describe('Schedule a session', () => {
  const setStart = (value) => fireEvent.change(screen.getByLabelText('Starts'), { target: { value } });

  async function openFormFor(slug = 'hades') {
    games.getGame.mockResolvedValue(game);
    renderAt(`/sessions/new?game=${slug}`);
    await screen.findByRole('form', { name: 'New session' });
  }

  it('prefills the game from ?game= and submits UTC times with the chosen options', async () => {
    api.createSession.mockResolvedValue(summary({ id: 'new1' }));
    api.getSession.mockResolvedValue(detail({ id: 'new1' }));
    await openFormFor();
    expect(screen.getByText('Hades')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Title'), 'Boss night');
    setStart('2099-01-01T18:30');
    await userEvent.type(screen.getByLabelText('Platform'), 'PC');
    await userEvent.click(await screen.findByLabelText('bea'));
    await userEvent.type(screen.getByLabelText('Discord invite'), 'discord.gg/hades-night');
    await userEvent.click(screen.getByRole('button', { name: 'Schedule session' }));
    await waitFor(() => expect(api.createSession).toHaveBeenCalled());
    expect(api.createSession).toHaveBeenCalledWith({
      gameId: GAME_ID,
      title: 'Boss night',
      startsAt: new Date('2099-01-01T18:30').toISOString(), // typed in local time, sent as UTC
      durationMin: 120,
      platform: 'PC',
      maxPlayers: 4,
      visibility: 'friends',
      inviteeIds: [BEA_ID],
      discordInviteUrl: 'https://discord.gg/hades-night', // normalised
    });
    expect(await screen.findByRole('heading', { name: 'Co-op night' })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Session scheduled');
  });

  it('validates inline: past start, bad Discord link, invite-only with nobody invited', async () => {
    await openFormFor();
    setStart('2020-01-01T10:00');
    await userEvent.type(screen.getByLabelText('Discord invite'), 'https://evil.example/discord.gg/abc');
    await userEvent.selectOptions(screen.getByLabelText('Who can join'), 'invite');
    await userEvent.click(screen.getByRole('button', { name: 'Schedule session' }));
    expect(await screen.findByText('Pick a start time in the future')).toBeInTheDocument();
    expect(screen.getByText(/Use a discord\.gg/)).toBeInTheDocument();
    expect(screen.getByText('Invite at least one friend')).toBeInTheDocument();
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it('shows the server’s message when saving fails and keeps the form', async () => {
    api.createSession.mockRejectedValue(apiError(400, 'You can only invite your friends'));
    await openFormFor();
    setStart('2099-01-01T18:30');
    await userEvent.click(screen.getByRole('button', { name: 'Schedule session' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You can only invite your friends');
    expect(screen.getByRole('form', { name: 'New session' })).toBeInTheDocument();
  });

  it('lets you search for a game when none is preselected', async () => {
    games.searchGames.mockResolvedValue({ items: [game], nextCursor: null, warnings: [] });
    renderAt('/sessions/new');
    expect(screen.getByText('Type at least 2 letters of the game’s name.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search for a game'), 'had');
    await userEvent.click(await screen.findByRole('button', { name: /Hades/ }, { timeout: 3000 }));
    expect(await screen.findByRole('form', { name: 'New session' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change game' }));
    expect(screen.getByLabelText('Search for a game')).toBeInTheDocument();
  });

  it('says so when you have no friends to invite', async () => {
    social.listFriends.mockResolvedValue([]);
    await openFormFor();
    expect(await screen.findByText(/You have no friends yet/)).toBeInTheDocument();
  });
});

describe('Session detail', () => {
  it('shows when, where, who and the Discord and calendar buttons', async () => {
    api.getSession.mockResolvedValue(detail({ discordInviteUrl: 'https://discord.gg/abc' }));
    renderAt('/sessions/s1');
    expect(screen.getByRole('status', { name: 'Loading session' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Co-op night' })).toBeInTheDocument();
    const discord = screen.getByRole('link', { name: /Join Discord/ });
    expect(discord).toHaveAttribute('href', 'https://discord.gg/abc');
    expect(discord).toHaveAttribute('target', '_blank');
    expect(discord).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByRole('link', { name: 'Hades' })).toHaveAttribute('href', '/games/hades');
    const who = screen.getByRole('heading', { name: /Who’s in/ }).closest('section');
    expect(within(who).getByRole('link', { name: 'alex' })).toBeInTheDocument();
    expect(within(who).getByText('Hosting')).toBeInTheDocument();
    expect(within(who).getByText('Invited')).toBeInTheDocument();
  });

  it('downloads the calendar file, and toasts if that fails', async () => {
    api.getSession.mockResolvedValue(detail());
    api.downloadIcs.mockResolvedValueOnce().mockRejectedValueOnce(apiError(404, 'Session not found'));
    renderAt('/sessions/s1');
    await userEvent.click(await screen.findByRole('button', { name: 'Add to calendar' }));
    expect(api.downloadIcs).toHaveBeenCalledWith('s1');
    await userEvent.click(screen.getByRole('button', { name: 'Add to calendar' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Session not found'));
  });

  it('RSVPs optimistically: your answer and the counts change before the server replies', async () => {
    const pending = deferred();
    api.getSession.mockResolvedValue(detail());
    api.rsvpSession.mockReturnValue(pending.promise);
    renderAt('/sessions/s1');
    await userEvent.click(await screen.findByRole('button', { name: /^Going$/ }));
    expect(api.rsvpSession).toHaveBeenCalledWith('s1', 'going');
    expect(screen.getByRole('button', { name: /^Going$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/3\/4 going/)).toBeInTheDocument(); // 2 → 3
    pending.resolve(detail({ myResponse: 'going', counts: { going: 3, maybe: 1, spotsLeft: 1 } }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('You’re going'));
  });

  it('rolls back and toasts the server message when the RSVP fails', async () => {
    api.getSession.mockResolvedValue(detail());
    api.rsvpSession.mockRejectedValue(apiError(409, 'This session is full'));
    renderAt('/sessions/s1');
    await userEvent.click(await screen.findByRole('button', { name: /^Going$/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This session is full'));
    expect(screen.getByRole('button', { name: /^Going$/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/2\/4 going/)).toBeInTheDocument();
  });

  it('disables Going when the session is full (but not for someone already going)', async () => {
    api.getSession.mockResolvedValue(detail({ counts: { going: 4, maybe: 0, spotsLeft: 0 } }));
    const first = renderAt('/sessions/s1');
    expect(await screen.findByRole('button', { name: /^Going$/ })).toBeDisabled();
    expect(screen.getByText('This session is full.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Maybe$/ })).toBeEnabled();
    first.unmount();

    api.getSession.mockResolvedValue(detail({ myResponse: 'going', counts: { going: 4, maybe: 0, spotsLeft: 0 } }));
    renderAt('/sessions/s1');
    expect(await screen.findByRole('button', { name: /^Going$/ })).toBeEnabled();
  });

  it('shows host controls instead of RSVP, and cancels only after confirming', async () => {
    api.getSession.mockResolvedValue(detail({ isHost: true, myResponse: 'host', inviteeIds: [BEA_ID] }));
    api.cancelSession.mockResolvedValue(detail({ isHost: true, myResponse: 'host', status: 'cancelled' }));
    renderAt('/sessions/s1');
    await screen.findByRole('heading', { name: 'Co-op night' });
    expect(screen.queryByRole('group', { name: 'Your response' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel this session' }));
    expect(api.cancelSession).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm cancelling the session' })).getByRole('button', { name: 'Cancel session' }));
    expect(api.cancelSession).toHaveBeenCalledWith('s1');
    expect(await screen.findByText('This session was cancelled.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel this session' })).not.toBeInTheDocument();
  });

  it('lets the host edit; an unchanged start time is not re-sent', async () => {
    const session = detail({ isHost: true, myResponse: 'host', inviteeIds: [BEA_ID] });
    api.getSession.mockResolvedValue(session);
    api.updateSession.mockResolvedValue({ ...session, customTitle: 'Renamed', title: 'Renamed' });
    renderAt('/sessions/s1');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const title = screen.getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.updateSession).toHaveBeenCalled());
    const [, patch] = api.updateSession.mock.calls[0];
    expect(patch.title).toBe('Renamed');
    expect(patch).not.toHaveProperty('startsAt');
    expect(patch).not.toHaveProperty('gameId');
    expect(await screen.findByRole('heading', { name: 'Renamed' })).toBeInTheDocument();
  });

  it('shows cancelled and ended notices and hides RSVP and Discord', async () => {
    api.getSession.mockResolvedValue(detail({ status: 'cancelled', discordInviteUrl: 'https://discord.gg/abc' }));
    const first = renderAt('/sessions/s1');
    expect(await screen.findByText('This session was cancelled.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Your response' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Join Discord/ })).not.toBeInTheDocument();
    first.unmount();

    api.getSession.mockResolvedValue(detail({ ended: true }));
    renderAt('/sessions/s1');
    expect(await screen.findByText('This session has ended.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Your response' })).not.toBeInTheDocument();
  });

  it('shows not-found and error states', async () => {
    api.getSession.mockRejectedValueOnce(apiError(404, 'Session not found'));
    const first = renderAt('/sessions/s1');
    expect(await screen.findByText('Session not found')).toBeInTheDocument();
    first.unmount();

    api.getSession.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(detail());
    renderAt('/sessions/s1');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Co-op night' })).toBeInTheDocument();
  });
});

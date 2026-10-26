import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/services/steamApi.js', () => ({ getSteamStatus: vi.fn(), linkSteam: vi.fn(), unlinkSteam: vi.fn(), syncSteam: vi.fn() }));

const api = await import('@/services/steamApi.js');
const { SteamLinkCard } = await import('./SteamLinkCard.jsx');

const linked = {
  linked: true,
  steamId: '76561198000000001',
  personaName: 'Gaben',
  avatar: 'https://avatars.steamstatic.com/a.jpg',
  profileUrl: 'https://steamcommunity.com/profiles/76561198000000001/',
  visibility: 'public',
  lastSync: null,
};

beforeEach(() => vi.clearAllMocks());

describe('SteamLinkCard', () => {
  it('shows a skeleton, then the link form with the Game details privacy note', async () => {
    api.getSteamStatus.mockResolvedValue({ linked: false });
    render(<SteamLinkCard />);
    expect(screen.getByRole('status', { name: /loading steam/i })).toBeInTheDocument();
    expect(await screen.findByLabelText(/steamid64 or profile url/i)).toBeInTheDocument();
    expect(screen.getByText(/game details/i)).toBeInTheDocument();
    const settings = screen.getByRole('link', { name: /steam privacy settings/i });
    expect(settings).toHaveAttribute('href', 'https://steamcommunity.com/my/edit/settings');
    expect(settings).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('links an account and shows the persona', async () => {
    api.getSteamStatus.mockResolvedValue({ linked: false });
    api.linkSteam.mockResolvedValue(linked);
    render(<SteamLinkCard />);
    await userEvent.type(await screen.findByLabelText(/steamid64 or profile url/i), 'gaben');
    await userEvent.click(screen.getByRole('button', { name: /link steam/i }));
    expect(api.linkSteam).toHaveBeenCalledWith('gaben');
    expect(await screen.findByText('Gaben')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalled();
  });

  it('shows the server message next to the field when linking fails', async () => {
    api.getSteamStatus.mockResolvedValue({ linked: false });
    api.linkSteam.mockRejectedValue({ response: { data: { error: { code: 'NOT_FOUND', message: 'No Steam profile found for "x".' } } } });
    render(<SteamLinkCard />);
    await userEvent.type(await screen.findByLabelText(/steamid64 or profile url/i), 'xx');
    await userEvent.click(screen.getByRole('button', { name: /link steam/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No Steam profile found');
  });

  it('asks before unlinking and says the library is kept', async () => {
    api.getSteamStatus.mockResolvedValue(linked);
    api.unlinkSteam.mockResolvedValue();
    render(<SteamLinkCard />);
    await userEvent.click(await screen.findByRole('button', { name: /^unlink$/i }));
    expect(api.unlinkSteam).not.toHaveBeenCalled();
    expect(screen.getByText(/stay in your library/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /yes, unlink/i }));
    await waitFor(() => expect(api.unlinkSteam).toHaveBeenCalledTimes(1));
    expect(await screen.findByLabelText(/steamid64 or profile url/i)).toBeInTheDocument();
  });

  it('says it has not synced yet, then syncs and summarises the result with the unmatched games', async () => {
    api.getSteamStatus.mockResolvedValue(linked);
    let finish;
    api.syncSteam.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<SteamLinkCard />);
    expect(await screen.findByText(/not synced yet/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /sync now/i }));
    expect(screen.getByRole('button', { name: /syncing/i })).toBeDisabled();

    finish({ added: 12, updated: 3, unmatched: [{ appid: '9', name: 'Some Soundtrack', playtimeMin: 90 }], warnings: ['Achievements could not be read for 1 game; they keep their previous values.'] });
    expect(await screen.findByText(/which games were not matched/i)).toBeInTheDocument();
    expect(screen.getByText('Some Soundtrack')).toBeInTheDocument();
    expect(screen.getByText(/could not be read for 1 game/i)).toBeInTheDocument();
    expect(screen.getByText(/12 added, 3 updated, 1 not matched/i)).toBeInTheDocument(); // last-sync line
    expect(screen.queryByText(/not synced yet/i)).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Steam synced: 12 added, 3 updated');
  });

  it('shows the helpful server message when the profile is private', async () => {
    api.getSteamStatus.mockResolvedValue({ ...linked, lastSync: { at: '2026-10-27T10:00:00.000Z', added: 1, updated: 2, unmatchedCount: 0 } });
    api.syncSteam.mockRejectedValue({ response: { data: { error: { code: 'UPSTREAM_ERROR', message: 'Your Steam game details are private. Set "Game details" to Public.' } } } });
    render(<SteamLinkCard />);
    await userEvent.click(await screen.findByRole('button', { name: /sync now/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Game details');
    expect(screen.getByRole('button', { name: /sync now/i })).toBeEnabled(); // can try again
    expect(screen.getByText(/1 added, 2 updated, 0 not matched/i)).toBeInTheDocument(); // previous sync is still shown
  });

  it('scopes a load failure to the section, with Retry', async () => {
    api.getSteamStatus.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ linked: false });
    render(<SteamLinkCard />);
    await userEvent.click(await screen.findByRole('button', { name: /retry/i }));
    expect(await screen.findByLabelText(/steamid64 or profile url/i)).toBeInTheDocument();
  });
});

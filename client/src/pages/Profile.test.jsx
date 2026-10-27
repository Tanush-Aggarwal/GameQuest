import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/services/socialApi.js', () => ({
  getProfile: vi.fn(),
  listBlocked: vi.fn(),
  setPrivacy: vi.fn(),
  unblockUser: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock('@/services/steamApi.js', () => ({ getSteamStatus: vi.fn(), linkSteam: vi.fn(), unlinkSteam: vi.fn(), syncSteam: vi.fn() }));
vi.mock('@/services/gamesApi.js', () => ({ searchGames: vi.fn() }));
vi.mock('@/services/libraryApi.js', () => ({ listLibrary: vi.fn() }));

const { AuthContext } = await import('@/features/auth/AuthContext.jsx');
const social = await import('@/services/socialApi.js');
const steam = await import('@/services/steamApi.js');
const { searchGames } = await import('@/services/gamesApi.js');
const { listLibrary } = await import('@/services/libraryApi.js');
const { default: Profile } = await import('./Profile.jsx');

const user = { id: '1', username: 'neo', email: 'neo@example.com', createdAt: '2026-01-01T00:00:00Z' };
const game = (n, title = `Game ${n}`) => ({ id: `g${n}`, slug: `game-${n}`, title, cover: null, genres: [] });

function renderProfile() {
  render(
    <AuthContext.Provider value={{ user, status: 'authenticated' }}>
      <MemoryRouter>
        <Profile />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const editor = () => screen.findByRole('list', { name: 'Favourite games' });

beforeEach(() => {
  vi.resetAllMocks();
  social.getProfile.mockResolvedValue({ user: { username: 'neo', avatar: null, bio: '', privacy: 'public', favouriteGames: [game(1), game(2)] } });
  social.listBlocked.mockResolvedValue([]);
  social.updateProfile.mockResolvedValue({});
  steam.getSteamStatus.mockResolvedValue({ linked: false });
  listLibrary.mockResolvedValue({ items: [{ game: game(3, 'Celeste') }, { game: game(4) }] });
  searchGames.mockResolvedValue({ items: [game(9, 'Hades')] });
});

describe('Profile: Favourite 4 editor', () => {
  it('shows the saved favourites in compact tiles, with the empty slots as add buttons and no picker open', async () => {
    renderProfile();
    const tiles = await editor();
    expect(within(tiles).getByText('Game 1')).toBeInTheDocument();
    expect(within(tiles).getByText('Game 2')).toBeInTheDocument();
    expect(within(tiles).getByRole('button', { name: 'Add favourite game 3' })).toBeInTheDocument();
    expect(within(tiles).getByRole('button', { name: 'Add favourite game 4' })).toBeInTheDocument();
    expect(screen.getByText('2/4')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /choose favourite/i })).not.toBeInTheDocument();
    expect(tiles.className).not.toMatch(/grid-cols/);
  });

  it('fills the clicked slot from the picker, then saves the favourites in slot order', async () => {
    renderProfile();
    const tiles = await editor();
    await userEvent.click(within(tiles).getByRole('button', { name: 'Add favourite game 4' }));
    const picker = screen.getByRole('group', { name: 'Choose favourite 4' });
    await userEvent.click(await within(picker).findByRole('button', { name: 'Celeste' }));

    expect(screen.queryByRole('group', { name: /choose favourite/i })).not.toBeInTheDocument(); // the picker closed
    expect(within(tiles).getByText('Celeste')).toBeInTheDocument();
    expect(screen.getByText('3/4')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
    expect(social.updateProfile).toHaveBeenCalledWith({ avatar: null, bio: '', favouriteGames: ['g1', 'g2', 'g3'] });
  });

  it('removing a favourite empties its slot, and the others keep their order on save', async () => {
    renderProfile();
    const tiles = await editor();
    await userEvent.click(within(tiles).getByRole('button', { name: 'Remove Game 1 from favourites' }));
    expect(within(tiles).getByRole('button', { name: 'Add favourite game 1' })).toBeInTheDocument();
    expect(screen.getByText('1/4')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
    expect(social.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ favouriteGames: ['g2'] }));
  });

  it('a game that is already a favourite cannot be picked again, and the catalog search works from the picker', async () => {
    renderProfile();
    const tiles = await editor();
    await userEvent.click(within(tiles).getByRole('button', { name: 'Add favourite game 3' }));
    const picker = screen.getByRole('group', { name: 'Choose favourite 3' });
    await userEvent.type(within(picker).getByRole('searchbox'), 'had');
    await userEvent.click(await within(picker).findByRole('button', { name: 'Hades' }));
    expect(within(tiles).getByText('Hades')).toBeInTheDocument();
    // slot 4: Hades is now disabled in the picker
    await userEvent.click(within(tiles).getByRole('button', { name: 'Add favourite game 4' }));
    await userEvent.type(within(screen.getByRole('group', { name: 'Choose favourite 4' })).getByRole('searchbox'), 'had');
    expect(await screen.findByRole('button', { name: 'Hades (already a favourite)' })).toBeDisabled();
  });

  it('Escape closes the picker and leaves the slots alone', async () => {
    renderProfile();
    const tiles = await editor();
    await userEvent.click(within(tiles).getByRole('button', { name: 'Add favourite game 3' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: /choose favourite/i })).not.toBeInTheDocument();
    expect(screen.getByText('2/4')).toBeInTheDocument();
  });

  it('shows a save error without losing the choices', async () => {
    social.updateProfile.mockRejectedValue({ response: { data: { error: { code: 'VALIDATION_ERROR', message: 'Bad favourites' } } } });
    renderProfile();
    const tiles = await editor();
    await userEvent.click(within(tiles).getByRole('button', { name: 'Remove Game 2 from favourites' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Bad favourites'));
    expect(screen.getByText('1/4')).toBeInTheDocument();
  });

  it('has an art header and sections on game art', async () => {
    renderProfile();
    await editor();
    expect(screen.getByRole('heading', { level: 1, name: 'Profile & Settings' })).toBeInTheDocument();
    for (const name of ['Gamer Identity', 'Account Information', 'Steam', 'Privacy', 'Blocked Players']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });
});

describe('Profile: Favourite 4 editor, keyboard and safety', () => {
  it('Enter in the picker search does not save the profile', async () => {
    renderProfile();
    const tiles = await editor();
    await userEvent.click(within(tiles).getByRole('button', { name: 'Add favourite game 3' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the catalog' }), 'had{Enter}');
    expect(social.updateProfile).not.toHaveBeenCalled();
  });

  it('puts focus back on the tile after closing the picker, picking a game, and removing a game', async () => {
    renderProfile();
    const tiles = await editor();

    await userEvent.click(within(tiles).getByRole('button', { name: 'Add favourite game 3' }));
    await userEvent.keyboard('{Escape}');
    expect(within(tiles).getByRole('button', { name: 'Add favourite game 3' })).toHaveFocus(); // closed: back on the opener

    await userEvent.click(within(tiles).getByRole('button', { name: 'Add favourite game 3' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Celeste' }));
    expect(within(tiles).getByRole('button', { name: 'Remove Celeste from favourites' })).toHaveFocus(); // picked: on the new tile

    await userEvent.click(within(tiles).getByRole('button', { name: 'Remove Game 1 from favourites' }));
    expect(within(tiles).getByRole('button', { name: 'Add favourite game 1' })).toHaveFocus(); // removed: on that empty slot
  });

  it('announces additions and removals to screen readers', async () => {
    renderProfile();
    const tiles = await editor();
    await userEvent.click(within(tiles).getByRole('button', { name: 'Remove Game 2 from favourites' }));
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Removed Game 2 from favourites')).toBe(true);
    await userEvent.click(within(tiles).getByRole('button', { name: 'Add favourite game 2' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Celeste' }));
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Added Celeste to favourite 2')).toBe(true);
  });

  it('warns about unsaved changes: a hint next to Save and the browser prompt before leaving', async () => {
    renderProfile();
    const tiles = await editor();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    const quiet = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(quiet);
    expect(quiet.defaultPrevented).toBe(false); // nothing to lose yet

    await userEvent.click(within(tiles).getByRole('button', { name: 'Remove Game 1 from favourites' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    const prompt = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(prompt);
    expect(prompt.defaultPrevented).toBe(true);

    // filling the slot again with a different game is still a change from what was saved
    await userEvent.click(within(tiles).getByRole('button', { name: 'Add favourite game 1' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Celeste' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('typing in the bio is an unsaved change too', async () => {
    renderProfile();
    await editor();
    await userEvent.type(screen.getByLabelText(/About You/), 'Hello');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });
});
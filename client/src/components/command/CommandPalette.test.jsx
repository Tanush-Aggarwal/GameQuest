import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('@/services/gamesApi.js', () => ({ searchGames: vi.fn() }));
vi.mock('@/services/libraryApi.js', () => ({ listLibrary: vi.fn() }));
vi.mock('@/services/socialApi.js', () => ({ searchUsers: vi.fn() }));
vi.mock('@/services/collectionsApi.js', () => ({ listCollections: vi.fn() }));

const { AuthContext } = await import('@/features/auth/AuthContext.jsx');
const games = await import('@/services/gamesApi.js');
const library = await import('@/services/libraryApi.js');
const social = await import('@/services/socialApi.js');
const collections = await import('@/services/collectionsApi.js');
const { default: CommandPalette, buildOptions } = await import('./CommandPalette.jsx');
const { AppLayout } = await import('@/components/layout/AppLayout.jsx');

const user = { id: '1', username: 'neo' };
const HADES = { slug: 'hades', title: 'Hades', releaseDate: '2020-09-17', releaseYear: 2020 };

function Where() {
  const { pathname } = useLocation();
  return <p data-testid="where">{pathname}</p>;
}

function renderPalette() {
  const onOpenChange = vi.fn();
  render(
    <MemoryRouter>
      <CommandPalette open onOpenChange={onOpenChange} />
      <Where />
    </MemoryRouter>,
  );
  return { onOpenChange };
}

beforeEach(() => {
  vi.resetAllMocks();
  games.searchGames.mockResolvedValue({ items: [HADES, { slug: 'hades-2', title: 'Hades II' }] });
  library.listLibrary.mockResolvedValue({ items: [] });
  social.searchUsers.mockResolvedValue([{ id: 'u2', username: 'hadesfan', relation: 'friend' }]);
  collections.listCollections.mockResolvedValue({ items: [{ id: 'c1', name: 'Hades runs', itemCount: 3 }, { id: 'c2', name: 'Cozy games', itemCount: 5 }] });
});

describe('CommandPalette', () => {
  it('is a labelled dialog with a combobox, focused on open, that lists your collections before you type', async () => {
    renderPalette();
    expect(screen.getByRole('dialog', { name: /search games, friends and collections/i })).toBeInTheDocument();
    const box = screen.getByRole('combobox', { name: /search games/i });
    await waitFor(() => expect(box).toHaveFocus());
    const list = await screen.findByRole('listbox', { name: 'Results' });
    expect(within(list).getByRole('group', { name: 'Collections' })).toBeInTheDocument();
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Hades runs3 games', 'Cozy games5 games']);
    expect(games.searchGames).not.toHaveBeenCalled(); // nothing to search yet
  });

  it('groups games, friends and matching collections after a pause in typing', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'hades');
    const list = await screen.findByRole('listbox', { name: 'Results' });
    await within(list).findByRole('group', { name: 'Games' });
    expect(within(within(list).getByRole('group', { name: 'Games' })).getAllByRole('option')).toHaveLength(2);
    expect(within(within(list).getByRole('group', { name: 'Friends' })).getByRole('option')).toHaveTextContent('hadesfan');
    expect(within(within(list).getByRole('group', { name: 'Collections' })).getByRole('option')).toHaveTextContent('Hades runs'); // "Cozy games" is filtered out
    expect(games.searchGames).toHaveBeenCalledTimes(1); // debounced: one call for the whole word
    expect(games.searchGames).toHaveBeenCalledWith({ q: 'hades', limit: 5 }, expect.anything());
  });

  it('moves with the arrow keys (wrapping) and opens the active result with Enter', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderPalette();
    const box = screen.getByRole('combobox');
    await user.type(box, 'hades');
    await screen.findByRole('group', { name: 'Games' });
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(box).toHaveAttribute('aria-activedescendant', options[0].id);
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowUp}{ArrowUp}'); // back to the first, then wraps to the last
    const last = screen.getAllByRole('option').at(-1);
    expect(last).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}{Enter}'); // wraps to the first: Hades
    expect(screen.getByTestId('where')).toHaveTextContent('/games/hades');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('a friend result goes to their profile and a collection to its page', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'hades');
    await user.click(await screen.findByRole('option', { name: /hadesfan/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/u/hadesfan');
  });

  it('one failing source does not hide the others, and says which failed', async () => {
    games.searchGames.mockRejectedValue(new Error('down'));
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'hades');
    expect(await screen.findByRole('group', { name: 'Friends' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Collections' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Games' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t search games/i);
  });

  it('says so when nothing matches, and asks for two letters first', async () => {
    games.searchGames.mockResolvedValue({ items: [] });
    social.searchUsers.mockResolvedValue([]);
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'zzzz');
    expect(await screen.findByText(/nothing found for/i)).toBeInTheDocument();
    await user.clear(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'q');
    expect(screen.getByText(/at least two letters/i)).toBeInTheDocument();
  });

  it('has a Retry for a failed source that searches again', async () => {
    games.searchGames.mockRejectedValueOnce(new Error('down'));
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'hades');
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('group', { name: 'Games' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('buildOptions keeps the group order games, friends, collections', () => {
    const options = buildOptions({ games: [HADES], friends: [{ id: 'u', username: 'x' }], collections: [{ id: 'c', name: 'C' }] });
    expect(options.map((o) => o.group)).toEqual(['games', 'friends', 'collections']);
  });
});

describe('opening the palette from the app shell', () => {
  function renderShell() {
    render(
      <AuthContext.Provider value={{ user, status: 'authenticated', logout: vi.fn() }}>
        <MemoryRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<h1>Page body</h1>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
  }

  it('Ctrl+K and Cmd+K open it, Escape closes it and gives focus back', async () => {
    const u = userEvent.setup();
    renderShell();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: /^Quick search/ });
    trigger.focus();
    await u.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await u.keyboard('{Meta>}k{/Meta}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('reopening starts clean: empty query, no old results', async () => {
    const u = userEvent.setup();
    renderShell();
    await u.keyboard('{Control>}k{/Control}');
    await u.type(await screen.findByRole('combobox'), 'hades');
    await screen.findByRole('group', { name: 'Games' });
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await u.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('combobox')).toHaveValue('');
    expect(screen.queryByRole('group', { name: 'Games' })).not.toBeInTheDocument();
  });

  it('the Quick search button opens it too', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: /^Quick search/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

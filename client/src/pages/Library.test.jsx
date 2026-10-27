import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/services/libraryApi.js', () => ({ listLibrary: vi.fn(), addToLibrary: vi.fn(), changeStatus: vi.fn(), removeFromLibrary: vi.fn() }));
vi.mock('@/services/gamesApi.js', () => ({ searchGames: vi.fn(), getGame: vi.fn(), getTrailers: vi.fn().mockResolvedValue([]) }));

const { listLibrary, addToLibrary, changeStatus, removeFromLibrary } = await import('@/services/libraryApi.js');
const { getGame, getTrailers } = await import('@/services/gamesApi.js');
const { ArtContext } = await import('@/components/art/artContext.js');
const { default: Library } = await import('./Library.jsx');
const { default: Game } = await import('./Game.jsx');

const game = (slug, title) => ({ id: `g-${slug}`, slug, title, cover: null, genres: [], platforms: [], releaseDate: null, summary: '', timeToBeat: {} });
const entry = (id, title, status, extra = {}) => ({ id, status, ownerships: [], game: game(title.toLowerCase(), title), ...extra });
const counts = (o = {}) => ({ all: 0, wishlist: 0, backlog: 0, playing: 0, completed: 0, dropped: 0, ...o });
const apiError = (status, message) => Object.assign(new Error('x'), { response: { status, data: { error: { code: 'CONFLICT', message } } } });

const renderLibrary = (path = '/library') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/library" element={<Library />} />
        <Route path="/games/:slug" element={<Game />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  getTrailers.mockResolvedValue([]); // the game page asks for a trailer; none here
});

describe('Library page', () => {
  it('shows a skeleton, then entries with status icon + label, platforms and tab counts', async () => {
    listLibrary.mockResolvedValue({
      items: [entry('1', 'Hades', 'playing', { ownerships: [{ platform: 'PC' }, { platform: 'Switch' }] })],
      nextCursor: null,
      counts: counts({ all: 1, playing: 1 }),
    });
    renderLibrary();
    expect(screen.getByRole('status', { name: 'Loading your library' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Hades' })).toBeInTheDocument();
    const card = screen.getByRole('heading', { name: 'Hades' }).closest('li');
    expect(within(card).getByText('Playing')).toBeInTheDocument();
    expect(within(card).getByText('PC')).toBeInTheDocument();
    expect(within(card).getByText('Switch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Playing 1$/ })).toBeInTheDocument();
  });

  it('shows the empty state with one action', async () => {
    listLibrary.mockResolvedValue({ items: [], nextCursor: null, counts: counts() });
    renderLibrary();
    expect(await screen.findByText('Your library is empty')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find games' })).toHaveAttribute('href', '/explore');
  });

  it('an empty library offers popular games to start from, but a filtered empty tab does not', async () => {
    const popular = [1, 2, 3].map((n) => ({ id: `p${n}`, slug: `popular-${n}`, title: `Popular ${n}`, cover: null, backdrop: null }));
    const withSuggestions = (path) =>
      render(
        <ArtContext.Provider value={{ pool: popular, suggestions: popular, status: 'ready', artFor: () => null }}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/library" element={<Library />} />
            </Routes>
          </MemoryRouter>
        </ArtContext.Provider>,
      );
    listLibrary.mockResolvedValue({ items: [], nextCursor: null, counts: counts() });
    const all = withSuggestions('/library');
    expect(await screen.findByText('Your library is empty')).toBeInTheDocument();
    const picks = screen.getByRole('list', { name: 'Popular right now' });
    expect(within(picks).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/games/popular-1', '/games/popular-2', '/games/popular-3']);
    all.unmount();

    withSuggestions('/library?status=backlog');
    await screen.findByText('No backlog games');
    expect(screen.queryByRole('list', { name: 'Popular right now' })).not.toBeInTheDocument();
  });
  it('shows an error with Retry', async () => {
    listLibrary.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ items: [], nextCursor: null, counts: counts() });
    renderLibrary();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Your library is empty')).toBeInTheDocument();
  });

  it('filters by the status in the URL', async () => {
    listLibrary.mockResolvedValue({ items: [], nextCursor: null, counts: counts() });
    renderLibrary('/library?status=backlog');
    await screen.findByText('No backlog games');
    expect(listLibrary).toHaveBeenCalledWith(expect.objectContaining({ status: 'backlog' }), expect.anything());
  });

  it('only offers the moves the state machine allows', async () => {
    listLibrary.mockResolvedValue({ items: [entry('1', 'Hades', 'completed')], nextCursor: null, counts: counts({ all: 1, completed: 1 }) });
    renderLibrary();
    const select = await screen.findByRole('combobox', { name: /Move Hades/ });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Move to…', 'Playing']);
  });

  it('moves a game optimistically, updating the badge and counts, and toasts', async () => {
    listLibrary.mockResolvedValue({ items: [entry('1', 'Hades', 'backlog')], nextCursor: null, counts: counts({ all: 1, backlog: 1 }) });
    changeStatus.mockResolvedValue({});
    renderLibrary();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Move Hades/ }), 'playing');
    const card = screen.getByRole('heading', { name: 'Hades' }).closest('li');
    expect(within(card).getByText('Playing')).toBeInTheDocument();
    expect(changeStatus).toHaveBeenCalledWith('1', 'playing');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Hades moved to Playing'));
    expect(screen.getByRole('button', { name: /^Backlog 0$/ })).toBeInTheDocument();
  });

  it('rolls back and toasts the server message when the move is rejected', async () => {
    listLibrary.mockResolvedValue({ items: [entry('1', 'Hades', 'backlog')], nextCursor: null, counts: counts({ all: 1, backlog: 1 }) });
    changeStatus.mockRejectedValue(apiError(409, "A backlog game can't move to playing"));
    renderLibrary();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Move Hades/ }), 'playing');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A backlog game can't move to playing"));
    const card = screen.getByRole('heading', { name: 'Hades' }).closest('li');
    expect(within(card).getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Backlog 1$/ })).toBeInTheDocument();
  });

  it('removes a game only after confirming', async () => {
    listLibrary.mockResolvedValue({ items: [entry('1', 'Hades', 'backlog')], nextCursor: null, counts: counts({ all: 1, backlog: 1 }) });
    removeFromLibrary.mockResolvedValue();
    renderLibrary();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Hades from library' }));
    expect(removeFromLibrary).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm removal' })).getByRole('button', { name: 'Remove' }));
    expect(removeFromLibrary).toHaveBeenCalledWith('1');
    expect(await screen.findByText('Your library is empty')).toBeInTheDocument();
  });

  it('toggles between grid and shelf view and filters by title', async () => {
    listLibrary.mockResolvedValue({
      items: [
        entry('1', 'Hades', 'playing', { manualProgress: 40 }),
        entry('2', 'Celeste', 'backlog'),
      ],
      nextCursor: null,
      counts: counts({ all: 2 }),
    });
    renderLibrary();
    expect(await screen.findByRole('heading', { name: 'Hades' })).toBeInTheDocument();

    // Toggle to shelf view
    const shelfBtn = screen.getByRole('button', { name: 'Shelf list view' });
    await userEvent.click(shelfBtn);
    expect(screen.getByText('40%')).toBeInTheDocument();

    // Filter by title
    const searchInput = screen.getByPlaceholderText('Filter by title...');
    await userEvent.type(searchInput, 'Celeste');
    expect(screen.getByText('Celeste')).toBeInTheDocument();
    expect(screen.queryByText('Hades')).not.toBeInTheDocument();
  });
});

describe('Game page library panel', () => {
  it('adds a game that is not in the library yet', async () => {
    getGame.mockResolvedValue(game('hades', 'Hades'));
    listLibrary.mockResolvedValue({ items: [] });
    addToLibrary.mockResolvedValue(entry('1', 'Hades', 'backlog'));
    renderLibrary('/games/hades');
    await userEvent.click(await screen.findByRole('button', { name: 'Add to backlog' }));
    expect(addToLibrary).toHaveBeenCalledWith({ gameId: 'g-hades', status: 'backlog' });
    expect(await screen.findByRole('combobox', { name: /Move Hades/ })).toBeInTheDocument();
    expect(screen.getByText('Backlog')).toBeInTheDocument();
  });

  it('shows the current status when the game is already in the library', async () => {
    getGame.mockResolvedValue(game('hades', 'Hades'));
    listLibrary.mockResolvedValue({ items: [entry('1', 'Hades', 'playing')] });
    renderLibrary('/games/hades');
    expect(await screen.findByText('Playing')).toBeInTheDocument();
    expect(listLibrary).toHaveBeenCalledWith({ gameId: 'g-hades', limit: 1 }, expect.anything());
  });

  it('scopes a library error to the panel with Retry', async () => {
    getGame.mockResolvedValue(game('hades', 'Hades'));
    listLibrary.mockRejectedValue(new Error('down'));
    renderLibrary('/games/hades');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hades' })).toBeInTheDocument();
  });
});

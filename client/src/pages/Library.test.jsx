import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/services/libraryApi.js', () => ({ listLibrary: vi.fn(), addToLibrary: vi.fn(), changeStatus: vi.fn(), removeFromLibrary: vi.fn() }));
vi.mock('@/services/steamApi.js', () => ({ getSteamStatus: vi.fn(), syncSteam: vi.fn() }));
vi.mock('@/services/gamesApi.js', () => ({ searchGames: vi.fn(), getGame: vi.fn(), getTrailers: vi.fn().mockResolvedValue([]) }));

const { listLibrary, addToLibrary, changeStatus, removeFromLibrary } = await import('@/services/libraryApi.js');
const { getGame, getTrailers } = await import('@/services/gamesApi.js');
const { getSteamStatus, syncSteam } = await import('@/services/steamApi.js');
const { ArtContext } = await import('@/components/art/artContext.js');
const { default: Library } = await import('./Library.jsx');
const { default: Game } = await import('./Game.jsx');

const game = (slug, title) => ({ id: `g-${slug}`, slug, title, cover: null, genres: [], platforms: [], releaseDate: null, summary: '', timeToBeat: {} });
const entry = (id, title, status, extra = {}) => ({ id, status, ownerships: [], game: game(title.toLowerCase(), title), ...extra });
const counts = (o = {}) => ({ all: 0, wishlist: 0, backlog: 0, playing: 0, completed: 0, dropped: 0, ...o });
const apiError = (status, message) => Object.assign(new Error('x'), { response: { status, data: { error: { code: 'CONFLICT', message } } } });

async function openMenu(title) {
  await userEvent.click(await screen.findByRole('button', { name: `Change status of ${title}` }));
  return screen.findByRole('menu');
}

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
  getSteamStatus.mockResolvedValue({ linked: false });
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
    const menu = await openMenu('Hades');
    expect(within(menu).getAllByRole('menuitem').map((o) => o.textContent.trim())).toEqual(['Playing', 'Open entry', 'Remove…']); // completed can only go back to playing
    expect(within(menu).getByText('Move to')).toBeInTheDocument();
  });

  it('moves a game optimistically, updating the badge and counts, and toasts', async () => {
    listLibrary.mockResolvedValue({ items: [entry('1', 'Hades', 'backlog')], nextCursor: null, counts: counts({ all: 1, backlog: 1 }) });
    changeStatus.mockResolvedValue({});
    renderLibrary();
    await userEvent.click(within(await openMenu('Hades')).getByRole('menuitem', { name: 'Playing' }));
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
    await userEvent.click(within(await openMenu('Hades')).getByRole('menuitem', { name: 'Playing' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A backlog game can't move to playing"));
    const card = screen.getByRole('heading', { name: 'Hades' }).closest('li');
    expect(within(card).getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Backlog 1$/ })).toBeInTheDocument();
  });

  it('removes a game only after confirming', async () => {
    listLibrary.mockResolvedValue({ items: [entry('1', 'Hades', 'backlog')], nextCursor: null, counts: counts({ all: 1, backlog: 1 }) });
    removeFromLibrary.mockResolvedValue();
    renderLibrary();
    await userEvent.click(within(await openMenu('Hades')).getByRole('menuitem', { name: 'Remove…' }));
    expect(removeFromLibrary).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm removal' })).getByRole('button', { name: 'Remove' }));
    expect(removeFromLibrary).toHaveBeenCalledWith('1');
    expect(await screen.findByText('Your library is empty')).toBeInTheDocument();
  });

  it('toggles between the cover grid and the shelf list', async () => {
    listLibrary.mockResolvedValue({
      items: [entry('1', 'Hades', 'playing', { manualProgress: 40 }), entry('2', 'Celeste', 'backlog')],
      nextCursor: null,
      counts: counts({ all: 2 }),
    });
    renderLibrary();
    expect(await screen.findByRole('heading', { name: 'Hades' })).toBeInTheDocument(); // cover grid is the default
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Shelf list view' }));
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hades' })).not.toBeInTheDocument(); // rows have no headings
  });
});

describe('Library filter bar', () => {
  const facets = { genres: ['Roguelike', 'Platformer'], platforms: ['Steam', 'Switch'] };
  const page = (items = [entry('1', 'Hades', 'playing')]) => ({ items, nextCursor: null, counts: counts({ all: items.length, playing: items.length }), facets });

  it('is sticky, with status tabs and counts', async () => {
    listLibrary.mockResolvedValue(page());
    renderLibrary();
    const tabs = await screen.findByRole('navigation', { name: 'Library status' });
    expect(tabs.parentElement.className).toMatch(/\bsticky\b/);
    expect(within(tabs).getAllByRole('button').map((b) => b.textContent.trim())).toEqual(['All 1', 'Wishlist 0', 'Backlog 0', 'Playing 1', 'Completed 0', 'Dropped 0']);
  });

  it('genre and platform menus come from the whole library and filter on the server', async () => {
    listLibrary.mockResolvedValue(page());
    renderLibrary();
    const genre = await screen.findByRole('combobox', { name: 'Filter by genre' });
    expect(within(genre).getAllByRole('option').map((o) => o.textContent)).toEqual(['All genres', 'Roguelike', 'Platformer']);
    await userEvent.selectOptions(genre, 'Roguelike');
    await waitFor(() => expect(listLibrary).toHaveBeenLastCalledWith(expect.objectContaining({ genre: 'Roguelike' }), expect.anything()));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by platform' }), 'Steam');
    await waitFor(() => expect(listLibrary).toHaveBeenLastCalledWith(expect.objectContaining({ genre: 'Roguelike', platform: 'Steam' }), expect.anything()));
  });

  it('searches by title after a pause, keeps focus in the box while results reload, and can clear the filters', async () => {
    listLibrary.mockResolvedValue(page());
    renderLibrary();
    const box = await screen.findByRole('searchbox', { name: 'Filter library' });
    listLibrary.mockResolvedValue({ items: [], nextCursor: null, counts: counts({ all: 3 }), facets });
    await userEvent.type(box, 'zel');
    await waitFor(() => expect(listLibrary).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'zel' }), expect.anything()));
    expect(listLibrary.mock.calls.filter(([params]) => params.q).length).toBe(1); // one request for the whole word, not one per letter
    expect(await screen.findByText(/No games match your current filter/)).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Filter library' })).toHaveValue('zel');
    listLibrary.mockResolvedValue(page());
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByRole('heading', { name: 'Hades' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Filter library' })).toHaveValue('');
  });

  it('keeps the tab counts and menus while a filtered reload is running, and the bar when a reload fails', async () => {
    listLibrary.mockResolvedValue(page());
    renderLibrary();
    await screen.findByRole('heading', { name: 'Hades' });
    let release;
    listLibrary.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by genre' }), 'Roguelike');
    expect(await screen.findByRole('status', { name: 'Loading your library' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filter by genre' })).toBeInTheDocument(); // still there while loading
    expect(screen.getByRole('button', { name: /^Playing 1$/ })).toBeInTheDocument();
    release(page());
    await screen.findByRole('heading', { name: 'Hades' });
    listLibrary.mockRejectedValueOnce(new Error('down'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by platform' }), 'Steam');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    listLibrary.mockResolvedValue(page());
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' })); // the bar is still there to get out of a failing filter
    expect(await screen.findByRole('heading', { name: 'Hades' })).toBeInTheDocument();
  });

  it('a failed move rolls back only its own game, not another edit made meanwhile', async () => {
    listLibrary.mockResolvedValue({
      items: [entry('1', 'Hades', 'backlog'), entry('2', 'Celeste', 'backlog')],
      nextCursor: null,
      counts: counts({ all: 2, backlog: 2 }),
    });
    let failFirst;
    changeStatus.mockImplementationOnce(() => new Promise((_, reject) => { failFirst = reject; }));
    changeStatus.mockResolvedValueOnce({});
    renderLibrary();
    await userEvent.click(within(await openMenu('Hades')).getByRole('menuitem', { name: 'Playing' })); // stays pending
    await userEvent.click(within(await openMenu('Celeste')).getByRole('menuitem', { name: 'Dropped' })); // succeeds
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Celeste moved to Dropped'));
    failFirst(apiError(409, 'nope'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('nope'));
    const cardOf = (title) => screen.getByRole('heading', { name: title }).closest('li');
    expect(within(cardOf('Hades')).getByText('Backlog')).toBeInTheDocument(); // rolled back
    expect(within(cardOf('Celeste')).getByText('Dropped')).toBeInTheDocument(); // not undone
    expect(screen.getByRole('button', { name: /^Backlog 1$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Dropped 1$/ })).toBeInTheDocument();
  });

  it('sorts what is loaded without asking the server', async () => {
    listLibrary.mockResolvedValue(page([entry('1', 'Zelda', 'playing'), entry('2', 'Alpha', 'playing')]));
    renderLibrary();
    await screen.findByRole('heading', { name: 'Zelda' });
    const callsBefore = listLibrary.mock.calls.length;
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort library' }), 'title');
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Alpha', 'Zelda']);
    expect(listLibrary.mock.calls.length).toBe(callsBefore);
  });

  it('with a brand new library there is no filter bar, only the empty state', async () => {
    listLibrary.mockResolvedValue({ items: [], nextCursor: null, counts: counts(), facets: { genres: [], platforms: [] } });
    renderLibrary();
    await screen.findByText('Your library is empty');
    expect(screen.queryByRole('searchbox', { name: 'Filter library' })).not.toBeInTheDocument();
  });
});

describe('Library cards and quick menu', () => {
  it('shows status (icon + label), Steam badge with playtime and achievements, and the progress bar', async () => {
    listLibrary.mockResolvedValue({
      items: [
        entry('1', 'Hades', 'playing', {
          manualProgress: 40,
          ownerships: [{ platform: 'Steam', playtimeMin: 750 }],
          achievements: { unlocked: 12, total: 48 },
        }),
      ],
      nextCursor: null,
      counts: counts({ all: 1, playing: 1 }),
    });
    renderLibrary();
    const card = (await screen.findByRole('heading', { name: 'Hades' })).closest('li');
    expect(within(card).getByText('Playing')).toBeInTheDocument();
    expect(within(card).getByText('Steam')).toBeInTheDocument();
    expect(within(card).getByText('13h')).toBeInTheDocument();
    expect(within(card).getByText(/25%/)).toBeInTheDocument();
    expect(card.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('the menu button is revealed on hover and focus (always visible on touch) and has a 44 px target', async () => {
    listLibrary.mockResolvedValue({ items: [entry('1', 'Hades', 'backlog')], nextCursor: null, counts: counts({ all: 1, backlog: 1 }) });
    renderLibrary();
    const button = await screen.findByRole('button', { name: 'Change status of Hades' });
    expect(button.className).toMatch(/md:opacity-0/);
    expect(button.className).toMatch(/md:group-hover:opacity-100/);
    expect(button.className).toMatch(/md:group-focus-within:opacity-100/);
    expect(button.className).toMatch(/\bh-11\b/);
    expect(button.className).toMatch(/\bw-11\b/);
  });

  it('opens with the keyboard, offers the moves with icons, and Escape closes it', async () => {
    listLibrary.mockResolvedValue({ items: [entry('1', 'Hades', 'backlog')], nextCursor: null, counts: counts({ all: 1, backlog: 1 }) });
    renderLibrary();
    const button = await screen.findByRole('button', { name: 'Change status of Hades' });
    button.focus();
    await userEvent.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent.trim())).toEqual(['Playing', 'Dropped', 'Wishlist', 'Open entry', 'Remove…']);
    expect(within(menu).getByRole('menuitem', { name: 'Open entry' })).toHaveAttribute('href', '/library/1');
    for (const item of within(menu).getAllByRole('menuitem').slice(0, 3)) expect(item.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('cancelling a removal keeps the game', async () => {
    listLibrary.mockResolvedValue({ items: [entry('1', 'Hades', 'backlog')], nextCursor: null, counts: counts({ all: 1, backlog: 1 }) });
    renderLibrary();
    await userEvent.click(within(await openMenu('Hades')).getByRole('menuitem', { name: 'Remove…' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm removal' })).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Confirm removal' })).not.toBeInTheDocument();
    expect(removeFromLibrary).not.toHaveBeenCalled();
  });
});

describe('Library Steam sync', () => {
  const one = { items: [entry('1', 'Hades', 'playing')], nextCursor: null, counts: counts({ all: 1, playing: 1 }) };

  it('offers to link Steam when it is not linked', async () => {
    listLibrary.mockResolvedValue(one);
    renderLibrary();
    expect(await screen.findByRole('link', { name: /link steam/i })).toHaveAttribute('href', '/profile');
  });

  it('shows the last sync, syncs on demand, reloads the list and shows the new time', async () => {
    getSteamStatus.mockResolvedValue({ linked: true, lastSync: { at: '2026-10-20T10:00:00Z', added: 3, updated: 1, unmatchedCount: 0 } });
    syncSteam.mockResolvedValue({ added: 2, updated: 5, unmatched: [], warnings: [] });
    listLibrary.mockResolvedValue(one);
    renderLibrary();
    expect(await screen.findByText(/steam synced/i)).toBeInTheDocument();
    const callsBefore = listLibrary.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Steam synced: 2 added, 5 updated'));
    await waitFor(() => expect(listLibrary.mock.calls.length).toBeGreaterThan(callsBefore)); // the games list reloads
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeEnabled();
  });

  it('says why a sync failed and stays usable', async () => {
    getSteamStatus.mockResolvedValue({ linked: true, lastSync: null });
    syncSteam.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 502, data: { error: { code: 'UPSTREAM', message: 'Steam is not answering' } } } }));
    listLibrary.mockResolvedValue(one);
    renderLibrary();
    expect(await screen.findByText('Steam not synced yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Steam is not answering'));
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeEnabled();
  });

  it('a Steam status failure stays in its own corner, with Retry, and the games still show', async () => {
    getSteamStatus.mockRejectedValueOnce(new Error('down'));
    listLibrary.mockResolvedValue(one);
    renderLibrary();
    expect(await screen.findByText('Steam status unavailable.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Hades' })).toBeInTheDocument();
    getSteamStatus.mockResolvedValue({ linked: false });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: /link steam/i })).toBeInTheDocument();
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

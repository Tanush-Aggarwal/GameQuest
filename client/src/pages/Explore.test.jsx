import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('@/services/gamesApi.js', () => ({ searchGames: vi.fn(), getGame: vi.fn(), getGameFriends: vi.fn().mockResolvedValue([]), getTrailer: vi.fn().mockResolvedValue(null) }));
vi.mock('@/services/reviewApi.js', () => ({ listReviewsForGame: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock('@/services/libraryApi.js', () => ({ listLibrary: vi.fn(), addToLibrary: vi.fn(), changeStatus: vi.fn(), removeFromLibrary: vi.fn() }));

const { searchGames, getGame } = await import('@/services/gamesApi.js');
const { default: Explore } = await import('./Explore.jsx');
const { default: Game } = await import('./Game.jsx');

const game = (slug, title) => ({
  id: slug,
  slug,
  title,
  cover: null,
  genres: ['RPG'],
  platforms: ['PC'],
  releaseDate: '2020-09-17T00:00:00.000Z',
  summary: 'A summary',
  timeToBeat: { main: 20, extras: null, full: null },
});

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/explore" element={<Explore />} />
        <Route path="/games/:slug" element={<Game />} />
      </Routes>
    </MemoryRouter>,
  );

const { listLibrary } = await import('@/services/libraryApi.js');
const { listReviewsForGame } = await import('@/services/reviewApi.js');
const { getGameFriends, getTrailer } = await import('@/services/gamesApi.js');

// The main grid asks for 24 games; every curated shelf asks for 12 with its own filter.
const isShelf = (p) => p.limit === 12;
const shelfCalls = () => searchGames.mock.calls.map((c) => c[0]).filter(isShelf);
const mainCalls = () => searchGames.mock.calls.map((c) => c[0]).filter((p) => !isShelf(p));
const EMPTY = { items: [], nextCursor: null, warnings: [] };
// `main` answers the main list (a value or a function of the params); `shelves` answer the shelves by
// name (a value, or a function that may throw). A shelf with no answer is empty.
function mockCatalog({ main = EMPTY, shelves = {} }) {
  searchGames.mockImplementation(async (p) => {
    if (isShelf(p)) {
      const key = p.minRating ? 'acclaimed' : p.maxHours ? 'quick' : 'epic';
      const answer = shelves[key];
      return typeof answer === 'function' ? answer() : (answer ?? EMPTY);
    }
    return typeof main === 'function' ? main(p) : main;
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  listLibrary.mockResolvedValue({ items: [] });
  listReviewsForGame.mockResolvedValue({ items: [] });
  getGameFriends.mockResolvedValue([]);
  getTrailer.mockResolvedValue(null);
});

describe('Explore', () => {
  it('shows a skeleton, then the results as links to game pages', async () => {
    searchGames.mockResolvedValue({ items: [game('hades', 'Hades')], nextCursor: null, warnings: [] });
    renderAt('/explore?q=hades');
    expect(screen.getByRole('status', { name: 'Loading games' })).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: /Hades/ });
    expect(link).toHaveAttribute('href', '/games/hades');
    expect(searchGames).toHaveBeenCalledWith(expect.objectContaining({ q: 'hades' }));
  });

  it('shows an empty state with the reason when nothing matches', async () => {
    searchGames.mockResolvedValue({ items: [], nextCursor: null, warnings: [] });
    renderAt('/explore?q=zzzz');
    expect(await screen.findByText('No games found for "zzzz"')).toBeInTheDocument();
  });

  it('shows the error with Retry, and recovers', async () => {
    let attempts = 0;
    mockCatalog({
      main: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('down');
        return { items: [game('a', 'Alpha')], nextCursor: null, warnings: [] };
      },
    });
    renderAt('/explore');
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot reach the server/i);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: /Alpha/ })).toBeInTheDocument();
  });

  it('surfaces a source warning but still lists cached games', async () => {
    searchGames.mockResolvedValue({
      items: [game('a', 'Alpha')],
      nextCursor: null,
      warnings: [{ source: 'igdb', code: 'NOT_CONFIGURED', message: 'Game lookup is not configured; showing cached games only.' }],
    });
    renderAt('/explore?q=a');
    expect(await screen.findByText(/showing cached games only/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Alpha/ })).toBeInTheDocument();
  });

  it('loads the next page with the cursor', async () => {
    mockCatalog({
      main: async (p) =>
        p.cursor
          ? { items: [game('b', 'Beta')], nextCursor: null, warnings: [] }
          : { items: [game('a', 'Alpha')], nextCursor: 'a', warnings: [] },
    });
    renderAt('/explore');
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('link', { name: /Beta/ })).toBeInTheDocument();
    expect(mainCalls().at(-1)).toEqual(expect.objectContaining({ cursor: 'a' }));
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });
});

describe('Explore curated shelves', () => {
  const list = (...games) => ({ items: games, nextCursor: null, warnings: [] });
  const withMain = { main: list(game('main-1', 'Main Grid Game')) };

  it('asks the catalog for each shelf, in popularity order, and keeps the order it gets', async () => {
    mockCatalog({
      ...withMain,
      shelves: {
        // already ordered by popularity by the API; ratingAvg is deliberately the opposite order
        acclaimed: list({ ...game('pop', 'Popular Pick'), ratingAvg: 1 }, { ...game('niche', 'Niche Pick'), ratingAvg: 5 }),
        quick: list(game('q1', 'Quick One')),
        epic: list(game('e1', 'Epic One')),
      },
    });
    renderAt('/explore');

    const acclaimed = await screen.findByRole('region', { name: 'Critically Acclaimed Masterpieces' });
    expect(within(acclaimed).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/games/pop', '/games/niche']);
    expect(within(await screen.findByRole('region', { name: 'Quick Weekend Wins' })).getByRole('link', { name: /Quick One/ })).toBeInTheDocument();
    expect(within(await screen.findByRole('region', { name: 'Massive 40h+ Epic RPGs' })).getByRole('link', { name: /Epic One/ })).toBeInTheDocument();

    const params = shelfCalls();
    expect(params).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ minRating: 80, limit: 12 }),
        expect.objectContaining({ maxHours: 10, limit: 12 }),
        expect.objectContaining({ genre: 'Role-playing (RPG)', minHours: 40, limit: 12 }),
      ]),
    );
    expect(params).toHaveLength(3);
    expect(screen.getByRole('link', { name: /Main Grid Game/ })).toBeInTheDocument(); // the main list is separate
  });

  it('scopes a failing shelf to itself, with Retry, while everything else still shows', async () => {
    let quickCalls = 0;
    mockCatalog({
      ...withMain,
      shelves: {
        acclaimed: list(game('pop', 'Popular Pick')),
        quick: () => {
          quickCalls += 1;
          if (quickCalls === 1) throw new Error('down');
          return list(game('q1', 'Quick One'));
        },
      },
    });
    renderAt('/explore');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load this shelf/i);
    expect(screen.getByRole('link', { name: /Popular Pick/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Main Grid Game/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry Quick Weekend Wins' }));
    expect(await screen.findByRole('link', { name: /Quick One/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a skeleton while a shelf loads, then the shelf', async () => {
    let release;
    mockCatalog({
      ...withMain,
      shelves: { acclaimed: () => new Promise((resolve) => { release = () => resolve(list(game('pop', 'Popular Pick'))); }) },
    });
    renderAt('/explore');
    expect(await screen.findByRole('status', { name: 'Loading Critically Acclaimed Masterpieces' })).toBeInTheDocument();
    release();
    expect(await screen.findByRole('region', { name: 'Critically Acclaimed Masterpieces' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /Loading Critically/ })).not.toBeInTheDocument();
  });

  it('hides a shelf that has no games', async () => {
    mockCatalog({ ...withMain, shelves: { acclaimed: list(game('pop', 'Popular Pick')) } });
    renderAt('/explore');
    expect(await screen.findByRole('region', { name: 'Critically Acclaimed Masterpieces' })).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole('status', { name: /Loading/ })).not.toBeInTheDocument());
    expect(screen.queryByText('Quick Weekend Wins')).not.toBeInTheDocument();
    expect(screen.queryByText('Massive 40h+ Epic RPGs')).not.toBeInTheDocument();
  });

  it('still shows the shelves when the main list fails, and vice versa', async () => {
    mockCatalog({ main: async () => { throw new Error('down'); }, shelves: { acclaimed: list(game('pop', 'Popular Pick')) } });
    renderAt('/explore');
    expect(await screen.findByRole('link', { name: /Popular Pick/ })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot reach the server/i);
  });

  it('starts the shelves together with the main list, not after it', async () => {
    mockCatalog({ main: () => new Promise(() => {}) }); // the main list never answers
    renderAt('/explore');
    await vi.waitFor(() => expect(shelfCalls()).toHaveLength(3));
  });

  it('shows no shelves while searching', async () => {
    mockCatalog({ ...withMain });
    renderAt('/explore?q=hades');
    expect(await screen.findByRole('link', { name: /Main Grid Game/ })).toBeInTheDocument();
    expect(shelfCalls()).toHaveLength(0);
  });

  it('shows no shelves while a genre is selected', async () => {
    mockCatalog({ ...withMain });
    renderAt('/explore?genre=Indie');
    expect(await screen.findByRole('link', { name: /Main Grid Game/ })).toBeInTheDocument();
    expect(mainCalls().some((p) => p.genre === 'Indie')).toBe(true);
    expect(shelfCalls()).toHaveLength(0);
  });
});

describe('Game page', () => {
  it('renders the game and its time to beat', async () => {
    getGame.mockResolvedValue(game('hades', 'Hades'));
    renderAt('/games/hades');
    expect(await screen.findByRole('heading', { name: 'Hades' })).toBeInTheDocument();
    expect(screen.getByText('20 h')).toBeInTheDocument();
  });

  it('shows a not-found empty state for a 404', async () => {
    getGame.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 404, data: { error: { code: 'NOT_FOUND', message: 'Game not found' } } } }));
    renderAt('/games/nope');
    expect(await screen.findByText('Game not found')).toBeInTheDocument();
  });

  it('shows a scoped error with Retry on other failures', async () => {
    getGame.mockRejectedValue(new Error('down'));
    renderAt('/games/hades');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
  it('switches to reviews and friends tabs', async () => {
    getGame.mockResolvedValue(game('hades', 'Hades'));
    renderAt('/games/hades');
    expect(await screen.findByRole('heading', { name: 'Hades' })).toBeInTheDocument();

    const reviewsTab = screen.getByRole('button', { name: /Community Reviews/ });
    await userEvent.click(reviewsTab);
    expect(await screen.findByText('No reviews yet')).toBeInTheDocument();

    const friendsTab = screen.getByRole('button', { name: /Friends Activity/ });
    await userEvent.click(friendsTab);
    expect(await screen.findByText('No friends playing yet')).toBeInTheDocument();
  });
});
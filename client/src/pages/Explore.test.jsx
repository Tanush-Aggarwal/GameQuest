import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';

const reducedMotion = vi.hoisted(() => ({ value: false }));
vi.mock('framer-motion', async (importOriginal) => ({ ...(await importOriginal()), useReducedMotion: () => reducedMotion.value }));
vi.mock('@/services/gamesApi.js', () => ({ searchGames: vi.fn(), getGame: vi.fn(), getGameFriends: vi.fn().mockResolvedValue([]), getTrailers: vi.fn().mockResolvedValue([]), getGameRequirements: vi.fn().mockResolvedValue({ available: false, reason: 'Not available' }) }));
vi.mock('@/services/socialApi.js', () => ({ listFriends: vi.fn().mockResolvedValue({ friends: [] }) }));
vi.mock('@/services/progressApi.js', () => ({ listLogs: vi.fn().mockResolvedValue({ items: [] }), listJournalEntries: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock('@/services/recommendationsApi.js', () => ({ sendRecommendation: vi.fn() }));
vi.mock('@/services/reviewApi.js', () => ({ listReviewsForGame: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock('@/services/libraryApi.js', () => ({ listLibrary: vi.fn(), addToLibrary: vi.fn(), changeStatus: vi.fn(), removeFromLibrary: vi.fn() }));

const { searchGames, getGame } = await import('@/services/gamesApi.js');
const { default: Explore } = await import('./Explore.jsx');
const { default: Game } = await import('./Game.jsx');
const { ADVANCE_MS: ADVANCE } = await import('@/components/explore/HeroCarousel.jsx');

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

const renderAt = (path) => {
  const router = createMemoryRouter(
    [
      { path: '/explore', element: <Explore /> },
      { path: '/games/:slug', element: <Game /> },
    ],
    { initialEntries: [path] },
  );
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
};
const renderAtWithContainer = renderAt;

const { listLibrary } = await import('@/services/libraryApi.js');
const { listReviewsForGame } = await import('@/services/reviewApi.js');
const { getGameFriends, getTrailers } = await import('@/services/gamesApi.js');
const { getGameRequirements } = await import('@/services/gamesApi.js');
const { listFriends } = await import('@/services/socialApi.js');

// The main grid asks for 24 games, the carousel for 8 and every rail for 12 with its own filter.
const kindOf = (p) => (p.limit === 12 ? 'rail' : p.limit === 8 ? 'carousel' : 'main');
const calls = (kind) => searchGames.mock.calls.map((c) => c[0]).filter((p) => kindOf(p) === kind);
const shelfCalls = () => calls('rail');
const mainCalls = () => calls('main');
const EMPTY = { items: [], nextCursor: null, warnings: [] };
const railKey = (p) => (p.platform ? 'pc' : p.sort === 'rating' ? 'top' : p.releasedAfter ? 'new' : p.maxHours ? 'short' : `genre:${p.genre}`);
// `main` answers the main list (a value or a function of the params); `shelves` answer the rails by key (a value, or
// a function that may throw); `carousel` answers the trending carousel. Anything without an answer is empty.
function mockCatalog({ main = EMPTY, shelves = {}, carousel = EMPTY }) {
  searchGames.mockImplementation(async (p) => {
    const kind = kindOf(p);
    if (kind === 'rail') {
      const answer = shelves[railKey(p)];
      return typeof answer === 'function' ? answer() : (answer ?? EMPTY);
    }
    if (kind === 'carousel') return typeof carousel === 'function' ? carousel() : carousel;
    return typeof main === 'function' ? main(p) : main;
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  listLibrary.mockResolvedValue({ items: [] });
  listReviewsForGame.mockResolvedValue({ items: [] });
  getGameFriends.mockResolvedValue([]);
  getTrailers.mockResolvedValue([]);
  getGameRequirements.mockResolvedValue({ available: false, reason: 'Not available' });
  listFriends.mockResolvedValue({ friends: [] });
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

describe('Explore search box follows the URL', () => {
  it('shows the new query when the URL changes from outside, and does not undo it', async () => {
    mockCatalog({ main: { items: [game('a', 'Alpha')], nextCursor: null, warnings: [] } });
    const { router } = renderAt('/explore?q=mario');
    const box = await screen.findByRole('searchbox', { name: 'Search games' });
    expect(box).toHaveValue('mario');

    await act(async () => {
      await router.navigate('/explore?q=zelda');
    });
    expect(await screen.findByRole('searchbox', { name: 'Search games' })).toHaveValue('zelda');
    // the debounce must not write the old text back into the URL
    await new Promise((r) => setTimeout(r, 450));
    expect(router.state.location.search).toBe('?q=zelda');
    expect(mainCalls().at(-1)).toEqual(expect.objectContaining({ q: 'zelda' }));
  });
});

describe('Explore rails', () => {
  const list = (...games) => ({ items: games, nextCursor: null, warnings: [] });
  const withMain = { main: list(game('main-1', 'Main Grid Game')) };

  it('asks the catalog for each rail with its own filter, and keeps the order it gets', async () => {
    mockCatalog({
      ...withMain,
      shelves: {
        // already ordered by the API; ratingAvg is deliberately the opposite order
        top: list({ ...game('pop', 'Popular Pick'), ratingAvg: 1 }, { ...game('niche', 'Niche Pick'), ratingAvg: 5 }),
        pc: list(game('p1', 'PC One')),
        new: list(game('n1', 'New One')),
        short: list(game('s1', 'Short One')),
        'genre:Indie': list(game('i1', 'Indie One')),
      },
    });
    renderAt('/explore');

    const top = await screen.findByRole('region', { name: 'Top rated' });
    expect(within(top).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/games/pop', '/games/niche']);
    expect(within(await screen.findByRole('region', { name: 'Popular on PC' })).getByRole('link', { name: /PC One/ })).toBeInTheDocument();
    expect(within(await screen.findByRole('region', { name: 'New & upcoming' })).getByRole('link', { name: /New One/ })).toBeInTheDocument();
    expect(within(await screen.findByRole('region', { name: 'Under 10 hours' })).getByRole('link', { name: /Short One/ })).toBeInTheDocument();
    expect(within(await screen.findByRole('region', { name: 'Indies' })).getByRole('link', { name: /Indie One/ })).toBeInTheDocument();

    const params = shelfCalls();
    expect(params).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ platform: 'PC (Microsoft Windows)', limit: 12 }),
        expect.objectContaining({ sort: 'rating', minRating: 80, limit: 12 }),
        expect.objectContaining({ releasedAfter: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), limit: 12 }),
        expect.objectContaining({ maxHours: 10, limit: 12 }),
        expect.objectContaining({ genre: 'Role-playing (RPG)', limit: 12 }),
        expect.objectContaining({ genre: 'Strategy', limit: 12 }),
      ]),
    );
    expect(params).toHaveLength(4 + 7); // four themed rails and one per genre
    expect(screen.getByRole('link', { name: /Main Grid Game/ })).toBeInTheDocument(); // the main list is separate
  });

  it('rail cards do not claim a shared cover id (the same game can sit in several rails)', async () => {
    mockCatalog({ ...withMain, shelves: { pc: list(game('p1', 'PC One')), top: list(game('p1', 'PC One')) } });
    const { container } = renderAtWithContainer('/explore');
    await screen.findByRole('region', { name: 'Popular on PC' });
    const inRails = container.querySelectorAll('section[aria-label="Popular on PC"] [data-shared-cover], section[aria-label="Top rated"] [data-shared-cover]');
    expect(inRails).toHaveLength(0);
    expect(container.querySelectorAll('[data-shared-cover="main-1"]')).toHaveLength(1); // the main grid does
  });

  it('computes "new" from the day it is shown, not from when the module loaded', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2030-03-15T12:00:00Z') });
    try {
      mockCatalog({ ...withMain });
      renderAt('/explore');
      await screen.findByRole('link', { name: /Main Grid Game/ });
      expect(shelfCalls().find((p) => p.releasedAfter)).toEqual(expect.objectContaining({ releasedAfter: '2030-01-14' }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('has a rail with arrows and no native scrollbar', async () => {
    mockCatalog({ ...withMain, shelves: { pc: list(game('p1', 'PC One')) } });
    renderAt('/explore');
    const rail = await screen.findByRole('list', { name: 'Popular on PC games' });
    expect(rail).toHaveClass('snap-x', 'scrollbar-none');
  });

  it('scopes a failing rail to itself, with Retry, while everything else still shows', async () => {
    let calls = 0;
    mockCatalog({
      ...withMain,
      shelves: {
        top: list(game('pop', 'Popular Pick')),
        short: () => {
          calls += 1;
          if (calls === 1) throw new Error('down');
          return list(game('q1', 'Quick One'));
        },
      },
    });
    renderAt('/explore');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load this shelf/i);
    expect(screen.getByRole('link', { name: /Popular Pick/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Main Grid Game/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry Under 10 hours' }));
    expect(await screen.findByRole('link', { name: /Quick One/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a skeleton while a rail loads, then the rail', async () => {
    let release;
    mockCatalog({
      ...withMain,
      shelves: { top: () => new Promise((resolve) => { release = () => resolve(list(game('pop', 'Popular Pick'))); }) },
    });
    renderAt('/explore');
    expect(await screen.findByRole('status', { name: 'Loading Top rated' })).toBeInTheDocument();
    release();
    expect(await screen.findByRole('region', { name: 'Top rated' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /Loading Top rated/ })).not.toBeInTheDocument();
  });

  it('hides a rail that has no games', async () => {
    mockCatalog({ ...withMain, shelves: { top: list(game('pop', 'Popular Pick')) } });
    renderAt('/explore');
    expect(await screen.findByRole('region', { name: 'Top rated' })).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole('status', { name: /Loading/ })).not.toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Under 10 hours' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'RPGs' })).not.toBeInTheDocument();
  });

  it('still shows the rails when the main list fails, and vice versa', async () => {
    mockCatalog({ main: async () => { throw new Error('down'); }, shelves: { top: list(game('pop', 'Popular Pick')) } });
    renderAt('/explore');
    expect(await screen.findByRole('link', { name: /Popular Pick/ })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot reach the server/i);
  });

  it('starts the rails together with the main list, not after it', async () => {
    mockCatalog({ main: () => new Promise(() => {}) }); // the main list never answers
    renderAt('/explore');
    await vi.waitFor(() => expect(shelfCalls()).toHaveLength(11));
  });

  it('with an IntersectionObserver, a rail below the fold waits until it nears the screen', async () => {
    const observers = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb) {
          this.cb = cb;
          observers.push(this);
        }
        observe() {}
        disconnect() {}
      },
    );
    try {
      mockCatalog({ ...withMain, shelves: { top: list(game('pop', 'Popular Pick')) } });
      renderAt('/explore');
      await screen.findByRole('link', { name: /Main Grid Game/ });
      expect(shelfCalls()).toHaveLength(0); // nothing near the screen yet
      expect(screen.getAllByRole('status', { name: /Loading/ }).length).toBeGreaterThan(5); // placeholders, one per rail
      await act(async () => observers.forEach((o) => o.cb([{ isIntersecting: true }])));
      expect(await screen.findByRole('region', { name: 'Top rated' })).toBeInTheDocument();
      expect(shelfCalls()).toHaveLength(11);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows no rails while searching or while a filter is on', async () => {
    mockCatalog({ ...withMain });
    renderAt('/explore?q=hades');
    expect(await screen.findByRole('link', { name: /Main Grid Game/ })).toBeInTheDocument();
    expect(shelfCalls()).toHaveLength(0);
  });

  it('shows no rails or carousel while a genre is selected', async () => {
    mockCatalog({ ...withMain });
    renderAt('/explore?genre=Indie');
    expect(await screen.findByRole('link', { name: /Main Grid Game/ })).toBeInTheDocument();
    expect(mainCalls().some((p) => p.genre === 'Indie')).toBe(true);
    expect(shelfCalls()).toHaveLength(0);
    expect(calls('carousel')).toHaveLength(0);
    expect(screen.queryByRole('region', { name: 'Trending games' })).not.toBeInTheDocument();
  });
});

describe('Explore filters for the results', () => {
  const one = { items: [game('a', 'Alpha')], nextCursor: null, warnings: [] };

  it('platform, length and rating go to the catalog and the URL, and can be cleared', async () => {
    mockCatalog({ main: one });
    const { router } = renderAt('/explore');
    await screen.findByRole('link', { name: /Alpha/ });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by platform' }), 'PlayStation 5');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by length' }), 'medium');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by rating' }), '80');
    await screen.findByRole('heading', { name: 'Results' });
    expect(router.state.location.search).toBe('?platform=PlayStation+5&length=medium&rating=80');
    expect(mainCalls().at(-1)).toEqual(expect.objectContaining({ platform: 'PlayStation 5', minHours: 10, maxHours: 20, minRating: 80, limit: 24 }));
    expect(screen.queryByRole('region', { name: 'Top rated' })).not.toBeInTheDocument(); // rails are for the default view
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByRole('heading', { name: 'All Games' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
  });

  it('opening a URL with filters selects them, and says so when nothing matches', async () => {
    mockCatalog({ main: EMPTY });
    renderAt('/explore?length=long&rating=90');
    expect(await screen.findByText('No games match these filters')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filter by length' })).toHaveValue('long');
    expect(screen.getByRole('combobox', { name: 'Filter by rating' })).toHaveValue('90');
    expect(mainCalls().at(-1)).toEqual(expect.objectContaining({ minHours: 40, minRating: 90 }));
  });

  it('ignores filter values it does not know', async () => {
    mockCatalog({ main: one });
    renderAt('/explore?length=forever&rating=5');
    await screen.findByRole('link', { name: /Alpha/ });
    expect(mainCalls().at(-1)).not.toHaveProperty('minHours');
    expect(mainCalls().at(-1).minRating).toBeUndefined();
    expect(screen.getByRole('heading', { name: 'All Games' })).toBeInTheDocument(); // still the default view
  });

  it('ignores a platform it does not know instead of showing a blank menu', async () => {
    mockCatalog({ main: one });
    renderAt('/explore?platform=Foo');
    await screen.findByRole('link', { name: /Alpha/ });
    expect(screen.getByRole('combobox', { name: 'Filter by platform' })).toHaveValue('');
    expect(mainCalls().at(-1)).not.toHaveProperty('platform', 'Foo');
    expect(screen.getByRole('heading', { name: 'All Games' })).toBeInTheDocument();
  });

  it('keeps the search text when filters are cleared', async () => {
    mockCatalog({ main: one });
    const { router } = renderAt('/explore?q=alp&rating=80');
    await screen.findByRole('link', { name: /Alpha/ });
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(router.state.location.search).toBe('?q=alp');
  });
});

describe('Explore trending carousel', () => {
  const slide = (n) => ({ ...game(`t${n}`, `Trending ${n}`), backdrop: `https://img/t${n}.jpg`, genres: ['RPG', 'Action'], summary: `Summary ${n}` });
  const five = { items: [1, 2, 3, 4, 5, 6].map(slide), nextCursor: null, warnings: [] };

  afterEach(() => vi.useRealTimers());

  it('shows the most popular game with a link, at most five slides, and labelled dots', async () => {
    mockCatalog({ carousel: five, main: { items: [game('a', 'Alpha')], nextCursor: null, warnings: [] } });
    renderAt('/explore');
    const region = await screen.findByRole('region', { name: 'Trending games' });
    expect(region).toHaveAttribute('aria-roledescription', 'carousel');
    expect(within(region).getByRole('heading', { level: 2, name: 'Trending 1' })).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'View game: Trending 1' })).toHaveAttribute('href', '/games/t1');
    expect(within(region).getByRole('group', { name: '1 of 5' })).toBeInTheDocument();
    const dots = within(within(region).getByRole('group', { name: 'Choose a slide' })).getAllByRole('button');
    expect(dots.map((d) => d.getAttribute('aria-label'))).toEqual(['Slide 1: Trending 1', 'Slide 2: Trending 2', 'Slide 3: Trending 3', 'Slide 4: Trending 4', 'Slide 5: Trending 5']);
    expect(dots[0]).toHaveAttribute('aria-pressed', 'true');
    expect(dots[0].className).toMatch(/h-2\.5/);
    expect(calls('carousel')[0]).toEqual({ limit: 8 });
  });

  it('moves with the arrows and dots, wrapping around', async () => {
    mockCatalog({ carousel: five });
    renderAt('/explore');
    const region = await screen.findByRole('region', { name: 'Trending games' });
    await userEvent.click(within(region).getByRole('button', { name: 'Next slide' }));
    expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent('Trending 2');
    await userEvent.click(within(region).getByRole('button', { name: 'Previous slide' }));
    await userEvent.click(within(region).getByRole('button', { name: 'Previous slide' })); // wraps to the last
    expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent('Trending 5');
    await userEvent.click(within(region).getByRole('button', { name: 'Slide 3: Trending 3' }));
    expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent('Trending 3');
  });

  it('advances by itself, can be paused, and holds still while the pointer is on it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true }); // before the carousel starts its timer
    mockCatalog({ carousel: five });
    renderAt('/explore');
    const region = await screen.findByRole('region', { name: 'Trending games' });
    const title = () => within(region).getByRole('heading', { level: 2 }).textContent;
    await act(async () => {}); // let the carousel's effect start its timer
    await act(async () => vi.advanceTimersByTime(ADVANCE));
    expect(title()).toBe('Trending 2');

    fireEvent.pointerEnter(region, { pointerType: 'mouse' });
    await act(async () => vi.advanceTimersByTime(ADVANCE * 2));
    expect(title()).toBe('Trending 2'); // held
    fireEvent.pointerLeave(region, { pointerType: 'mouse' });
    await act(async () => vi.advanceTimersByTime(ADVANCE));
    expect(title()).toBe('Trending 3');

    fireEvent.click(within(region).getByRole('button', { name: 'Pause auto-advance' }));
    await act(async () => vi.advanceTimersByTime(ADVANCE * 3));
    expect(title()).toBe('Trending 3');
    expect(within(region).getByRole('button', { name: 'Resume auto-advance' })).toBeInTheDocument();
    fireEvent.click(within(region).getByRole('button', { name: 'Resume auto-advance' }));
    await act(async () => vi.advanceTimersByTime(ADVANCE));
    expect(title()).toBe('Trending 4');
  });

  it('a touch tap does not leave it held (only a mouse pointer holds it still)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockCatalog({ carousel: five });
    renderAt('/explore');
    const region = await screen.findByRole('region', { name: 'Trending games' });
    await act(async () => {});
    fireEvent.pointerEnter(region, { pointerType: 'touch' });
    await act(async () => vi.advanceTimersByTime(ADVANCE));
    expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent('Trending 2');
  });

  it('keyboard focus stays on the control you pressed when the slide changes', async () => {
    mockCatalog({ carousel: five });
    renderAt('/explore');
    const region = await screen.findByRole('region', { name: 'Trending games' });
    const next = within(region).getByRole('button', { name: 'Next slide' });
    next.focus();
    await userEvent.keyboard('{Enter}');
    expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent('Trending 2');
    expect(within(region).getByRole('button', { name: 'Next slide' })).toBe(next); // the same element, not a new one
    expect(next).toHaveFocus();
    const dot = within(region).getByRole('button', { name: 'Slide 4: Trending 4' });
    dot.focus();
    await userEvent.keyboard('{Enter}');
    expect(dot).toHaveFocus();
    expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent('Trending 4');
  });

  it('is one landmark: the carousel section holds a plain container, not a second section', async () => {
    mockCatalog({ carousel: five });
    renderAt('/explore');
    const region = await screen.findByRole('region', { name: 'Trending games' });
    expect(region.querySelectorAll('section')).toHaveLength(0);
    expect(region.querySelector('[aria-live]')).not.toBeNull();
  });

  it('does not move by itself, and has no pause button, when the viewer prefers reduced motion', async () => {
    reducedMotion.value = true;
    try {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mockCatalog({ carousel: five });
      renderAt('/explore');
      const region = await screen.findByRole('region', { name: 'Trending games' });
      await act(async () => vi.advanceTimersByTime(ADVANCE * 3));
      expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent('Trending 1');
      expect(within(region).queryByRole('button', { name: /slideshow/ })).not.toBeInTheDocument();
      fireEvent.click(within(region).getByRole('button', { name: 'Next slide' })); // still usable by hand
      expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent('Trending 2');
    } finally {
      reducedMotion.value = false;
    }
  });

  it('with a single game there are no controls, and with none there is no carousel', async () => {
    mockCatalog({ carousel: { items: [slide(1)], nextCursor: null, warnings: [] } });
    const first = renderAtWithContainer('/explore');
    const region = await screen.findByRole('region', { name: 'Trending games' });
    expect(within(region).queryByRole('button', { name: 'Next slide' })).not.toBeInTheDocument();
    first.unmount();
    mockCatalog({ carousel: EMPTY });
    renderAt('/explore');
    await screen.findByRole('heading', { name: 'Explore Catalog' });
    await vi.waitFor(() => expect(screen.queryByRole('status', { name: 'Loading trending games' })).not.toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Trending games' })).not.toBeInTheDocument();
  });

  it('shows a skeleton while loading and a scoped error with Retry that does not touch the rest', async () => {
    let attempts = 0;
    mockCatalog({
      carousel: () => {
        attempts += 1;
        if (attempts === 1) throw new Error('down');
        return five;
      },
      main: { items: [game('a', 'Alpha')], nextCursor: null, warnings: [] },
    });
    renderAt('/explore');
    expect(screen.getByRole('status', { name: 'Loading trending games' })).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/trending games/i);
    expect(screen.getByRole('link', { name: /Alpha/ })).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('region', { name: 'Trending games' })).toBeInTheDocument();
  });
});
describe('Game page', () => {
  it('renders the game and its time to beat', async () => {
    getGame.mockResolvedValue(game('hades', 'Hades'));
    renderAt('/games/hades');
    expect(await screen.findByRole('heading', { name: 'Hades' })).toBeInTheDocument();
    expect(screen.getByText('20h')).toBeInTheDocument();
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

    const communityTab = screen.getByRole('tab', { name: 'Community' });
    await userEvent.click(communityTab);
    expect(await screen.findByText('No reviews yet')).toBeInTheDocument();
    expect(screen.getByText('Friends who have the game')).toBeInTheDocument();
    expect(await screen.findByText('No friends playing yet')).toBeInTheDocument();
  });
});
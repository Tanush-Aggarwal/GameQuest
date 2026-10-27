import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/services/gamesApi.js', () => ({
  getGame: vi.fn(),
  getTrailers: vi.fn(),
  getGameFriends: vi.fn(),
  searchGames: vi.fn(),
  reportTrailer: vi.fn(),
}));
vi.mock('@/services/libraryApi.js', () => ({ listLibrary: vi.fn(), addToLibrary: vi.fn(), changeStatus: vi.fn() }));
vi.mock('@/services/reviewApi.js', () => ({ listReviewsForGame: vi.fn(), getMyReview: vi.fn(), upsertReview: vi.fn(), deleteReview: vi.fn() }));
vi.mock('@/services/progressApi.js', () => ({
  setProgress: vi.fn(),
  logSession: vi.fn(),
  listLogs: vi.fn(),
  deleteLog: vi.fn(),
  addJournalEntry: vi.fn(),
  listJournalEntries: vi.fn(),
  deleteJournalEntry: vi.fn(),
}));
vi.mock('@/services/socialApi.js', () => ({ listFriends: vi.fn() }));
vi.mock('@/services/recommendationsApi.js', () => ({ sendRecommendation: vi.fn() }));

const games = await import('@/services/gamesApi.js');
const library = await import('@/services/libraryApi.js');
const reviews = await import('@/services/reviewApi.js');
const progress = await import('@/services/progressApi.js');
const social = await import('@/services/socialApi.js');
const { default: Game } = await import('./Game.jsx');

const SHOT = (n) => `https://images.igdb.com/igdb/image/upload/t_1080p/shot${n}.jpg`;
const hades = {
  id: 'g1',
  slug: 'hades',
  title: 'Hades',
  cover: null,
  backdrop: 'https://images.igdb.com/igdb/image/upload/t_1080p/bd.jpg',
  summary: 'Defy the god of the dead.',
  genres: ['Roguelike', 'Action'],
  platforms: ['PC (Microsoft Windows)', 'Nintendo Switch', 'PlayStation 5'],
  developer: ['Supergiant Games'],
  releaseDate: '2020-09-17T00:00:00Z',
  ratingAvg: 4.5,
  ratingCount: 12,
  timeToBeat: { main: 22, extras: 40, full: 95 },
  screenshots: [SHOT(1), SHOT(2), SHOT(3)],
};

function renderGame(path = '/games/hades') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/games/:slug" element={<Game />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  games.getGame.mockResolvedValue(hades);
  games.getTrailers.mockResolvedValue([]);
  games.getGameFriends.mockResolvedValue([]);
  games.searchGames.mockResolvedValue({
    items: [hades, { id: 'g2', slug: 'dead-cells', title: 'Dead Cells', cover: null, genres: ['Roguelike'] }],
  });
  library.listLibrary.mockResolvedValue({ items: [] });
  social.listFriends.mockResolvedValue([]);
  reviews.listReviewsForGame.mockResolvedValue({ items: [] });
  reviews.getMyReview.mockResolvedValue(null);
  progress.listLogs.mockResolvedValue({ items: [] });
  progress.listJournalEntries.mockResolvedValue({ items: [] });
});

describe('Game page hero', () => {
  it('shows title, developer, year, rating, time to beat and platform pills with names', async () => {
    renderGame();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hades' })).toBeInTheDocument();
    expect(screen.getByText('Supergiant Games · 2020')).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText(/~22 h to beat/)).toBeInTheDocument();
    const pills = within(screen.getByRole('list', { name: 'Platforms' })).getAllByRole('listitem');
    expect(pills.map((p) => p.textContent)).toEqual(['PC', 'Nintendo Switch', 'PlayStation 5']); // "(Microsoft Windows)" is trimmed
    expect(screen.getByRole('button', { name: /^recommend/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /schedule/i })).toHaveAttribute('href', '/sessions/new?game=hades');
  });

  it('offers one primary action when the game is not in the library, and adds it optimistically with a toast', async () => {
    library.addToLibrary.mockResolvedValue({ id: 'e1', gameId: 'g1', status: 'backlog', manualProgress: 0 });
    renderGame();
    await userEvent.click(await screen.findByRole('button', { name: /add to backlog/i }));
    expect(library.addToLibrary).toHaveBeenCalledWith({ gameId: 'g1', status: 'backlog' });
    expect(await screen.findByRole('link', { name: /open in library/i })).toHaveAttribute('href', '/library/e1');
    expect(toast.success).toHaveBeenCalledWith('Hades added to your backlog');
  });

  it('shows the status and the allowed moves when it is in the library', async () => {
    library.listLibrary.mockResolvedValue({ items: [{ id: 'e1', gameId: 'g1', status: 'playing', manualProgress: 30 }] });
    renderGame();
    expect(await screen.findByRole('link', { name: /open in library/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /move hades to another status/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add to backlog/i })).not.toBeInTheDocument();
  });

  it('a library lookup failure is scoped to that control, with Retry', async () => {
    library.listLibrary.mockRejectedValueOnce(new Error('down'));
    renderGame();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Hades' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: /add to backlog/i })).toBeInTheDocument();
  });

  it('says so for an unknown game, and retries a failing load', async () => {
    games.getGame.mockRejectedValueOnce(Object.assign(new Error('nope'), { response: { status: 404 } }));
    renderGame('/games/zzz');
    expect(await screen.findByRole('heading', { level: 1, name: 'Game not found' })).toBeInTheDocument();
  });
});

describe('Game page tabs', () => {
  it('has About, Your progress, Reviews and Friends tabs; About is selected first', async () => {
    renderGame();
    const list = await screen.findByRole('tablist', { name: 'Game details' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['About', 'Your progress', 'Reviews12', 'Friends']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Defy the god of the dead.')).toBeInTheDocument();
  });

  it('moves between tabs with the arrow keys', async () => {
    const user = userEvent.setup();
    renderGame();
    const [about] = within(await screen.findByRole('tablist')).getAllByRole('tab');
    about.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Your progress' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('tab', { name: 'Your progress' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Your progress asks you to add the game first, and shows the progress panel once it is in the library', async () => {
    const user = userEvent.setup();
    renderGame();
    await user.click(await screen.findByRole('tab', { name: 'Your progress' }));
    expect(await screen.findByText('Not in your library yet')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'About' }));

    library.addToLibrary.mockResolvedValue({ id: 'e1', gameId: 'g1', status: 'playing', manualProgress: 40 });
    await user.click(screen.getByRole('button', { name: /start playing/i }));
    await screen.findByRole('link', { name: /open in library/i });
    await user.click(screen.getByRole('tab', { name: 'Your progress' }));
    expect(await screen.findByLabelText('Manual progress')).toHaveValue('40');
  });

  it('Friends lists friends who have it, with an empty state otherwise', async () => {
    const user = userEvent.setup();
    games.getGameFriends.mockResolvedValue([{ userId: 'u2', username: 'trin', status: 'playing', manualProgress: 20 }]);
    renderGame();
    await user.click(await screen.findByRole('tab', { name: 'Friends' }));
    expect(await screen.findByRole('link', { name: 'trin' })).toHaveAttribute('href', '/u/trin');
  });

  it('Reviews shows the community reviews for a game that is not in your library', async () => {
    const user = userEvent.setup();
    reviews.listReviewsForGame.mockResolvedValue({ items: [{ id: 'r1', username: 'neo', rating: 5, body: 'Superb run.', createdAt: '2026-01-01T00:00:00Z' }] });
    renderGame();
    await user.click(await screen.findByRole('tab', { name: /^Reviews/ }));
    expect(await screen.findByText('Superb run.')).toBeInTheDocument();
  });
});

describe('Game page sections fail on their own', () => {
  it('a friends failure is an error with Retry, not "no friends playing"', async () => {
    const user = userEvent.setup();
    games.getGameFriends.mockRejectedValueOnce(new Error('down'));
    renderGame();
    await user.click(await screen.findByRole('tab', { name: 'Friends' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/friends/i);
    expect(screen.queryByText('No friends playing yet')).not.toBeInTheDocument();
    games.getGameFriends.mockResolvedValue([{ userId: 'u2', username: 'trin', status: 'playing', manualProgress: 0 }]);
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: 'trin' })).toBeInTheDocument();
  });

  it('a reviews failure is an error with Retry, and the review stars read as one image', async () => {
    const user = userEvent.setup();
    reviews.listReviewsForGame.mockRejectedValueOnce(new Error('down'));
    renderGame();
    await user.click(await screen.findByRole('tab', { name: /^Reviews/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/reviews/i);
    reviews.listReviewsForGame.mockResolvedValue({ items: [{ id: 'r1', username: 'neo', rating: 4, body: 'Great.', createdAt: '2026-01-01T00:00:00Z' }] });
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('img', { name: '4 out of 5 stars' })).toBeInTheDocument();
  });

  it('a failed status move rolls back and says why', async () => {
    const user = userEvent.setup();
    library.listLibrary.mockResolvedValue({ items: [{ id: 'e1', gameId: 'g1', status: 'backlog', manualProgress: 0 }] });
    library.changeStatus.mockRejectedValue(new Error('nope'));
    renderGame();
    await user.selectOptions(await screen.findByRole('combobox', { name: /move hades/i }), 'playing');
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(await screen.findByText('Backlog')).toBeInTheDocument(); // back where it was
  });

  it('a failed add shows the error and keeps the add buttons', async () => {
    library.addToLibrary.mockRejectedValue(new Error('nope'));
    renderGame();
    await userEvent.click(await screen.findByRole('button', { name: /add to backlog/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /add to backlog/i })).toBeEnabled();
  });
});

describe('screenshot gallery and lightbox', () => {
  it('opens a lightbox with a counter, steps with the arrow keys (wrapping), closes with Escape and returns focus', async () => {
    const user = userEvent.setup();
    renderGame();
    const thumb = await screen.findByRole('button', { name: 'Open Hades screenshot 1 of 3' });
    await user.click(thumb);
    const dialog = await screen.findByRole('dialog', { name: 'Hades screenshots' });
    expect(within(dialog).getByRole('img', { name: 'Hades screenshot 1 of 3' })).toHaveAttribute('src', SHOT(1)); // the 1080p original
    expect(within(dialog).getByText('1 / 3')).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByRole('img', { name: 'Hades screenshot 2 of 3' })).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}{ArrowLeft}'); // back to 1, then wraps to 3
    expect(within(dialog).getByText('3 / 3')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Next screenshot' })); // wraps to 1
    expect(within(dialog).getByText('1 / 3')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(thumb).toHaveFocus());
  });

  it('thumbnails use the medium size and load lazily', async () => {
    renderGame();
    const thumb = await screen.findByRole('button', { name: 'Open Hades screenshot 2 of 3' });
    const img = thumb.querySelector('img');
    expect(img.getAttribute('src')).toContain('/t_screenshot_med/');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('is absent when the game has no screenshots', async () => {
    games.getGame.mockResolvedValue({ ...hades, screenshots: [] });
    renderGame();
    await screen.findByRole('heading', { level: 1, name: 'Hades' });
    expect(screen.queryByRole('heading', { name: 'Screenshots' })).not.toBeInTheDocument();
  });
});

describe('More like this', () => {
  it('lists other games of the first genre, never the game itself', async () => {
    renderGame();
    const rail = await screen.findByRole('list', { name: 'Similar games' });
    expect(within(rail).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/games/dead-cells']);
    expect(games.searchGames).toHaveBeenCalledWith({ genre: 'Roguelike', limit: 13 }, expect.anything());
  });

  it('a failure stays inside that section, which can retry', async () => {
    games.searchGames.mockRejectedValueOnce(new Error('down'));
    renderGame();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/similar games/i);
    expect(screen.getByRole('heading', { level: 1, name: 'Hades' })).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('list', { name: 'Similar games' })).toBeInTheDocument();
  });
});

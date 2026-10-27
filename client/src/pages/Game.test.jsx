import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/services/gamesApi.js', () => ({
  getGame: vi.fn(),
  getTrailers: vi.fn(),
  getGameFriends: vi.fn(),
  getGameRequirements: vi.fn(),
  searchGames: vi.fn(),
  reportTrailer: vi.fn(),
}));
vi.mock('@/services/libraryApi.js', () => ({ listLibrary: vi.fn(), addToLibrary: vi.fn(), changeStatus: vi.fn() }));
vi.mock('@/services/reviewApi.js', () => ({ listReviewsForGame: vi.fn(), getMyReview: vi.fn(), upsertReview: vi.fn(), deleteReview: vi.fn() }));
vi.mock('@/services/progressApi.js', () => ({ setProgress: vi.fn(), logSession: vi.fn(), listLogs: vi.fn(), deleteLog: vi.fn(), addJournalEntry: vi.fn(), listJournalEntries: vi.fn(), deleteJournalEntry: vi.fn() }));
vi.mock('@/services/socialApi.js', () => ({ listFriends: vi.fn() }));
vi.mock('@/services/recommendationsApi.js', () => ({ sendRecommendation: vi.fn() }));

const games = await import('@/services/gamesApi.js');
const library = await import('@/services/libraryApi.js');
const reviews = await import('@/services/reviewApi.js');
const social = await import('@/services/socialApi.js');
const progress = await import('@/services/progressApi.js');
const { default: Game } = await import('./Game.jsx');

const SHOT = (n) => `https://images.igdb.com/igdb/image/upload/t_1080p/shot${n}.jpg`;
const hades = {
  id: 'g1', slug: 'hades', title: 'Hades', cover: null,
  backdrop: 'https://images.igdb.com/igdb/image/upload/t_1080p/bd.jpg',
  summary: 'Defy the god of the dead.', genres: ['Roguelike', 'Action'],
  platforms: ['PC (Microsoft Windows)', 'Nintendo Switch', 'PlayStation 5'],
  developer: ['Supergiant Games'], publisher: ['Supergiant Games'],
  releaseDate: '2020-09-17T00:00:00Z', totalRating: 90,
  ratingAvg: 4.5, ratingCount: 12, gameModes: ['Single player'],
  timeToBeat: { main: 22, extras: 40, full: 95 }, screenshots: [SHOT(1), SHOT(2), SHOT(3)],
};

function renderGame(path = '/games/hades') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/games/:slug" element={<Game />} /></Routes></MemoryRouter>);
}

beforeEach(() => {
  vi.resetAllMocks();
  games.getGame.mockResolvedValue(hades);
  games.getTrailers.mockResolvedValue([{ videoId: 'abcdefghijk', label: 'Gameplay trailer' }]);
  games.getGameFriends.mockResolvedValue([]);
  games.getGameRequirements.mockResolvedValue({ available: false, reason: 'Not available for this game.' });
  games.searchGames.mockResolvedValue({ items: [{ id: 'g2', slug: 'dead-cells', title: 'Dead Cells', cover: null, genres: ['Roguelike'] }] });
  library.listLibrary.mockResolvedValue({ items: [] });
  reviews.listReviewsForGame.mockResolvedValue({ items: [] });
  reviews.getMyReview.mockResolvedValue(null);
  social.listFriends.mockResolvedValue({ friends: [] });
  progress.listLogs.mockResolvedValue({ items: [] });
  progress.listJournalEntries.mockResolvedValue({ items: [] });
});

describe('Game page redesign', () => {
  it('renders the full-bleed hero metadata and grouped platform families', async () => {
    renderGame();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hades' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Platforms' })).toHaveTextContent('PCPlayStationSwitch');
    expect(screen.getByText('9.0')).toBeInTheDocument();
    expect(screen.getAllByText('Supergiant Games').length).toBeGreaterThan(0);
    expect(await screen.findByRole('button', { name: /add to library/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /watch trailer/i })).toBeInTheDocument();
  });

  it('adds a game with the lime primary action', async () => {
    library.addToLibrary.mockResolvedValue({ id: 'e1', gameId: 'g1', status: 'backlog', manualProgress: 0 });
    renderGame();
    await userEvent.click(await screen.findByRole('button', { name: /add to library/i }));
    expect(library.addToLibrary).toHaveBeenCalledWith({ gameId: 'g1', status: 'backlog' });
    expect(toast.success).toHaveBeenCalledWith('Hades added to your backlog');
  });

  it('shows the status action menu when the game is already in the library', async () => {
    library.listLibrary.mockResolvedValue({ items: [{ id: 'e1', gameId: 'g1', status: 'playing', manualProgress: 30 }] });
    renderGame();
    await userEvent.click(await screen.findByRole('button', { name: /playing/i }));
    expect(screen.getByRole('menuitem', { name: /open in library/i })).toHaveAttribute('href', '/library/e1');
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('has the required tabs and conditionally renders progress', async () => {
    games.getGameRequirements.mockResolvedValue({
      available: true,
      minimum: [{ label: 'OS', value: 'Windows 10' }],
      recommended: [],
    });
    renderGame();
    const list = await screen.findByRole('tablist', { name: 'Game details' });
    expect(within(list).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Overview', 'Screenshots', 'Community', 'System requirements']);
    await userEvent.click(screen.getByRole('tab', { name: 'System requirements' }));
    expect(await screen.findByText('Windows 10')).toBeInTheDocument();
  });

  it('shows progress only for a library game and loads community content', async () => {
    library.listLibrary.mockResolvedValue({ items: [{ id: 'e1', gameId: 'g1', status: 'playing', manualProgress: 30 }] });
    renderGame();
    expect(await screen.findByRole('tab', { name: 'Your progress' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Community' }));
    expect(await screen.findByText('Community reviews')).toBeInTheDocument();
    expect(screen.getByText('Friends who have the game')).toBeInTheDocument();
  });

  it('switches to screenshots and opens the trailer lightbox trigger', async () => {
    renderGame();
    await userEvent.click(await screen.findByRole('tab', { name: 'Screenshots' }));
    expect(await screen.findByRole('heading', { name: 'Trailers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open hades screenshot 1 of 3/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /watch trailer/i }));
    expect(await screen.findByRole('dialog', { name: /hades trailer/i })).toBeInTheDocument();
  });

  it('keeps similar games in a separate rail', async () => {
    renderGame();
    expect(await screen.findByRole('list', { name: 'Similar games' })).toBeInTheDocument();
  });

  it('shows a not found state', async () => {
    games.getGame.mockRejectedValue(Object.assign(new Error('nope'), { response: { status: 404 } }));
    renderGame('/games/zzz');
    expect(await screen.findByRole('heading', { level: 1, name: 'Game not found' })).toBeInTheDocument();
  });
});

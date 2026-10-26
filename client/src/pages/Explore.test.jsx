import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('@/services/gamesApi.js', () => ({ searchGames: vi.fn(), getGame: vi.fn() }));

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

beforeEach(() => vi.resetAllMocks());

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
    searchGames.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ items: [game('a', 'Alpha')], nextCursor: null, warnings: [] });
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
    searchGames
      .mockResolvedValueOnce({ items: [game('a', 'Alpha')], nextCursor: 'a', warnings: [] })
      .mockResolvedValueOnce({ items: [game('b', 'Beta')], nextCursor: null, warnings: [] });
    renderAt('/explore');
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('link', { name: /Beta/ })).toBeInTheDocument();
    expect(searchGames).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'a' }));
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
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
});

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

const reduced = vi.hoisted(() => ({ value: false }));
vi.mock('framer-motion', async (importOriginal) => ({ ...(await importOriginal()), useReducedMotion: () => reduced.value }));
vi.mock('@/services/gamesApi.js', () => ({ searchGames: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock('@/services/libraryApi.js', () => ({ listLibrary: vi.fn().mockResolvedValue({ items: [] }) }));

const { AuthContext } = await import('@/features/auth/AuthContext.jsx');
const { AppLayout } = await import('@/components/layout/AppLayout.jsx');
const { AmbientBackground } = await import('@/components/art/AmbientBackground.jsx');
const { AmbientContext } = await import('@/components/art/ambientContext.js');
const { GameCard } = await import('@/components/games/GameCard.jsx');

const game = { id: 'g1', slug: 'hades', title: 'Hades', cover: null, genres: ['Roguelike'], releaseDate: '2020-09-17T00:00:00Z' };

function renderCard() {
  return render(
    <MemoryRouter>
      <GameCard game={game} />
    </MemoryRouter>,
  );
}

function renderShell() {
  return render(
    <AuthContext.Provider value={{ user: { id: '1', username: 'neo' }, status: 'authenticated', logout: vi.fn() }}>
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

describe('motion is off under prefers-reduced-motion', () => {
  afterEach(() => {
    reduced.value = false;
  });

  it('pages fade in and covers carry a shared layout id by default', () => {
    const shell = renderShell();
    expect(shell.container.querySelector('[data-page-transition]')).not.toBeNull();
    shell.unmount();
    expect(renderCard().container.querySelector('[data-shared-cover="hades"]')).not.toBeNull();
  });

  it('with reduced motion: the page is swapped without a transition wrapper and covers do not glide', () => {
    reduced.value = true;
    const shell = renderShell();
    expect(screen.getByRole('heading', { name: 'Page body' })).toBeInTheDocument();
    expect(shell.container.querySelector('[data-page-transition]')).toBeNull();
    shell.unmount();
    expect(renderCard().container.querySelector('[data-shared-cover]')).toBeNull();
  });

  it('the ambient background shows the current game and nothing when there is none', () => {
    const ctx = (current) => ({ base: current, preview: null, current, setBase() {}, previewGame() {}, clearPreview() {} });
    const { container, rerender } = render(
      <AmbientContext.Provider value={ctx(null)}>
        <AmbientBackground />
      </AmbientContext.Provider>,
    );
    expect(container.querySelector('[data-ambient]')).toHaveAttribute('data-ambient', 'off');
    rerender(
      <AmbientContext.Provider value={ctx({ backdrop: 'https://img/hades.jpg' })}>
        <AmbientBackground />
      </AmbientContext.Provider>,
    );
    expect(container.querySelector('[data-ambient]')).toHaveAttribute('data-ambient', 'on');
    expect(container.querySelector('[data-ambient]')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://img/hades.jpg');
  });
});

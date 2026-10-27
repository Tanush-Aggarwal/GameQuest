import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthContext } from '@/features/auth/AuthContext.jsx';
import { routes } from './routes.jsx';


// The shell loads game art for section backgrounds; these tests are about routing, so give it nothing.
vi.mock('@/services/gamesApi.js', async (orig) => ({ ...(await orig()), searchGames: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock('@/services/libraryApi.js', async (orig) => ({ ...(await orig()), listLibrary: vi.fn().mockResolvedValue({ items: [], counts: {} }) }));

const user = { id: '1', username: 'neo', email: 'neo@example.com', role: 'user', createdAt: '2026-01-01T00:00:00Z' };

function renderAt(path, auth) {
  const value = { user: null, status: 'anonymous', retry: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), ...auth };
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthContext.Provider value={value}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  );
  return { router, value };
}

describe('route guards', () => {
  it('redirects anonymous visitors from a protected page to /login', async () => {
    const { router } = renderAt('/library', { status: 'anonymous' });
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('shows a skeleton, not the page, while the session is being checked', () => {
    renderAt('/library', { status: 'loading' });
    expect(screen.getByRole('status', { name: /checking your session/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Library' })).not.toBeInTheDocument();
  });

  it('shows a scoped error with Retry when the session check fails', async () => {
    const { value } = renderAt('/', { status: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't check your session/i);
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(value.retry).toHaveBeenCalled();
  });

  it('renders protected pages for signed-in users, with both navs', async () => {
    renderAt('/library', { status: 'authenticated', user });
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument();
    // side rail (desktop) + bottom tab bar (mobile): each is a "Main" nav, one is hidden by CSS at any width
    const navs = screen.getAllByRole('navigation', { name: 'Main' });
    expect(navs).toHaveLength(2);
    for (const label of ['Home', 'Library', 'Explore', 'Friends', 'Profile']) {
      expect(screen.getAllByRole('link', { name: label })).toHaveLength(2);
    }
    // the rail also has the two destinations that do not fit in the five mobile tabs
    const [rail, tabs] = navs; // DOM order: rail first
    for (const label of ['Collections', 'Sessions']) {
      expect(within(rail).getAllByRole('link', { name: label })).toHaveLength(1);
      expect(within(tabs).queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
    expect(screen.getAllByRole('link', { name: 'Library' }).every((l) => l.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('sends signed-in users away from /login', async () => {
    const { router } = renderAt('/login', { status: 'authenticated', user });
    expect(await screen.findByRole('heading', { name: /welcome back, neo/i })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('unknown URLs show the not-found page', async () => {
    renderAt('/nope', { status: 'authenticated', user });
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

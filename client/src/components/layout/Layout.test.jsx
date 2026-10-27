import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/services/gamesApi.js', () => ({ searchGames: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock('@/services/libraryApi.js', () => ({ listLibrary: vi.fn().mockResolvedValue({ items: [] }) }));

const { AuthContext } = await import('@/features/auth/AuthContext.jsx');
const { SideRail } = await import('./SideRail.jsx');
const { TopBar } = await import('./TopBar.jsx');
const { AppLayout } = await import('./AppLayout.jsx');
const { DESKTOP_NAV_ITEMS, MOBILE_NAV_ITEMS } = await import('./navItems.js');

const user = { id: '1', username: 'neo', email: 'neo@example.com', role: 'user' };

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function renderAt(ui, { path = '/', logout = vi.fn() } = {}) {
  render(
    <AuthContext.Provider value={{ user, status: 'authenticated', logout }}>
      <MemoryRouter initialEntries={[path]}>
        {ui}
        <Where />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { logout };
}

beforeEach(() => vi.clearAllMocks());

describe('SideRail', () => {
  it('lists every desktop destination in one "Main" navigation, plus the logo link home', () => {
    renderAt(<SideRail />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(DESKTOP_NAV_ITEMS.map((i) => i.label));
    expect(screen.getByRole('link', { name: 'GameQuest home' })).toHaveAttribute('href', '/');
  });

  it('marks the current page, and only that one', () => {
    renderAt(<SideRail />, { path: '/collections' });
    const current = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');
    expect(current.map((l) => l.textContent)).toEqual(['Collections']);
  });

  it('is the 160px desktop sidebar: hidden below md, fixed to the left', () => {
    renderAt(<SideRail />);
    const rail = screen.getByRole('navigation', { name: 'Main' }).parentElement;
    expect(rail.className).toMatch(/\bhidden\b/);
    expect(rail.className).toMatch(/\bmd:flex\b/);
    expect(rail.className).toMatch(/\bfixed\b/);
    expect(rail.className).toMatch(/w-\[160px\]/);
  });

  it('keeps the five mobile destinations for the bottom tab bar', () => {
    expect(MOBILE_NAV_ITEMS.map((i) => i.label)).toEqual(['Home', 'Library', 'Explore', 'Friends', 'Profile']);
  });
});

describe('TopBar', () => {
  it('is slim, has a labelled game search, and a way to your profile and to log out', () => {
    renderAt(<TopBar />);
    expect(screen.getByRole('banner').firstElementChild.className).toMatch(/\bh-12\b/);
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search games' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Your profile/ })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('searching goes to Explore with the query, encoded; an empty search does nothing', async () => {
    renderAt(<TopBar />);
    const box = screen.getByRole('searchbox', { name: 'Search games' });
    await userEvent.type(box, '{enter}');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
    await userEvent.type(box, '   {enter}');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
    await userEvent.clear(box);
    await userEvent.type(box, 'Baldur\'s Gate & co{enter}');
    expect(screen.getByTestId('where')).toHaveTextContent(`/explore?q=${encodeURIComponent("Baldur's Gate & co")}`);
  });

  it('logs out', async () => {
    const { logout } = renderAt(<TopBar />, { logout: vi.fn().mockResolvedValue() });
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('tells the user when the server could not be reached while logging out', async () => {
    renderAt(<TopBar />, { logout: vi.fn().mockRejectedValue(new Error('offline')) });
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('logged out on this device')));
  });
});

describe('TopBar details', () => {
  it('has no second search box on Explore, which has its own', () => {
    renderAt(<TopBar />, { path: '/explore' });
    expect(screen.queryByRole('searchbox', { name: 'Search games' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('search box and mobile logo meet the 44 px touch target', () => {
    renderAt(<TopBar />);
    expect(screen.getByRole('searchbox', { name: 'Search games' }).className).toMatch(/\bh-11\b/);
    const logo = screen.getByRole('link', { name: 'GameQuest home' });
    expect(logo.className).toMatch(/min-h-11/);
    expect(logo.className).toMatch(/md:hidden/);
  });

  it('shows no profile link when nobody is signed in', () => {
    render(
      <AuthContext.Provider value={{ user: null, status: 'anonymous', logout: vi.fn() }}>
        <MemoryRouter>
          <TopBar />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.queryByRole('link', { name: /^Your profile/ })).not.toBeInTheDocument();
  });
});
describe('AppLayout', () => {
  it('puts the rail, the slim bar, the page and the mobile tab bar together, with a skip link', () => {
    renderAt(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<h1>Page body</h1>} />
        </Route>
      </Routes>,
    );
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { name: 'Page body' }));
    // the content column leaves room for the 160px sidebar on desktop
    expect(screen.getByRole('main').parentElement.className).toMatch(/md:pl-\[160px\]/);
  });
});

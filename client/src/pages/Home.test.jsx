import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('@/services/progressApi.js', () => ({ getDashboard: vi.fn(), getPlayNext: vi.fn(), getBacklogHealth: vi.fn() }));
vi.mock('@/services/socialApi.js', () => ({ getFeed: vi.fn() }));
vi.mock('@/services/sessionsApi.js', () => ({ listSessions: vi.fn() }));
vi.mock('@/services/recommendationsApi.js', () => ({ listInbox: vi.fn() }));

const { AuthContext } = await import('@/features/auth/AuthContext.jsx');
const { ArtContext } = await import('@/components/art/artContext.js');
const progress = await import('@/services/progressApi.js');
const social = await import('@/services/socialApi.js');
const sessions = await import('@/services/sessionsApi.js');
const recommendations = await import('@/services/recommendationsApi.js');
const { default: Home } = await import('./Home.jsx');

const user = { id: '1', username: 'neo' };

function renderHome() {
  render(
    <AuthContext.Provider value={{ user, status: 'authenticated' }}>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  progress.getDashboard.mockResolvedValue({ statusCounts: { playing: 1, backlog: 4, completed: 2 }, totalHours: 30, resumeCard: null });
  progress.getPlayNext.mockResolvedValue({ items: [] });
  progress.getBacklogHealth.mockResolvedValue({ data: [] });
  social.getFeed.mockResolvedValue({ items: [], nextCursor: null, friendCount: 0 });
  sessions.listSessions.mockResolvedValue({ items: [] });
  recommendations.listInbox.mockResolvedValue({ items: [] });
});

describe('Home', () => {
  it('greets the user in an art header and asks for eight play-next suggestions', async () => {
    renderHome();
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back, neo' })).toBeInTheDocument();
    await waitFor(() => expect(progress.getPlayNext).toHaveBeenCalled());
    expect(progress.getPlayNext).toHaveBeenCalledWith({ limit: 8 }, expect.anything());
  });

  it('renders the play-next suggestions as a rail with the reasons', async () => {
    progress.getPlayNext.mockResolvedValue({
      items: [{ entryId: 'e1', gameId: 'g1', title: 'Hades', cover: null, backdrop: null, status: 'backlog', manualProgress: 0, timeToBeatMain: 22, reasons: ['Waiting 12 days'] }],
    });
    renderHome();
    const link = await screen.findByRole('link', { name: 'Hades, Backlog' });
    expect(link).toHaveAttribute('href', '/library/e1');
    expect(screen.getByText('Waiting 12 days')).toBeInTheDocument();
  });

  it('with nothing to suggest, shows a compact empty state with popular games to start from', async () => {
    const popular = [1, 2, 3].map((n) => ({ id: `p${n}`, slug: `popular-${n}`, title: `Popular ${n}`, cover: null, backdrop: null }));
    render(
      <ArtContext.Provider value={{ pool: popular, suggestions: popular, status: 'ready', artFor: () => null }}>
        <AuthContext.Provider value={{ user, status: 'authenticated' }}>
          <MemoryRouter>
            <Home />
          </MemoryRouter>
        </AuthContext.Provider>
      </ArtContext.Provider>,
    );
    expect(await screen.findByText('Nothing to recommend yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find games' })).toHaveAttribute('href', '/explore');
    const picks = screen.getAllByRole('list', { name: 'Popular right now' })[0];
    expect(within(picks).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/games/popular-1', '/games/popular-2', '/games/popular-3']);
  });
  it('keeps every section on game art, and a failing section does not blank the others', async () => {
    progress.getPlayNext.mockRejectedValue(new Error('down'));
    const { container } = render(
      <AuthContext.Provider value={{ user, status: 'authenticated' }}>
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load your suggestions/i);
    expect(await screen.findByText('Hours logged')).toBeInTheDocument(); // the stats still show
    expect(container.querySelectorAll('[data-art]').length).toBeGreaterThanOrEqual(4); // header, stats, play next, sessions, friends...
  });
});

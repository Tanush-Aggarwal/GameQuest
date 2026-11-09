import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/services/adminApi.js', () => ({
  getAdminOverview: vi.fn(),
  searchAdminGames: vi.fn(),
  getHeaderOptions: vi.fn(),
  updateAdminGame: vi.fn(),
  getHiddenTrailers: vi.fn(),
  restoreTrailer: vi.fn(),
  searchAdminUsers: vi.fn(),
  setUserRole: vi.fn(),
}));

const api = await import('@/services/adminApi.js');
const { AuthContext } = await import('@/features/auth/AuthContext.jsx');
const { default: Admin } = await import('./Admin.jsx');
const { HeaderEditor } = await import('@/components/admin/HeaderEditor.jsx');

const ADMIN = { id: 'u1', username: 'boss', role: 'admin' };
const withAuth = (ui, user = ADMIN) =>
  render(
    <AuthContext.Provider value={{ user, status: 'authenticated' }}>
      <MemoryRouter>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  );

const game = { id: 'g1', title: 'Hades', slug: 'hades', cover: null, hidden: false, platforms: ['PC'], releaseDate: '2020-09-17', hasCustomHeader: false, hiddenTrailers: [] };

beforeEach(() => {
  vi.resetAllMocks();
  api.getAdminOverview.mockResolvedValue({ players: 12, admins: 1, visibleGames: 9231, hiddenGames: 40, customHeaders: 3, withHiddenTrailers: 2, gamesWithoutArt: 5, reviews: 7 });
  api.searchAdminGames.mockResolvedValue({ items: [game] });
  api.getHiddenTrailers.mockResolvedValue({ items: [{ ...game, hiddenTrailers: ['aaaaaaaaaaa'] }] });
  api.searchAdminUsers.mockResolvedValue({ items: [{ id: 'u1', username: 'boss', email: 'b@x.dev', role: 'admin' }, { id: 'u2', username: 'ana', email: 'a@x.dev', role: 'user', emailVerified: true }] });
});

describe('Admin console', () => {
  it('is closed to players', () => {
    withAuth(<Admin />, { id: 'u2', username: 'ana', role: 'user' });
    expect(screen.getByRole('heading', { name: 'Administrators only' })).toBeInTheDocument();
    expect(api.getAdminOverview).not.toHaveBeenCalled();
  });

  it('shows the overview numbers', async () => {
    withAuth(<Admin />);
    expect(await screen.findByText('9,231')).toBeInTheDocument();
    expect(screen.getByText('Custom headers')).toBeInTheDocument();
  });

  it('hides a game from the catalog', async () => {
    api.updateAdminGame.mockResolvedValue({ ...game, hidden: true });
    withAuth(<Admin />);
    await userEvent.click(screen.getByRole('tab', { name: /games/i }));
    const list = await screen.findByRole('list', { name: 'Games' });
    await userEvent.click(within(list).getByRole('button', { name: /hide/i }));
    expect(api.updateAdminGame).toHaveBeenCalledWith('g1', { hidden: true });
    expect(await within(list).findByText('Hidden')).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: /show/i })).toBeInTheDocument();
  });

  it('renames a game inline', async () => {
    api.updateAdminGame.mockResolvedValue({ ...game, title: 'Hades II' });
    withAuth(<Admin />);
    await userEvent.click(screen.getByRole('tab', { name: /games/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Hades' }));
    const input = screen.getByLabelText('Title');
    await userEvent.clear(input);
    await userEvent.type(input, 'Hades II{Enter}');
    expect(api.updateAdminGame).toHaveBeenCalledWith('g1', { title: 'Hades II' });
    expect(await screen.findByText('Hades II')).toBeInTheDocument();
  });

  it('restores a hidden trailer', async () => {
    api.restoreTrailer.mockResolvedValue({ hidden: false });
    withAuth(<Admin />);
    await userEvent.click(screen.getByRole('tab', { name: /hidden trailers/i }));
    await userEvent.click(await screen.findByRole('button', { name: /restore/i }));
    expect(api.restoreTrailer).toHaveBeenCalledWith('g1', 'aaaaaaaaaaa');
    expect(await screen.findByText('No hidden trailers')).toBeInTheDocument();
  });

  it('changes another user’s role, never your own', async () => {
    api.setUserRole.mockResolvedValue({ id: 'u2', role: 'admin' });
    withAuth(<Admin />);
    await userEvent.click(screen.getByRole('tab', { name: /users/i }));
    const list = await screen.findByRole('list', { name: 'Users' });
    const [mine, theirs] = within(list).getAllByRole('combobox');
    expect(mine).toBeDisabled();
    await userEvent.selectOptions(theirs, 'admin');
    expect(api.setUserRole).toHaveBeenCalledWith('u2', 'admin');
  });
});

describe('Header editor', () => {
  const options = [
    { url: 'https://cdn/steam-hero.jpg', preview: 'https://cdn/steam-hero.jpg', label: 'Steam banner art', source: 'steam' },
    { url: 'https://cdn/shot1.jpg', preview: 'https://cdn/shot1-small.jpg', label: 'Screenshot 1', source: 'igdb' },
  ];

  it('saves the picked picture with its framing for everyone', async () => {
    api.getHeaderOptions.mockResolvedValue({ current: null, options });
    api.updateAdminGame.mockResolvedValue({ ...game, heroOverride: { url: options[1].url, posX: 50, posY: 30, zoom: 1 } });
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    withAuth(<HeaderEditor game={game} open onOpenChange={onOpenChange} onSaved={onSaved} />);
    const pictures = await screen.findByRole('radiogroup', { name: 'Header picture' });
    expect(within(pictures).getAllByRole('radio')[0]).toHaveAttribute('aria-checked', 'true'); // the first option is preselected
    await userEvent.click(within(pictures).getByRole('radio', { name: /screenshot 1/i }));
    await userEvent.click(screen.getByRole('button', { name: /save header/i }));
    expect(api.updateAdminGame).toHaveBeenCalledWith('g1', { heroOverride: { url: options[1].url, posX: 50, posY: 30, zoom: 1 } });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('starts from the saved header and can go back to automatic', async () => {
    api.getHeaderOptions.mockResolvedValue({ current: { url: options[1].url, posX: 20, posY: 70, zoom: 1.5 }, options });
    api.updateAdminGame.mockResolvedValue({ ...game, heroOverride: null });
    withAuth(<HeaderEditor game={game} open onOpenChange={vi.fn()} />);
    expect(await screen.findByRole('radio', { name: /screenshot 1/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('150%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /back to automatic/i }));
    expect(api.updateAdminGame).toHaveBeenCalledWith('g1', { heroOverride: null });
  });

  it('moves the focus point with the arrow keys', async () => {
    api.getHeaderOptions.mockResolvedValue({ current: null, options });
    api.updateAdminGame.mockResolvedValue(game);
    withAuth(<HeaderEditor game={game} open onOpenChange={vi.fn()} />);
    const preview = await screen.findByRole('application', { name: /header preview/i });
    preview.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowDown}');
    await userEvent.click(screen.getByRole('button', { name: /save header/i }));
    expect(api.updateAdminGame).toHaveBeenCalledWith('g1', { heroOverride: expect.objectContaining({ posX: 54, posY: 32 }) });
  });

  it('accepts a pasted https image link and refuses anything else', async () => {
    api.getHeaderOptions.mockResolvedValue({ current: null, options });
    api.updateAdminGame.mockResolvedValue(game);
    withAuth(<HeaderEditor game={game} open onOpenChange={vi.fn()} />);
    const field = await screen.findByLabelText(/or use an image link/i);
    await userEvent.type(field, 'javascript:alert(1){Enter}');
    expect(toast.error).toHaveBeenCalled();
    await userEvent.clear(field);
    await userEvent.type(field, 'https://example.com/wide.jpg{Enter}');
    await userEvent.click(screen.getByRole('button', { name: /save header/i }));
    expect(api.updateAdminGame).toHaveBeenCalledWith('g1', { heroOverride: expect.objectContaining({ url: 'https://example.com/wide.jpg' }) });
  });
});

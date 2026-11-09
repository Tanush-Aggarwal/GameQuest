import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/services/gamesApi.js', () => ({ getTrailers: vi.fn(), reportTrailer: vi.fn() }));
const admin = vi.hoisted(() => ({ on: false }));
vi.mock('@/hooks/useIsAdmin.js', () => ({ useIsAdmin: () => admin.on }));

const { getTrailers, reportTrailer } = await import('@/services/gamesApi.js');
const { TrailerPlayer } = await import('./TrailerPlayer.jsx');

const A = 'aaaaaaaaaaa';
const B = 'bbbbbbbbbbb';
const C = 'ccccccccccc';
const best = { videoId: A, label: 'Gameplay trailer', source: 'igdb' };
const second = { videoId: B, label: 'Launch trailer', source: 'youtube' };
const third = { videoId: C, label: 'Trailer', source: 'youtube' };

beforeEach(() => {
  vi.resetAllMocks();
  admin.on = false;
});

describe('TrailerPlayer', () => {
  it('shows a skeleton, then the best trailer as a thumbnail with a play button, and no iframe yet', async () => {
    getTrailers.mockResolvedValue([best]);
    const { container } = render(<TrailerPlayer slug="hades" title="Hades" />);
    expect(screen.getByRole('status', { name: /loading trailer/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Play trailer for Hades' })).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull(); // nothing from YouTube is embedded before a click
    const thumb = container.querySelector('img');
    expect(thumb).toHaveAttribute('src', `https://i.ytimg.com/vi/${A}/hqdefault.jpg`);
    expect(thumb).toHaveAttribute('loading', 'lazy');
    expect(getTrailers).toHaveBeenCalledWith('hades', expect.anything());
    expect(screen.queryByRole('group', { name: /choose a trailer/i })).not.toBeInTheDocument(); // one trailer: no tabs
  });

  it('creates the sandboxed youtube-nocookie iframe only on click, with English UI and captions off', async () => {
    getTrailers.mockResolvedValue([best]);
    const { container } = render(<TrailerPlayer slug="hades" title="Hades" />);
    await userEvent.click(await screen.findByRole('button', { name: /play trailer/i }));
    const frame = container.querySelector('iframe');
    expect(frame).not.toBeNull();
    const url = new URL(frame.getAttribute('src'));
    expect(url.origin + url.pathname).toBe(`https://www.youtube-nocookie.com/embed/${A}`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ autoplay: '1', rel: '0', hl: 'en', cc_lang_pref: 'en', cc_load_policy: '0' });
    expect(frame).toHaveAttribute('title', 'Hades trailer');
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(screen.queryByRole('button', { name: /play trailer/i })).not.toBeInTheDocument();
  });

  it('shows small tabs for the other trailers and switches to the one picked', async () => {
    getTrailers.mockResolvedValue([best, second, third]);
    const { container } = render(<TrailerPlayer slug="hades" title="Hades" />);
    const tabs = await screen.findByRole('group', { name: /choose a trailer/i });
    const buttons = within(tabs).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Gameplay trailer', 'Launch trailer', 'Trailer']);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining(A));

    await userEvent.click(buttons[1]);
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('iframe')).toBeNull(); // still not loaded: only a click on play loads it
    expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining(B));
    await userEvent.click(screen.getByRole('button', { name: 'Play trailer for Hades' }));
    expect(container.querySelector('iframe').getAttribute('src')).toContain(`/embed/${B}?`);
  });

  it('numbers tabs that would otherwise share a label', async () => {
    getTrailers.mockResolvedValue([best, { ...second, label: 'Trailer' }, { ...third, label: 'Trailer' }]);
    render(<TrailerPlayer slug="hades" title="Hades" />);
    const tabs = await screen.findByRole('group', { name: /choose a trailer/i });
    expect(within(tabs).getAllByRole('button').map((b) => b.textContent)).toEqual(['Gameplay trailer', 'Trailer 1', 'Trailer 2']);
  });

  it('renders nothing at all when the game has no trailer', async () => {
    getTrailers.mockResolvedValue([]);
    const { container } = render(<TrailerPlayer slug="obscure" title="Obscure" />);
    await vi.waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(container).toBeEmptyDOMElement();
  });

  it('never embeds an id that is not a valid YouTube id', async () => {
    getTrailers.mockResolvedValue([{ videoId: '"><script>x', label: 'Trailer', source: 'youtube' }]);
    const { container } = render(<TrailerPlayer slug="x" title="X" />);
    await vi.waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a scoped error with Retry when the trailer cannot be loaded', async () => {
    getTrailers.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([best]);
    render(<TrailerPlayer slug="hades" title="Hades" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load the trailer/i);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByRole('button', { name: /play trailer/i })).toBeInTheDocument();
  });
});

describe('Hide this video (administrators only)', () => {
  const NAME = 'Hide this video (admin)';
  const askToHide = async () => userEvent.click(await screen.findByRole('button', { name: NAME }));
  const confirm = async () => userEvent.click(await screen.findByRole('button', { name: 'Yes, hide it' }));
  beforeEach(() => {
    admin.on = true;
  });

  it('is not shown to players', async () => {
    admin.on = false;
    getTrailers.mockResolvedValue([best, second]);
    render(<TrailerPlayer slug="hades" title="Hades" />);
    await screen.findByRole('button', { name: 'Play trailer for Hades' });
    expect(screen.queryByRole('button', { name: NAME })).not.toBeInTheDocument();
  });

  it('asks before doing anything, and Cancel leaves everything as it was', async () => {
    getTrailers.mockResolvedValue([best, second]);
    render(<TrailerPlayer slug="hades" title="Hades" />);
    await askToHide();
    expect(screen.getByText('Hide this video for everyone?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(reportTrailer).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: NAME })).toBeInTheDocument();
  });

  it('hides the selected trailer for everyone and shows the next one', async () => {
    getTrailers.mockResolvedValue([best, second]);
    reportTrailer.mockResolvedValue({ trailers: [best], changed: true, dropped: true });
    const { container } = render(<TrailerPlayer slug="hades" title="Hades" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Launch trailer' }));
    await askToHide();
    await confirm();
    expect(reportTrailer).toHaveBeenCalledWith('hades', B);
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('hidden for everyone')));
    await vi.waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining(A)));
  });

  it('also works for Steam trailers', async () => {
    getTrailers.mockResolvedValue([{ videoId: 'steam-123', label: 'Trailer', source: 'steam', poster: 'https://x/p.jpg', mp4: 'https://x/v.mp4' }]);
    reportTrailer.mockResolvedValue({ trailers: [], changed: true, dropped: true });
    const { container } = render(<TrailerPlayer slug="hades" title="Hades" />);
    await askToHide();
    await confirm();
    expect(reportTrailer).toHaveBeenCalledWith('hades', 'steam-123');
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('keeps the list and shows the error when hiding fails', async () => {
    getTrailers.mockResolvedValue([best, second]);
    reportTrailer.mockRejectedValue({ response: { data: { error: { code: 'RATE_LIMITED', message: 'Slow down.' } } } });
    render(<TrailerPlayer slug="hades" title="Hades" />);
    await askToHide();
    await confirm();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Slow down.'));
    expect(screen.getByRole('button', { name: NAME })).toBeEnabled();
  });
});

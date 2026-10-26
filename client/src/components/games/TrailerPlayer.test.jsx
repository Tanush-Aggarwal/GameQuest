import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/services/gamesApi.js', () => ({ getTrailers: vi.fn(), reportTrailer: vi.fn() }));

const { getTrailers, reportTrailer } = await import('@/services/gamesApi.js');
const { TrailerPlayer } = await import('./TrailerPlayer.jsx');

const A = 'aaaaaaaaaaa';
const B = 'bbbbbbbbbbb';
const C = 'ccccccccccc';
const best = { videoId: A, label: 'Gameplay trailer', source: 'igdb' };
const second = { videoId: B, label: 'Launch trailer', source: 'youtube' };
const third = { videoId: C, label: 'Trailer', source: 'youtube' };

beforeEach(() => vi.resetAllMocks());

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

describe('"Wrong trailer?"', () => {
  const askToReport = async () => userEvent.click(await screen.findByRole('button', { name: 'Wrong trailer?' }));
  const confirm = async () => userEvent.click(await screen.findByRole('button', { name: 'Yes, it is wrong' }));

  it('asks before doing anything, and Cancel leaves everything as it was', async () => {
    getTrailers.mockResolvedValue([best, second]);
    render(<TrailerPlayer slug="hades" title="Hades" />);
    await askToReport();
    expect(screen.getByText('Hide this video?')).toBeInTheDocument();
    expect(reportTrailer).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(reportTrailer).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Wrong trailer?' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /choose a trailer/i })).toBeInTheDocument();
  });

  it('hides the shown trailer for you and shows the next candidate', async () => {
    getTrailers.mockResolvedValue([best, second]);
    reportTrailer.mockResolvedValue({ trailers: [second], changed: true, dropped: false });
    const { container } = render(<TrailerPlayer slug="hades" title="Hades" />);
    await askToReport();
    await confirm();

    expect(reportTrailer).toHaveBeenCalledWith('hades', A);
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('hid that video for you')));
    await vi.waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining(B)));
    expect(screen.queryByRole('group', { name: /choose a trailer/i })).not.toBeInTheDocument(); // one left: no tabs
    expect(screen.getByRole('button', { name: 'Wrong trailer?' })).toBeInTheDocument(); // the confirm closed
  });

  it('says when the video is now removed for everyone', async () => {
    getTrailers.mockResolvedValue([best, second]);
    reportTrailer.mockResolvedValue({ trailers: [second], changed: true, dropped: true });
    render(<TrailerPlayer slug="hades" title="Hades" />);
    await askToReport();
    await confirm();
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('Thanks, that video was removed for everyone.'));
  });

  it('does not claim a removal when the report did not count (the video was already gone)', async () => {
    getTrailers.mockResolvedValue([best, second]);
    reportTrailer.mockResolvedValue({ trailers: [second], changed: false, dropped: true });
    render(<TrailerPlayer slug="hades" title="Hades" />);
    await askToReport();
    await confirm();
    await vi.waitFor(() => expect(toast.info).toHaveBeenCalledWith('That video was already removed.'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('reports the trailer that is currently selected, not always the first', async () => {
    getTrailers.mockResolvedValue([best, second]);
    reportTrailer.mockResolvedValue({ trailers: [best], changed: true, dropped: false });
    render(<TrailerPlayer slug="hades" title="Hades" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Launch trailer' }));
    await askToReport();
    await confirm();
    expect(reportTrailer).toHaveBeenCalledWith('hades', B);
  });

  it('hides the whole section when the last trailer is hidden', async () => {
    getTrailers.mockResolvedValue([best]);
    reportTrailer.mockResolvedValue({ trailers: [], changed: true, dropped: false });
    const { container } = render(<TrailerPlayer slug="hades" title="Hades" />);
    await askToReport();
    await confirm();
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(toast.success).toHaveBeenCalled();
  });

  it('keeps the list and shows the error when reporting fails (e.g. rate limited)', async () => {
    getTrailers.mockResolvedValue([best, second]);
    reportTrailer.mockRejectedValue({ response: { data: { error: { code: 'RATE_LIMITED', message: 'You have reported a lot of trailers.' } } } });
    render(<TrailerPlayer slug="hades" title="Hades" />);
    await askToReport();
    await confirm();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('You have reported a lot of trailers.'));
    expect(screen.getByRole('group', { name: /choose a trailer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wrong trailer?' })).toBeEnabled();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('@/services/gamesApi.js', () => ({ getTrailer: vi.fn() }));

const { getTrailer } = await import('@/services/gamesApi.js');
const { TrailerPlayer } = await import('./TrailerPlayer.jsx');

const VID = 'dQw4w9WgXcQ';
beforeEach(() => vi.clearAllMocks());

describe('TrailerPlayer', () => {
  it('shows a skeleton, then a thumbnail with a play button, and no iframe yet', async () => {
    getTrailer.mockResolvedValue({ videoId: VID, source: 'igdb' });
    const { container } = render(<TrailerPlayer slug="hades" title="Hades" />);
    expect(screen.getByRole('status', { name: /loading trailer/i })).toBeInTheDocument();
    const play = await screen.findByRole('button', { name: 'Play trailer for Hades' });
    expect(play).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull(); // nothing from YouTube is embedded before a click
    const thumb = container.querySelector('img');
    expect(thumb).toHaveAttribute('src', `https://i.ytimg.com/vi/${VID}/hqdefault.jpg`);
    expect(thumb).toHaveAttribute('loading', 'lazy');
    expect(getTrailer).toHaveBeenCalledWith('hades', expect.anything());
  });

  it('creates the youtube-nocookie iframe only when the thumbnail is clicked', async () => {
    getTrailer.mockResolvedValue({ videoId: VID, source: 'youtube' });
    const { container } = render(<TrailerPlayer slug="hades" title="Hades" />);
    await userEvent.click(await screen.findByRole('button', { name: /play trailer/i }));
    const frame = container.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('src')).toBe(`https://www.youtube-nocookie.com/embed/${VID}?autoplay=1&rel=0`);
    expect(frame).toHaveAttribute('title', 'Hades trailer');
    expect(screen.queryByRole('button', { name: /play trailer/i })).not.toBeInTheDocument();
  });

  it('renders nothing at all when the game has no video', async () => {
    getTrailer.mockResolvedValue(null);
    const { container } = render(<TrailerPlayer slug="obscure" title="Obscure" />);
    await vi.waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(container).toBeEmptyDOMElement();
  });

  it('never embeds an id that is not a valid YouTube id', async () => {
    getTrailer.mockResolvedValue({ videoId: '"><script>x', source: 'youtube' });
    const { container } = render(<TrailerPlayer slug="x" title="X" />);
    await vi.waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a scoped error with Retry when the trailer cannot be loaded', async () => {
    getTrailer.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ videoId: VID, source: 'igdb' });
    render(<TrailerPlayer slug="hades" title="Hades" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load the trailer/i);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByRole('button', { name: /play trailer/i })).toBeInTheDocument();
  });
});

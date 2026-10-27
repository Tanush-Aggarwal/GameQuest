import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('@/services/libraryApi.js', () => ({ listLibrary: vi.fn() }));
vi.mock('@/services/gamesApi.js', () => ({ searchGames: vi.fn() }));

const { listLibrary } = await import('@/services/libraryApi.js');
const { searchGames } = await import('@/services/gamesApi.js');
const { artImageUrl, fallbackGradient, hashOf, pickArt } = await import('@/lib/art.js');
const { ArtProvider } = await import('./ArtProvider.jsx');
const { ArtPanel, ArtHeader, ART_IMAGE_CLASS, ART_SCRIM_CLASS } = await import('./ArtPanel.jsx');
const { useArt } = await import('./useArt.js');

const game = (n, extra = {}) => ({ id: `g${n}`, slug: `game-${n}`, title: `Game ${n}`, cover: `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/c${n}.jpg`, backdrop: `https://images.igdb.com/igdb/image/upload/t_1080p/b${n}.jpg`, ...extra });

beforeEach(() => vi.resetAllMocks());

describe('art helpers', () => {
  it('asks IGDB for small variants: 889x500 for a backdrop, the regular size for a cover', () => {
    expect(artImageUrl('https://images.igdb.com/igdb/image/upload/t_1080p/x.jpg')).toBe('https://images.igdb.com/igdb/image/upload/t_screenshot_big/x.jpg');
    expect(artImageUrl('https://images.igdb.com/igdb/image/upload/t_cover_big_2x/x.jpg', 'cover')).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big/x.jpg');
    expect(artImageUrl('https://cdn.cloudflare.steamstatic.com/steam/apps/1/library_hero.jpg')).toBe('https://cdn.cloudflare.steamstatic.com/steam/apps/1/library_hero.jpg');
    expect(artImageUrl(null)).toBeNull();
    expect(artImageUrl(42)).toBeNull();
  });

  it('picks the same game for the same section every time, preferring games with a backdrop', () => {
    const pool = [game(1, { backdrop: null }), game(2), game(3)];
    const picks = new Set(Array.from({ length: 5 }, () => pickArt(pool, 'home-stats').id));
    expect(picks.size).toBe(1);
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) expect(pickArt(pool, seed).backdrop).toBeTruthy(); // never the backdrop-less one while others exist
    expect(pickArt([game(1, { backdrop: null })], 'x').id).toBe('g1'); // only covers: use a cover
    expect(pickArt([], 'x')).toBeNull();
  });

  it('spreads sections over the pool and gives a hue gradient, never grey, without art', () => {
    const pool = Array.from({ length: 8 }, (_, i) => game(i));
    const used = new Set(['home-resume', 'home-stats', 'home-next', 'home-friends', 'home-backlog', 'profile-identity'].map((s) => pickArt(pool, s).id));
    expect(used.size).toBeGreaterThan(2);
    expect(fallbackGradient('x')).toMatch(/^linear-gradient\(135deg, hsl\(\d+ 45% 22%\), hsl\(\d+ 50% 12%\)\)$/);
    expect(fallbackGradient('a')).not.toBe(fallbackGradient('b'));
    expect(hashOf('same')).toBe(hashOf('same'));
  });
});

describe('ArtPanel', () => {
  it('puts the game backdrop behind its children as a decorative, lazy image under a readability scrim', () => {
    const { container } = render(
      <ArtPanel art={game(1)} aria-label="Stats">
        <p>Body text</p>
      </ArtPanel>,
    );
    expect(screen.getByLabelText('Stats')).toContainElement(screen.getByText('Body text'));
    const layer = container.querySelector('[data-art]');
    expect(layer).toHaveAttribute('data-art', 'backdrop');
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    const img = layer.querySelector('img');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('src', 'https://images.igdb.com/igdb/image/upload/t_screenshot_big/b1.jpg');
    expect(layer.lastElementChild.className).toContain(ART_SCRIM_CLASS);
    // it fades in once loaded, so there is no pop when the picture arrives
    expect(img.className).toContain('opacity-0');
    fireEvent.load(img);
    expect(img.className).toContain(ART_IMAGE_CLASS);
    expect(img.className).not.toContain('opacity-0');
  });

  it('keeps the readability scrim values that give >= 4.5:1 for muted text even over white art', () => {
    // pixel = img*opacity over bg, then the scrim over that: compute the worst case (white art) and check contrast
    const bg = [0x0e, 0x0f, 0x14];
    const muted = [0xa3, 0xa8, 0xbd];
    const lum = (c) => 0.2126 * ((c[0] / 255) ** 2.2) + 0.7152 * ((c[1] / 255) ** 2.2) + 0.0722 * ((c[2] / 255) ** 2.2);
    const imgOpacity = Number(/opacity-(\d+)/.exec(ART_IMAGE_CLASS)[1]) / 100;
    const scrimMin = Math.min(...[...ART_SCRIM_CLASS.matchAll(/bg-(?:\/)?|(?:from|via|to)-bg\/(\d+)/g)].map((m) => Number(m[1])).filter(Boolean)) / 100;
    const mix = (top, bottom, a) => top.map((v, i) => v * a + bottom[i] * (1 - a));
    const withImage = mix([255, 255, 255], bg, imgOpacity);
    const behindText = mix(bg, withImage, scrimMin);
    const ratio = (lum(muted) + 0.05) / (lum(behindText) + 0.05);
    expect(scrimMin).toBeGreaterThanOrEqual(0.7);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('blurs and scales a cover when the game has no backdrop', () => {
    const { container } = render(<ArtPanel art={game(2, { backdrop: null })} />);
    const layer = container.querySelector('[data-art]');
    expect(layer).toHaveAttribute('data-art', 'cover');
    expect(layer.querySelector('img').className).toMatch(/blur-2xl/);
    expect(layer.querySelector('img')).toHaveAttribute('src', 'https://images.igdb.com/igdb/image/upload/t_cover_big/c2.jpg');
  });

  it('takes a plain URL as the backdrop', () => {
    const { container } = render(<ArtPanel art="https://images.igdb.com/igdb/image/upload/t_1080p/z.jpg" />);
    expect(container.querySelector('[data-art] img')).toHaveAttribute('src', expect.stringContaining('t_screenshot_big/z.jpg'));
  });

  it('shows a hue gradient, not a flat panel, when there is no art at all', () => {
    const { container } = render(<ArtPanel seed="home-stats" />);
    const layer = container.querySelector('[data-art]');
    expect(layer).toHaveAttribute('data-art', 'gradient');
    expect(layer.querySelector('img')).toBeNull();
    expect(layer.firstElementChild.style.backgroundImage).toContain('linear-gradient');
    expect(layer.lastElementChild.className).toContain(ART_SCRIM_CLASS); // still readable
  });

  it('falls back to the gradient when the image fails to load', () => {
    const { container } = render(<ArtPanel art={game(3)} seed="s" />);
    const img = container.querySelector('[data-art] img');
    fireEvent.error(img);
    return waitFor(() => expect(container.querySelector('[data-art]')).toHaveAttribute('data-art', 'gradient'));
  });

  it('uses the shared pool for a seed when the section has no game of its own', async () => {
    listLibrary.mockResolvedValue({ items: [] });
    searchGames.mockResolvedValue({ items: [game(7)] });
    const { container } = render(
      <ArtProvider>
        <ArtPanel seed="anything" />
      </ArtProvider>,
    );
    // while the shared art loads nothing is drawn (no gradient that would flash and be replaced)
    expect(container.querySelector('[data-art]')).toHaveAttribute('data-art', 'pending');
    expect(container.querySelector('[data-art] img')).toBeNull();
    await waitFor(() => expect(container.querySelector('[data-art]')).toHaveAttribute('data-art', 'backdrop'));
    expect(container.querySelector('[data-art] img')).toHaveAttribute('src', expect.stringContaining('b7.jpg'));
  });

  it('a section with its own game art does not wait for the pool', () => {
    listLibrary.mockReturnValue(new Promise(() => {}));
    searchGames.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <ArtProvider>
        <ArtPanel art={game(1)} seed="x" />
      </ArtProvider>,
    );
    expect(container.querySelector('[data-art]')).toHaveAttribute('data-art', 'backdrop');
  });

  it('forwards props to a custom element (a Link) and keeps the art behind it', () => {
    const { container } = render(
      <MemoryRouter>
        <ArtPanel as={Link} to="/library/1" art={game(1)} className="p-4">
          Continue
        </ArtPanel>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Continue' });
    expect(link).toHaveAttribute('href', '/library/1');
    expect(link.className).toContain('p-4');
    expect(link.querySelector('[data-art]')).toBeInTheDocument();
    expect(container.querySelectorAll('a')).toHaveLength(1);
  });

  it('starts fresh when the section gets different art (a failed image does not stick)', () => {
    const { container, rerender } = render(<ArtPanel art={game(1)} seed="s" />);
    fireEvent.error(container.querySelector('[data-art] img'));
    expect(container.querySelector('[data-art]')).toHaveAttribute('data-art', 'gradient');
    rerender(<ArtPanel art={game(2)} seed="s" />);
    expect(container.querySelector('[data-art]')).toHaveAttribute('data-art', 'backdrop');
    expect(container.querySelector('[data-art] img')).toHaveAttribute('src', expect.stringContaining('b2.jpg'));
  });

  it('an empty art object falls back to the pool like no art', () => {
    const { container } = render(<ArtPanel art={{ backdrop: null, cover: null }} seed="x" />);
    expect(container.querySelector('[data-art]')).toHaveAttribute('data-art', 'gradient');
  });
});

describe('ArtHeader', () => {
  it('renders the page title as the h1 with a subtitle and actions on art', () => {
    const { container } = render(<ArtHeader title="Library" subtitle="Everything you own" actions={<button type="button">New</button>} art={game(1)} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
    expect(screen.getByText('Everything you own')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
    expect(container.querySelector('header [data-art]')).toBeInTheDocument();
  });
});

describe('ArtProvider', () => {
  function Probe() {
    const { pool, status } = useArt();
    return (
      <p data-testid="pool">
        {status}:{pool.map((g) => g.id).join(',')}
      </p>
    );
  }
  const renderProbe = () =>
    render(
      <ArtProvider>
        <Probe />
      </ArtProvider>,
    );

  it("lists the user's own games first, then popular ones, once each, only with usable art", async () => {
    listLibrary.mockResolvedValue({ items: [{ game: game(1) }, { game: game(2, { backdrop: null }) }, { game: game(3, { backdrop: null, cover: null }) }] });
    searchGames.mockResolvedValue({ items: [game(2), game(4), game(1)] });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('pool')).toHaveTextContent('ready:g1,g2,g4'));
    expect(listLibrary).toHaveBeenCalledTimes(1);
    expect(searchGames).toHaveBeenCalledTimes(1);
    expect(searchGames).toHaveBeenCalledWith(expect.objectContaining({ limit: 24 }));
  });

  it('still fills the pool when one source fails, and settles to an empty pool when both do', async () => {
    listLibrary.mockRejectedValue(new Error('down'));
    searchGames.mockResolvedValue({ items: [game(5)] });
    const first = renderProbe();
    await waitFor(() => expect(screen.getByTestId('pool')).toHaveTextContent('ready:g5'));
    first.unmount();

    listLibrary.mockRejectedValue(new Error('down'));
    searchGames.mockRejectedValue(new Error('down'));
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('pool')).toHaveTextContent(/^ready:$/));
  });

  it('offers the popular games you do not already own as suggestions for empty states', async () => {
    function Suggestions() {
      const { suggestions } = useArt();
      return <p data-testid="suggestions">{suggestions.map((g) => g.id).join(',')}</p>;
    }
    listLibrary.mockResolvedValue({ items: [{ game: game(1) }, { game: game(2) }] });
    searchGames.mockResolvedValue({ items: [game(1), game(3), game(4, { slug: '' }), game(5, { backdrop: null, cover: null }), game(6)] });
    render(
      <ArtProvider>
        <Suggestions />
      </ArtProvider>,
    );
    // owned (g1) is left out; no slug or no art is not linkable/showable
    await waitFor(() => expect(screen.getByTestId('suggestions')).toHaveTextContent(/^g3,g6$/));
  });

  it('caps the suggestions', async () => {
    function Count() {
      return <p data-testid="count">{useArt().suggestions.length}</p>;
    }
    listLibrary.mockResolvedValue({ items: [] });
    searchGames.mockResolvedValue({ items: Array.from({ length: 24 }, (_, i) => game(i)) });
    render(
      <ArtProvider>
        <Count />
      </ArtProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('12'));
  });
  it('skips a library entry whose game is missing', async () => {
    listLibrary.mockResolvedValue({ items: [{ game: null }, { game: game(1) }, {}] });
    searchGames.mockResolvedValue({ items: [] });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('pool')).toHaveTextContent('ready:g1'));
  });

  it('caps the pool so a big library does not become a big download', async () => {
    listLibrary.mockResolvedValue({ items: Array.from({ length: 30 }, (_, i) => ({ game: game(i) })) });
    searchGames.mockResolvedValue({ items: Array.from({ length: 24 }, (_, i) => game(100 + i)) });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('pool').textContent.split(':')[1].split(',')).toHaveLength(40));
  });
});

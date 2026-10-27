import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('@/services/publicApi.js', () => ({ getPublicCovers: vi.fn() }));

const { getPublicCovers } = await import('@/services/publicApi.js');
const { AuthContext } = await import('@/features/auth/AuthContext.jsx');
const { CoverCollage, toColumns, repeatingUnit } = await import('./CoverCollage.jsx');
const { default: Login } = await import('@/pages/Login.jsx');
const { default: Register } = await import('@/pages/Register.jsx');

const covers = (n) => Array.from({ length: n }, (_, i) => ({ cover: `https://img/c${i + 1}.jpg` }));

beforeEach(() => vi.resetAllMocks());

describe('toColumns', () => {
  it('deals covers out in turn so neighbouring columns differ, and drops empty columns', () => {
    expect(toColumns(['a', 'b', 'c', 'd', 'e'], 3)).toEqual([['a', 'd'], ['b', 'e'], ['c']]);
    expect(toColumns(['a', 'b'], 6)).toEqual([['a'], ['b']]);
    expect(toColumns([], 6)).toEqual([]);
  });
});

describe('repeatingUnit', () => {
  it('repeats a short column until it is long enough to fill a screen', () => {
    expect(repeatingUnit(['a', 'b', 'c', 'd'], 8)).toEqual(['a', 'b', 'c', 'd', 'a', 'b', 'c', 'd']);
    expect(repeatingUnit(['a', 'b', 'c'], 8)).toHaveLength(9);
    expect(repeatingUnit(['a'], 8)).toHaveLength(8);
    expect(repeatingUnit(Array(10).fill('x'), 8)).toHaveLength(10); // already long enough
  });
});

describe('CoverCollage', () => {
  it('is decorative: hidden from assistive tech, no links, no buttons, lazy images with no alt text', async () => {
    getPublicCovers.mockResolvedValue(covers(12));
    const { container } = render(<CoverCollage />);
    const root = container.firstElementChild;
    await waitFor(() => expect(root).toHaveAttribute('data-collage', 'covers'));
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.querySelectorAll('a, button, input')).toHaveLength(0);
    const imgs = root.querySelectorAll('img');
    // 12 covers over 6 columns = 2 each; a unit is repeated to 8, and the unit is shown twice so the drift loops without a seam
    expect(imgs.length).toBe(6 * 8 * 2);
    expect(new Set([...imgs].map((i) => i.getAttribute('src'))).size).toBe(12); // the same 12 covers, so the browser fetches 12 images
    for (const img of imgs) {
      expect(img).toHaveAttribute('alt', '');
      expect(img).toHaveAttribute('loading', 'lazy');
    }
  });

  it('drifts in alternating directions, and a motion-reduce class stops it', async () => {
    getPublicCovers.mockResolvedValue(covers(12));
    const { container } = render(<CoverCollage />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    const columns = [...container.querySelectorAll('.animate-drift-up, .animate-drift-down')];
    expect(columns.length).toBe(6);
    expect(columns.map((c) => (c.className.includes('animate-drift-down') ? 'down' : 'up'))).toEqual(['up', 'down', 'up', 'down', 'up', 'down']);
    for (const column of columns) {
      expect(column.className).toMatch(/motion-reduce:animate-none/);
      expect(column.className).toMatch(/\bpb-4\b/); // with gap-4 this makes half the column exactly one repeat: no jump when it loops
      expect(column.className).toMatch(/transform-gpu/);
    }
    expect(columns.filter((c) => c.className.includes('hidden sm:flex'))).toHaveLength(2); // two columns fewer on a phone
  });

  it('asks for the regular cover size, not the 2x one, because they are drawn small', async () => {
    getPublicCovers.mockResolvedValue([{ cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/abc.jpg' }]);
    const { container } = render(<CoverCollage />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg');
  });

  it('keeps a scrim over the covers so they never compete with the form', async () => {
    getPublicCovers.mockResolvedValue(covers(6));
    const { container } = render(<CoverCollage />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(container.querySelector('.bg-bg\\/75')).not.toBeNull();
  });

  it('falls back to a gradient while loading, when the covers fail, and when there are none', async () => {
    let release;
    getPublicCovers.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const first = render(<CoverCollage />);
    expect(first.container.firstElementChild).toHaveAttribute('data-collage', 'gradient');
    release([]);
    await waitFor(() => expect(getPublicCovers).toHaveBeenCalled());
    expect(first.container.querySelectorAll('img')).toHaveLength(0);
    first.unmount();

    getPublicCovers.mockRejectedValueOnce(new Error('down'));
    const failed = render(<CoverCollage />);
    await waitFor(() => expect(getPublicCovers).toHaveBeenCalledTimes(2));
    expect(failed.container.firstElementChild).toHaveAttribute('data-collage', 'gradient');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); // it never shows an error: it is only a background
  });
});

describe('sign-in pages with the collage', () => {
  const renderPage = (Page) =>
    render(
      <AuthContext.Provider value={{ login: vi.fn(), register: vi.fn() }}>
        <MemoryRouter>
          <Page />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

  it.each([
    ['Log in', Login],
    ['Create account', Register],
  ])('%s still works when the collage cannot load, and the form sits on a solid panel', async (heading, Page) => {
    getPublicCovers.mockRejectedValue(new Error('down'));
    const { container } = renderPage(Page);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in|create|sign up|register/i })).toBeInTheDocument();
    const panel = container.querySelector('main');
    expect(panel.className).toMatch(/\bmd:bg-surface\b/); // opaque beside the collage on wide screens
    expect(panel.contains(container.querySelector('form'))).toBe(true);
    expect(container.querySelector('[data-collage]')).not.toBeNull();
  });

  it('asks for the covers once per page, without credentials-only calls', async () => {
    getPublicCovers.mockResolvedValue(covers(6));
    renderPage(Login);
    await waitFor(() => expect(getPublicCovers).toHaveBeenCalledTimes(1));
    expect(getPublicCovers).toHaveBeenCalledWith({ signal: expect.anything() });
  });
});

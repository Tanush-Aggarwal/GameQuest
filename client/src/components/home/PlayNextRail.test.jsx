import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, vi } from 'vitest';
import { PlayNextSection } from './PlayNextRail.jsx';

const item = (n, extra = {}) => ({
  entryId: `e${n}`,
  gameId: `g${n}`,
  title: `Game ${n}`,
  cover: `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/c${n}.jpg`,
  backdrop: `https://images.igdb.com/igdb/image/upload/t_1080p/b${n}.jpg`,
  status: 'backlog',
  manualProgress: 0,
  timeToBeatMain: 12,
  score: 50,
  reasons: ['Matches your taste (RPG)', 'Waiting 40 days', '~12h to beat'],
  ...extra,
});

const state = (status, items, extra = {}) => ({ status, data: items ? { items } : null, retry: vi.fn(), ...extra });
const renderRail = (playNext) =>
  render(
    <MemoryRouter>
      <PlayNextSection playNext={playNext} />
    </MemoryRouter>,
  );

// jsdom does no layout: say how wide the scrolling row's content and viewport are
function layout({ scrollWidth, clientWidth }) {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => scrollWidth });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => clientWidth });
}

afterEach(() => {
  delete HTMLElement.prototype.scrollWidth;
  delete HTMLElement.prototype.clientWidth;
  delete window.matchMedia;
});

describe('PlayNextSection', () => {
  it('shows each suggestion as a large cover linking to its library entry, with the reasons in full', () => {
    renderRail(state('success', [item(1), item(2, { status: 'playing', manualProgress: 40, reasons: ['40% already done'] })]));
    expect(screen.getByRole('heading', { name: 'What to play next' })).toBeInTheDocument();
    const rail = screen.getByRole('list', { name: 'Suggested games' });
    const cards = within(rail).getAllByRole('link');
    expect(cards.map((c) => c.getAttribute('href'))).toEqual(['/library/e1', '/library/e2']);
    const firstCard = within(rail).getAllByRole('listitem')[0];

    // every reason is its own visible chip, none clipped to a single line
    const why = within(firstCard).getByRole('list', { name: 'Why Game 1' });
    expect(within(why).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['Matches your taste (RPG)', 'Waiting 40 days']);
    expect(why.className).toMatch(/flex-wrap/);
    // the time to beat is shown once, under the title, not repeated as a chip
    expect(within(firstCard).getAllByText('~12h to beat')).toHaveLength(1);
  });

  it('names each link by what it shows (status, title, progress), with the reasons beside it rather than inside its name', () => {
    renderRail(state('success', [item(1, { status: 'playing', manualProgress: 40, reasons: ['40% already done', 'Waiting 40 days'] }), item(2)]));
    const first = screen.getByRole('link', { name: 'Playing Game 1, 40% done' }); // no aria-label: the name is the visible text
    expect(first).not.toHaveAttribute('aria-label');
    const why = screen.getByRole('list', { name: 'Why Game 1' });
    expect(first).not.toContainElement(why); // the long "why" is not read out as part of the link
    expect(first.closest('li')).toContainElement(why);
    expect(screen.getByRole('link', { name: 'Backlog Game 2' })).toBeInTheDocument();
  });
  it('is a rail of covers: wide cards, a snap-scrolling row, 3:4 covers', () => {
    renderRail(state('success', [item(1), item(2)]));
    const rail = screen.getByRole('list', { name: 'Suggested games' });
    expect(rail.className).toMatch(/overflow-x-auto/);
    expect(rail.className).toMatch(/snap-x/);
    const card = within(rail).getAllByRole('listitem')[0];
    expect(card.className).toMatch(/w-40/);
    expect(card.className).toMatch(/sm:w-48/);
    expect(card.className).toMatch(/shrink-0/);
    expect(card.querySelector('.aspect-\\[3\\/4\\]')).toBeInTheDocument();
  });

  it('pads the scrolling row so a focus ring and a hover lift are not clipped', () => {
    renderRail(state('success', [item(1)]));
    const rail = screen.getByRole('list', { name: 'Suggested games' });
    expect(rail.className).toMatch(/\bp-2\b/);
    expect(rail.className).toMatch(/-m-2\b/);
  });

  it('marks status with icon and label (never colour alone) on a solid pill, and shows progress visually', () => {
    renderRail(state('success', [item(1, { status: 'playing', manualProgress: 40 }), item(2)]));
    const [first, second] = within(screen.getByRole('list', { name: 'Suggested games' })).getAllByRole('link');
    expect(within(first).getByText('Playing').closest('span.rounded-full').className).toMatch(/\bbg-bg\b(?!\/)/);
    expect(within(second).getByText('Backlog')).toBeInTheDocument();
    const bar = first.querySelector('[style*="width: 40%"]');
    expect(bar).toBeInTheDocument();
    expect(bar.parentElement).toHaveAttribute('aria-hidden', 'true'); // the percentage is in the link name instead
    expect(second.querySelector('[style*="width"]')).toBeNull();
  });

  it('copes with a suggestion that has no reasons, no time to beat or no cover', () => {
    renderRail(state('success', [item(1, { reasons: [], timeToBeatMain: null, cover: null })]));
    const card = screen.getByRole('link', { name: 'Backlog Game 1' });
    expect(screen.queryByRole('list', { name: /Why/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/to beat/)).not.toBeInTheDocument();
    expect(within(card).getAllByText('Game 1').length).toBeGreaterThan(0); // title text, and the generated cover shows it too
  });

  it("puts the first suggestion's backdrop behind the section", () => {
    const { container } = renderRail(state('success', [item(1), item(2)]));
    expect(container.querySelector('[data-art] img')).toHaveAttribute('src', expect.stringContaining('t_screenshot_big/b1.jpg'));
  });

  it('shows a loading skeleton row', () => {
    renderRail(state('loading'));
    expect(screen.getByRole('status', { name: 'Loading suggestions' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Suggested games' })).not.toBeInTheDocument();
  });

  it('shows a scoped error with Retry', async () => {
    const playNext = state('error');
    renderRail(playNext);
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load your suggestions/i);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(playNext.retry).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state with one action when there is nothing to suggest', () => {
    renderRail(state('success', []));
    expect(screen.getByText('Nothing to recommend yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find games' })).toHaveAttribute('href', '/explore');
  });
});

describe('scroll buttons', () => {
  const many = [item(1), item(2), item(3), item(4), item(5)];

  it('only appear when the row really overflows', () => {
    layout({ scrollWidth: 400, clientWidth: 900 }); // everything fits
    renderRail(state('success', many));
    expect(screen.queryByRole('button', { name: /scroll suggestions/i })).not.toBeInTheDocument();
  });

  it('scroll the row by most of its width, and are for pointer users on wide screens only', async () => {
    layout({ scrollWidth: 2000, clientWidth: 500 });
    renderRail(state('success', many));
    const rail = screen.getByRole('list', { name: 'Suggested games' });
    rail.scrollBy = vi.fn();
    const left = screen.getByRole('button', { name: 'Scroll suggestions left' });
    const right = screen.getByRole('button', { name: 'Scroll suggestions right' });
    expect(right.parentElement.className).toMatch(/\bhidden\b.*md:flex/);
    await userEvent.click(right);
    expect(rail.scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ left: 400 }));
    rail.scrollLeft = 300;
    fireEvent.scroll(rail);
    await userEvent.click(left);
    expect(rail.scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ left: -400 }));
  });

  it('are disabled at the ends of the row', () => {
    layout({ scrollWidth: 2000, clientWidth: 500 });
    renderRail(state('success', many));
    const rail = screen.getByRole('list', { name: 'Suggested games' });
    const left = screen.getByRole('button', { name: 'Scroll suggestions left' });
    const right = screen.getByRole('button', { name: 'Scroll suggestions right' });
    expect(left).toBeDisabled(); // at the start
    expect(right).toBeEnabled();
    rail.scrollLeft = 1500;
    fireEvent.scroll(rail);
    expect(left).toBeEnabled();
    expect(right).toBeDisabled(); // at the end: 1500 + 500 = 2000
  });

  it('do not animate the scroll when the user prefers reduced motion', async () => {
    layout({ scrollWidth: 2000, clientWidth: 500 });
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    renderRail(state('success', many));
    const rail = screen.getByRole('list', { name: 'Suggested games' });
    rail.scrollBy = vi.fn();
    await userEvent.click(screen.getByRole('button', { name: 'Scroll suggestions right' }));
    expect(rail.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });

  it('animate the scroll otherwise', async () => {
    layout({ scrollWidth: 2000, clientWidth: 500 });
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    renderRail(state('success', many));
    const rail = screen.getByRole('list', { name: 'Suggested games' });
    rail.scrollBy = vi.fn();
    await userEvent.click(screen.getByRole('button', { name: 'Scroll suggestions right' }));
    expect(rail.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
  });
});

describe('keyboard', () => {
  it('cards are reachable links in order', async () => {
    renderRail(state('success', [item(1), item(2)]));
    await userEvent.tab();
    expect(screen.getByRole('link', { name: /Game 1/ })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('link', { name: /Game 2/ })).toHaveFocus();
  });
});

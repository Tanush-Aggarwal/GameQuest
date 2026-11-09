import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
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

describe('PlayNextSection', () => {
  it('is a ranked shortlist: numbered cards linking to each library entry, in order', () => {
    renderRail(state('success', [item(1), item(2), item(3)]));
    expect(screen.getByRole('heading', { name: 'What to play next' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Suggested games' });
    expect(list.tagName).toBe('OL');
    expect(within(list).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/library/e1', '/library/e2', '/library/e3']);
    expect([...list.children].map((li) => li.textContent.slice(0, 1))).toEqual(['1', '2', '3']);
  });

  it('lays the cards out in a grid that never scrolls sideways', () => {
    renderRail(state('success', [item(1), item(2)]));
    const list = screen.getByRole('list', { name: 'Suggested games' });
    expect(list.className).toMatch(/grid/);
    expect(list.className).toMatch(/xl:grid-cols-3/);
    expect(list.className).not.toMatch(/overflow-x/);
  });

  it('shows six at most, with a link to the backlog for the rest', () => {
    renderRail(state('success', [1, 2, 3, 4, 5, 6, 7, 8].map((n) => item(n))));
    expect(screen.getByRole('list', { name: 'Suggested games' }).children).toHaveLength(6);
    expect(screen.getByRole('link', { name: 'See your backlog' })).toHaveAttribute('href', '/library?status=backlog');
  });

  it('says why in short lines, and shows the time to beat once', () => {
    renderRail(state('success', [item(1)]));
    const why = screen.getByRole('list', { name: 'Why Game 1' });
    expect(within(why).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['Your taste: RPG', 'Waiting 40 days']);
    expect(screen.getAllByText(/12h/)).toHaveLength(1);
  });

  it('names each link by status, title and progress, and shows progress without repeating it as a reason', () => {
    renderRail(state('success', [item(1, { status: 'playing', manualProgress: 40, reasons: ['40% already done', 'Waiting 40 days'] }), item(2)]));
    const first = screen.getByRole('link', { name: 'Playing Game 1, 40% done' });
    expect(first.closest('li').querySelector('[style*="width: 40%"]')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Why Game 1' })).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['Waiting 40 days']);
    expect(screen.getByRole('link', { name: 'Backlog Game 2' })).toBeInTheDocument();
  });

  it('copes with a suggestion that has no reasons, no time to beat or no cover', () => {
    renderRail(state('success', [item(1, { reasons: [], timeToBeatMain: null, cover: null })]));
    expect(screen.getByRole('link', { name: 'Backlog Game 1' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /Why/ })).not.toBeInTheDocument();
  });

  it("puts the first suggestion's backdrop behind the section", () => {
    const { container } = renderRail(state('success', [item(1), item(2)]));
    expect(container.querySelector('[data-art] img')).toHaveAttribute('src', expect.stringContaining('t_screenshot_big/b1.jpg'));
  });

  it('shows a loading skeleton', () => {
    renderRail(state('loading'));
    expect(screen.getByRole('status', { name: 'Loading suggestions' })).toBeInTheDocument();
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

  it('cards are reachable links in order', async () => {
    renderRail(state('success', [item(1), item(2)]));
    await userEvent.tab();
    expect(screen.getByRole('link', { name: /Game 1/ })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('link', { name: /Game 2/ })).toHaveFocus();
  });
});

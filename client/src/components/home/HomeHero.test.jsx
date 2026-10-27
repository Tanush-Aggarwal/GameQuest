import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { AmbientProvider, PREVIEW_DELAY_MS } from '@/components/art/AmbientProvider.jsx';
import { useAmbient } from '@/components/art/ambientContext.js';
import { PlayNextCard } from './PlayNextRail.jsx';
import { HomeHero, ProgressRing } from './HomeHero.jsx';

const ok = (data) => ({ status: 'success', data, error: null, retry: vi.fn() });
const loading = { status: 'loading', data: null, error: null, retry: vi.fn() };
const resume = {
  entryId: 'e1',
  title: 'Hades',
  cover: null,
  backdrop: 'https://img/hades.jpg',
  manualProgress: 42,
  playtimeMinutes: 750,
  achievements: { unlocked: 12, total: 48, pct: 25 },
  lastPlayedAt: new Date().toISOString(),
};
const nextItem = { entryId: 'e2', gameId: 'g2', title: 'Celeste', cover: null, backdrop: 'https://img/celeste.jpg', status: 'backlog', manualProgress: 0, timeToBeatMain: 8, reasons: [] };

function renderHero({ dashboard, playNext, extra = null }) {
  return render(
    <MemoryRouter>
      <AmbientProvider>
        <HomeHero username="neo" dashboard={dashboard} playNext={playNext} />
        {extra}
      </AmbientProvider>
    </MemoryRouter>,
  );
}

describe('HomeHero', () => {
  it('shows the last played game with Continue, a progress ring, hours and achievement %', () => {
    renderHero({ dashboard: ok({ resumeCard: resume }), playNext: ok({ items: [nextItem] }) });
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back, neo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Hades' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue hades/i })).toHaveAttribute('href', '/library/e1');
    expect(screen.getByRole('img', { name: '42% complete' })).toBeInTheDocument();
    expect(screen.getByText('12.5 hours')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('(12/48)')).toBeInTheDocument();
    expect(screen.getByText(/continue playing/i)).toBeInTheDocument();
  });

  it('leaves out achievements it does not have', () => {
    renderHero({ dashboard: ok({ resumeCard: { ...resume, achievements: null } }), playNext: ok({ items: [] }) });
    expect(screen.queryByText('Achievements')).not.toBeInTheDocument();
    expect(screen.getByText('Played')).toBeInTheDocument();
  });

  it('with nothing played yet, offers the top suggestion with "Start playing"', () => {
    renderHero({ dashboard: ok({ resumeCard: null }), playNext: ok({ items: [nextItem] }) });
    expect(screen.getByRole('heading', { level: 2, name: 'Celeste' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start playing celeste/i })).toHaveAttribute('href', '/library/e2');
    expect(screen.queryByText('Played')).not.toBeInTheDocument();
  });

  it('with no game at all, keeps the greeting and gives one action', () => {
    renderHero({ dashboard: ok({ resumeCard: null }), playNext: ok({ items: [] }) });
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back, neo' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /discover new games/i })).toHaveAttribute('href', '/explore');
  });

  it('shows a skeleton while loading, with the greeting already there', () => {
    renderHero({ dashboard: loading, playNext: loading });
    expect(screen.getByRole('status', { name: 'Loading your game' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back, neo' })).toBeInTheDocument();
  });

  it('survives both sources failing', () => {
    const failed = { status: 'error', data: null, error: { message: 'down' }, retry: vi.fn() };
    renderHero({ dashboard: failed, playNext: failed });
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back, neo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /discover new games/i })).toBeInTheDocument();
  });
});

describe('hovering or focusing a suggestion previews it in the hero (250 ms debounce)', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  const rail = (
    <ul>
      <PlayNextCard item={nextItem} />
    </ul>
  );

  it('swaps after the delay on hover and back on leave', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderHero({ dashboard: ok({ resumeCard: resume }), playNext: ok({ items: [nextItem] }), extra: rail });
    const card = screen.getByRole('link', { name: 'Celeste, Backlog' });

    await user.hover(card);
    act(() => vi.advanceTimersByTime(PREVIEW_DELAY_MS - 50));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Hades'); // not yet
    act(() => vi.advanceTimersByTime(60));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Celeste');
    expect(screen.getByText('Previewing')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start playing celeste/i })).toBeInTheDocument();

    await user.unhover(card);
    act(() => vi.advanceTimersByTime(PREVIEW_DELAY_MS + 10));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Hades');
  });

  it('works from the keyboard: focus previews, blur restores', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderHero({ dashboard: ok({ resumeCard: resume }), playNext: ok({ items: [nextItem] }), extra: rail });
    await user.tab(); // hero Continue
    await user.tab(); // hero Discover
    await user.tab(); // the rail card
    expect(screen.getByRole('link', { name: 'Celeste, Backlog' })).toHaveFocus();
    act(() => vi.advanceTimersByTime(PREVIEW_DELAY_MS + 10));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Celeste');
    await user.tab();
    act(() => vi.advanceTimersByTime(PREVIEW_DELAY_MS + 10));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Hades');
  });

  it('only the card the pointer rests on wins when it sweeps across several', async () => {
    const other = { ...nextItem, entryId: 'e3', title: 'Hollow Knight' };
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderHero({
      dashboard: ok({ resumeCard: resume }),
      playNext: ok({ items: [nextItem] }),
      extra: (
        <ul>
          <PlayNextCard item={nextItem} />
          <PlayNextCard item={other} />
        </ul>
      ),
    });
    await user.hover(screen.getByRole('link', { name: 'Celeste, Backlog' }));
    act(() => vi.advanceTimersByTime(100));
    await user.hover(screen.getByRole('link', { name: 'Hollow Knight, Backlog' }));
    act(() => vi.advanceTimersByTime(PREVIEW_DELAY_MS + 10));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Hollow Knight');
  });
});

describe('ProgressRing', () => {
  it('clamps and rounds, and labels itself', () => {
    const { rerender } = render(<ProgressRing value={140} />);
    expect(screen.getByRole('img', { name: '100% complete' })).toBeInTheDocument();
    rerender(<ProgressRing value={-5} />);
    expect(screen.getByRole('img', { name: '0% complete' })).toBeInTheDocument();
    rerender(<ProgressRing value={33.6} />);
    expect(screen.getByRole('img', { name: '34% complete' })).toBeInTheDocument();
  });
});

describe('AmbientProvider', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  function Probe() {
    const { current, previewGame, setBase, clearBase } = useAmbient();
    return (
      <div>
        <p data-testid="current">{current?.title ?? 'none'}</p>
        <button onClick={() => previewGame({ title: 'Previewed' })}>preview</button>
        <button onClick={() => setBase({ title: 'NewBase' })}>newbase</button>
        <button onClick={() => clearBase(OLD)}>clearold</button>
        <Link to="/next">go</Link>
        <Link to="/third">go again</Link>
      </div>
    );
  }
  const OLD = { title: 'OldBase' };

  it('a preview does not follow you to the next page, even one still pending when you navigate', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MemoryRouter>
        <AmbientProvider>
          <Routes>
            <Route path="*" element={<Probe />} />
          </Routes>
        </AmbientProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByText('preview'));
    act(() => vi.advanceTimersByTime(PREVIEW_DELAY_MS + 10));
    expect(screen.getByTestId('current')).toHaveTextContent('Previewed');
    await user.click(screen.getByText('go'));
    expect(screen.getByTestId('current')).toHaveTextContent('none');
    // a timer started just before the click lands after it
    await user.click(screen.getByText('preview'));
    await user.click(screen.getByText('go again'));
    act(() => vi.advanceTimersByTime(PREVIEW_DELAY_MS + 10));
    expect(screen.getByTestId('current')).toHaveTextContent('none');
  });

  it('a page that is leaving cannot clear the base set by the page that arrived', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MemoryRouter>
        <AmbientProvider>
          <Probe />
        </AmbientProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByText('newbase'));
    expect(screen.getByTestId('current')).toHaveTextContent('NewBase');
    await user.click(screen.getByText('clearold'));
    expect(screen.getByTestId('current')).toHaveTextContent('NewBase');
  });
});
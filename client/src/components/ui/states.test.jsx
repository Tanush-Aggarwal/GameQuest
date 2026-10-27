import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Library } from 'lucide-react';
import { vi } from 'vitest';
import { ArtContext } from '@/components/art/artContext.js';
import { EmptyState, ErrorState } from './states.jsx';

const g = (n) => ({ id: `g${n}`, slug: `game-${n}`, title: `Game ${n}`, cover: null, backdrop: null });
const art = (suggestions, status = 'ready') => ({ pool: suggestions, suggestions, status, artFor: () => null });

function renderWith(ui, context) {
  return render(
    <ArtContext.Provider value={context ?? art([])}>
      <MemoryRouter>{ui}</MemoryRouter>
    </ArtContext.Provider>,
  );
}

describe('EmptyState (compact)', () => {
  it('is a short strip: icon, the reason, one action; not a tall blank panel', () => {
    const { container } = renderWith(<EmptyState icon={Library} title="Your library is empty" description="Add games from the catalog." actionLabel="Find games" actionTo="/explore" />);
    expect(screen.getByRole('heading', { name: 'Your library is empty' })).toBeInTheDocument();
    expect(screen.getByText('Add games from the catalog.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find games' })).toHaveAttribute('href', '/explore');
    const box = container.firstElementChild;
    expect(box.className).toMatch(/\bpy-4\b/);
    expect(box.className).not.toMatch(/py-12|py-8/); // the old blank-panel padding
    expect(box.className).not.toMatch(/text-center/);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('has no action when none is given, and no icon when none is given', () => {
    const { container } = renderWith(<EmptyState title="Nothing here" description="Because." />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('uses the heading level of its page: h2 by default, h3 inside a section, h1 when it is the whole page', () => {
    const { unmount } = renderWith(<EmptyState title="Default" description="d" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Default' })).toBeInTheDocument();
    unmount();
    const inSection = renderWith(<EmptyState title="In a section" description="d" headingLevel="h3" />);
    expect(screen.getByRole('heading', { level: 3, name: 'In a section' })).toBeInTheDocument();
    inSection.unmount();
    renderWith(<EmptyState title="Whole page" description="d" headingLevel="h1" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Whole page' })).toBeInTheDocument();
  });

  it('shows no suggestions unless asked, and none when there is nothing to suggest', () => {
    renderWith(<EmptyState title="t" description="d" />, art([g(1), g(2)]));
    expect(screen.queryByRole('list', { name: 'Popular right now' })).not.toBeInTheDocument();
    renderWith(<EmptyState title="t2" description="d" suggestions />, art([]));
    expect(screen.queryByRole('list', { name: 'Popular right now' })).not.toBeInTheDocument();
    renderWith(<EmptyState title="t3" description="d" suggestions />, art([], 'loading'));
    expect(screen.queryByText('Popular right now')).not.toBeInTheDocument();
  });

  it('offers popular catalog games as links to their pages', () => {
    renderWith(<EmptyState title="Empty" description="d" suggestions />, art([g(1), g(2), g(3)]));
    const list = screen.getByRole('list', { name: 'Popular right now' });
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => [l.getAttribute('aria-label'), l.getAttribute('href')])).toEqual([
      ['Game 1', '/games/game-1'],
      ['Game 2', '/games/game-2'],
      ['Game 3', '/games/game-3'],
    ]);
  });

  it('shows at most the requested number, and only four on a narrow screen', () => {
    const many = [1, 2, 3, 4, 5, 6, 7, 8].map(g);
    renderWith(<EmptyState title="Empty" description="d" suggestions />, art(many));
    const items = within(screen.getByRole('list', { name: 'Popular right now' })).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    expect(items.slice(0, 4).every((li) => !li.className.includes('hidden'))).toBe(true);
    expect(items.slice(4).every((li) => li.className.includes('hidden') && li.className.includes('sm:block'))).toBe(true);
  });

  it('accepts a number of suggestions', () => {
    renderWith(<EmptyState title="Empty" description="d" suggestions={2} />, art([1, 2, 3, 4].map(g)));
    expect(within(screen.getByRole('list', { name: 'Popular right now' })).getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('ErrorState (compact)', () => {
  it('is a short strip with the message and a Retry button scoped to its section', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Could not load this." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load this.');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').className).not.toMatch(/py-12/);
  });

  it('has no Retry button without a handler', () => {
    render(<ErrorState message="Gone." />);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});

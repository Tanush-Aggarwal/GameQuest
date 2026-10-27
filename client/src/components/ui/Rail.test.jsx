import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Rail } from './Rail.jsx';
import { PlatformPills, platformIcon, shortPlatform } from './PlatformPills.jsx';

function sizeList(list, { scrollWidth, clientWidth, scrollLeft = 0 }) {
  Object.defineProperty(list, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(list, 'clientWidth', { configurable: true, value: clientWidth });
  list.scrollLeft = scrollLeft;
  list.scrollBy = vi.fn();
}

describe('Rail', () => {
  const cards = [1, 2, 3].map((n) => <li key={n}>Card {n}</li>);

  it('has no arrows when everything fits', () => {
    render(<Rail label="Games">{cards}</Rail>);
    expect(screen.getByRole('list', { name: 'Games' })).toHaveClass('snap-x', 'scrollbar-none');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows labelled arrows when it overflows, disabled at the ends, and scrolls by most of a screen', async () => {
    const { rerender } = render(<Rail label="Games">{cards}</Rail>);
    const list = screen.getByRole('list', { name: 'Games' });
    sizeList(list, { scrollWidth: 1000, clientWidth: 400 });
    rerender(
      <Rail label="Games">
        {cards}
        <li>Card 4</li>
      </Rail>,
    ); // a changed child count re-measures
    const left = await screen.findByRole('button', { name: 'Scroll Games left' });
    const right = screen.getByRole('button', { name: 'Scroll Games right' });
    expect(left).toBeDisabled();
    expect(right).toBeEnabled();
    await userEvent.click(right);
    expect(list.scrollBy).toHaveBeenCalledWith({ left: 320, behavior: 'smooth' });
    sizeList(list, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 600 });
    fireEvent.scroll(list);
    expect(screen.getByRole('button', { name: 'Scroll Games right' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Scroll Games left' })).toBeEnabled();
  });
});

describe('PlatformPills', () => {
  it('trims the bracketed detail, de-duplicates and always writes the name', () => {
    render(<PlatformPills platforms={['PC (Microsoft Windows)', 'PC (Linux)', 'PlayStation 5']} />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['PC', 'PlayStation 5']);
  });

  it('collapses the tail into "+N more" and renders nothing for no platforms', () => {
    const many = ['A', 'B', 'C', 'D'].map((n) => `Platform ${n}`);
    const { container, rerender } = render(<PlatformPills platforms={many} max={2} />);
    expect(screen.getByText('+2 more')).toBeInTheDocument();
    rerender(<PlatformPills platforms={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('picks a hint icon but never relies on it', () => {
    expect(platformIcon('PC (Microsoft Windows)')).not.toBe(platformIcon('PlayStation 5'));
    expect(platformIcon('Android')).not.toBe(platformIcon('PlayStation 5'));
    expect(shortPlatform('Xbox Series X|S')).toBe('Xbox Series X|S');
  });
});

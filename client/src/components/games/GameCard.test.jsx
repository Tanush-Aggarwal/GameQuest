import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CoverImage, coverSrcSet } from './GameCard.jsx';

const BIG = 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1.jpg';

describe('coverSrcSet', () => {
  it('offers the 1x and 2x IGDB cover sizes', () => {
    const expected =
      'https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg 1x, https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1.jpg 2x';
    expect(coverSrcSet(BIG)).toBe(expected);
    expect(coverSrcSet(BIG.replace('_2x', ''))).toBe(expected);
  });

  it('leaves other URLs alone', () => {
    expect(coverSrcSet('https://images.igdb.com/igdb/image/upload/t_1080p/co1.jpg')).toBeUndefined();
    expect(coverSrcSet(null)).toBeUndefined();
  });
});

describe('CoverImage', () => {
  it('renders a lazy image with srcset', () => {
    render(<CoverImage cover={BIG} title="Hades" alt="Hades" />);
    const img = screen.getByRole('img', { name: 'Hades' });
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img.getAttribute('srcset')).toContain('2x');
  });

  it('shows a generated cover with the title when there is no art', () => {
    render(<CoverImage cover={null} title="Obscure Game" alt="Obscure Game" />);
    expect(screen.getByRole('img', { name: 'Obscure Game' })).toBeInTheDocument();
    expect(screen.getByText('Obscure Game')).toBeInTheDocument();
  });

  it('falls back to the generated cover when the image fails to load', () => {
    render(<CoverImage cover={BIG} title="Broken Art" alt="Broken Art" />);
    fireEvent.error(screen.getByRole('img', { name: 'Broken Art' }));
    expect(screen.queryByRole('img', { name: 'Broken Art' }).tagName).toBe('DIV');
    expect(screen.getByText('Broken Art')).toBeInTheDocument();
  });

  it('hides the title text on compact thumbnails but keeps an accessible name', () => {
    render(<CoverImage cover={null} title="Tiny" alt="Tiny" compact />);
    expect(screen.getByRole('img', { name: 'Tiny' })).toBeInTheDocument();
    expect(screen.queryByText('Tiny')).toBeNull();
  });
});

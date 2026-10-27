import { fireEvent, render } from '@testing-library/react';
import { BackdropHero, MAX_BACKDROP_RATIO } from './BackdropHero.jsx';

const BACKDROP = 'https://images.igdb.com/igdb/image/upload/t_1080p/bd.jpg';
const COVER = 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/cv.jpg';

function sized(img, width, height) {
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: width });
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: height });
}
const imgOf = (container) => container.querySelector('[data-hero] img');

describe('BackdropHero', () => {
  it('uses the backdrop at its largest size and fades it in once loaded', () => {
    const { container } = render(<BackdropHero art={{ backdrop: BACKDROP, cover: COVER }}>content</BackdropHero>);
    const img = imgOf(container);
    expect(img).toHaveAttribute('src', BACKDROP);
    expect(img).toHaveAttribute('srcset', expect.stringContaining('/t_screenshot_big/bd.jpg 889w'));
    expect(img).toHaveAttribute('sizes', '(max-width: 640px) 100vw, 1920px');
    expect(img).toHaveAttribute('fetchpriority', 'high');
    expect(img.className).toMatch(/opacity-0/);
    sized(img, 1920, 1080);
    fireEvent.load(img);
    expect(imgOf(container).className).toMatch(/opacity-100/);
    expect(imgOf(container).className).not.toMatch(/blur/);
  });

  it('skips a banner or logo strip (far wider than a backdrop) and uses the cover, blurred, instead', () => {
    expect(MAX_BACKDROP_RATIO).toBeLessThan(1920 / 295);
    const { container } = render(<BackdropHero art={{ backdrop: BACKDROP, cover: COVER }}>content</BackdropHero>);
    const strip = imgOf(container);
    sized(strip, 1920, 295);
    fireEvent.load(strip);
    const next = imgOf(container);
    expect(next).toHaveAttribute('src', 'https://images.igdb.com/igdb/image/upload/t_cover_big/cv.jpg');
    expect(next.className).toMatch(/blur/);
    expect(container.querySelector('[data-hero]')).toHaveAttribute('data-hero', 'art');
  });

  it('falls back to a gradient when the wide backdrop is all there is, or the images fail', () => {
    const { container, rerender } = render(<BackdropHero art={{ backdrop: BACKDROP }} seed="x">content</BackdropHero>);
    const strip = imgOf(container);
    sized(strip, 1920, 295);
    fireEvent.load(strip);
    expect(container.querySelector('[data-hero]')).toHaveAttribute('data-hero', 'gradient');
    expect(container.querySelector('img')).toBeNull();

    rerender(<BackdropHero art={{ backdrop: `${BACKDROP}?v=2`, cover: COVER }} seed="x">content</BackdropHero>);
    fireEvent.error(imgOf(container)); // the backdrop is broken
    fireEvent.error(imgOf(container)); // and so is the cover
    expect(container.querySelector('[data-hero]')).toHaveAttribute('data-hero', 'gradient');
  });

  it('keeps its content, and a gradient, when there is no art at all', () => {
    const { container, getByText } = render(<BackdropHero art={null} seed="home">hello</BackdropHero>);
    expect(getByText('hello')).toBeInTheDocument();
    expect(container.querySelector('[data-hero]')).toHaveAttribute('data-hero', 'gradient');
  });
});

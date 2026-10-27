import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TrailerModal } from './TrailerModal.jsx';

vi.mock('@/services/gamesApi.js', () => ({
  getTrailers: vi.fn(),
  reportTrailer: vi.fn(),
}));

const { getTrailers } = await import('@/services/gamesApi.js');

describe('TrailerModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    document.body.style.overflow = '';
  });

  it('renders nothing when isOpen is false', () => {
    render(<TrailerModal isOpen={false} onClose={vi.fn()} slug="elden-ring" title="Elden Ring" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });

  it('renders in document.body via portal with role="dialog" when open', async () => {
    getTrailers.mockResolvedValue([
      { videoId: 'dQw4w9WgXcQ', label: 'Launch Trailer', source: 'youtube' },
    ]);

    render(<TrailerModal isOpen={true} onClose={vi.fn()} slug="elden-ring" title="Elden Ring" />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-label', 'Elden Ring Trailer');
    // Verify it is portaled to document.body
    expect(document.body.contains(dialog)).toBe(true);
    // Verify body overflow is hidden
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body overflow when unmounted or closed', async () => {
    getTrailers.mockResolvedValue([
      { videoId: 'dQw4w9WgXcQ', label: 'Launch Trailer', source: 'youtube' },
    ]);

    const { unmount } = render(
      <TrailerModal isOpen={true} onClose={vi.fn()} slug="elden-ring" title="Elden Ring" />
    );

    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('calls onClose when Escape key is pressed', async () => {
    getTrailers.mockResolvedValue([
      { videoId: 'dQw4w9WgXcQ', label: 'Launch Trailer', source: 'youtube' },
    ]);

    const handleClose = vi.fn();
    render(<TrailerModal isOpen={true} onClose={handleClose} slug="elden-ring" title="Elden Ring" />);

    await userEvent.keyboard('{Escape}');
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked, but NOT when inside dialog content is clicked', async () => {
    getTrailers.mockResolvedValue([
      { videoId: 'dQw4w9WgXcQ', label: 'Launch Trailer', source: 'youtube' },
    ]);

    const handleClose = vi.fn();
    render(<TrailerModal isOpen={true} onClose={handleClose} slug="elden-ring" title="Elden Ring" />);

    // Click inside the dialog card header/content
    const heading = screen.getByRole('heading', { name: /Elden Ring/i });
    await userEvent.click(heading);
    expect(handleClose).not.toHaveBeenCalled();

    // Click backdrop (the outer dialog wrapper)
    const backdrop = screen.getByRole('dialog');
    await userEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('shows clear unavailable state with Dismiss when no trailers exist', async () => {
    getTrailers.mockResolvedValue([]);

    const handleClose = vi.fn();
    render(<TrailerModal isOpen={true} onClose={handleClose} slug="empty-game" title="Empty Game" />);

    expect(await screen.findByText(/No trailer available for Empty Game/i)).toBeInTheDocument();
    expect(
      screen.getByText(/An official trailer hasn't been verified for this game yet/i)
    ).toBeInTheDocument();

    const dismissBtn = screen.getByRole('button', { name: 'Dismiss' });
    await userEvent.click(dismissBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to triggerRef when closed', async () => {
    getTrailers.mockResolvedValue([
      { videoId: 'dQw4w9WgXcQ', label: 'Launch Trailer', source: 'youtube' },
    ]);

    const triggerBtn = document.createElement('button');
    triggerBtn.textContent = 'Open';
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    const triggerRef = { current: triggerBtn };
    const { rerender } = render(
      <TrailerModal
        isOpen={true}
        onClose={vi.fn()}
        slug="elden-ring"
        title="Elden Ring"
        triggerRef={triggerRef}
      />
    );

    // Now close
    rerender(
      <TrailerModal
        isOpen={false}
        onClose={vi.fn()}
        slug="elden-ring"
        title="Elden Ring"
        triggerRef={triggerRef}
      />
    );

    await waitFor(() => {
      expect(document.activeElement).toBe(triggerBtn);
    });

    document.body.removeChild(triggerBtn);
  });
});

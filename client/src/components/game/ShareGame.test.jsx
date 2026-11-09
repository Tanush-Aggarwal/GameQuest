import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
const { ShareGame, shareDetails } = await import('./ShareGame.jsx');

const game = { title: 'Hades', slug: 'hades', releaseDate: '2020-09-17', genres: ['Roguelike', 'Action'], totalRating: 93 };

describe('ShareGame', () => {
  it('builds a message with the game details and its link', () => {
    const { url, message } = shareDetails(game, 'https://gq.app');
    expect(url).toBe('https://gq.app/games/hades');
    expect(message).toContain('Hades (2020 · Roguelike · Action · ★ 9.3/10)');
    expect(message.endsWith('https://gq.app/games/hades')).toBe(true);
  });

  it('copies the link on click and offers WhatsApp and other apps', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ShareGame game={game} />);
    await user.click(screen.getByRole('button', { name: 'Share Hades' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/games/hades'));
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/copied/i));
    await user.click(await screen.findByRole('menuitem', { name: /whatsapp/i }));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/wa\.me\/\?text=.*Hades/), '_blank', 'noopener,noreferrer');
  });
});

import { render, screen } from '@testing-library/react';
import { SteamBadge, SteamDetails } from './SteamBadge.jsx';
import { achievementPercent, formatPlaytime, otherPlatforms } from '@/lib/steam.js';

const entry = (over = {}) => ({
  ownerships: [
    { platform: 'Steam', externalId: '1', playtimeMin: 150, lastSyncedAt: '2026-10-27T10:00:00.000Z' },
    { platform: 'Switch', playtimeMin: 0 },
  ],
  achievements: { unlocked: 7, total: 10, fetchedAt: '2026-10-27T10:00:00.000Z' },
  ...over,
});

describe('steam helpers', () => {
  it('computes whole-number achievement percent, or null without achievements', () => {
    expect(achievementPercent({ unlocked: 7, total: 10 })).toBe(70);
    expect(achievementPercent({ unlocked: 1, total: 3 })).toBe(33);
    expect(achievementPercent({ unlocked: null, total: null })).toBeNull();
    expect(achievementPercent({ unlocked: 0, total: 0 })).toBeNull();
    expect(achievementPercent(undefined)).toBeNull();
  });

  it('formats playtime and lists the non-Steam platforms', () => {
    expect(formatPlaytime(45)).toBe('45m');
    expect(formatPlaytime(150)).toBe('3h');
    expect(otherPlatforms(entry()).map((o) => o.platform)).toEqual(['Switch']);
  });
});

describe('SteamBadge', () => {
  it('shows the Steam label, playtime and achievement percent with a screen-reader description', () => {
    render(<SteamBadge entry={entry()} />);
    expect(screen.getByText('Steam')).toBeInTheDocument();
    expect(screen.getByText('3h')).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText(/achievements unlocked \(7 of 10\)/)).toBeInTheDocument();
  });

  it('omits the achievement part for games without achievements and renders nothing without Steam', () => {
    const { rerender, container } = render(<SteamBadge entry={entry({ achievements: { unlocked: null, total: null } })} />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    rerender(<SteamBadge entry={{ ownerships: [{ platform: 'Switch' }] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SteamDetails', () => {
  it('shows an achievement progress bar and the sync time', () => {
    render(<SteamDetails entry={entry()} />);
    expect(screen.getByRole('progressbar', { name: /achievements unlocked/i })).toHaveAttribute('aria-valuenow', '70');
    expect(screen.getByText('7 / 10 (70%)')).toBeInTheDocument();
    expect(screen.getByText('3h played')).toBeInTheDocument();
    expect(screen.getByText(/^Synced/)).toBeInTheDocument();
  });

  it('says so when the game has no achievements', () => {
    render(<SteamDetails entry={entry({ achievements: { unlocked: null, total: null } })} />);
    expect(screen.getByText(/no achievements for this game/i)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});

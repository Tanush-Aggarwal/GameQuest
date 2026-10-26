// Helpers for the Steam data on a library entry (ownerships[] and achievements).
export const steamOwnership = (entry) => (entry?.ownerships ?? []).find((o) => o.platform === 'Steam') ?? null;

// Platforms other than Steam; Steam gets its own badge with playtime and achievements.
export const otherPlatforms = (entry) => (entry?.ownerships ?? []).filter((o) => o.platform !== 'Steam');

// Whole percent unlocked, or null when the game has no achievements or none were synced.
export function achievementPercent(achievements) {
  if (!achievements || !(achievements.total > 0) || achievements.unlocked == null) return null;
  return Math.round((achievements.unlocked / achievements.total) * 100);
}

export const formatPlaytime = (minutes) => (minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`);

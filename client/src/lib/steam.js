// Helpers for the Steam data on a library entry (ownerships[] and achievements).
export const steamOwnership = (entry) => (entry?.ownerships ?? []).find((o) => o.platform === 'Steam') ?? null;

// Platforms other than Steam; Steam gets its own badge with playtime and achievements.
export const otherPlatforms = (entry) => (entry?.ownerships ?? []).filter((o) => o.platform !== 'Steam');

// Whole percent unlocked, or null when the game has no achievements or none were synced.
export function achievementPercent(achievements) {
  if (!achievements || !(achievements.total > 0) || achievements.unlocked == null) return null;
  return Math.round((achievements.unlocked / achievements.total) * 100);
}

// One decimal like Steam shows it (294.1h), whole hours past 1000.
export const formatPlaytime = (minutes) =>
  minutes >= 60 ? `${minutes >= 60000 ? Math.round(minutes / 60) : (Math.floor(minutes / 6) / 10).toFixed(1).replace(/\.0$/, "")}h` : `${minutes}m`;

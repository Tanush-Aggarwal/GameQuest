// Player levels. Mirrors server/src/services/accountService.js: change both together.
// XP comes only from real activity, so a level is always explainable from the player's own numbers.
export const XP_RULES = [
  { key: 'hours', label: 'Hour played', xp: 10, note: 'Steam playtime or hours you log yourself (whichever is higher per game)' },
  { key: 'completed', label: 'Game completed', xp: 100, note: 'Any game you move to Completed' },
  { key: 'reviews', label: 'Review written', xp: 25, note: 'One review per game' },
];

export const xpForLevel = (level) => 100 * (level - 1) ** 2;
export const levelForXp = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;

// Percent of the way from the start of the current level to the next one.
export function levelProgress({ xp = 0, level = levelForXp(xp) } = {}) {
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { start, next, toGo: Math.max(0, next - xp), pct: Math.min(100, Math.max(0, Math.round(((xp - start) / Math.max(1, next - start)) * 100))) };
}

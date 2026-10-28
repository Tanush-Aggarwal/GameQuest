import { CalendarClock, Gamepad2, Layers3, Library, MonitorSmartphone, PenLine, Trophy, Users } from 'lucide-react';

// Trophy tracks. Each one reads a single number from the profile stats the server computes from the
// player's own library, reviews and friends; tiers are earned in order and every tier shows the next goal.
export const TIERS = [
  { name: 'Bronze', color: 'var(--trophy-bronze)' },
  { name: 'Silver', color: 'var(--trophy-silver)' },
  { name: 'Gold', color: 'var(--trophy-gold)' },
  { name: 'Platinum', color: 'var(--trophy-platinum)' },
];

export const TRACKS = [
  { key: 'games', name: 'Collector', icon: Library, unit: 'games in library', goals: [1, 10, 25, 50], titles: ['Apprentice', 'Avid Collector', 'Veteran Collector', 'Master Collector'] },
  { key: 'completed', name: 'Finisher', icon: Trophy, unit: 'games completed', goals: [1, 5, 15, 30], titles: ['First Quest Cleared', 'Dedicated Finisher', 'Master Finisher', 'Legendary Finisher'] },
  { key: 'hours', name: 'Time played', icon: CalendarClock, unit: 'hours played', goals: [10, 50, 150, 500], titles: ['Initiate', 'Regular', 'Century Club', 'No-Lifer'] },
  { key: 'achievements', name: 'Achievement hunter', icon: Gamepad2, unit: 'achievements unlocked', goals: [10, 100, 500, 1500], titles: ['Hunter', 'Tracker', 'Completionist', 'Trophy Legend'] },
  { key: 'reviews', name: 'Critic', icon: PenLine, unit: 'reviews written', goals: [1, 5, 15, 30], titles: ['Voice of the Player', 'Columnist', 'Critic', 'Master Critic'] },
  { key: 'genres', name: 'Genre explorer', icon: Layers3, unit: 'genres played', goals: [3, 6, 10, 15], titles: ['Curious', 'Wanderer', 'Explorer', 'Omnivore'] },
  { key: 'platforms', name: 'Platform hopper', icon: MonitorSmartphone, unit: 'platforms linked', goals: [1, 2, 3, 4], titles: ['Connected', 'Dual Wielder', 'Multi-platform', 'Everywhere'] },
  { key: 'friends', name: 'Squad', icon: Users, unit: 'friends', goals: [1, 3, 10, 25], titles: ['Player Two', 'Party', 'Squad Leader', 'Guild Master'] },
];

// For one track: the tier earned (index, or -1), its title, and progress towards the next goal.
export function trackState(track, stats = {}) {
  const value = Number(stats?.[track.key]) || 0;
  let tier = -1;
  track.goals.forEach((goal, i) => { if (value >= goal) tier = i; });
  const maxed = tier === track.goals.length - 1;
  const from = tier >= 0 ? track.goals[tier] : 0;
  const next = maxed ? track.goals[tier] : track.goals[tier + 1];
  const pct = maxed ? 100 : Math.round(((value - from) / Math.max(1, next - from)) * 100);
  return {
    value,
    tier,
    maxed,
    next,
    pct: Math.min(100, Math.max(0, pct)),
    title: tier >= 0 ? track.titles[tier] : track.name,
    tierInfo: tier >= 0 ? TIERS[tier] : null,
    nextTier: maxed ? null : TIERS[tier + 1],
  };
}

export function trophySummary(stats) {
  const states = TRACKS.map((t) => ({ track: t, ...trackState(t, stats) }));
  return { states, earned: states.reduce((sum, s) => sum + (s.tier + 1), 0), total: TRACKS.length * TIERS.length };
}

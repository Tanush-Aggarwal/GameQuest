import { Gamepad2, Monitor, Smartphone } from 'lucide-react';

// Platform names come from IGDB ("PC (Microsoft Windows)", "PlayStation 5", "Nintendo Switch"...). The icon is only
// a hint: the name is always written out.
export function platformIcon(name = '') {
  if (/\b(pc|windows|mac|linux|steam)\b/i.test(name)) return Monitor;
  if (/\b(ios|android|iphone|ipad|mobile)\b/i.test(name)) return Smartphone;
  return Gamepad2;
}

// "PC (Microsoft Windows)" -> "PC": the pills are short.
export const shortPlatform = (name) => name.replace(/\s*\(.*\)\s*$/, '').trim() || name;

export function PlatformPills({ platforms = [], max = 6, className = '' }) {
  const list = [...new Set(platforms.map(shortPlatform))];
  if (!list.length) return null;
  const shown = list.slice(0, max);
  return (
    <ul aria-label="Platforms" className={`flex flex-wrap gap-1.5 ${className}`}>
      {shown.map((name) => {
        const Icon = platformIcon(name);
        return (
          <li key={name} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg/70 px-2.5 py-1 text-xs text-text">
            <Icon className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
            {name}
          </li>
        );
      })}
      {list.length > shown.length && <li className="inline-flex items-center px-1 text-xs text-text-muted">+{list.length - shown.length} more</li>}
    </ul>
  );
}
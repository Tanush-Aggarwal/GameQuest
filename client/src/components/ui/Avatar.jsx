import { useState } from 'react';

// Warm, readable tints for players without a picture, picked from their name so each person keeps one colour.
const TINTS = [
  ['#e8dfcf', '#151713'],
  ['#d7e6f0', '#155f77'],
  ['#dceee2', '#17633b'],
  ['#f3e0d6', '#9b3510'],
  ['#efe3c8', '#8b5a14'],
  ['#e6dff0', '#4b3a75'],
];
const tintFor = (name = '') => TINTS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % TINTS.length];

// The player's chosen picture everywhere, with their initial on a soft tint as the fallback (no picture, or it failed).
export function Avatar({ user, size = 40, className = '', ring = false }) {
  const [failed, setFailed] = useState(false);
  const name = user?.username ?? '?';
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.4)) };
  const ringClass = ring ? 'ring-2 ring-white/80 shadow-md' : '';
  if (user?.avatar && !failed) {
    return (
      <img
        src={user.avatar}
        alt=""
        aria-hidden="true"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${ringClass} ${className}`}
        style={style}
      />
    );
  }
  const [bg, fg] = tintFor(name);
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-heading font-bold uppercase ${ringClass} ${className}`}
      style={{ ...style, backgroundColor: bg, color: fg }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

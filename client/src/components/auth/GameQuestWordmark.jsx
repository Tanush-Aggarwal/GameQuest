import { Layers, Compass, Users } from 'lucide-react';

/**
 * Custom GameQuest Controller Emblem
 * Original geometric game-controller silhouette with an acid-lime quest sparkle at its center.
 * Fully responsive inline SVG with crisp rendering at any size.
 */
export function GameControllerEmblem({ className = 'h-7 w-7', ...props }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Outer Controller Body */}
      <path
        d="M11 9H25C28.5 9 31.5 11.2 32.8 14.5L34.2 20.2C35 23.2 33.5 26.2 30.5 26.5C28.5 26.7 27 25.2 26 23.2L24.8 20.8C24 19.5 23 18.8 21.6 18.8H14.4C13 18.8 12 19.5 11.2 20.8L10 23.2C9 25.2 7.5 26.7 5.5 26.5C2.5 26.2 1 23.2 1.8 20.2L3.2 14.5C4.5 11.2 7.5 9 11 9Z"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Directional Pad (Left Grip) */}
      <path
        d="M9.5 13.5V17.5M7.5 15.5H11.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Action Buttons Diamond (Right Grip) */}
      <circle cx="26.5" cy="13.5" r="0.95" fill="currentColor" />
      <circle cx="26.5" cy="17.5" r="0.95" fill="currentColor" />
      <circle cx="24.5" cy="15.5" r="0.95" fill="currentColor" />
      <circle cx="28.5" cy="15.5" r="0.95" fill="currentColor" />
      {/* Central Quest Star / Diamond Sparkle in Acid-Lime */}
      <path
        d="M18 10.5Q18 14.5 14.5 14.5Q18 14.5 18 18.5Q18 14.5 21.5 14.5Q18 14.5 18 10.5Z"
        fill="#C9F36D"
      />
      <circle cx="18" cy="14.5" r="0.7" fill="#FFFFFF" />
    </svg>
  );
}

/**
 * Premium Wordmark with custom typographic hierarchy and original controller emblem.
 * Rendered with 'Game' in warm white and 'Quest' in acid-lime.
 */
export function GameQuestWordmark({ size = 'lg', className = '' }) {
  if (size === 'sm') {
    return (
      <div className={`flex items-center gap-2.5 ${className}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-[#111311] text-white shadow-sm">
          <GameControllerEmblem className="h-5 w-5 text-white" />
        </div>
        <span className="font-heading text-2xl font-extrabold tracking-tight text-white leading-none">
          Game<span className="text-[var(--accent)]">Quest</span>
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-4 sm:gap-5 ${className}`}>
      <div className="flex h-13 w-13 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-[#111311]/90 shadow-2xl backdrop-blur-md">
        <GameControllerEmblem className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
      </div>
      <div className="flex flex-col">
        <span className="font-heading text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-none select-none">
          Game<span className="text-[var(--accent)]">Quest</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Supporting two-line editorial tagline with balanced line heights.
 */
export function GameQuestTagline({ className = '' }) {
  return (
    <p className={`text-base sm:text-lg leading-relaxed text-white/80 max-w-lg ${className}`}>
      <span className="block font-medium text-white/95">
        Your games from every platform in one library.
      </span>
      <span className="block text-white/70">
        Pick what to play next and play it with friends.
      </span>
    </p>
  );
}

/**
 * Three compact feature highlights pairing simple line icons with readable copy.
 */
export function GameQuestHighlights({ className = '' }) {
  const highlights = [
    { label: 'Track Your Games', icon: Layers },
    { label: 'Discover New Favorites', icon: Compass },
    { label: 'Play With Friends', icon: Users },
  ];

  return (
    <div className={`flex flex-wrap items-center gap-2 sm:gap-2.5 ${className}`}>
      {highlights.map(({ label, icon: Icon }) => (
        <div
          key={label}
          className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 backdrop-blur-sm text-white/90 text-xs sm:text-sm font-medium transition-colors"
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}


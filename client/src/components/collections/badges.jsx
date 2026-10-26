import { Globe, Layers, Lock, Sparkles, Users } from 'lucide-react';

// Icon + label, never colour alone.
const VISIBILITY = {
  public: { label: 'Public', icon: Globe },
  friends: { label: 'Friends', icon: Users },
  private: { label: 'Private', icon: Lock },
};
const TYPE = {
  manual: { label: 'Manual', icon: Layers },
  smart: { label: 'Smart', icon: Sparkles },
};

function Badge({ meta }) {
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-text-muted">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export const VisibilityBadge = ({ visibility }) => <Badge meta={VISIBILITY[visibility]} />;
export const TypeBadge = ({ type }) => <Badge meta={TYPE[type]} />;
export const VISIBILITY_OPTIONS = Object.entries(VISIBILITY).map(([value, { label }]) => ({ value, label }));

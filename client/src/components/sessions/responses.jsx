import { Check, CircleHelp, Crown, Mail, X } from 'lucide-react';

// Every RSVP state has an icon and a label; colour never carries the meaning alone.
export const RESPONSE_META = {
  host: { label: 'Hosting', icon: Crown, text: 'text-accent' },
  going: { label: 'Going', icon: Check, text: 'text-success' },
  maybe: { label: 'Maybe', icon: CircleHelp, text: 'text-warning' },
  declined: { label: 'Can’t make it', icon: X, text: 'text-danger' },
  invited: { label: 'Invited', icon: Mail, text: 'text-info' },
};

export function ResponseBadge({ response }) {
  const meta = RESPONSE_META[response];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${meta.text}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

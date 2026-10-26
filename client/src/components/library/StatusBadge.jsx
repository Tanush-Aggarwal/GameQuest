import { STATUS_META } from '@/lib/libraryStatus.js';

export function StatusBadge({ status }) {
  const { label, icon: Icon, text } = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${text}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

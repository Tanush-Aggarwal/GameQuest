import { useRef } from 'react';
import { Link } from 'react-router-dom';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react';
import { LIBRARY_TRANSITIONS } from '@gamequest/shared';
import { cn } from '@/lib/utils.js';
import { STATUS_META } from '@/lib/libraryStatus.js';

const ITEM =
  'flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-3 text-sm text-text outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-raised';

// The quick status menu of a library card: only the moves the state machine allows from the current status (each
// with its icon and label), a way into the entry page, and removal. `triggerClassName` places the button; on cards it
// is revealed on hover and keyboard focus, and always shown on touch screens.
export function QuickStatusMenu({ entry, onMove, onRemove, disabled, triggerClassName }) {
  const options = LIBRARY_TRANSITIONS[entry.status] ?? [];
  const title = entry.game?.title ?? 'game';
  // After Remove the confirm row takes focus (on its safe Cancel button); Radix must not pull it back to the trigger.
  const removing = useRef(false);
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Change status of ${title}`}
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg text-text hover:border-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text disabled:opacity-60',
            triggerClassName,
          )}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          onCloseAutoFocus={(e) => {
            if (removing.current) e.preventDefault();
            removing.current = false;
          }}
          className="z-50 min-w-48 rounded-card border border-border bg-surface p-1 shadow-2xl">
          <Menu.Group aria-label="Move to">
            <Menu.Label className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-text-muted">Move to</Menu.Label>
            {options.map((to) => {
              const { icon: Icon, label } = STATUS_META[to];
              return (
                <Menu.Item key={to} className={ITEM} onSelect={() => onMove(entry, to)}>
                  <Icon className="h-4 w-4 text-text-muted" aria-hidden="true" /> {label}
                </Menu.Item>
              );
            })}
          </Menu.Group>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item asChild className={ITEM}>
            <Link to={`/library/${entry.id}`}>
              <ExternalLink className="h-4 w-4 text-text-muted" aria-hidden="true" /> Open entry
            </Link>
          </Menu.Item>
          <Menu.Item
            className={ITEM}
            onSelect={() => {
              removing.current = true;
              onRemove(entry);
            }}
          >
            <Trash2 className="h-4 w-4 text-text-muted" aria-hidden="true" /> Remove…
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
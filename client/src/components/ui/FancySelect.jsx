import { Children, isValidElement, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils.js';

// A drop-in for <select> with a styled menu. Use it exactly like a select (same children <option>s, same onChange
// reading e.target.value). The real <select> stays in the page for keyboards and screen readers (and its value is
// the source of truth); a mouse click opens the styled menu instead of the operating system's plain list.
export function FancySelect({ children, value, onChange, className, 'aria-label': ariaLabel, id, disabled, ...rest }) {
  const selectRef = useRef(null);
  const [open, setOpen] = useState(false);
  const options = Children.toArray(children)
    .filter((c) => isValidElement(c) && c.type === 'option')
    .map((c) => ({ value: String(c.props.value ?? ''), label: c.props.children }));
  const current = options.find((o) => o.value === String(value ?? '')) ?? options[0];

  function pick(next) {
    setOpen(false);
    if (next === String(value ?? '')) return;
    onChange?.({ target: { value: next }, currentTarget: { value: next } });
    selectRef.current?.focus({ preventScroll: true });
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
      <div className={cn('gq-fancy-select relative inline-flex min-w-0', className, 'p-0')}>
        <select
          ref={selectRef}
          id={id}
          aria-label={ariaLabel}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
          onMouseDown={(e) => {
            // a pointer opens the styled menu; keyboards keep using the native control
            e.preventDefault();
            if (!disabled) setOpen((o) => !o);
          }}
          {...rest}
        >
          {children}
        </select>
        <DropdownMenu.Trigger asChild disabled={disabled}>
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-[12px] border bg-surface pl-4 pr-3 text-sm font-medium text-text shadow-[0_1px_0_rgba(21,23,19,0.04)] transition-[border-color,box-shadow,background-color]',
              'peer-hover:border-[color-mix(in_srgb,var(--text)_35%,var(--border))] peer-focus-visible:border-text peer-focus-visible:shadow-[0_0_0_4px_color-mix(in_srgb,var(--text)_10%,transparent)]',
              open ? 'border-text shadow-[0_0_0_4px_color-mix(in_srgb,var(--text)_10%,transparent)]' : 'border-border',
              disabled && 'opacity-55',
            )}
          >
            <span className="truncate">{current?.label}</span>
            <ChevronDown className={cn('h-4 w-4 shrink-0 text-text-muted transition-transform duration-200', open && 'rotate-180')} />
          </span>
        </DropdownMenu.Trigger>
      </div>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="z-[60] max-h-[min(22rem,var(--radix-dropdown-menu-content-available-height))] min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-[14px] border border-border bg-surface p-1.5 text-text shadow-[0_24px_48px_-16px_rgba(21,23,19,0.35)] animate-in fade-in zoom-in-95 duration-150"
        >
          {options.map((o) => {
            const selected = o.value === current?.value;
            return (
              <DropdownMenu.Item
                key={o.value}
                onSelect={() => pick(o.value)}
                className={cn(
                  'flex cursor-pointer select-none items-center justify-between gap-6 rounded-[9px] px-3 py-2 text-sm outline-none transition-colors data-[highlighted]:bg-surface-raised',
                  selected ? 'font-semibold text-text' : 'text-text-muted data-[highlighted]:text-text',
                )}
              >
                <span className="truncate">{o.label}</span>
                {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

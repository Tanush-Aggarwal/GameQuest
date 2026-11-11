import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils.js';

// Date and date-time picker in the app's own style, replacing the browser's <input type="date|datetime-local">.
// Values use the same strings those inputs use, in local time: "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm".
// A hidden input with the same value stays in the form (for `name` and tests).
//
//   <DatePicker id="start" withTime value={start} onChange={setStart} min={new Date()} />
//
// Keyboard: Enter/Space/↓ opens it; arrow keys move the day (Page Up/Down a month), Enter picks, Escape closes.

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameDay = (a, b) => a && b && dayKey(a) === dayKey(b);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), 28));

function parse(value, withTime) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], withTime ? +(m[4] ?? 0) : 0, withTime ? +(m[5] ?? 0) : 0);
}
const format = (d, withTime) => (withTime ? `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` : dayKey(d));

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const timeLabel = (h, m) => new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const SLOTS = Array.from({ length: 48 }, (_, i) => [Math.floor(i / 2), (i % 2) * 30]);

// Six weeks starting on the Monday on or before the 1st of the month.
function monthGrid(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => addDays(first, i - offset));
}

export function DatePicker({ id, value, onChange, withTime = false, min, max, invalid = false, name, placeholder = 'Pick a date', className, triggerClassName, align = 'start' }) {
  const selected = parse(value, withTime);
  const minDay = min ? startOfDay(new Date(min)) : null;
  const maxDay = max ? startOfDay(typeof max === 'string' ? parse(max, false) : new Date(max)) : null;
  const disabledDay = (d) => (minDay && d < minDay) || (maxDay && d > maxDay);

  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => selected ?? new Date());
  const [focusDay, setFocusDay] = useState(() => selected ?? new Date());
  const root = useRef(null);
  const grid = useRef(null);
  const trigger = useRef(null);
  const timeList = useRef(null);

  // close on outside click
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !root.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // keep the focused day's button focused, and the chosen time in view
  useEffect(() => {
    if (!open) return;
    grid.current?.querySelector(`[data-day="${dayKey(focusDay)}"]`)?.focus({ preventScroll: true });
  }, [open, focusDay]);
  useEffect(() => {
    if (open && withTime) timeList.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'center' });
  }, [open, withTime]);

  function openPicker() {
    const base = selected ?? new Date();
    setMonth(base);
    setFocusDay(base);
    setOpen(true);
  }
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function pickDay(d) {
    if (disabledDay(d)) return;
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), selected?.getHours() ?? 20, selected?.getMinutes() ?? 0);
    onChange(format(next, withTime));
    setFocusDay(d);
    if (!withTime) close();
  }
  function pickTime(h, m) {
    const base = selected ?? new Date();
    onChange(format(new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m), true));
  }

  function onGridKey(e) {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next = null;
    if (moves[e.key] != null) next = addDays(focusDay, moves[e.key]);
    else if (e.key === 'PageUp') next = addMonths(focusDay, -1);
    else if (e.key === 'PageDown') next = addMonths(focusDay, 1);
    else if (e.key === 'Home') next = addDays(focusDay, -((focusDay.getDay() + 6) % 7));
    else if (e.key === 'End') next = addDays(focusDay, 6 - ((focusDay.getDay() + 6) % 7));
    if (!next) return;
    e.preventDefault();
    setFocusDay(next);
    if (next.getMonth() !== month.getMonth() || next.getFullYear() !== month.getFullYear()) setMonth(next);
  }

  const days = useMemo(() => monthGrid(month), [month]);
  const today = new Date();
  const slots = useMemo(() => {
    if (!selected || SLOTS.some(([h, m]) => h === selected.getHours() && m === selected.getMinutes())) return SLOTS;
    return [...SLOTS, [selected.getHours(), selected.getMinutes()]].sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
  }, [selected]);
  const slotPast = (h, m) => {
    if (!min || !selected) return false;
    const t = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), h, m);
    return t < new Date(min);
  };

  // A few one-click suggestions for game nights
  const quick = withTime
    ? [
        { label: 'Tonight', d: (() => { const t = new Date(); t.setHours(21, 0, 0, 0); return t; })() },
        { label: 'Tomorrow', d: (() => { const t = addDays(new Date(), 1); t.setHours(20, 0, 0, 0); return t; })() },
        { label: 'Saturday', d: (() => { const n = new Date(); const t = addDays(n, ((6 - n.getDay() + 7) % 7) || 7); t.setHours(19, 0, 0, 0); return t; })() },
      ].filter((q) => !min || q.d >= new Date(min))
    : [];

  const shown = selected
    ? withTime
      ? `${selected.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${timeLabel(selected.getHours(), selected.getMinutes())}`
      : selected.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : placeholder;

  return (
    <div ref={root} className={cn('relative', className)} onKeyDown={(e) => e.key === 'Escape' && open && (e.stopPropagation(), close())}>
      <button
        ref={trigger}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        onClick={() => (open ? setOpen(false) : openPicker())}
        onKeyDown={(e) => e.key === 'ArrowDown' && !open && (e.preventDefault(), openPicker())}
        className={cn(
          'flex min-h-11 w-full items-center gap-2.5 rounded-control border bg-surface px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text',
          invalid ? 'border-danger' : open ? 'border-text' : 'border-border hover:border-text',
          triggerClassName,
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <span className={cn('flex-1 truncate', selected ? 'text-text' : 'text-text-muted')}>{shown}</span>
      </button>
      <input type="text" name={name} value={value ?? ''} data-picker-value="" onChange={(e) => onChange(e.target.value)} tabIndex={-1} aria-hidden="true" className="sr-only" />

      {open && (
        <div
          role="dialog"
          aria-label={withTime ? 'Choose date and time' : 'Choose a date'}
          className={cn('absolute top-full z-50 mt-2 flex w-[min(92vw,560px)] flex-col overflow-hidden rounded-card border border-border bg-surface text-text shadow-xl sm:flex-row', align === 'end' ? 'right-0' : 'left-0')}
          style={withTime ? undefined : { width: 'min(92vw, 300px)' }}
        >
          {/* Calendar */}
          <div className="flex flex-1 flex-col gap-2 p-3">
            <div className="flex items-center justify-between px-1">
              <span className="font-heading text-sm font-bold" aria-live="polite">
                {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </span>
              <div className="flex gap-1">
                {[
                  [-1, 'Previous month', ChevronLeft],
                  [1, 'Next month', ChevronRight],
                ].map(([step, label, Icon]) => (
                  <button
                    key={label}
                    type="button"
                    aria-label={label}
                    onClick={() => setMonth((m) => addMonths(m, step))}
                    className="flex h-8 w-8 items-center justify-center rounded-control text-text-muted hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
            <div role="grid" ref={grid} onKeyDown={onGridKey} aria-label="Calendar" className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((w) => (
                <span key={w} role="columnheader" className="pb-1 text-center text-[11px] font-semibold text-text-muted">{w}</span>
              ))}
              {days.map((d) => {
                const out = d.getMonth() !== month.getMonth();
                const isSel = sameDay(d, selected);
                const isToday = sameDay(d, today);
                const off = disabledDay(d);
                return (
                  <button
                    key={dayKey(d)}
                    type="button"
                    role="gridcell"
                    data-day={dayKey(d)}
                    tabIndex={sameDay(d, focusDay) ? 0 : -1}
                    aria-selected={isSel}
                    aria-disabled={off || undefined}
                    aria-label={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    onClick={() => pickDay(d)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pickDay(d))}
                    className={cn(
                      'relative flex h-9 items-center justify-center rounded-control text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text',
                      isSel ? 'bg-text font-semibold text-bg' : off ? 'cursor-not-allowed text-text-muted/35' : out ? 'text-text-muted/60 hover:bg-surface-raised' : 'text-text hover:bg-surface-raised',
                      isToday && !isSel && 'font-bold',
                    )}
                  >
                    {d.getDate()}
                    {isToday && <span aria-hidden="true" className={cn('absolute bottom-1 h-1 w-1 rounded-full', isSel ? 'bg-bg' : 'bg-text')} />}
                  </button>
                );
              })}
            </div>
            {quick.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-border pt-2.5">
                {quick.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => {
                      onChange(format(q.d, true));
                      setMonth(q.d);
                      setFocusDay(q.d);
                    }}
                    className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-text-muted hover:border-text hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text"
                  >
                    {q.label} · {timeLabel(q.d.getHours(), 0)}
                  </button>
                ))}
              </div>
            )}
            {!withTime && (
              <button type="button" onClick={() => pickDay(startOfDay(today))} disabled={disabledDay(startOfDay(today))} className="self-start rounded-full px-2 py-1 text-xs font-semibold text-text-muted hover:text-text disabled:opacity-40">
                Today
              </button>
            )}
          </div>

          {/* Time */}
          {withTime && (
            <div className="flex flex-col border-t border-border sm:w-40 sm:border-l sm:border-t-0">
              <p className="flex items-center gap-1.5 px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Time
              </p>
              <ul ref={timeList} role="listbox" aria-label="Time" className="max-h-48 overflow-y-auto px-2 pb-2 sm:max-h-[296px]">
                {slots.map(([h, m]) => {
                  const on = selected && selected.getHours() === h && selected.getMinutes() === m;
                  const past = slotPast(h, m);
                  return (
                    <li key={`${h}:${m}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={Boolean(on)}
                        disabled={past}
                        onClick={() => pickTime(h, m)}
                        className={cn(
                          'w-full rounded-control px-3 py-1.5 text-left text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text',
                          on ? 'bg-text font-semibold text-bg' : past ? 'cursor-not-allowed text-text-muted/35' : 'hover:bg-surface-raised',
                        )}
                      >
                        {timeLabel(h, m)}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-border p-2">
                <button type="button" onClick={close} className="w-full rounded-control bg-text px-3 py-2 text-sm font-semibold text-bg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text focus-visible:ring-offset-2">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

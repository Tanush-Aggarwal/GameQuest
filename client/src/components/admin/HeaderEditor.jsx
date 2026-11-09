import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Check, Link2, Loader2, Monitor, Move, RotateCcw, Smartphone, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { getHeaderOptions, updateAdminGame } from '@/services/adminApi.js';
import { getErrorInfo } from '@/services/api.js';
import { heroFrameStyle } from '@/lib/heroFrame.js';
import { cn } from '@/lib/utils.js';

const DEFAULT_FRAME = { posX: 50, posY: 30, zoom: 1 };
const LOW_RES = 1280; // narrower than this looks soft on a full-width banner
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v) => Math.round(v * 10) / 10;

// Option groups, in the order an admin should look at them.
const GROUPS = [
  { title: 'Suggested', test: (o) => o.label === 'Steam banner art' || o.label === 'Current backdrop' },
  { title: 'Artwork', test: (o) => o.label.startsWith('Artwork') },
  { title: 'Screenshots', test: (o) => o.label.startsWith('Screenshot') },
];

// Header editor (administrators): choose the picture a game's headers use and frame it.
// - Picture: Steam banner art, the backdrop, artworks and screenshots the catalog already has, or any https image link.
// - Framing: drag the preview (or arrow keys / sliders) to move the focus point, and zoom in.
// - Preview: desktop banner or phone header, with the title and buttons where the real page puts them.
// "Back to automatic" removes the choice and the headers pick the best picture themselves again.
// Saved for everyone: game page, library page, profile banners, collections and the Home carousel.
export function HeaderEditor({ game, open, onOpenChange, onSaved }) {
  const [saving, setSaving] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      {/* keyed: every opening starts from the saved header, with fresh options */}
      {open && <EditorBody key={game?.id} game={game} onOpenChange={onOpenChange} onSaved={onSaved} saving={saving} setSaving={setSaving} />}
    </Dialog.Root>
  );
}

function EditorBody({ game, onOpenChange, onSaved, saving, setSaving }) {
  const [options, setOptions] = useState(null);
  const [error, setError] = useState(null);
  const [url, setUrl] = useState(null);
  const [frame, setFrame] = useState(DEFAULT_FRAME);
  const [device, setDevice] = useState('desktop');
  const [link, setLink] = useState('');
  const [broken, setBroken] = useState(() => new Set());
  const [size, setSize] = useState(null); // { url, w, h } of the picture in the preview

  useEffect(() => {
    if (!game?.id) return undefined;
    const ctrl = new AbortController();
    getHeaderOptions(game.id, { signal: ctrl.signal })
      .then((data) => {
        setOptions(data.options);
        if (data.current?.url) {
          setUrl(data.current.url);
          setFrame({ posX: data.current.posX, posY: data.current.posY, zoom: data.current.zoom });
        } else {
          setUrl(data.options[0]?.url ?? null);
        }
      })
      .catch((err) => {
        if (err?.code !== 'ERR_CANCELED') setError(getErrorInfo(err).message);
      });
    return () => ctrl.abort();
  }, [game?.id]);

  async function save(heroOverride) {
    setSaving(true);
    try {
      const updated = await updateAdminGame(game.id, { heroOverride });
      toast.success(heroOverride ? 'Header saved for everyone' : 'Header set back to automatic');
      onSaved?.(updated);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setSaving(false);
    }
  }

  function pick(next) {
    setUrl(next);
    setFrame(DEFAULT_FRAME);
  }

  function useLink(e) {
    e.preventDefault();
    const value = link.trim();
    if (!/^https:\/\/\S+$/.test(value)) {
      toast.error('Paste a full image link that starts with https://');
      return;
    }
    pick(value);
    setLink('');
  }

  const shown = (options ?? []).filter((o) => !broken.has(o.url));
  const groups = GROUPS.map((g) => ({ ...g, items: shown.filter(g.test) })).filter((g) => g.items.length);
  const known = size?.url === url ? size : null;
  const lowRes = known && known.w < LOW_RES;

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" />
      <Dialog.Content onOpenAutoFocus={(e) => e.preventDefault()} className="fixed left-1/2 top-1/2 z-50 flex h-[min(94vh,660px)] w-[min(96vw,1060px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[16px] border border-border bg-surface text-text shadow-2xl focus:outline-none">
        {/* ── Title bar ── */}
        <header className="flex items-center gap-3 border-b border-border px-5 py-3">
          <div className="min-w-0 flex-1">
            <Dialog.Title className="truncate font-heading text-base font-bold">
              <span className="font-medium text-text-muted">Edit header · </span>
              {game?.title}
            </Dialog.Title>
            <Dialog.Description className="text-xs text-text-muted">Pick a picture and frame it. Saved for everyone, on every header that shows this game.</Dialog.Description>
          </div>
          <Dialog.Close className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text" aria-label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </Dialog.Close>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden">
          {/* ── Preview + framing ── */}
          <section aria-label="Preview" className="flex min-w-0 flex-col gap-3 p-4 sm:p-5 lg:min-h-0 lg:overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div role="radiogroup" aria-label="Preview size" className="flex rounded-full border border-border bg-bg p-0.5">
                {[
                  ['desktop', 'Desktop', Monitor],
                  ['phone', 'Phone', Smartphone],
                ].map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={device === value}
                    onClick={() => setDevice(value)}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text',
                      device === value ? 'bg-text text-bg' : 'text-text-muted hover:text-text',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>
              {known && (
                <span className={cn('inline-flex items-center gap-1 text-xs tabular-nums', lowRes ? 'font-semibold text-[#B8420E]' : 'text-text-muted')}>
                  {lowRes && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                  {known.w} × {known.h}px{lowRes ? ' · may look blurry' : ''}
                </span>
              )}
            </div>

            {error ? (
              <p role="alert" className="rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</p>
            ) : (
              // One stage of fixed height: switching desktop/phone doesn't move anything else
              <div className="flex h-[200px] items-center justify-center rounded-card bg-[#ECE7DA] p-3 lg:h-auto lg:min-h-[200px] lg:flex-1">
                {!options ? (
                  <Loader2 className="h-6 w-6 animate-spin text-text-muted" aria-label="Loading pictures" />
                ) : (
                  <FramePreview
                    url={url}
                    frame={frame}
                    title={game?.title}
                    onFrame={setFrame}
                    phone={device === 'phone'}
                    onSize={(w, h) => setSize({ url, w, h })}
                  />
                )}
              </div>
            )}

            <div className="grid gap-x-5 gap-y-3 rounded-card border border-border bg-bg/60 p-4 sm:grid-cols-3">
              <Slider label="Zoom" value={frame.zoom} min={1} max={2.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(zoom) => setFrame((f) => ({ ...f, zoom }))} />
              <Slider label="Left – right" value={frame.posX} min={0} max={100} step={1} format={(v) => `${Math.round(v)}%`} onChange={(posX) => setFrame((f) => ({ ...f, posX }))} />
              <Slider label="Top – bottom" value={frame.posY} min={0} max={100} step={1} format={(v) => `${Math.round(v)}%`} onChange={(posY) => setFrame((f) => ({ ...f, posY }))} />
              <div className="flex items-center justify-between gap-3 sm:col-span-3">
                <p className="flex items-center gap-1.5 text-xs text-text-muted">
                  <Move className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Drag the preview or use the arrow keys. Keep key art clear of the title.
                </p>
                <button
                  type="button"
                  onClick={() => setFrame(DEFAULT_FRAME)}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-text-muted hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset framing
                </button>
              </div>
            </div>
          </section>

          {/* ── Picture choice ── */}
          <section aria-label="Pictures" className="flex flex-col border-t border-border bg-bg/40 lg:min-h-0 lg:border-l lg:border-t-0">
            <div className="px-4 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <div role="radiogroup" aria-label="Header picture" className="flex flex-col gap-4">
                {groups.map((g) => (
                  <div key={g.title} className="flex flex-col gap-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
                      {g.title} <span className="font-medium tabular-nums">· {g.items.length}</span>
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {g.items.map((o) => (
                        <Thumb key={o.url} option={o} on={o.url === url} onPick={() => pick(o.url)} onBroken={() => setBroken((b) => new Set(b).add(o.url))} />
                      ))}
                    </div>
                  </div>
                ))}
                {options && !shown.length && <p className="text-sm text-text-muted">This game has no pictures yet. Paste an image link below.</p>}
                {!options && !error && (
                  <div className="grid grid-cols-2 gap-2">
                    {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="aspect-video animate-pulse rounded-[8px] bg-surface-raised" />)}
                  </div>
                )}
              </div>
            </div>
            <form onSubmit={useLink} className="flex flex-col gap-1.5 border-t border-border px-4 py-3">
              <label htmlFor="header-link" className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-muted">
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Or use an image link
              </label>
              <div className="flex gap-1.5">
                <input
                  id="header-link"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://…/wide-banner.jpg"
                  className="h-9 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-sm focus:border-text focus:outline-none"
                />
                <Button type="submit" variant="secondary" className="h-9 px-3">Use</Button>
              </div>
            </form>
          </section>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={() => save(null)} disabled={saving} className="h-10 px-3">
            <span className="hidden sm:inline">Back to automatic</span><span className="sm:hidden">Automatic</span>
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving} className="h-10">Cancel</Button>
            <Button
              onClick={() => save({ url, posX: round(frame.posX), posY: round(frame.posY), zoom: Math.round(frame.zoom * 100) / 100 })}
              disabled={saving || !url}
              className="h-10"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              Save header
            </Button>
          </div>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

// A picture option: a proper 16:9 thumbnail with its name underneath (never covering the picture).
function Thumb({ option, on, onPick, onBroken }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={option.label}
      onClick={onPick}
      className="group flex min-w-0 flex-col gap-1 rounded-[10px] p-1 text-left transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text"
    >
      <span className={cn('relative block aspect-video w-full overflow-hidden rounded-[7px] bg-surface-raised ring-offset-2 ring-offset-bg', on ? 'ring-2 ring-text' : 'ring-1 ring-border')}>
        <img src={option.preview} alt="" loading="lazy" onError={onBroken} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
        {option.source === 'steam' && <span className="absolute left-1 top-1 rounded bg-black/65 px-1 text-[9px] font-bold uppercase tracking-wide text-white">Steam</span>}
        {on && (
          <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-text text-bg">
            <Check className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className={cn('truncate px-0.5 text-[11px] font-semibold', on ? 'text-text' : 'text-text-muted')}>{option.label}</span>
    </button>
  );
}

// The header as the page draws it (picture, dark scrim, title and buttons). Drag or arrow keys move the picture.
function FramePreview({ url, frame, title, onFrame, phone, onSize }) {
  const box = useRef(null);
  const drag = useRef(null);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: frame };
  };
  const onPointerMove = (e) => {
    if (!drag.current || !box.current) return;
    const rect = box.current.getBoundingClientRect();
    // dragging the picture right shows more of its left side: the focus point moves the other way
    const dx = ((e.clientX - drag.current.x) / rect.width) * 100;
    const dy = ((e.clientY - drag.current.y) / rect.height) * 100;
    const start = drag.current.start;
    onFrame((f) => ({ ...f, posX: clamp(start.posX - dx, 0, 100), posY: clamp(start.posY - dy, 0, 100) }));
  };
  const end = () => {
    drag.current = null;
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 10 : 2;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    onFrame((f) => ({ ...f, posX: clamp(f.posX + m[0], 0, 100), posY: clamp(f.posY + m[1], 0, 100) }));
  };

  return (
    <div
      ref={box}
      role="application"
      aria-label="Header preview. Drag or use the arrow keys to move the picture."
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      className={cn(
        'group/preview relative isolate cursor-grab touch-none select-none overflow-hidden bg-[#111311] shadow-lg active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text focus-visible:ring-offset-2',
        phone ? 'h-full aspect-[9/16] rounded-[18px] ring-4 ring-[#111311]' : 'aspect-[16/5] w-full rounded-[10px]',
      )}
    >
      {url && (
        <img
          key={url}
          src={url}
          alt=""
          draggable={false}
          onLoad={(e) => onSize?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={heroFrameStyle(frame)}
        />
      )}
      <div aria-hidden="true" className={cn('absolute inset-0', phone ? 'bg-gradient-to-t from-black/90 via-black/30 to-black/10' : 'bg-gradient-to-r from-black/85 via-black/45 via-50% to-transparent')} />
      <div aria-hidden="true" className={cn('absolute flex flex-col', phone ? 'inset-x-3 bottom-4 gap-1.5' : 'bottom-[13%] left-[4.5%] max-w-[50%] gap-2')}>
        <span className={cn('font-heading font-bold leading-[0.95] text-white', phone ? 'text-base' : 'text-[clamp(1rem,2.6vw,1.9rem)]')}>{title}</span>
        <span className="flex gap-1.5">
          <span className={cn('rounded-full bg-[var(--accent)]', phone ? 'h-4 w-14' : 'h-5 w-20')} />
          <span className={cn('rounded-full border border-white/40 bg-white/10', phone ? 'h-4 w-12' : 'h-5 w-16')} />
        </span>
      </div>
      <span
        aria-hidden="true"
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white/85 opacity-0 backdrop-blur-sm transition-opacity group-hover/preview:opacity-100"
      >
        <Move className="h-3 w-3" /> Drag
      </span>
    </div>
  );
}

function Slider({ label, value, min, max, step, format, onChange }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold">
      <span className="flex justify-between gap-2">
        {label}
        <span className="tabular-nums text-text-muted">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="gq-range w-full" style={{ '--p': `${((value - min) / (max - min)) * 100}%` }} />
    </label>
  );
}

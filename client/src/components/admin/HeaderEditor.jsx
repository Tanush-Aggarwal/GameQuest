import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Crosshair, ImagePlus, Link2, Loader2, Monitor, RotateCcw, Smartphone, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { getHeaderOptions, updateAdminGame } from '@/services/adminApi.js';
import { getErrorInfo } from '@/services/api.js';
import { heroFrameStyle } from '@/lib/heroFrame.js';
import { cn } from '@/lib/utils.js';

const DEFAULT_FRAME = { posX: 50, posY: 30, zoom: 1 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v) => Math.round(v * 10) / 10;

// Header editor (administrators): choose the picture a game's headers use and frame it.
// - Picture: Steam banner art, the backdrop, artworks and screenshots the catalog already has, or any https image link.
// - Framing: drag the preview (or use the sliders / arrow keys) to move the focus point, and zoom in.
// - Preview: the desktop banner and the phone header side by side, with the title where the real page puts it.
// "Automatic" removes the choice and the headers go back to picking the best picture themselves.
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
  const [link, setLink] = useState('');
  const [broken, setBroken] = useState(() => new Set());

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
          setFrame(DEFAULT_FRAME);
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

  function useLink(e) {
    e.preventDefault();
    const value = link.trim();
    if (!/^https:\/\/\S+$/.test(value)) {
      toast.error('Paste a full image link that starts with https://');
      return;
    }
    setUrl(value);
    setFrame(DEFAULT_FRAME);
    setLink('');
  }

  const shown = (options ?? []).filter((o) => !broken.has(o.url));

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[94vh] w-[min(96vw,1100px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[18px] border border-border bg-surface text-text shadow-2xl focus:outline-none">
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Admin · Header editor</p>
            <Dialog.Title className="font-heading text-xl font-bold">{game?.title}</Dialog.Title>
            <Dialog.Description className="text-sm text-text-muted">
              Pick a picture and frame it. Saved for everyone, on every header that shows this game.
            </Dialog.Description>
          </div>
          <Dialog.Close className="rounded-full p-2 text-text-muted hover:bg-surface-raised hover:text-text" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </Dialog.Close>
        </header>

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ── Preview + framing ── */}
          <section aria-label="Preview" className="flex min-w-0 flex-col gap-4">
            {error ? (
              <p role="alert" className="rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</p>
            ) : !options ? (
              <div className="flex aspect-[16/5] items-center justify-center rounded-card bg-[#111311] text-white/70">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                <span className="sr-only">Loading pictures</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
                  <Monitor className="h-4 w-4" aria-hidden="true" /> Desktop header
                </div>
                <FramePreview url={url} frame={frame} title={game?.title} onFrame={setFrame} aspect="aspect-[16/5]" interactive />
                <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
                      <Smartphone className="h-4 w-4" aria-hidden="true" /> Phone
                    </div>
                    <FramePreview url={url} frame={frame} title={game?.title} aspect="aspect-[4/5]" compact />
                  </div>
                  <div className="flex flex-col gap-4 rounded-card border border-border bg-bg/60 p-4">
                    <Slider label="Zoom" value={frame.zoom} min={1} max={2.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(zoom) => setFrame((f) => ({ ...f, zoom }))} />
                    <Slider label="Focus left – right" value={frame.posX} min={0} max={100} step={1} format={(v) => `${Math.round(v)}%`} onChange={(posX) => setFrame((f) => ({ ...f, posX }))} />
                    <Slider label="Focus top – bottom" value={frame.posY} min={0} max={100} step={1} format={(v) => `${Math.round(v)}%`} onChange={(posY) => setFrame((f) => ({ ...f, posY }))} />
                    <p className="flex items-start gap-1.5 text-xs text-text-muted">
                      <Crosshair className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Drag the desktop preview to move the picture. Keep faces and key art clear of the title on the left.
                    </p>
                    <Button variant="ghost" className="self-start" onClick={() => setFrame(DEFAULT_FRAME)}>
                      <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset framing
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* ── Picture choice ── */}
          <section aria-label="Pictures" className="flex min-w-0 flex-col gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ImagePlus className="h-4 w-4 text-text-muted" aria-hidden="true" /> Choose a picture
            </h3>
            <div role="radiogroup" aria-label="Header picture" className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto p-0.5">
              {shown.map((o) => {
                const on = o.url === url;
                return (
                  <button
                    key={o.url}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setUrl(o.url);
                      setFrame(DEFAULT_FRAME);
                    }}
                    className={cn(
                      'group relative overflow-hidden rounded-[10px] border-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text',
                      on ? 'border-[var(--accent)]' : 'border-transparent hover:border-border',
                    )}
                  >
                    <img
                      src={o.preview}
                      alt=""
                      loading="lazy"
                      onError={() => setBroken((b) => new Set(b).add(o.url))}
                      className="aspect-video w-full bg-surface-raised object-cover"
                    />
                    <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-5 text-[11px] font-semibold text-white">
                      <span className="truncate">{o.label}</span>
                      {o.source === 'steam' && <span className="rounded bg-white/15 px-1 text-[10px]">Steam</span>}
                    </span>
                    {on && (
                      <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                );
              })}
              {options && !shown.length && <p className="col-span-2 text-sm text-text-muted">This game has no pictures yet. Paste an image link below.</p>}
            </div>
            <form onSubmit={useLink} className="flex flex-col gap-1.5">
              <label htmlFor="header-link" className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Or use an image link
              </label>
              <div className="flex gap-2">
                <input
                  id="header-link"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://…/banner.jpg"
                  className="min-w-0 flex-1 rounded-control border border-border bg-bg px-3 py-2 text-sm focus:border-text focus:outline-none"
                />
                <Button type="submit" variant="secondary">Use</Button>
              </div>
              <p className="text-[11px] text-text-muted">Wide images (at least 1600 px across) look best.</p>
            </form>
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-bg/60 px-6 py-3">
          <Button variant="ghost" onClick={() => save(null)} disabled={saving}>
            <Sparkles className="h-4 w-4" aria-hidden="true" /> Back to automatic
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button
              onClick={() => save({ url, posX: round(frame.posX), posY: round(frame.posY), zoom: Math.round(frame.zoom * 100) / 100 })}
              disabled={saving || !url}
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

// The header as the page draws it (picture, dark scrim, title on the left). The desktop one can be dragged.
function FramePreview({ url, frame, title, onFrame, aspect, interactive = false, compact = false }) {
  const box = useRef(null);
  const drag = useRef(null);

  const onPointerDown = (e) => {
    if (!interactive) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: frame };
  };
  const onPointerMove = (e) => {
    if (!drag.current || !box.current) return;
    const rect = box.current.getBoundingClientRect();
    // dragging the picture right shows more of its left side: the focus point moves the other way
    const dx = ((e.clientX - drag.current.x) / rect.width) * 100;
    const dy = ((e.clientY - drag.current.y) / rect.height) * 100;
    onFrame((f) => ({ ...f, posX: clamp(drag.current.start.posX - dx, 0, 100), posY: clamp(drag.current.start.posY - dy, 0, 100) }));
  };
  const end = () => {
    drag.current = null;
  };
  const onKeyDown = (e) => {
    if (!interactive) return;
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
      role={interactive ? 'application' : undefined}
      aria-label={interactive ? 'Header preview. Drag or use the arrow keys to move the picture.' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      className={cn(
        'relative isolate overflow-hidden rounded-card bg-[#111311] select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        aspect,
        interactive && 'cursor-grab active:cursor-grabbing touch-none',
      )}
    >
      {url && <img src={url} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={heroFrameStyle(frame)} />}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 via-55% to-transparent" />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div aria-hidden="true" className={cn('absolute flex flex-col gap-1.5', compact ? 'inset-x-3 bottom-3' : 'bottom-[14%] left-[5%] max-w-[55%]')}>
        <span className={cn('font-heading font-bold leading-tight text-white', compact ? 'text-sm' : 'text-2xl sm:text-3xl')}>{title}</span>
        {!compact && <span className="h-7 w-28 rounded-full" style={{ background: 'var(--accent)' }} />}
      </div>
      {interactive && (
        <span aria-hidden="true" className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white/85 backdrop-blur-sm">
          Drag to reposition
        </span>
      )}
    </div>
  );
}

function Slider({ label, value, min, max, step, format, onChange }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-semibold">
      <span className="flex justify-between">
        {label}
        <span className="tabular-nums text-text-muted">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-[#151713]" />
    </label>
  );
}

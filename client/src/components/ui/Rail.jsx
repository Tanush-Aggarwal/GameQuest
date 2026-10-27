import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils.js';

// A horizontal row of cards that scrolls with snap points and no native scrollbar. On pointer devices there are
// labelled arrow buttons (hidden when the row does not overflow, disabled at its ends); on touch the row swipes.
// Children are <li> elements.
export function Rail({ label, children, className }) {
  const list = useRef(null);
  const [edges, setEdges] = useState({ overflow: false, left: false, right: false });
  const count = Array.isArray(children) ? children.length : 1;

  const measure = useCallback(() => {
    const el = list.current;
    if (!el) return;
    setEdges({
      overflow: el.scrollWidth > el.clientWidth + 1,
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = list.current;
    if (!el) return undefined;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [measure, count]);

  function scrollBy(direction) {
    const el = list.current;
    if (!el?.scrollBy) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduced ? 'auto' : 'smooth' });
  }

  const arrow = 'absolute top-1/3 z-10 hidden h-11 w-11 items-center justify-center rounded-full border border-border bg-bg/90 text-text shadow-lg hover:border-accent disabled:opacity-0 md:flex';
  return (
    <div className="group/rail relative">
      {/* padding with a matching negative margin: focus rings, hover lifts and shadows are not clipped by the scroll box */}
      <ul ref={list} aria-label={label} className={cn('scrollbar-none -m-2 flex snap-x snap-mandatory gap-4 overflow-x-auto p-2 pb-3', className)}>
        {children}
      </ul>
      {edges.overflow && (
        <>
          <button type="button" aria-label={`Scroll ${label} left`} onClick={() => scrollBy(-1)} disabled={!edges.left} className={cn(arrow, '-left-3')}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" aria-label={`Scroll ${label} right`} onClick={() => scrollBy(1)} disabled={!edges.right} className={cn(arrow, '-right-3')}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
import { useEffect, useRef } from 'react';

// Calls `onMore` when the returned sentinel comes within `margin` of the viewport, like a store page that keeps
// loading as you scroll. `enabled` is false while a page is loading or when there is nothing left.
// Returns { ref, supported }: without IntersectionObserver (old browsers, tests) the caller shows a button instead.
export function useInfiniteScroll(onMore, { enabled, margin = '900px' } = {}) {
  const ref = useRef(null);
  const latest = useRef(onMore);
  useEffect(() => {
    latest.current = onMore;
  });
  const supported = typeof window !== 'undefined' && 'IntersectionObserver' in window;

  useEffect(() => {
    const node = ref.current;
    if (!supported || !enabled || !node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) latest.current();
      },
      { rootMargin: `0px 0px ${margin} 0px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, margin, supported]);

  return { ref, supported };
}

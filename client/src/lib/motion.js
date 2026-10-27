import { useReducedMotion } from 'framer-motion';

// Every animation that moves or fades big things is gated by this: false when the viewer asked for reduced motion.
export function useMotionOk() {
  return !useReducedMotion();
}

export const PAGE_TRANSITION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: 'easeOut' },
};

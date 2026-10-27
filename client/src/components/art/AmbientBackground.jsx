import { AnimatePresence, motion } from 'framer-motion';
import { artImageUrl } from '@/lib/art.js';
import { useMotionOk } from '@/lib/motion.js';
import { useAmbient } from './ambientContext.js';

// A dim, blurred wash of the current game's art behind the whole app. It crossfades when the game changes
// (instantly under reduced motion) and is purely decorative.
export function AmbientBackground() {
  const { current } = useAmbient();
  const motionOk = useMotionOk();
  const url = artImageUrl(current?.backdrop, 'backdrop') ?? artImageUrl(current?.cover, 'cover');
  const fade = { duration: motionOk ? 0.6 : 0 };
  return (
    <div aria-hidden="true" data-ambient={url ? 'on' : 'off'} className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg">
      <AnimatePresence initial={false}>
        {url && (
          <motion.img
            key={url}
            src={url}
            alt=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.28 }}
            exit={{ opacity: 0 }}
            transition={fade}
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
          />
        )}
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-b from-bg/60 via-bg/80 to-bg" />
    </div>
  );
}

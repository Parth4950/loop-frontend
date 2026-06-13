/** Shared framer-motion variants so motion across the app reads as one hand. */

import type { Transition, Variants } from "framer-motion";

/** One spring, used everywhere so motion feels like a single hand. */
const spring: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 30,
  mass: 0.8,
};

/** A calm, premium ease for fades and rises. */
const ease: Transition = { duration: 0.5, ease: [0.22, 0.61, 0.36, 1] };

/** Subtle scale + rise. For cards, panels, anything that "arrives". */
export const springIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: spring },
};

/** Plain rise + fade. For text, rows, list items. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: ease },
};

/**
 * Container variant that orchestrates a list: children inherit `hidden`
 * / `visible` and reveal in sequence. Pair with `fadeUp` or `springIn`
 * on the children.
 */
export function stagger(staggerChildren = 0.06, delayChildren = 0): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren, delayChildren } },
  };
}

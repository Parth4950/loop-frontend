"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

/** Animate a number from its previously shown value up to `value`. */
export function useCountUp(value: number, duration = 1) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const reduce = useReducedMotion();

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: reduce ? 0 : duration,
      ease: [0.22, 0.61, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduce, duration]);

  return display;
}

const groupedInt = (n: number) => Math.round(n).toLocaleString("en-US");

/** A bare counting-up number. Compose freely with your own type styles. */
export function CountUp({
  value,
  format = groupedInt,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const display = useCountUp(value);
  return <span className={className}>{format(display)}</span>;
}

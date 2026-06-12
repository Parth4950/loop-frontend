"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface RingProps {
  /** Progress 0–1, e.g. an agent confidence score. */
  value: number;
  size?: number;
  stroke?: number;
  /** Show the rounded percentage in the center. */
  showLabel?: boolean;
  className?: string;
}

/** Animated circular progress ring in gold — for confidence %. */
export function Ring({
  value,
  size = 88,
  stroke = 8,
  showLabel = true,
  className,
}: RingProps) {
  const reduce = useReducedMotion();
  const [progress, setProgress] = useState(reduce ? value : 0);
  const prev = useRef(reduce ? value : 0);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: reduce ? 0 : 1.1,
      ease: [0.22, 0.61, 0.36, 1],
      onUpdate: (v) => setProgress(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-live)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
        />
      </svg>
      {showLabel && (
        <span className="absolute font-mono text-sm font-medium tabular-nums text-ink">
          {Math.round(clamped * 100)}%
        </span>
      )}
    </div>
  );
}

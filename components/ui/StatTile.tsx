"use client";

import { cn } from "@/lib/utils";
import { Eyebrow } from "./Eyebrow";
import { useCountUp } from "./CountUp";

export interface StatTileProps {
  label: string;
  value: number;
  /** Format the displayed number. Defaults to a grouped integer. */
  format?: (n: number) => string;
  /** Render the figure in mono — for live counters / rates / timestamps. */
  mono?: boolean;
  /** A CSS color for a small dot beside the label, e.g. a status color. */
  accent?: string;
  className?: string;
}

const groupedInt = (n: number) => Math.round(n).toLocaleString("en-US");

/** Small muted label over a large display-type figure that counts up. */
export function StatTile({
  label,
  value,
  format = groupedInt,
  mono = false,
  accent,
  className,
}: StatTileProps) {
  const display = useCountUp(value);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1.5">
        {accent && (
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
            aria-hidden
          />
        )}
        <Eyebrow>{label}</Eyebrow>
      </div>
      <span
        className={cn(
          "text-3xl leading-none tabular-nums text-ink",
          mono ? "font-mono tracking-tight" : "font-display font-medium",
        )}
      >
        {format(display)}
      </span>
    </div>
  );
}

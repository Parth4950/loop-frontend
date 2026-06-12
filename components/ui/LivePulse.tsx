import { cn } from "@/lib/utils";

/**
 * A small gold dot with a soft pulsing halo — the product's one signal of
 * "live / thinking / active". The halo is CSS-driven and honors
 * prefers-reduced-motion (it collapses via the global reduce rule).
 */
export function LivePulse({
  size = 8,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className="absolute inset-0 rounded-full bg-live/50 [animation:var(--animate-halo)]"
      />
      <span className="relative inline-block size-full rounded-full bg-live" />
    </span>
  );
}

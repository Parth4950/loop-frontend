import { cn } from "@/lib/utils";
import type { Channel } from "@/lib/api";

/**
 * A neutral pill for a delivery channel. A channel isn't a message status,
 * so it deliberately doesn't use the status Badge — same shape, kept within
 * the neutral token palette.
 */
export function ChannelPill({
  channel,
  className,
}: {
  channel: Channel;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border border-line px-2.5 py-1",
        "font-mono text-[11px] font-medium uppercase tracking-wide text-ink",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-ink/40" aria-hidden />
      {channel}
    </span>
  );
}

import { cn } from "@/lib/utils";
import type { MessageStatus } from "@/lib/api";

/**
 * Per-status classes written out in full so Tailwind keeps them. Each is a
 * soft tint of the status color, that color's text, and a matching dot.
 * Labels are mono so streaming rows stay column-aligned.
 */
const STATUS: Record<MessageStatus, { wrap: string; dot: string; label: string }> = {
  queued: { wrap: "bg-queued/12 text-queued", dot: "bg-queued", label: "queued" },
  sent: { wrap: "bg-sent/12 text-sent", dot: "bg-sent", label: "sent" },
  delivered: { wrap: "bg-delivered/12 text-delivered", dot: "bg-delivered", label: "delivered" },
  read: { wrap: "bg-read/12 text-read", dot: "bg-read", label: "read" },
  opened: { wrap: "bg-opened/12 text-opened", dot: "bg-opened", label: "opened" },
  clicked: { wrap: "bg-clicked/12 text-clicked", dot: "bg-clicked", label: "clicked" },
  converted: { wrap: "bg-converted/12 text-converted", dot: "bg-converted", label: "converted" },
  failed: { wrap: "bg-failed/12 text-failed", dot: "bg-failed", label: "failed" },
  retrying: { wrap: "bg-retrying/14 text-retrying", dot: "bg-retrying", label: "retrying" },
};

export function Badge({
  status,
  className,
}: {
  status: MessageStatus;
  className?: string;
}) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        "font-mono text-[11px] font-medium uppercase tracking-wide",
        s.wrap,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

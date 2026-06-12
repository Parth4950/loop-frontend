import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Roomy by default; set false for a denser cell. */
  padded?: boolean;
}

/** Surface panel — 1px line border, 20px radius, soft layered shadow. */
export function Card({ padded = true, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface shadow-soft",
        padded && "p-6",
        className,
      )}
      {...props}
    />
  );
}

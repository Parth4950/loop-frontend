import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  // Ink button — the one loud-ish action on a view.
  primary: "bg-ink text-surface hover:bg-ink/90 active:bg-ink",
  // Quiet bordered button on surface.
  secondary:
    "bg-surface text-ink border border-line hover:bg-canvas active:bg-line/40",
  // Chromeless.
  ghost: "bg-transparent text-ink hover:bg-line/40 active:bg-line/60",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-medium",
        "transition-colors duration-200 ease-out outline-none",
        "focus-visible:ring-2 focus-visible:ring-live/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = "Button";

import { cn } from "@/lib/utils";

/**
 * AutoSage AI logo — shield silhouette housing a car profile bisected by a
 * diagnostic scan line. Pure SVG so it inherits currentColor and scales
 * crisply at every size. Use `className` to control text/stroke color.
 */
export function AutoSageLogo({
  className,
  withScanGlow = true,
}: {
  className?: string;
  withScanGlow?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-6 w-6", className)}
      aria-hidden="true"
    >
      {/* Shield outline — trust + authority */}
      <path
        d="M16 2.5 4.5 6.2v9.1c0 6.6 4.6 12.4 11.5 14.2 6.9-1.8 11.5-7.6 11.5-14.2V6.2L16 2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity="0.95"
      />
      {/* Car silhouette inside the shield */}
      <path
        d="M9.5 19.5h13M11 19.5l1.4-3.2c.3-.7 1-1.1 1.7-1.1h3.8c.7 0 1.4.4 1.7 1.1l1.4 3.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="20.6" r="1.15" fill="currentColor" />
      <circle cx="19" cy="20.6" r="1.15" fill="currentColor" />
      {/* Scan line — AI / diagnostic intelligence */}
      <line
        x1="7"
        y1="12.5"
        x2="25"
        y2="12.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity={withScanGlow ? 0.9 : 0.7}
      />
      <circle cx="25" cy="12.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

/**
 * Logo lockup — mark + wordmark. Used in the auth hero and marketing surfaces.
 */
export function AutoSageLockup({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: { box: "h-8 w-8", text: "text-sm" },
    md: { box: "h-10 w-10", text: "text-base" },
    lg: { box: "h-14 w-14", text: "text-xl" },
  } as const;
  const s = sizes[size];
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center rounded-xl border border-primary/40 bg-card text-primary",
          "shadow-[0_0_0_1px_oklch(1_0_0/0.04)_inset,0_8px_24px_-12px_oklch(0_0_0/0.6)]",
          s.box,
        )}
      >
        <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/15 to-transparent" />
        <AutoSageLogo className="relative h-[58%] w-[58%]" />
      </div>
      <div className="flex flex-col leading-none">
        <span className={cn("font-bold tracking-tight text-foreground", s.text)}>
          AutoSage<span className="text-primary"> AI</span>
        </span>
        <span className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Automotive Intelligence
        </span>
      </div>
    </div>
  );
}

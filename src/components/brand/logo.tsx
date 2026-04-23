import { cn } from "@/lib/utils";
import iconUrl from "@/assets/app-icon.png";

/**
 * AutoSage AI app mark — uses the generated app-icon asset for premium,
 * App Store-quality branding. Falls back to a clean rounded container so it
 * looks correct at any size.
 */
export function AutoSageLogo({ className }: { className?: string }) {
  return (
    <img
      src={iconUrl}
      alt="AutoSage AI"
      width={64}
      height={64}
      className={cn("h-6 w-6 select-none rounded-[22%] object-cover", className)}
      draggable={false}
    />
  );
}

/**
 * Logo lockup — mark + wordmark. Used on the auth hero and marketing surfaces.
 */
export function AutoSageLockup({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: { box: "h-9 w-9", text: "text-sm" },
    md: { box: "h-11 w-11", text: "text-base" },
    lg: { box: "h-14 w-14", text: "text-xl" },
  } as const;
  const s = sizes[size];
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <AutoSageLogo className={cn(s.box, "shadow-[0_8px_24px_-12px_oklch(0_0_0/0.6)]")} />
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

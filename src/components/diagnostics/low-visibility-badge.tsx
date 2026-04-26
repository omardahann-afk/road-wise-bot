import { AlertTriangle, Eye, Hand } from "lucide-react";
import type { SurfaceVisibility } from "@/lib/camera-visibility";

/** Floating warning chip shown over the camera viewfinder when surface
 * conditions hide damage. Honest signal — not a "no damage" claim.
 * On "low" visibility we explicitly recommend manual confirmation. */
export function LowVisibilityBadge({ visibility }: { visibility: SurfaceVisibility | null }) {
  if (!visibility || visibility.level === "good") return null;
  const isLow = visibility.level === "low";
  const tone = isLow
    ? "border-warning/60 bg-warning/15 text-warning"
    : "border-primary/40 bg-primary/15 text-primary";
  const Icon = isLow ? AlertTriangle : Eye;
  return (
    <div className="pointer-events-none absolute left-1/2 bottom-3 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5">
      <div
        className={`flex max-w-[20rem] items-center gap-2 rounded-full border-2 ${tone} bg-background/85 px-3 py-1.5 text-[11px] font-bold shadow-decision backdrop-blur-md`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="whitespace-normal leading-tight">{visibility.reason}</span>
      </div>
      {isLow && (
        <div className="flex items-center gap-1.5 rounded-full border border-warning/50 bg-background/85 px-2.5 py-1 text-[10px] font-bold text-warning shadow-decision backdrop-blur-md">
          <Hand className="h-3 w-3" />
          <span>Manual confirmation recommended</span>
        </div>
      )}
    </div>
  );
}

import {
  ArrowLeft, ArrowRight, ArrowUp, ArrowDown, ZoomIn, ZoomOut,
  Hand, Sun, SunDim, CloudSun, Crosshair, Check, Eye, AlertCircle,
} from "lucide-react";
import type { CoachingHint } from "@/lib/camera-coaching";

/**
 * Camera-overlay coaching banner. Renders an animated directional cue
 * + message at the top of the camera viewport, plus a target reticle.
 */
export function CoachingOverlay({ hint }: { hint: CoachingHint | null }) {
  if (!hint) return null;
  const Icon = iconFor(hint.direction);
  const tone =
    hint.tone === "good"
      ? "border-success/60 bg-success/15 text-success"
      : hint.tone === "warn"
      ? "border-warning/60 bg-warning/15 text-warning"
      : "border-destructive/60 bg-destructive/20 text-destructive";

  return (
    <>
      {/* Top coaching banner */}
      <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
        <div className={`flex items-center gap-2 rounded-full border-2 ${tone} bg-background/80 px-3 py-1.5 text-xs font-bold shadow-decision backdrop-blur-md`}>
          <Icon className={`h-4 w-4 ${hint.tone === "warn" ? "animate-pulse" : ""}`} />
          <span className="whitespace-nowrap">{hint.message}</span>
        </div>
      </div>

      {/* Center target reticle for closeup framing */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className={`h-28 w-28 rounded-full border-2 transition-all ${
            hint.tone === "good"
              ? "border-success/70 shadow-[0_0_30px_-8px_oklch(0.70_0.18_152/0.7)]"
              : hint.tone === "warn"
              ? "border-warning/40"
              : "border-destructive/40 animate-pulse"
          }`}
        >
          <div
            className={`h-full w-full rounded-full border ${
              hint.tone === "good" ? "border-success/30" : "border-transparent"
            }`}
          />
        </div>
      </div>

      {/* Edge directional arrows for movement hints */}
      {hint.direction === "move_left" && (
        <ArrowEdge side="left" tone={hint.tone} />
      )}
      {hint.direction === "move_right" && (
        <ArrowEdge side="right" tone={hint.tone} />
      )}
      {hint.direction === "tilt_up" && (
        <ArrowEdge side="top" tone={hint.tone} />
      )}
      {hint.direction === "tilt_down" && (
        <ArrowEdge side="bottom" tone={hint.tone} />
      )}
    </>
  );
}

function ArrowEdge({ side, tone }: { side: "left" | "right" | "top" | "bottom"; tone: CoachingHint["tone"] }) {
  const Icon = side === "left" ? ArrowLeft : side === "right" ? ArrowRight : side === "top" ? ArrowUp : ArrowDown;
  const pos =
    side === "left" ? "left-3 top-1/2 -translate-y-1/2"
    : side === "right" ? "right-3 top-1/2 -translate-y-1/2"
    : side === "top" ? "top-12 left-1/2 -translate-x-1/2"
    : "bottom-3 left-1/2 -translate-x-1/2";
  const color = tone === "good" ? "text-success" : tone === "warn" ? "text-warning" : "text-destructive";
  return (
    <div className={`pointer-events-none absolute z-10 ${pos} animate-pulse`}>
      <Icon className={`h-10 w-10 ${color} drop-shadow-[0_0_8px_currentColor]`} />
    </div>
  );
}

function iconFor(d: CoachingHint["direction"]) {
  switch (d) {
    case "move_closer": return ZoomIn;
    case "step_back": return ZoomOut;
    case "move_left": return ArrowLeft;
    case "move_right": return ArrowRight;
    case "tilt_up": return ArrowUp;
    case "tilt_down": return ArrowDown;
    case "hold_steady": return Hand;
    case "improve_lighting": return Sun;
    case "overexposed": return SunDim;
    case "glare": return SunDim;
    case "move_to_shade": return CloudSun;
    case "center_panel": return Crosshair;
    case "good_view": return Check;
    case "looking": return Eye;
    default:
      return AlertCircle;
  }
}

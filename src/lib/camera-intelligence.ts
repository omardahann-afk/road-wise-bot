// AutoSage AI — Camera Intelligence layer.
// Builds on top of camera-coaching.ts. Camera-coaching tells the user how to
// move the phone; camera-intelligence interprets WHAT is in the frame in
// automotive terms (panel category, possible surface issue, confidence).
//
// Deterministic. Runs every detection tick. Never overrides AI findings —
// instead surfaces "candidate" findings the user can confirm with one tap.

import type { Finding } from "@/lib/valuation";
import type { SurfaceVisibility } from "@/lib/camera-visibility";

export type AutoCategory =
  | "engine_bay"
  | "body_panel"
  | "wheel"
  | "interior"
  | "dashboard"
  | "unknown";

export type SurfaceIssue =
  | "scratch_light"
  | "scratch_deep"
  | "dent_small"
  | "dent_large"
  | "rust_surface"
  | "rust_moderate"
  | "rust_severe"
  | "paint_mismatch"
  | "fluid_leak"
  | "battery_corrosion"
  | "tire_wear"
  | null;

export type Confidence = "high" | "medium" | "low";

export interface DetLite {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

export interface InterpretedDetection {
  /** Original COCO-SSD class. */
  class: string;
  /** Mapped automotive category. */
  category: AutoCategory;
  /** Pretty label for overlay. */
  label: string;
  /** 0-1 raw score. */
  score: number;
  /** Bucketed confidence: high/medium/low. */
  confidence: Confidence;
  /** 0-100 confidence percent for display. */
  confidencePct: number;
  bbox: [number, number, number, number];
  /** Suggested issue type for this detection given step context. */
  suggestedIssue: SurfaceIssue;
  /** Severity to default the candidate finding to. */
  suggestedSeverity: Finding["severity"];
  /** Short contextual coach prompt for THIS detection. */
  prompt: string;
  /** True when surface visibility damped this detection. UI uses dashed bbox. */
  lowVisibility?: boolean;
}

/* ---------- COCO class → automotive category mapping ---------- */
const ENGINE_CLASSES = new Set(["bottle", "cup"]); // reservoirs / oil cans
const BODY_CLASSES = new Set(["car", "truck", "bus", "boat"]);
const WHEEL_CLASSES = new Set(["frisbee", "donut", "clock"]); // round-shape proxies
const INTERIOR_CLASSES = new Set(["chair", "couch", "bed", "remote", "cell phone", "book"]);
const DASHBOARD_CLASSES = new Set(["tv", "laptop", "keyboard", "mouse"]);

function mapClassToCategory(c: string, stepId?: string): AutoCategory {
  // Step context is the stronger signal — trust it first.
  if (stepId === "engine_bay") return "engine_bay";
  if (stepId === "wheels_tires") return "wheel";
  if (stepId === "interior") return "interior";
  if (stepId === "dashboard") return "dashboard";

  if (BODY_CLASSES.has(c)) return "body_panel";
  if (ENGINE_CLASSES.has(c)) return "engine_bay";
  if (WHEEL_CLASSES.has(c)) return "wheel";
  if (INTERIOR_CLASSES.has(c)) return "interior";
  if (DASHBOARD_CLASSES.has(c)) return "dashboard";
  return "unknown";
}

function categoryLabel(c: AutoCategory, fallback: string): string {
  switch (c) {
    case "engine_bay": return "Engine bay";
    case "body_panel": return "Body panel";
    case "wheel": return "Wheel / tire";
    case "interior": return "Interior";
    case "dashboard": return "Dashboard";
    default: return fallback;
  }
}

/* ---------- confidence bucketing ---------- */
export function bucketConfidence(score: number): Confidence {
  if (score >= 0.7) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

/* ---------- contextual issue inference ----------
   We don't actually do paint-grade segmentation in the browser. Instead we
   produce *candidate* findings based on step context + bbox geometry. The
   user confirms with one tap, which is honest and fast. */
function inferCandidateIssue(
  stepId: string | undefined,
  detection: DetLite,
  category: AutoCategory,
  frameW: number,
  frameH: number,
): { issue: SurfaceIssue; severity: Finding["severity"]; prompt: string } {
  const [x, y, w, h] = detection.bbox;
  const area = (w * h) / Math.max(1, frameW * frameH);
  const aspect = w / Math.max(1, h);

  // Engine bay
  if (category === "engine_bay") {
    if (detection.class === "bottle" || detection.class === "cup") {
      return {
        issue: "fluid_leak",
        severity: "medium",
        prompt: "Reservoir detected — check around base for leaks or stains.",
      };
    }
    return {
      issue: "battery_corrosion",
      severity: "low",
      prompt: "Engine bay visible — scan battery terminals for corrosion.",
    };
  }

  // Wheels / tires
  if (category === "wheel" || stepId === "wheels_tires") {
    return {
      issue: "tire_wear",
      severity: area > 0.25 ? "medium" : "low",
      prompt: area > 0.2
        ? "Tire framed well — scan tread depth and sidewall."
        : "Move closer for a clearer tread + sidewall check.",
    };
  }

  // Dashboard
  if (category === "dashboard") {
    return {
      issue: null,
      severity: "low",
      prompt: "Aim at the cluster after ignition self-test.",
    };
  }

  // Interior
  if (category === "interior") {
    return {
      issue: null,
      severity: "low",
      prompt: "Pan slowly across seats and trim for wear matching the mileage.",
    };
  }

  // Body panel — heuristic: small high-contrast region inside a larger panel
  // is more likely a scratch/dent. We approximate using bbox aspect ratio:
  // long thin = scratch, square small = dent.
  if (category === "body_panel" || stepId === "front_exterior" || stepId === "side_panels" || stepId === "rear") {
    if (area < 0.05) {
      // tiny region inside frame — coach to move closer
      return {
        issue: null,
        severity: "low",
        prompt: "Possible blemish detected — move closer for a clearer check.",
      };
    }
    if (aspect > 3 || aspect < 0.33) {
      return {
        issue: "scratch_light",
        severity: "low",
        prompt: "Possible scratch detected — move closer to check depth.",
      };
    }
    if (area < 0.18 && Math.abs(aspect - 1) < 0.6) {
      return {
        issue: "dent_small",
        severity: "low",
        prompt: "Possible dent detected — angle light across the panel.",
      };
    }
    return {
      issue: null,
      severity: "low",
      prompt: "Panel visible — scanning for damage.",
    };
  }

  return { issue: null, severity: "low", prompt: "Looking for vehicle area…" };
}

/* ---------- public API ---------- */

/**
 * Interpret raw COCO-SSD detections in light of the current inspection step
 * and produce overlay-ready, automotive-aware annotations.
 */
export function interpretDetections(
  detections: DetLite[],
  stepId: string | undefined,
  frameW: number,
  frameH: number,
): InterpretedDetection[] {
  return detections
    .filter((d) => d.score >= 0.3)
    .slice(0, 6)
    .map((d) => {
      const category = mapClassToCategory(d.class, stepId);
      const cand = inferCandidateIssue(stepId, d, category, frameW, frameH);
      return {
        class: d.class,
        category,
        label: categoryLabel(category, d.class),
        score: d.score,
        confidence: bucketConfidence(d.score),
        confidencePct: Math.round(d.score * 100),
        bbox: d.bbox,
        suggestedIssue: cand.issue,
        suggestedSeverity: cand.severity,
        prompt: cand.prompt,
      };
    });
}

/** Pretty issue label for the "add to findings" button. */
export function surfaceIssueLabel(s: SurfaceIssue): string {
  switch (s) {
    case "scratch_light": return "Light scratch (clear coat)";
    case "scratch_deep": return "Deep scratch (paint/primer)";
    case "dent_small": return "Small dent";
    case "dent_large": return "Large dent";
    case "rust_surface": return "Surface rust";
    case "rust_moderate": return "Moderate rust";
    case "rust_severe": return "Severe rust";
    case "paint_mismatch": return "Paint mismatch";
    case "fluid_leak": return "Possible fluid leak";
    case "battery_corrosion": return "Battery corrosion";
    case "tire_wear": return "Tire wear / damage";
    default: return "";
  }
}

/** Confidence color token for overlay tags. */
export function confidenceTone(c: Confidence): string {
  switch (c) {
    case "high": return "border-success/60 bg-success/15 text-success";
    case "medium": return "border-primary/60 bg-primary/15 text-primary";
    case "low": return "border-warning/60 bg-warning/15 text-warning";
  }
}

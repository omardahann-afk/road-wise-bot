// ============================================================================
// Local camera-diagnosis fallback.
//
// Synthesizes an `AiCameraResult`-shaped object from the signals that are
// already available in the browser:
//   - COCO/object detections from the smart-camera hook
//   - Browser-side damage candidates from `damage-detection.ts`
//   - Surface visibility (lighting / paint tone) snapshot
//
// Used only when the AI camera analysis fails or times out, so the user
// always sees something useful instead of a blank screen.
// ============================================================================
import type { AiCameraResult } from "@/lib/camera-analysis";
import type { DamageCandidate } from "@/lib/damage-detection";
import type { SurfaceVisibility } from "@/lib/camera-visibility";

export interface LocalCameraInput {
  detections?: { class: string; score: number }[];
  damage?: DamageCandidate[];
  visibility?: SurfaceVisibility | null;
}

function topConfidence(damage: DamageCandidate[]): "low" | "medium" | "high" {
  if (damage.length === 0) return "low";
  const top = Math.max(...damage.map((d) => d.confidence));
  if (top >= 0.7) return "high";
  if (top >= 0.45) return "medium";
  return "low";
}

function severityToConfidence(s: DamageCandidate["severity"]): string {
  if (s === "critical" || s === "high") return "high";
  if (s === "medium") return "medium";
  return "low";
}

/**
 * Always returns a complete, renderable AiCameraResult — even when nothing
 * was detected. The result is honest about being a local heuristic so the UI
 * can label it appropriately.
 */
export function localCameraAnalyze(input: LocalCameraInput): AiCameraResult {
  const damage = input.damage ?? [];
  const detections = input.detections ?? [];
  const lowVisibility = input.visibility?.level === "low";

  const components: AiCameraResult["likely_components"] = [];

  for (const d of damage.slice(0, 4)) {
    components.push({
      name: d.label,
      confidence: severityToConfidence(d.severity),
      what_to_check: [
        `Inspect the ${d.location.replace(/_/g, " ")} area in person.`,
        d.note,
      ],
      likely_issue: d.label,
    });
  }

  // NOTE: We intentionally do NOT add raw COCO classes (car, truck, wheel...)
  // as components — surfacing "car" as a final diagnosis is misleading. Only
  // concrete damage findings become components here. The summary copy below
  // stays honest about what the detector actually saw.

  const warnings: string[] = [];
  if (lowVisibility) {
    warnings.push("Lighting or paint tone made automatic detection less reliable. Consider retaking in better light.");
  }
  if (damage.some((d) => d.severity === "high" || d.severity === "critical")) {
    warnings.push("Possible significant damage spotted — confirm in person before driving.");
  }

  const overall: "low" | "medium" | "high" =
    damage.length === 0 && detections.length === 0 ? "low" : topConfidence(damage);

  const summary =
    damage.length > 0
      ? `Local detection found ${damage.length} possible issue${damage.length === 1 ? "" : "s"}: ${damage
          .map((d) => d.label)
          .slice(0, 3)
          .join(", ")}.`
      : detections.length > 0
        ? "AI is unavailable. Showing what the on-device detector saw — confirm the part visually."
        : "AI is unavailable and nothing obvious was detected on-device. Try a closer photo in better light.";

  const next_action =
    damage.length > 0
      ? "Add the most likely finding and continue to a repair workflow."
      : "Retake the photo from a different angle or upload a clearer one.";

  return {
    summary,
    overall_confidence: overall,
    image_quality: {
      lighting: lowVisibility ? "poor" : "ok",
      focus: "ok",
      framing: "ok",
    },
    likely_components: components,
    warnings,
    next_action,
    recapture_tip: lowVisibility
      ? "Move to even lighting (open shade or indoors with a light source) and avoid direct reflections."
      : null,
    follow_up_questions: [
      "Is the damage visible in person, or only on the photo?",
      "Roughly when do you think it happened?",
    ],
    cleaning: null,
  };
}

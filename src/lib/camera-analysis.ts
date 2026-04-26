import { callAi } from "@/lib/ai";
import type { SurfaceVisibility } from "@/lib/camera-visibility";

export interface CleaningAdvice {
  /** Material(s) detected (e.g. "leather seat", "alloy wheel"). */
  material?: string | null;
  /** Risk if cleaned incorrectly. */
  risk_level?: "low" | "medium" | "high" | null;
  /** Products that ARE safe to use. */
  safe_products?: string[];
  /** Products / household items to AVOID on this surface. */
  unsafe_products?: string[];
  /** Optional ordered cleaning steps specific to this photo. */
  cleaning_steps?: string[];
}

export interface AiCameraResult {
  summary: string;
  overall_confidence?: "low" | "medium" | "high";
  image_quality?: {
    lighting?: "poor" | "ok" | "good";
    focus?: "poor" | "ok" | "good";
    framing?: "poor" | "ok" | "good";
  };
  likely_components: {
    name: string;
    confidence: string;
    what_to_check: string[];
    likely_issue?: string | null;
  }[];
  warnings: string[];
  next_action: string;
  recapture_tip?: string | null;
  follow_up_questions: string[];
  /** Optional cleaning-specific advice block — only filled when goal=cleaning. */
  cleaning?: CleaningAdvice | null;
}

export async function analyzeCameraPhoto(input: {
  dataUrl: string;
  detections: { class: string; score: number }[];
  area?: string;
  goal?: string;
  notes?: string;
  visibility?: SurfaceVisibility | null;
}) {
  return callAi<AiCameraResult>("camera", {
    detected_objects: input.detections,
    image_base64: input.dataUrl,
    area: input.area,
    goal: input.goal,
    notes: input.notes,
    surface_visibility: input.visibility ?? null,
  });
}

export function cameraConfidenceTone(confidence?: "low" | "medium" | "high") {
  if (confidence === "high") return "border-success/60 bg-success/10 text-success";
  if (confidence === "medium") return "border-primary/60 bg-primary/10 text-primary";
  return "border-warning/60 bg-warning/10 text-warning";
}

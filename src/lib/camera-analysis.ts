import { callAi } from "@/lib/ai";

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
}

export async function analyzeCameraPhoto(input: {
  dataUrl: string;
  detections: { class: string; score: number }[];
  area?: string;
  goal?: string;
  notes?: string;
}) {
  return callAi<AiCameraResult>("camera", {
    detected_objects: input.detections,
    image_base64: input.dataUrl,
    area: input.area,
    goal: input.goal,
    notes: input.notes,
  });
}

export function cameraConfidenceTone(confidence?: "low" | "medium" | "high") {
  if (confidence === "high") return "border-success/60 bg-success/10 text-success";
  if (confidence === "medium") return "border-primary/60 bg-primary/10 text-primary";
  return "border-warning/60 bg-warning/10 text-warning";
}

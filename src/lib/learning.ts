// AutoSage AI — Learning events recorder.
//
// Lightweight, fire-and-forget logger that records detection difficulty so
// we can improve guidance over time. ALL writes are best-effort; we never
// throw to the UI from here.

import { supabase } from "@/integrations/supabase/client";
import type { VisibilityLevel, PaintTone } from "@/lib/camera-visibility";

export interface LearningEvent {
  step_id?: string | null;
  paint_color?: string | null;
  paint_tone?: PaintTone | null;
  surface_visibility?: VisibilityLevel | null;
  detection_confidence?: number | null;
  issue_detected?: string | null;
  issue_confirmed_by_user?: boolean | null;
  source: "auto_detection" | "manual_mark" | "ai_finding";
  vehicle_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordLearningEvent(event: LearningEvent): Promise<void> {
  try {
    const { data: userResp } = await supabase.auth.getUser();
    const userId = userResp.user?.id;
    if (!userId) return; // anonymous — skip silently
    await supabase.from("learning_events" as never).insert({
      user_id: userId,
      step_id: event.step_id ?? null,
      paint_color: event.paint_color ?? null,
      paint_tone: event.paint_tone ?? null,
      surface_visibility: event.surface_visibility ?? null,
      detection_confidence: event.detection_confidence ?? null,
      issue_detected: event.issue_detected ?? null,
      issue_confirmed_by_user: event.issue_confirmed_by_user ?? null,
      source: event.source,
      vehicle_id: event.vehicle_id ?? null,
      metadata: event.metadata ?? {},
    } as never);
  } catch (err) {
    // Never crash UI on logging failure.
    console.warn("[learning] recordLearningEvent failed", err);
  }
}

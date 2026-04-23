// AutoSage AI — Camera coaching heuristics.
// Deterministic, fast, frame-by-frame analysis to coach the user during
// live inspection. Operates on COCO-SSD style detections + simple pixel
// statistics from a video element. AI is NOT used here — this is real-time.

export type CoachingTone = "good" | "warn" | "bad";

export type CoachingDirection =
  | "move_closer"
  | "step_back"
  | "move_left"
  | "move_right"
  | "tilt_up"
  | "tilt_down"
  | "hold_steady"
  | "improve_lighting"
  | "overexposed"
  | "glare"
  | "move_to_shade"
  | "center_panel"
  | "good_view"
  | "looking";

export interface CoachingHint {
  tone: CoachingTone;
  direction: CoachingDirection;
  message: string;
  confidence: number; // 0-1
}

export interface DetLite {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

export interface FrameStats {
  brightness: number;        // 0-255 mean luma
  motion: number;            // 0-1 normalized inter-frame delta
  largestArea: number;       // 0-1 portion of frame covered by largest detection
  centerOffset: number;      // 0-1 distance of largest bbox center from frame center
  count: number;
  /** Fraction of pixels at/near max luma — high = blown highlights/glare. */
  highlightClip: number;     // 0-1
  /** Fraction of pixels at/near min luma — high = crushed shadows. */
  shadowClip: number;        // 0-1
  /** Std-dev of luma. Low = washed-out / fogged frame. */
  contrast: number;          // 0-1 normalized
}

const VEHICLE_CLASSES = new Set([
  "car","truck","bus","motorcycle","bicycle",
  "tire","wheel",
  "person", // for scale calibration
]);

/** Compute a fast luma + motion delta from a downscaled video frame. */
export function sampleFrameStats(
  video: HTMLVideoElement,
  prevPixels: Uint8ClampedArray | null,
  detections: DetLite[],
  scratchCanvas: HTMLCanvasElement,
): { stats: FrameStats; pixels: Uint8ClampedArray | null } {
  if (video.readyState < 2 || video.videoWidth === 0) {
    return {
      stats: { brightness: 0, motion: 0, largestArea: 0, centerOffset: 0.5, count: detections.length },
      pixels: prevPixels,
    };
  }
  const W = 64, H = 48;
  scratchCanvas.width = W;
  scratchCanvas.height = H;
  const ctx = scratchCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { stats: { brightness: 0, motion: 0, largestArea: 0, centerOffset: 0.5, count: detections.length }, pixels: prevPixels };
  ctx.drawImage(video, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;

  // Luma mean (rec601-ish)
  let lumaSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    lumaSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const brightness = lumaSum / (W * H);

  // Motion delta vs prev
  let motionSum = 0;
  if (prevPixels && prevPixels.length === data.length) {
    for (let i = 0; i < data.length; i += 4) {
      motionSum += Math.abs(data[i] - prevPixels[i]);
    }
  }
  const motion = Math.min(1, motionSum / (W * H * 80)); // 80 = soft cap

  // Largest detection area & centering relative to frame
  const fw = video.videoWidth || 1;
  const fh = video.videoHeight || 1;
  let largest = 0;
  let cx = 0.5, cy = 0.5;
  for (const d of detections) {
    if (!VEHICLE_CLASSES.has(d.class) && d.score < 0.4) continue;
    const [x, y, w, h] = d.bbox;
    const a = (w * h) / (fw * fh);
    if (a > largest) {
      largest = a;
      cx = (x + w / 2) / fw;
      cy = (y + h / 2) / fh;
    }
  }
  const centerOffset = Math.hypot(cx - 0.5, cy - 0.5) * 2; // 0..~1.4

  return {
    stats: { brightness, motion, largestArea: largest, centerOffset, count: detections.length },
    pixels: new Uint8ClampedArray(data),
  };
}

/**
 * Translate frame stats + step expectations into a single coaching hint.
 * - "closeup" steps (wheels, dashboard) prefer larger subject area.
 * - "panel" steps (front, side, rear) prefer the panel framed full.
 * - "engine" wants engine bay cues + good lighting.
 */
export function coachForStep(
  stepId: string,
  stats: FrameStats,
): CoachingHint {
  const closeup = stepId === "wheels_tires" || stepId === "dashboard";
  const wantsLargeSubject = closeup;

  // Lighting first — overrides framing if too dark.
  if (stats.brightness < 35) {
    return {
      tone: "bad",
      direction: "improve_lighting",
      message: "Too dark — move to better lighting.",
      confidence: 0.9,
    };
  }
  if (stats.brightness > 235) {
    return {
      tone: "warn",
      direction: "improve_lighting",
      message: "Glare — angle away from direct sun.",
      confidence: 0.7,
    };
  }

  // Stability second.
  if (stats.motion > 0.55) {
    return {
      tone: "warn",
      direction: "hold_steady",
      message: "Hold steady so I can analyze the panel.",
      confidence: 0.85,
    };
  }

  // Framing.
  if (stats.count === 0 && stats.largestArea === 0) {
    return {
      tone: "warn",
      direction: "looking",
      message: "Looking for the vehicle — point camera at the area.",
      confidence: 0.5,
    };
  }

  if (wantsLargeSubject) {
    if (stats.largestArea < 0.18) {
      return { tone: "warn", direction: "move_closer", message: "Move closer for a clearer check.", confidence: 0.8 };
    }
  } else {
    if (stats.largestArea > 0.85) {
      return { tone: "warn", direction: "step_back", message: "Step back so the full panel is in view.", confidence: 0.8 };
    }
    if (stats.largestArea < 0.12) {
      return { tone: "warn", direction: "move_closer", message: "Move closer — panel is too small in frame.", confidence: 0.75 };
    }
  }

  // Centering.
  if (stats.centerOffset > 0.45) {
    // crude direction hint
    return {
      tone: "warn",
      direction: "center_panel",
      message: "Center the panel in frame.",
      confidence: 0.7,
    };
  }

  return {
    tone: "good",
    direction: "good_view",
    message: "Good view — capture when ready.",
    confidence: 0.9,
  };
}

/** Per-step framing instructions used by the overlay coach UI. */
export const STEP_GUIDANCE: Record<string, { hint: string; closeup: boolean }> = {
  front_exterior: { hint: "Stand 6–8 ft in front. Frame the full bumper, hood and grille.", closeup: false },
  side_panels:    { hint: "Walk slowly along the side. Keep doors and panels in view.", closeup: false },
  rear:           { hint: "Frame the full rear bumper, lights, and trunk seam.", closeup: false },
  wheels_tires:   { hint: "Get close to each tire — capture tread and sidewall.", closeup: true },
  interior:       { hint: "Pan slowly across seats, dashboard, and headliner.", closeup: false },
  dashboard:      { hint: "Aim at the instrument cluster after ignition self-test.", closeup: true },
  engine_bay:     { hint: "Open the hood. Aim at the engine, belts, and reservoirs.", closeup: false },
};

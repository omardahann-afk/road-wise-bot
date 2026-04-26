// AutoSage AI — Low-visibility surface awareness.
//
// Pure-browser heuristics that complement camera-coaching.ts. We do NOT
// remove existing detection — we wrap it with awareness of conditions that
// hide damage (dark paint, glossy reflections, low contrast, fuzzy edges).
//
// Rule of thumb: when surface visibility is "low", we trust the model
// LESS, not more. We damp confidence, surface a clear warning, and ask the
// user to add light/angle instead of silently claiming "no damage".

import type { FrameStats } from "@/lib/camera-coaching";

export type PaintTone = "dark" | "mid" | "light" | "unknown";
export type VisibilityLevel = "good" | "ok" | "low";

export interface SurfaceVisibility {
  /** Bucketed paint lightness — derived from luma + clipping pattern. */
  paintTone: PaintTone;
  /** True when bright clip patches indicate strong specular reflections. */
  highReflection: boolean;
  /** True when overall std-dev of luma is low → washed-out / dark blob. */
  lowContrast: boolean;
  /** True when edges in the frame are weak (blur, fog, dim panel). */
  weakEdges: boolean;
  /** Aggregate level used by UI. */
  level: VisibilityLevel;
  /** Multiplier (0–1) to apply to detection confidence. */
  confidenceMultiplier: number;
  /** Short reason string for the UI badge. */
  reason: string;
}

const GOOD: SurfaceVisibility = {
  paintTone: "unknown",
  highReflection: false,
  lowContrast: false,
  weakEdges: false,
  level: "good",
  confidenceMultiplier: 1,
  reason: "Good visibility",
};

/**
 * Combine luma stats with a quick edge-strength sample to classify how
 * trustworthy this frame is for surface-damage detection.
 */
export function assessSurfaceVisibility(stats: FrameStats, edgeStrength?: number): SurfaceVisibility {
  if (stats.count === 0 && stats.largestArea === 0 && stats.brightness === 0) {
    // No frame data yet — don't fabricate a warning.
    return GOOD;
  }

  // Paint tone from mean luma, ignoring extreme clip pixels.
  let paintTone: PaintTone = "unknown";
  if (stats.brightness > 0) {
    if (stats.brightness < 75) paintTone = "dark";
    else if (stats.brightness < 165) paintTone = "mid";
    else paintTone = "light";
  }

  const highReflection = stats.highlightClip > 0.10 && stats.contrast < 0.45;
  const lowContrast = stats.contrast < 0.22;
  const weakEdges = (edgeStrength ?? 1) < 0.18;

  const flags = [
    paintTone === "dark",
    highReflection,
    lowContrast,
    weakEdges,
  ].filter(Boolean).length;

  let level: VisibilityLevel = "good";
  let confidenceMultiplier = 1;
  let reason = "Good visibility";

  if (flags >= 2) {
    level = "low";
    confidenceMultiplier = 0.55;
    reason = paintTone === "dark"
      ? "Dark paint can hide dents — please confirm by hand"
      : highReflection
        ? "Reflections are covering the surface — check manually too"
        : "Low-contrast surface — please confirm any damage by hand";
  } else if (flags === 1) {
    level = "ok";
    confidenceMultiplier = 0.8;
    reason = paintTone === "dark"
      ? "Dark surface — tilt the camera to catch a light streak"
      : highReflection
        ? "Bright reflections may hide blemishes — try a new angle"
        : lowContrast
          ? "A bit washed-out — move to brighter, even light"
          : "Soft edges — hold steady or move slightly closer";
  }

  return {
    paintTone,
    highReflection,
    lowContrast,
    weakEdges,
    level,
    confidenceMultiplier,
    reason,
  };
}

/**
 * Sample a quick edge-strength score (0–1) from a downscaled frame using
 * a Sobel-like luma gradient. Cheap enough to run every inference tick.
 */
export function sampleEdgeStrength(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) return 1;
  const W = canvas.width;
  const H = canvas.height;
  const data = ctx.getImageData(0, 0, W, H).data;

  // Convert to luma row buffer.
  const luma = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    luma[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }

  let total = 0;
  let samples = 0;
  // Sample every 2px to keep CPU light.
  for (let y = 1; y < H - 1; y += 2) {
    for (let x = 1; x < W - 1; x += 2) {
      const i = y * W + x;
      const gx = luma[i + 1] - luma[i - 1];
      const gy = luma[i + W] - luma[i - W];
      total += Math.min(255, Math.abs(gx) + Math.abs(gy));
      samples++;
    }
  }
  if (samples === 0) return 1;
  // Normalize: ~40+ avg gradient is a sharp panel; <10 is very soft.
  return Math.min(1, (total / samples) / 60);
}

/**
 * Coaching message tailored to low-visibility conditions. Returned as a
 * string the existing CoachingOverlay can display via its hint pipeline,
 * OR rendered separately as a "low confidence" badge.
 */
export function lowVisibilityCoach(v: SurfaceVisibility): string | null {
  if (v.level === "good") return null;
  if (v.paintTone === "dark" && v.highReflection) {
    return "Dark, glossy paint hides damage. Tilt the camera until a light streak runs across the panel — that's when dents show up.";
  }
  if (v.paintTone === "dark") {
    return "Dark paint can hide dents. Angle the camera until reflections reveal the panel shape.";
  }
  if (v.highReflection) {
    return "Strong reflections are covering the surface. Step to a new angle or shade the panel from direct sun.";
  }
  if (v.lowContrast) {
    return "The surface looks washed out. Move into brighter, even light so scratches and dents stand out.";
  }
  if (v.weakEdges) {
    return "The image is a bit soft. Hold steady, let it refocus, or move slightly closer.";
  }
  return "Hard to read this surface. Try a different angle and better light, then confirm by running your hand across the panel.";
}

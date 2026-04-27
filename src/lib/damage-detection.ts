// AutoSage AI — Browser-side damage detection layer.
//
// COCO-SSD detects "car"/"truck" — it does NOT detect car damage. This module
// runs lightweight image-processing heuristics against a captured frame to
// surface visible damage signals: scrape clusters, paint transfer (dark marks
// on light panels), cracks (long contour lines), abnormal panel gaps,
// bumper-edge separation.
//
// Pure-browser, deterministic, no AI calls. Adds candidates the user can
// confirm with one tap. Never overrides AI findings — purely additive.
//
// Returns DamageCandidate[] with bbox in source-image coordinates so the
// camera UI can draw an overlay directly on the captured photo.

import type { Finding } from "@/lib/valuation";
import type { RepairWorkflow } from "@/lib/valuation";

export type DamageType =
  | "bumper_scrape"
  | "fender_scrape"
  | "paint_transfer"
  | "cracked_bumper"
  | "panel_gap"
  | "bumper_clip"
  | "cosmetic_damage";

export interface DamageCandidate {
  damage_type: DamageType;
  /** Pretty label shown to the user. */
  label: string;
  /** 0-1 confidence. */
  confidence: number;
  /** Severity guess from area + intensity. */
  severity: Finding["severity"];
  /** Bounding box in source-image pixel coords: [x, y, w, h]. */
  bbox: [number, number, number, number];
  /** Short explanation of WHY this candidate was raised. */
  note: string;
  /** Suggested next step shown under the chip. */
  next_step: string;
  /** Suggested repair workflow slug. */
  suggestedWorkflow: RepairWorkflow;
  /** Where in the frame: e.g. "lower-left near wheel arch". */
  location: string;
}

/* ---------- internal types ---------- */

interface Stats {
  W: number;
  H: number;
  luma: Float32Array;
  /** Mean luma of bright (panel) pixels — used to detect light vs dark paint. */
  meanLuma: number;
  /** Std-dev of luma. */
  stdLuma: number;
}

interface DarkPatch {
  x: number;
  y: number;
  w: number;
  h: number;
  count: number;
  /** Eccentricity proxy: long & thin patches read as scrapes/streaks. */
  aspect: number;
  /** 0-1 intensity (how much darker than the panel mean). */
  intensity: number;
}

/* ---------- public entry point ---------- */

/**
 * Analyze a captured image and return up to N damage candidates ordered by
 * confidence. Designed to run on a freshly-captured frame — not every video
 * tick (it does a full ImageData read).
 *
 * Accepts either an HTMLCanvasElement or an HTMLImageElement.
 */
export async function detectDamage(
  source: HTMLCanvasElement | HTMLImageElement,
  options: { maxCandidates?: number } = {},
): Promise<DamageCandidate[]> {
  const stats = readStats(source);
  if (!stats) return [];
  return detectDamageFromStats(stats, options);
}

/**
 * Test-friendly entry point: run the same heuristic pipeline against a
 * pre-built Stats object (raw luma + dimensions). Lets unit tests exercise
 * the detection logic without a DOM canvas.
 */
export function detectDamageFromStats(
  stats: Stats,
  options: { maxCandidates?: number } = {},
): DamageCandidate[] {
  const max = options.maxCandidates ?? 4;
  const candidates: DamageCandidate[] = [];

  const darkPatches = findDarkPatches(stats);
  for (const p of darkPatches) {
    const cand = classifyDarkPatch(p, stats);
    if (cand) candidates.push(cand);
  }
  for (const hit of findCrackLines(stats)) candidates.push(hit);
  for (const hit of findPanelGaps(stats)) candidates.push(hit);

  const merged = mergeOverlapping(candidates);
  return merged.sort((a, b) => b.confidence - a.confidence).slice(0, max);
}

/**
 * Build a Stats object from a raw luma buffer. Used by tests and any caller
 * that already has decoded pixel data. Sets the internal scale to 1 so bbox
 * coordinates map 1:1 to the input grid.
 */
export function buildStatsFromLuma(W: number, H: number, luma: Float32Array): Stats {
  let sum = 0;
  for (let i = 0; i < W * H; i++) sum += luma[i];
  const mean = sum / (W * H);
  let varSum = 0;
  for (let i = 0; i < W * H; i++) {
    const d = luma[i] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / (W * H));
  const result: Stats & { _scale: number; _srcW: number; _srcH: number } = {
    W,
    H,
    luma,
    meanLuma: mean,
    stdLuma: std,
    _scale: 1,
    _srcW: W,
    _srcH: H,
  };
  return result;
}

/* ---------- read pixels ---------- */

function readStats(source: HTMLCanvasElement | HTMLImageElement): Stats | null {
  // Downscale to ~256px wide for fast processing — all bbox coords are returned
  // scaled back to source dimensions.
  const sourceW =
    source instanceof HTMLCanvasElement ? source.width : source.naturalWidth || source.width;
  const sourceH =
    source instanceof HTMLCanvasElement ? source.height : source.naturalHeight || source.height;
  if (!sourceW || !sourceH) return null;

  const targetW = 256;
  const scale = targetW / sourceW;
  const W = targetW;
  const H = Math.max(1, Math.round(sourceH * scale));

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;

  const luma = new Float32Array(W * H);
  let sum = 0;
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    const y = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    luma[i] = y;
    sum += y;
  }
  const mean = sum / (W * H);
  let varSum = 0;
  for (let i = 0; i < W * H; i++) {
    const d = luma[i] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / (W * H));

  // Stash the source dimensions on the stats so we can scale bboxes back.
  const result: Stats & { _scale: number; _srcW: number; _srcH: number } = {
    W,
    H,
    luma,
    meanLuma: mean,
    stdLuma: std,
    _scale: scale,
    _srcW: sourceW,
    _srcH: sourceH,
  };
  return result;
}

function scaleBBox(
  stats: Stats,
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number, number, number] {
  const s = (stats as Stats & { _scale: number })._scale;
  return [x / s, y / s, w / s, h / s];
}

/* ---------- dark-patch (paint transfer / scrape) detection ---------- */

function findDarkPatches(stats: Stats): DarkPatch[] {
  const { W, H, luma, meanLuma, stdLuma } = stats;
  // A pixel is "dark mark" when significantly darker than panel mean AND the
  // panel mean is itself bright (light/white paint). Skip dark cars entirely.
  if (meanLuma < 110) return []; // mid/dark paint — not the target case
  const threshold = Math.max(60, meanLuma - Math.max(35, stdLuma * 1.4));

  // Build a binary mask, then run a simple connected-components pass.
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (luma[i] < threshold) mask[i] = 1;
  }

  // Flood-fill components.
  const labels = new Int32Array(W * H);
  const patches: DarkPatch[] = [];
  let nextLabel = 1;
  const stack: number[] = [];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mask[i] || labels[i]) continue;
      labels[i] = nextLabel;
      stack.length = 0;
      stack.push(i);
      let minX = x, maxX = x, minY = y, maxY = y, count = 0, intSum = 0;
      while (stack.length) {
        const p = stack.pop()!;
        const px = p % W;
        const py = Math.floor(p / W);
        count++;
        intSum += meanLuma - luma[p];
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        const neigh = [
          p - 1, p + 1, p - W, p + W,
          p - W - 1, p - W + 1, p + W - 1, p + W + 1,
        ];
        for (const n of neigh) {
          if (n < 0 || n >= W * H) continue;
          if (!mask[n] || labels[n]) continue;
          // Prevent wrap-around on row edges.
          const nx = n % W;
          if (Math.abs(nx - px) > 1) continue;
          labels[n] = nextLabel;
          stack.push(n);
        }
      }
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const area = w * h;
      // Filter noise: must be at least ~30 pixels and area-ratio not too sparse.
      if (count < 30) continue;
      if (count / area < 0.2) continue;
      // Skip giant blobs that are likely the background or shadow under the car.
      if (count > W * H * 0.18) continue;
      patches.push({
        x: minX,
        y: minY,
        w,
        h,
        count,
        aspect: w / Math.max(1, h),
        intensity: Math.min(1, intSum / count / 120),
      });
      nextLabel++;
    }
  }
  // Cap to top 8 by darkness × area to keep work bounded.
  return patches
    .sort((a, b) => b.intensity * b.count - a.intensity * a.count)
    .slice(0, 8);
}

function classifyDarkPatch(p: DarkPatch, stats: Stats): DamageCandidate | null {
  const { W, H } = stats;
  const areaRatio = (p.w * p.h) / (W * H);

  // Discard tiny noise patches that slipped through.
  if (areaRatio < 0.0015) return null;

  const longThin = p.aspect > 2.5 || p.aspect < 0.4;
  const inLowerHalf = p.y + p.h / 2 > H * 0.45;
  const location = locationLabel(p.x + p.w / 2, p.y + p.h / 2, W, H);

  // Long thin dark marks on light paint = classic scrape / paint transfer.
  if (longThin && p.intensity > 0.25) {
    const inBumperZone = inLowerHalf;
    const damageType: DamageType = inBumperZone ? "bumper_scrape" : "fender_scrape";
    const conf = Math.min(0.92, 0.45 + p.intensity * 0.45 + Math.min(0.15, areaRatio * 4));
    return {
      damage_type: damageType,
      label: damageType === "bumper_scrape" ? "Bumper scrape detected" : "Fender scrape detected",
      confidence: conf,
      severity: areaRatio > 0.02 ? "medium" : "low",
      bbox: scaleBBox(stats, p.x, p.y, p.w, p.h),
      note: "Long, dark streak on a light-coloured panel — looks like a scrape mark.",
      next_step: "Add to findings to start a paint/scratch repair workflow.",
      suggestedWorkflow: "paint_repair",
      location,
    };
  }

  // Compact dark marks on light paint = paint transfer from another vehicle.
  if (!longThin && p.intensity > 0.3 && areaRatio > 0.002 && areaRatio < 0.04) {
    const conf = Math.min(0.88, 0.4 + p.intensity * 0.5);
    return {
      damage_type: "paint_transfer",
      label: "Paint transfer visible",
      confidence: conf,
      severity: "low",
      bbox: scaleBBox(stats, p.x, p.y, p.w, p.h),
      note: "Dark mark on a light-coloured panel — looks like paint transferred from another object.",
      next_step: "Try a clay bar or polishing compound — add to findings to view the workflow.",
      suggestedWorkflow: "paint_repair",
      location,
    };
  }

  // Big, lower-zone, low-aspect dark patch in the bumper area = cosmetic body damage.
  if (inLowerHalf && areaRatio > 0.01 && p.intensity > 0.2) {
    const conf = Math.min(0.75, 0.35 + p.intensity * 0.35 + areaRatio * 4);
    return {
      damage_type: "cosmetic_damage",
      label: "Possible cosmetic body damage",
      confidence: conf,
      severity: "low",
      bbox: scaleBBox(stats, p.x, p.y, p.w, p.h),
      note: "Dark cluster on the lower body area — possibly scuffs, scrapes, or a damaged trim piece.",
      next_step: "Confirm visually and add to findings if it's real damage.",
      suggestedWorkflow: "general_repair",
      location,
    };
  }

  return null;
}

/* ---------- crack / split-bumper line detection ----------
 * Cracks read as long, thin runs of high horizontal-or-diagonal gradient with
 * darker line interior. We approximate using a row/col sweep for sustained
 * gradient peaks — much cheaper than a true Hough transform and good enough
 * to surface a "possible crack" candidate.
 */

function findCrackLines(stats: Stats): DamageCandidate[] {
  const { W, H, luma } = stats;
  // Compute a quick |gx| + |gy| gradient.
  const grad = new Float32Array(W * H);
  let gradMax = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = luma[i + 1] - luma[i - 1];
      const gy = luma[i + W] - luma[i - W];
      const m = Math.abs(gx) + Math.abs(gy);
      grad[i] = m;
      if (m > gradMax) gradMax = m;
    }
  }
  if (gradMax < 30) return [];
  const thresh = Math.max(45, gradMax * 0.55);

  const out: DamageCandidate[] = [];

  // Row sweep — long horizontal/diagonal runs of strong gradient = crack-like.
  for (let y = 2; y < H - 2; y += 3) {
    let runStart = -1;
    let runStrength = 0;
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      // Crack heuristic: strong gradient AND interior pixel is darker than
      // its row mean — pure edge between two equally-bright panels is NOT a crack.
      const rowMean = luma[i];
      const isStrong = grad[i] > thresh && rowMean < stats.meanLuma + 10;
      if (isStrong) {
        if (runStart < 0) runStart = x;
        runStrength += grad[i];
      } else if (runStart >= 0) {
        const len = x - runStart;
        if (len >= Math.max(28, W * 0.12)) {
          const conf = Math.min(0.75, 0.35 + (len / W) * 0.4 + (runStrength / (len * 200)) * 0.2);
          out.push({
            damage_type: "cracked_bumper",
            label: "Possible cracked bumper",
            confidence: conf,
            severity: "medium",
            bbox: scaleBBox(stats, runStart, Math.max(0, y - 4), len, 8),
            note: "A long, dark line sits on a body panel — could be a crack or split bumper edge.",
            next_step: "Confirm by touch — if it's a real crack, start the bumper repair workflow.",
            suggestedWorkflow: "general_repair",
            location: locationLabel(runStart + len / 2, y, W, H),
          });
        }
        runStart = -1;
        runStrength = 0;
      }
    }
  }

  // Keep the strongest 2 row hits.
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 2);
}

/* ---------- panel-gap detection ----------
 * Vertical bands of strong gradient that span ≥40% of the (lower) frame height
 * with a dark interior strip = likely panel gap or bumper-cover separation.
 */

function findPanelGaps(stats: Stats): DamageCandidate[] {
  const { W, H, luma } = stats;
  const out: DamageCandidate[] = [];

  // Only scan the lower 65% of the frame — that's where bumpers/wheel arches live.
  const startY = Math.floor(H * 0.35);
  const endY = H - 2;

  for (let x = 2; x < W - 2; x += 2) {
    let darkRun = 0;
    let darkStartY = -1;
    let bestRun = 0;
    let bestY = -1;
    for (let y = startY; y < endY; y++) {
      const i = y * W + x;
      // Vertical seam: pixel is darker than both horizontal neighbours by margin.
      const left = luma[i - 1];
      const right = luma[i + 1];
      const center = luma[i];
      const isSeam = center < left - 25 && center < right - 25;
      if (isSeam) {
        if (darkStartY < 0) darkStartY = y;
        darkRun++;
        if (darkRun > bestRun) {
          bestRun = darkRun;
          bestY = darkStartY;
        }
      } else {
        darkRun = 0;
        darkStartY = -1;
      }
    }
    const verticalSpan = (endY - startY);
    if (bestRun >= Math.max(12, verticalSpan * 0.35) && bestY >= 0) {
      const conf = Math.min(0.7, 0.35 + (bestRun / verticalSpan) * 0.35);
      out.push({
        damage_type: "panel_gap",
        label: "Panel gap / misalignment",
        confidence: conf,
        severity: "low",
        bbox: scaleBBox(stats, Math.max(0, x - 4), bestY, 8, bestRun),
        note: "Long vertical dark seam on the lower body — could be a misaligned bumper cover or panel.",
        next_step: "Check whether the bumper edge sits flush — broken clips often cause this.",
        suggestedWorkflow: "general_repair",
        location: locationLabel(x, bestY + bestRun / 2, W, H),
      });
    }
  }

  // De-dupe near-by gap detections — keep the strongest 1.
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 1);
}

/* ---------- helpers ---------- */

function locationLabel(cx: number, cy: number, W: number, H: number): string {
  const xPart = cx < W / 3 ? "left" : cx > (2 * W) / 3 ? "right" : "centre";
  const yPart = cy < H / 3 ? "upper" : cy > (2 * H) / 3 ? "lower" : "middle";
  // Heuristic: lower-side regions near edges are typically wheel-arch / bumper corner.
  if (yPart === "lower" && (xPart === "left" || xPart === "right")) {
    return `${yPart}-${xPart} (near wheel arch)`;
  }
  return `${yPart}-${xPart}`;
}

function mergeOverlapping(list: DamageCandidate[]): DamageCandidate[] {
  const out: DamageCandidate[] = [];
  for (const c of list) {
    const dup = out.find(
      (o) => o.damage_type === c.damage_type && bboxIoU(o.bbox, c.bbox) > 0.4,
    );
    if (dup) {
      if (c.confidence > dup.confidence) {
        Object.assign(dup, c);
      }
    } else {
      out.push(c);
    }
  }
  return out;
}

function bboxIoU(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = aw * ah + bw * bh - inter;
  return union <= 0 ? 0 : inter / union;
}

/* ---------- pretty labels for the manual fallback ---------- */

export const MANUAL_DAMAGE_OPTIONS: {
  label: string;
  damage_type: DamageType | "dent" | "rust" | "scratch";
  severity: Finding["severity"];
  workflow: RepairWorkflow;
}[] = [
  { label: "Scrape (you spotted it)", damage_type: "bumper_scrape", severity: "low", workflow: "paint_repair" },
  { label: "Crack / split (you spotted it)", damage_type: "cracked_bumper", severity: "medium", workflow: "general_repair" },
  { label: "Dent (you spotted it)", damage_type: "dent", severity: "low", workflow: "dent_repair" },
  { label: "Paint transfer (you spotted it)", damage_type: "paint_transfer", severity: "low", workflow: "paint_repair" },
  { label: "Rust spot (you spotted it)", damage_type: "rust", severity: "medium", workflow: "rust_repair" },
  { label: "Panel gap (you spotted it)", damage_type: "panel_gap", severity: "low", workflow: "general_repair" },
  { label: "Broken bumper clip (you spotted it)", damage_type: "bumper_clip", severity: "low", workflow: "general_repair" },
  { label: "Scratch (you spotted it)", damage_type: "scratch", severity: "low", workflow: "paint_repair" },
];

/** Best-effort mapping from a damage candidate to a repair workflow slug. */
export function damageToWorkflow(t: DamageType): RepairWorkflow {
  switch (t) {
    case "bumper_scrape":
    case "fender_scrape":
    case "paint_transfer":
      return "paint_repair";
    case "cracked_bumper":
    case "panel_gap":
    case "bumper_clip":
    case "cosmetic_damage":
      return "general_repair";
  }
}

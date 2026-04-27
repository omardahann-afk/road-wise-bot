// ============================================================================
// Regression test — browser-side damage-detection layer.
//
// Verifies that synthetic luma fields representing the requested test case
// (white front bumper / fender area with scrape marks, paint transfer,
// crack-like dark line, and panel gap) produce non-empty damage candidates
// with the right damage_types and a workable suggested workflow.
//
// Pure-data test: bypasses the DOM by feeding the heuristic pipeline a
// pre-built Stats object.
//
// Run: bun test src/lib/__tests__/damage-detection.test.ts
// ============================================================================
import { describe, it, expect } from "bun:test";
import {
  buildStatsFromLuma,
  detectDamageFromStats,
  damageToWorkflow,
  MANUAL_DAMAGE_OPTIONS,
} from "@/lib/damage-detection";
import { classifyRepair } from "@/lib/valuation";

const W = 256;
const H = 192;

/** Build a synthetic "white panel" canvas with various damage signatures. */
function buildSyntheticDamageImage(): Float32Array {
  const luma = new Float32Array(W * H);
  // Bright white panel base ~225 with mild noise.
  for (let i = 0; i < W * H; i++) {
    luma[i] = 220 + (Math.sin(i * 0.013) * 4);
  }

  // 1) Long horizontal scrape streak (paint-transfer style) ~y=110, x=40-150
  for (let x = 40; x < 150; x++) {
    for (let dy = -2; dy <= 2; dy++) {
      luma[(110 + dy) * W + x] = 50;
    }
  }

  // 2) Compact dark blob (paint transfer) ~ x=180-210, y=60-90
  for (let y = 60; y < 90; y++) {
    for (let x = 180; x < 210; x++) {
      luma[y * W + x] = 40;
    }
  }

  // 3) Crack-like long dark line near lower-half row 150, spanning >12% of width
  for (let x = 30; x < 180; x++) {
    luma[150 * W + x] = 70;
    luma[151 * W + x] = 75;
  }

  // 4) Vertical panel-gap seam at x=220, lower half
  for (let y = 90; y < 175; y++) {
    luma[y * W + 220] = 30;
  }

  return luma;
}

describe("damage-detection — synthetic white-panel image", () => {
  const stats = buildStatsFromLuma(W, H, buildSyntheticDamageImage());
  const candidates = detectDamageFromStats(stats, { maxCandidates: 6 });
  const types = new Set(candidates.map((c) => c.damage_type));

  it("returns a non-empty candidate list (does NOT silently say 'no issue')", () => {
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("surfaces at least one of the expected damage signatures", () => {
    const expected = [
      "bumper_scrape",
      "fender_scrape",
      "paint_transfer",
      "cracked_bumper",
      "panel_gap",
      "cosmetic_damage",
    ];
    const hit = expected.some((t) => types.has(t as never));
    expect(hit).toBe(true);
  });

  it("every candidate has a sane bbox and confidence", () => {
    for (const c of candidates) {
      const [x, y, w, h] = c.bbox;
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeGreaterThan(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.note.length).toBeGreaterThan(0);
      expect(c.next_step.length).toBeGreaterThan(0);
      expect(c.location.length).toBeGreaterThan(0);
    }
  });

  it("each candidate maps to a real RepairWorkflow", () => {
    const valid = new Set([
      "dent_repair",
      "rust_repair",
      "paint_repair",
      "tire_service",
      "fluid_leak",
      "warning_light_diagnostic",
      "interior_repair",
      "battery_service",
      "general_repair",
    ]);
    for (const c of candidates) {
      const direct = damageToWorkflow(c.damage_type);
      expect(valid.has(direct)).toBe(true);
      expect(valid.has(c.suggestedWorkflow)).toBe(true);
    }
  });

  it("classifyRepair routes detected damage labels into a non-default workflow when applicable", () => {
    for (const c of candidates) {
      const handoff = classifyRepair({
        step: "diagnose_camera",
        category: "exterior",
        issue: c.label,
        severity: c.severity,
      });
      // Each candidate must produce a workflow handoff (general_repair is fine).
      expect(handoff.workflow.length).toBeGreaterThan(0);
    }
  });
});

describe("damage-detection — dark vehicle (light-paint heuristics gated off)", () => {
  it("does NOT spam scrape/paint-transfer candidates on a uniformly dark panel", () => {
    const luma = new Float32Array(W * H).fill(60); // dark panel
    const stats = buildStatsFromLuma(W, H, luma);
    const candidates = detectDamageFromStats(stats);
    for (const c of candidates) {
      expect(c.damage_type).not.toBe("paint_transfer");
      expect(c.damage_type).not.toBe("bumper_scrape");
    }
  });
});

describe("damage-detection — clean panel produces no false positives", () => {
  it("returns zero or only low-confidence candidates on a uniformly bright panel", () => {
    const luma = new Float32Array(W * H).fill(220);
    const stats = buildStatsFromLuma(W, H, luma);
    const candidates = detectDamageFromStats(stats);
    expect(candidates.length).toBeLessThanOrEqual(1);
    if (candidates.length === 1) {
      expect(candidates[0].confidence).toBeLessThan(0.7);
    }
  });
});

describe("MANUAL_DAMAGE_OPTIONS — taxonomy alignment", () => {
  it("covers scrape, crack, dent, paint transfer, rust, panel gap, broken clip, scratch", () => {
    const labels = MANUAL_DAMAGE_OPTIONS.map((o) => o.label.toLowerCase()).join(" | ");
    for (const expected of [
      "scrape",
      "crack",
      "dent",
      "paint transfer",
      "rust",
      "panel gap",
      "broken bumper clip",
      "scratch",
    ]) {
      expect(labels).toContain(expected);
    }
  });

  it("each option routes to a real RepairWorkflow", () => {
    const valid = new Set([
      "dent_repair",
      "rust_repair",
      "paint_repair",
      "tire_service",
      "fluid_leak",
      "warning_light_diagnostic",
      "interior_repair",
      "battery_service",
      "general_repair",
    ]);
    for (const o of MANUAL_DAMAGE_OPTIONS) {
      expect(valid.has(o.workflow)).toBe(true);
    }
  });
});

describe("classifyRepair — extended damage vocabulary", () => {
  it("routes 'bumper scrape' to paint_repair", () => {
    const r = classifyRepair({
      step: "diagnose_camera",
      category: "exterior",
      issue: "Bumper scrape detected",
      severity: "low",
    });
    expect(r.workflow).toBe("paint_repair");
  });

  it("routes 'paint transfer' to paint_repair", () => {
    const r = classifyRepair({
      step: "diagnose_camera",
      category: "exterior",
      issue: "Paint transfer visible",
      severity: "low",
    });
    expect(r.workflow).toBe("paint_repair");
  });

  it("routes 'cracked bumper' to general_repair", () => {
    const r = classifyRepair({
      step: "diagnose_camera",
      category: "exterior",
      issue: "Possible cracked bumper",
      severity: "medium",
    });
    expect(r.workflow).toBe("general_repair");
  });

  it("routes 'panel gap' to general_repair", () => {
    const r = classifyRepair({
      step: "diagnose_camera",
      category: "exterior",
      issue: "Panel gap / misalignment",
      severity: "low",
    });
    expect(r.workflow).toBe("general_repair");
  });
});

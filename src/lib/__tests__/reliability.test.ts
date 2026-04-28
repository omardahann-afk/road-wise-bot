// ============================================================================
// Reliability tests — every diagnosis flow must work without AI.
//
// Verifies:
//   - The shared AI fallback message + finite timeout exist.
//   - Local symptom + camera fallbacks always return renderable, JSON-safe results.
//   - The OBD2 deterministic dataset answers without any AI call.
//
// Run: bun test src/lib/__tests__/reliability.test.ts
// ============================================================================
import { describe, expect, it } from "bun:test";
import { localSymptomDiagnose } from "@/lib/symptom-local";
import { localCameraAnalyze } from "@/lib/camera-local";
import { lookupObd2, inferObd2Stub } from "@/lib/obd2-dataset";
import { estimateRepairCost } from "@/lib/pricing";
import { AI_UNAVAILABLE_MESSAGE, AI_DEFAULT_TIMEOUT_MS } from "@/lib/ai";

describe("Reliability — AI is optional enhancement", () => {
  describe("Shared AI fallback contract", () => {
    it("publishes a single user-facing fallback message", () => {
      expect(AI_UNAVAILABLE_MESSAGE).toMatch(/AI enhancement is unavailable/);
    });

    it("enforces a finite default AI timeout", () => {
      expect(AI_DEFAULT_TIMEOUT_MS).toBeGreaterThan(0);
      expect(AI_DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
    });
  });


  describe("Symptom — local fallback", () => {
    it("returns a usable result even with empty input", () => {
      const r = localSymptomDiagnose("", "");
      expect(r.summary.length).toBeGreaterThan(0);
      expect(r.next_steps.length).toBeGreaterThan(0);
      expect(r.generic).toBe(true);
    });

    it("matches a no-start symptom with concrete steps", () => {
      const r = localSymptomDiagnose("Engine cranks but won't start");
      expect(r.generic).toBe(false);
      expect(r.severity).toBe("high");
      expect(r.possible_issues.some((p) => /battery/i.test(p.title))).toBe(true);
      expect(r.tools_needed).toContain("Multimeter");
    });

    it("flags overheating as critical with safety warnings", () => {
      const r = localSymptomDiagnose("Car is overheating, temp gauge in red");
      expect(r.severity).toBe("critical");
      expect(r.safety.length).toBeGreaterThan(0);
      expect(r.professional_recommended).toBe(true);
    });

    it("flags brake grinding as urgent", () => {
      const r = localSymptomDiagnose("Squealing noise when braking");
      expect(r.severity).toBe("high");
      expect(r.safety.length).toBeGreaterThan(0);
    });

    it("identifies flashing CEL as critical", () => {
      const r = localSymptomDiagnose("Check engine light flashing");
      expect(r.severity).toBe("critical");
      expect(r.professional_recommended).toBe(true);
    });

    it("falls back to generic guidance for nonsense input", () => {
      const r = localSymptomDiagnose("ufo abducted my air freshener");
      expect(r.generic).toBe(true);
      expect(r.next_steps.length).toBeGreaterThan(0);
    });

    it("serializes cleanly to JSON for persistence", () => {
      const r = localSymptomDiagnose("Battery dies overnight");
      const round = JSON.parse(JSON.stringify(r));
      expect(round.summary).toBe(r.summary);
      expect(round.possible_issues.length).toBe(r.possible_issues.length);
    });
  });

  describe("Camera — local fallback", () => {
    it("returns a renderable result with NO detections and NO damage", () => {
      const r = localCameraAnalyze({});
      expect(r.summary.length).toBeGreaterThan(0);
      expect(Array.isArray(r.likely_components)).toBe(true);
      expect(Array.isArray(r.warnings)).toBe(true);
      expect(r.next_action.length).toBeGreaterThan(0);
      expect(r.overall_confidence).toBe("low");
    });

    it("surfaces browser-detected damage as components", () => {
      const r = localCameraAnalyze({
        damage: [
          {
            damage_type: "scrape",
            label: "Scrape",
            confidence: 0.72,
            severity: "medium",
            bbox: [10, 10, 50, 50],
            note: "Dark mark on light surface",
            next_step: "Inspect closely",
            suggestedWorkflow: "paint_repair",
            location: "lower_left",
          },
        ],
      });
      expect(r.likely_components.length).toBeGreaterThanOrEqual(1);
      expect(r.likely_components[0].name).toBe("Scrape");
      expect(r.overall_confidence).toBe("high");
      expect(r.summary).toMatch(/Scrape/);
    });

    it("warns when surface visibility is low", () => {
      const r = localCameraAnalyze({
        visibility: { level: "low", paintTone: "dark", reasons: [], score: 0.2 } as never,
      });
      expect(r.warnings.some((w) => /lighting/i.test(w))).toBe(true);
      expect(r.image_quality?.lighting).toBe("poor");
      expect(r.recapture_tip).toBeTruthy();
    });

    it("warns about high-severity damage", () => {
      const r = localCameraAnalyze({
        damage: [
          {
            damage_type: "cracked_bumper",
            label: "Cracked bumper",
            confidence: 0.8,
            severity: "high",
            bbox: [0, 0, 100, 100],
            note: "",
            next_step: "",
            suggestedWorkflow: "general_repair",
            location: "front",
          },
        ],
      });
      expect(r.warnings.some((w) => /significant damage/i.test(w))).toBe(true);
    });

    it("serializes cleanly to JSON for persistence", () => {
      const r = localCameraAnalyze({ detections: [{ class: "car", score: 0.9 }] });
      const round = JSON.parse(JSON.stringify(r));
      expect(round.summary).toBe(r.summary);
    });
  });

  describe("OBD2 — deterministic dataset works without AI", () => {
    it("looks up a known code from the local dataset", () => {
      const e = lookupObd2("P0420");
      expect(e).not.toBeNull();
      expect(e?.title).toMatch(/Catalyst/i);
    });

    it("falls back to a structured stub for unknown valid codes", () => {
      const e = inferObd2Stub("P9999");
      expect(e).not.toBeNull();
      expect(e?.system).toBe("powertrain");
      expect(e?.pricing_issue).toBe("warning_light_diagnostic");
    });

    it("rejects malformed codes", () => {
      expect(inferObd2Stub("ZZZZZ")).toBeNull();
      expect(inferObd2Stub("123")).toBeNull();
    });

    it("produces deterministic pricing without AI", () => {
      const e = lookupObd2("P0301")!;
      const p = estimateRepairCost({
        issue_type: e.pricing_issue,
        severity: e.severity,
        region: "canada",
      });
      expect(p.low_estimate).toBeGreaterThan(0);
      expect(p.high_estimate).toBeGreaterThanOrEqual(p.low_estimate);
    });
  });
});

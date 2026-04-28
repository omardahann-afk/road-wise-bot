// Orchestrator & local-fallback tests.
// Pure-JS — does NOT hit Supabase or AI. Verifies the orchestrator returns
// a usable result even when network/AI are unavailable.

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  runLocalDiagnosis,
  type DiagnosisInput,
} from "@/lib/local-diagnosis-fallback";
import { checkQuote } from "@/lib/diagnosis-orchestrator";

describe("runLocalDiagnosis", () => {
  it("matches misfire / P0301 to a high-severity result", () => {
    const r = runLocalDiagnosis({ obdCode: "P0301" });
    expect(r.severity).toBe("high");
    expect(r.likelyIssues.length).toBeGreaterThan(0);
    expect(r.source).toBe("local_fallback");
  });

  it("matches P0420 catalyst code", () => {
    const r = runLocalDiagnosis({ obdCode: "p0420" });
    expect(r.summary?.toLowerCase()).toContain("catalyst");
    expect(r.estimatedCostHigh).toBeGreaterThan(0);
  });

  it("matches brake grinding text to high severity / no-drive", () => {
    const r = runLocalDiagnosis({ symptom: "Loud grinding noise from the brakes" });
    expect(r.severity).toBe("high");
    expect(r.safeToDrive).toBe("no");
  });

  it("matches overheating to critical / no-drive", () => {
    const r = runLocalDiagnosis({ symptom: "Car is overheating, gauge in red" });
    expect(r.severity).toBe("critical");
    expect(r.safeToDrive).toBe("no");
  });

  it("matches oil pressure warning to critical", () => {
    const r = runLocalDiagnosis({ symptom: "Oil pressure light came on" });
    expect(r.severity).toBe("critical");
    expect(r.warnings && r.warnings.length).toBeGreaterThan(0);
  });

  it("returns generic safety fallback for unmatched input", () => {
    const r = runLocalDiagnosis({ symptom: "weird purple noise from the dashboard" });
    expect(r.source).toBe("generic_safety_fallback");
    expect(r.nextStep.length).toBeGreaterThan(0);
  });

  it("returns a generic result for empty input", () => {
    const r = runLocalDiagnosis({} as DiagnosisInput);
    expect(r.source).toBe("generic_safety_fallback");
    expect(r.confidence).toBeGreaterThan(0);
  });
});

describe("checkQuote", () => {
  it("flags very_high quotes more than 35% above the high range", () => {
    const r = checkQuote(1500, 400, 800);
    expect(r.verdict).toBe("very_high");
    expect(r.message).toContain("$400");
  });

  it("flags high quotes above the typical range", () => {
    const r = checkQuote(900, 400, 800);
    expect(r.verdict).toBe("high");
  });

  it("flags suspiciously_low quotes well below the low end", () => {
    const r = checkQuote(200, 400, 800);
    expect(r.verdict).toBe("suspiciously_low");
    expect(r.questionsToAsk.some((q) => /used|refurbish/i.test(q))).toBe(true);
  });

  it("returns fair when quote sits inside the range", () => {
    const r = checkQuote(550, 400, 800);
    expect(r.verdict).toBe("fair");
    expect(r.questionsToAsk.length).toBeGreaterThan(0);
  });

  it("includes the negotiation advice and itemization questions", () => {
    const r = checkQuote(900, 400, 800);
    expect(r.negotiationAdvice.length).toBeGreaterThan(0);
    expect(r.questionsToAsk.length).toBeGreaterThan(0);
  });
});

describe("runDiagnosis (orchestrator) — failure resilience", () => {
  // We mock the supabase client and the AI call so we can simulate failures.
  beforeEach(() => {
    mock.module("@/integrations/supabase/client", () => ({
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                throw new Error("simulated supabase outage");
              },
            }),
          }),
        }),
      },
    }));
    mock.module("@/lib/ai", () => ({
      AI_DEFAULT_TIMEOUT_MS: 100,
      AI_UNAVAILABLE_MESSAGE: "AI enhancement is unavailable.",
      callAi: async () => {
        throw new Error("simulated AI outage");
      },
      callAiSafe: async () => ({
        ok: false,
        reason: "network",
        message: "AI enhancement is unavailable.",
      }),
    }));
  });

  afterEach(() => {
    mock.restore();
  });

  it("returns a usable result when both Supabase and AI fail", async () => {
    const { runDiagnosis } = await import("@/lib/diagnosis-orchestrator");
    const r = await runDiagnosis({ symptom: "Car won't start, just clicks" });
    expect(r).toBeDefined();
    expect(r.likelyIssues.length).toBeGreaterThan(0);
    expect(r.nextStep.length).toBeGreaterThan(0);
    // AI failed → should be marked as such
    expect(r.aiUsed).toBe(false);
  });

  it("never throws on empty input", async () => {
    const { runDiagnosis } = await import("@/lib/diagnosis-orchestrator");
    const r = await runDiagnosis({});
    expect(r.severity).toBeDefined();
    expect(r.safeToDrive).toBeDefined();
  });
});

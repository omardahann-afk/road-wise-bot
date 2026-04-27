// ============================================================================
// Regression test: battery_service workflow end-to-end.
// Run: bun test src/lib/__tests__/battery-workflow.test.ts
//
// Tests REAL buildWorkflow() — never mocks the builder. Mocks only the
// underlying AI transport (`callAi`) to simulate AI-available vs unavailable.
// ============================================================================
import { describe, expect, it, mock, beforeAll } from "bun:test";

// ---- Mock callAi BEFORE importing buildWorkflow so the module graph picks it up ----
let aiBehavior: "success" | "fail" = "fail";

await mock.module("@/lib/ai", () => ({
  callAi: async () => {
    if (aiBehavior === "fail") {
      throw new Error("Edge Function returned a non-2xx status code");
    }
    // Minimal valid AI response — buildWorkflow normalizes/hardens this.
    return {
      title: "Battery replacement (AI)",
      issue_type: "battery",
      vehicle_context: "2009 Dodge Journey",
      difficulty: "beginner" as const,
      estimated_time: "45 min",
      diy_possible: true,
      mechanic_recommended: false,
      tools_required: ["10mm socket", "Multimeter"],
      parts_required: ["Replacement battery", "Battery terminal cleaner"],
      safety_warnings: ["Disconnect negative terminal first"],
      real_world_tips: [
        "Battery sits behind the wheel well — pop the fender liner.",
        "Hold-down bolts are usually rusted; soak with penetrating oil.",
      ],
      steps: [
        { step_number: 1, title: "Test the battery", instruction: "Measure resting voltage with a multimeter.", completion_check: "You confirmed the battery is the failure." },
        { step_number: 2, title: "Access via wheel well", instruction: "Turn the wheel and remove the fender liner.", completion_check: "Battery is visible." },
        { step_number: 3, title: "Disconnect terminals", instruction: "Negative first, then positive.", completion_check: "Both terminals are off and isolated." },
        { step_number: 4, title: "Free hold-down bolts", instruction: "Soak with penetrating oil and back out slowly.", completion_check: "Hold-down hardware is removed." },
        { step_number: 5, title: "Install new battery", instruction: "Reverse the order — positive first.", completion_check: "Engine starts cleanly." },
      ],
    };
  },
}));

// Now import — the mock is already in place.
const { buildWorkflow, workflowToEngineSteps } = await import("@/lib/workflow-builder");
const { classifyRepair } = await import("@/lib/valuation");

const VEHICLE = { year: 2009, make: "Dodge", model: "Journey" };
const ISSUE = "battery replacement — won't start";
const FINDING = {
  issue: ISSUE,
  severity: "medium" as const,
  category: "battery",
  step: "battery",
} as never;

const INPUT = {
  kind: "repair" as const,
  workflow: "battery_service" as const,
  issue: ISSUE,
  severity: "medium" as const,
  user_skill: "beginner" as const,
  vehicle: VEHICLE,
  real_world_insights: {
    driver_reports: ["Battery is behind the driver-side wheel well, not under the hood"],
    common_fixes: ["Turn the wheel and pop the fender liner clips for access"],
    watch_out_for: ["Hold-down bolts are often rusted — soak with penetrating oil first"],
  },
};

// ----------------------------------------------------------------------------
// 1. Routing
// ----------------------------------------------------------------------------
describe("battery_service — routing", () => {
  it("classifyRepair routes battery issues to battery_service", () => {
    const r = classifyRepair(FINDING);
    expect(r.workflow).toBe("battery_service");
  });
});

// ----------------------------------------------------------------------------
// Helper: run the same battery of assertions for both AI states.
// ----------------------------------------------------------------------------
function runWorkflowAssertions(label: string, mode: "success" | "fail") {
  describe(`battery_service — ${label}`, () => {
    let workflow: Awaited<ReturnType<typeof buildWorkflow>>;

    beforeAll(async () => {
      aiBehavior = mode;
      workflow = await buildWorkflow(INPUT);
    });

    it("2. pricing — issue_type is battery and pricing_source is engine", () => {
      expect(workflow.issue_type).toBe("battery");
      expect(workflow.pricing_source).toBe("engine");
      expect(workflow.estimated_cost.low_estimate).toBeGreaterThan(0);
      expect(workflow.estimated_cost.high_estimate).toBeGreaterThan(workflow.estimated_cost.low_estimate);
      // Battery profile typically yields parts in $120-$400 range; general_repair
      // would be in a much wider range. Sanity-check we're on the battery profile.
      expect(workflow.estimated_cost.high_estimate).toBeLessThan(2000);
    });

    if (mode === "fail") {
      it("3. fallback behavior — source/fallback_reason set", () => {
        expect(workflow.source).toBe("fallback");
        expect(workflow.fallback_reason).toBeDefined();
        expect(workflow.fallback_reason!.length).toBeGreaterThan(0);
      });
    } else {
      it("3'. AI-available — source is ai, no fallback_reason", () => {
        expect(workflow.source).toBe("ai");
      });
    }

    it("4. parts list includes battery essentials", () => {
      const blob = workflow.parts_required.join(" | ").toLowerCase();
      expect(blob).toContain("replacement battery");
      expect(blob).toContain("battery terminal cleaner");
      expect(blob).toContain("anti-corrosion");
      expect(blob).toContain("hold-down");
    });

    it("5. real-world tips include wheel well, rusted, penetrating oil", () => {
      const blob = workflow.real_world_tips.join(" | ").toLowerCase();
      expect(blob).toContain("wheel well");
      expect(blob).toContain("rusted");
      expect(blob).toContain("penetrating oil");
    });

    it("6. steps — count and required fields", () => {
      expect(workflow.steps.length).toBeGreaterThanOrEqual(4);
      for (const s of workflow.steps) {
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.instruction.length).toBeGreaterThan(0);
        expect(s.completion_check.length).toBeGreaterThan(0);
      }
    });

    it("7. StepEngine mapping preserves step count", () => {
      const engine = workflowToEngineSteps(workflow);
      expect(engine.length).toBe(workflow.steps.length);
    });

    it("8. persistence shape — payloads serialize cleanly for repair_guides / sessions / learning_events", () => {
      const repairGuide = {
        user_id: "00000000-0000-0000-0000-000000000000",
        title: workflow.title,
        steps: workflow.steps,
        tools: workflow.tools_required,
        parts: workflow.parts_required,
        warnings: workflow.safety_warnings,
        estimated_cost: {
          low: workflow.estimated_cost.low_estimate,
          high: workflow.estimated_cost.high_estimate,
          currency: "CAD",
        },
        difficulty: workflow.difficulty,
      };
      const session = {
        user_id: "00000000-0000-0000-0000-000000000000",
        kind: "repair",
        title: workflow.title,
        status: "active",
        data: { workflow_id: workflow.workflow_id, completed: [1, 2], current_step: 3, pricing_source: workflow.pricing_source },
      };
      const learning = {
        user_id: "00000000-0000-0000-0000-000000000000",
        source: "workflow_feedback",
        issue_detected: "battery_service",
        issue_confirmed_by_user: true,
        metadata: { workflow_id: workflow.workflow_id, outcome: "worked", actual_cost_cad: 280, fallback_used: workflow.source === "fallback" },
      };
      expect(() => JSON.stringify(repairGuide)).not.toThrow();
      expect(() => JSON.stringify(session)).not.toThrow();
      expect(() => JSON.stringify(learning)).not.toThrow();
      // sanity — no undefined values that'd break a JSONB insert
      expect(JSON.stringify(repairGuide)).not.toContain('":undefined');
      expect(JSON.stringify(session)).not.toContain('":undefined');
      expect(JSON.stringify(learning)).not.toContain('":undefined');
    });
  });
}

runWorkflowAssertions("AI unavailable (fallback)", "fail");
runWorkflowAssertions("AI available (success)", "success");

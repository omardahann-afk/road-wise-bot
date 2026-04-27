// ============================================================================
// Regression coverage for ALL existing RepairWorkflow types except
// battery_service (covered separately in battery-workflow.test.ts).
//
// For each workflow, asserts both AI-available and AI-unavailable paths:
//   - routing
//   - pricing profile (issue_type + pricing_source === "engine")
//   - fallback parts/tools populated
//   - safety warnings present
//   - real-world tips pass through
//   - workflowToEngineSteps preserves step count
//   - persistence payloads serialize cleanly
//
// Run: bun test src/lib/__tests__/repair-workflows.test.ts
// ============================================================================
import { describe, expect, it, mock, beforeAll } from "bun:test";

// Per-workflow mocked AI response — keeps the AI-available path realistic
// without reaching the network.
let aiBehavior: "success" | "fail" = "fail";
let currentMockResponse: Record<string, unknown> = {};

await mock.module("@/lib/ai", () => ({
  callAi: async () => {
    if (aiBehavior === "fail") {
      throw new Error("Edge Function returned a non-2xx status code");
    }
    return currentMockResponse;
  },
}));

const { buildWorkflow, workflowToEngineSteps } = await import("@/lib/workflow-builder");
const { classifyRepair } = await import("@/lib/valuation");
import type { RepairWorkflow } from "@/lib/valuation";
import type { IssueType } from "@/lib/pricing";

// ---------------------------------------------------------------------------
// Test cases — one row per workflow (battery_service excluded).
// ---------------------------------------------------------------------------
interface Case {
  name: string;
  workflow: RepairWorkflow;
  expectedIssueType: IssueType;
  // Issue string that should classify into this workflow.
  routingIssue: string;
  // Optional category to help the classifier (some workflows route by category).
  routingCategory?: string;
  // Real-world insights — should pass through to real_world_tips.
  insightTips: { driver: string; fix: string; watchOut: string };
  // Minimal valid AI response for the AI-available path.
  aiResponse: Record<string, unknown>;
}

const CASES: Case[] = [
  {
    name: "dent_repair",
    workflow: "dent_repair",
    expectedIssueType: "dent",
    routingIssue: "small dent on the rear quarter panel",
    insightTips: {
      driver: "Door dings on this model are very common in parking lots",
      fix: "PDR works well if the paint isn't cracked",
      watchOut: "Don't try to pop creased dents — the clear coat will tear",
    },
    aiResponse: {
      title: "Dent repair (AI)",
      difficulty: "intermediate",
      tools_required: ["slide hammer"],
      parts_required: ["Body filler"],
      safety_warnings: ["Wear safety glasses"],
      real_world_tips: ["AI tip about PDR"],
      steps: minimalSteps(5),
    },
  },
  {
    name: "rust_repair",
    workflow: "rust_repair",
    expectedIssueType: "rust",
    routingIssue: "rust forming on the rocker panel and corrosion under the door",
    insightTips: {
      driver: "Rocker panels rust early on this platform due to road salt",
      fix: "Strip to bright metal, rust converter, then etching primer",
      watchOut: "Perforated metal means structural failure — go to a body shop",
    },
    aiResponse: {
      title: "Rust repair (AI)",
      difficulty: "intermediate",
      tools_required: ["wire wheel"],
      parts_required: ["Rust converter"],
      safety_warnings: ["Wear N95 and gloves"],
      real_world_tips: ["AI tip about converter"],
      steps: minimalSteps(6),
    },
  },
  {
    name: "paint_repair",
    workflow: "paint_repair",
    expectedIssueType: "scratch_paint",
    routingIssue: "scratch through the clear coat on the door",
    insightTips: {
      driver: "Touch-up paint from parts stores rarely matches",
      fix: "Verify paint code on the door-jamb sticker",
      watchOut: "Burning through the clear coat is easy with a polisher",
    },
    aiResponse: {
      title: "Paint repair (AI)",
      difficulty: "beginner",
      tools_required: ["DA polisher"],
      parts_required: ["Touch-up paint"],
      safety_warnings: ["Use respirator when spraying"],
      real_world_tips: ["AI tip about paint code"],
      steps: minimalSteps(6),
    },
  },
  {
    name: "tire_service",
    workflow: "tire_service",
    expectedIssueType: "tire_service",
    routingIssue: "tread is low and the tire shows uneven wear",
    routingCategory: "tires",
    insightTips: {
      driver: "Cupping on this car usually means worn shocks",
      fix: "Rotate tires every 8000 km and re-torque after 100 km",
      watchOut: "Mismatched tread on AWD damages the centre differential",
    },
    aiResponse: {
      title: "Tire service (AI)",
      difficulty: "beginner",
      tools_required: ["torque wrench"],
      parts_required: ["Replacement tire"],
      safety_warnings: ["Use a torque wrench, never an impact"],
      real_world_tips: ["AI tip about rotation"],
      steps: minimalSteps(5),
    },
  },
  {
    name: "fluid_leak",
    workflow: "fluid_leak",
    expectedIssueType: "fluid_leak",
    routingIssue: "oil leak from the valve cover gasket dripping onto the exhaust",
    insightTips: {
      driver: "Valve cover gaskets harden after 100k km on this engine",
      fix: "Replace the gasket and torque to spec in the proper sequence",
      watchOut: "Brake or fuel leaks are a safety emergency — do not drive",
    },
    aiResponse: {
      title: "Fluid leak repair (AI)",
      difficulty: "intermediate",
      tools_required: ["torque wrench"],
      parts_required: ["Valve cover gasket"],
      safety_warnings: ["Let engine cool before working near exhaust"],
      real_world_tips: ["AI tip about leak source"],
      steps: minimalSteps(5),
    },
  },
  {
    name: "warning_light_diagnostic",
    workflow: "warning_light_diagnostic",
    expectedIssueType: "warning_light_diagnostic",
    routingIssue: "check engine light came on with code P0420",
    routingCategory: "dashboard",
    insightTips: {
      driver: "P0420 on this platform is usually a tired catalytic converter",
      fix: "Test O2 sensors and check for exhaust leaks before swapping cats",
      watchOut: "Replacing parts based only on the code wastes money",
    },
    aiResponse: {
      title: "Warning light diagnostic (AI)",
      difficulty: "intermediate",
      tools_required: ["OBD2 scanner"],
      parts_required: ["O2 sensor"],
      safety_warnings: ["Disconnect battery before electrical work"],
      real_world_tips: ["AI tip about codes"],
      steps: minimalSteps(5),
    },
  },
  {
    name: "interior_repair",
    workflow: "interior_repair",
    expectedIssueType: "interior_repair",
    routingIssue: "tear in the driver seat leather",
    routingCategory: "interior",
    insightTips: {
      driver: "Driver bolster tears are common after 100k miles",
      fix: "Leather repair kit with color matching works for clean tears",
      watchOut: "Mismatched dye stands out forever in daylight",
    },
    aiResponse: {
      title: "Interior repair (AI)",
      difficulty: "beginner",
      tools_required: ["leather repair kit"],
      parts_required: ["Color-matched dye"],
      safety_warnings: ["Ventilate the cabin when applying solvents"],
      real_world_tips: ["AI tip about dye matching"],
      steps: minimalSteps(5),
    },
  },
  {
    name: "general_repair",
    workflow: "general_repair",
    expectedIssueType: "general_repair",
    // Intentionally vague — should fall through all classifier branches.
    routingIssue: "something feels off when I drive",
    insightTips: {
      driver: "Vague symptoms need careful documentation",
      fix: "Reproduce the issue and note exactly when it happens",
      watchOut: "Skipping diagnosis wastes time and money",
    },
    aiResponse: {
      title: "General repair (AI)",
      difficulty: "intermediate",
      tools_required: ["multimeter"],
      parts_required: ["Diagnostic time"],
      safety_warnings: ["Use jack stands, never just a jack"],
      real_world_tips: ["AI tip about diagnosis"],
      steps: minimalSteps(5),
    },
  },
];

function minimalSteps(n: number): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_, i) => ({
    step_number: i + 1,
    title: `AI step ${i + 1}`,
    instruction: `AI instruction for step ${i + 1}.`,
    completion_check: `Step ${i + 1} verified.`,
  }));
}

// ---------------------------------------------------------------------------
// Run the same battery of assertions for every workflow + both AI states.
// ---------------------------------------------------------------------------
for (const c of CASES) {
  describe(`${c.name} — routing`, () => {
    it(`classifyRepair routes "${c.routingIssue}" to ${c.workflow}`, () => {
      const r = classifyRepair({
        issue: c.routingIssue,
        severity: "medium",
        category: c.routingCategory ?? "other",
        step: "test_step",
      } as never);
      expect(r.workflow).toBe(c.workflow);
    });
  });

  for (const mode of ["fail", "success"] as const) {
    describe(`${c.name} — AI ${mode === "fail" ? "unavailable (fallback)" : "available"}`, () => {
      let workflow: Awaited<ReturnType<typeof buildWorkflow>>;

      beforeAll(async () => {
        aiBehavior = mode;
        currentMockResponse = c.aiResponse;
        workflow = await buildWorkflow({
          kind: "repair",
          workflow: c.workflow,
          issue: c.routingIssue,
          severity: "medium",
          user_skill: "beginner",
          vehicle: { year: 2015, make: "Toyota", model: "Camry" },
          real_world_insights: {
            driver_reports: [c.insightTips.driver],
            common_fixes: [c.insightTips.fix],
            watch_out_for: [c.insightTips.watchOut],
          },
        });
      });

      it("pricing — issue_type matches and pricing_source is engine", () => {
        expect(workflow.issue_type).toBe(c.expectedIssueType);
        expect(workflow.pricing_source).toBe("engine");
        expect(workflow.estimated_cost.low_estimate).toBeGreaterThan(0);
        expect(workflow.estimated_cost.high_estimate).toBeGreaterThan(workflow.estimated_cost.low_estimate);
      });

      it(`source flag is ${mode === "fail" ? "fallback" : "ai"}`, () => {
        if (mode === "fail") {
          expect(workflow.source).toBe("fallback");
          expect(workflow.fallback_reason).toBeDefined();
          expect(workflow.fallback_reason!.length).toBeGreaterThan(0);
        } else {
          expect(workflow.source).toBe("ai");
        }
      });

      it("fallback tools and parts are populated", () => {
        expect(workflow.tools_required.length).toBeGreaterThan(0);
        expect(workflow.parts_required.length).toBeGreaterThan(0);
      });

      it("safety warnings exist", () => {
        expect(workflow.safety_warnings.length).toBeGreaterThan(0);
        for (const w of workflow.safety_warnings) {
          expect(typeof w).toBe("string");
          expect(w.length).toBeGreaterThan(0);
        }
      });

      it("real-world tips pass through (driver/fix/watchOut markers visible)", () => {
        const blob = workflow.real_world_tips.join(" | ").toLowerCase();
        // At least ONE of the three insight bullets should be visible. AI mode
        // may legitimately replace tips with its own — but in that case the AI
        // response above includes a recognizable "AI tip" marker.
        const driverHit = blob.includes(c.insightTips.driver.toLowerCase().slice(0, 20));
        const fixHit = blob.includes(c.insightTips.fix.toLowerCase().slice(0, 20));
        const watchHit = blob.includes(c.insightTips.watchOut.toLowerCase().slice(0, 20));
        const aiHit = blob.includes("ai tip");
        expect(driverHit || fixHit || watchHit || aiHit).toBe(true);
      });

      it("steps have title, instruction, completion_check", () => {
        expect(workflow.steps.length).toBeGreaterThanOrEqual(4);
        for (const s of workflow.steps) {
          expect(s.title.length).toBeGreaterThan(0);
          expect(s.instruction.length).toBeGreaterThan(0);
          expect(s.completion_check.length).toBeGreaterThan(0);
        }
      });

      it("workflowToEngineSteps preserves step count", () => {
        const engine = workflowToEngineSteps(workflow);
        expect(engine.length).toBe(workflow.steps.length);
      });

      it("persistence payloads serialize cleanly", () => {
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
          data: { workflow_id: workflow.workflow_id, completed: [1], current_step: 2, pricing_source: workflow.pricing_source },
        };
        const learning = {
          user_id: "00000000-0000-0000-0000-000000000000",
          source: "workflow_feedback",
          issue_detected: c.workflow,
          issue_confirmed_by_user: true,
          metadata: { workflow_id: workflow.workflow_id, outcome: "worked", fallback_used: workflow.source === "fallback" },
        };
        for (const payload of [repairGuide, session, learning]) {
          const json = JSON.stringify(payload);
          expect(json).not.toContain('":undefined');
          expect(json.length).toBeGreaterThan(0);
        }
      });
    });
  });
}

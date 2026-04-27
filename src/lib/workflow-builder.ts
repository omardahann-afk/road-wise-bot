// ============================================================================
// AutoSage Brain — AI Workflow Builder
//
// Composes vehicle context + diagnostic + camera + inspection + real-world
// insights + user skill into a single AI request, then HARDENS the AI output
// through a deterministic safety + pricing gate before it reaches the user.
//
// Design contract:
//   - AI may DRAFT instructions, tips, and step structure.
//   - AI may NOT set pricing (pricing.ts is the source of truth).
//   - AI may NOT bypass safety rules for safety-critical systems.
//   - The app ALWAYS returns a valid GeneratedWorkflow — never blank.
//   - When AI fails, deterministic FALLBACK_STEPS + GUIDE_META are used.
// ============================================================================
import { callAi } from "@/lib/ai";
import {
  estimateRepairCost,
  formatCAD,
  type IssueType,
  type Severity,
  type PricingResult,
} from "@/lib/pricing";
import {
  FALLBACK_STEPS,
  FALLBACK_PARTS,
  GUIDE_META,
  type EngineStep,
} from "@/lib/repair-engine";
import type { RepairWorkflow } from "@/lib/valuation";

// ---------- Public types ----------------------------------------------------

export type WorkflowKind = "repair" | "inspection" | "maintenance" | "cleaning";
export type Skill = "beginner" | "intermediate" | "advanced";

export interface VehicleContext {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  mileage?: number | null;
  vin?: string | null;
}

export interface BuildWorkflowInput {
  workflow: RepairWorkflow;
  kind: WorkflowKind;
  issue?: string;
  severity?: Severity;
  vehicle?: VehicleContext | null;
  obd2_codes?: string[];
  symptoms?: string[];
  camera_findings?: string[];
  inspection_findings?: string[];
  real_world_insights?: {
    driver_reports?: string[];
    common_fixes?: string[];
    watch_out_for?: string[];
  } | null;
  user_skill?: Skill;
  available_tools?: string[];
  pricing?: PricingResult; // optional override; otherwise computed
}

export interface WorkflowStep {
  step_number: number;
  title: string;
  instruction: string;
  why_it_matters: string;
  tools_needed: string[];
  warning: string | null;
  completion_check: string;
  uncertain?: boolean;
}

export interface GeneratedWorkflow {
  workflow_id: string;
  source: "ai" | "fallback" | "hybrid";
  /** When source !== "ai", a short user-friendly reason why the AI path didn't run. */
  fallback_reason?: string | null;
  /** Pricing always comes from the deterministic engine — never from AI. */
  pricing_source: "engine";
  title: string;
  issue_type: IssueType;
  workflow_kind: WorkflowKind;
  vehicle_context: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimated_time: string;
  estimated_cost: PricingResult; // deterministic, always present
  diy_possible: boolean;
  mechanic_recommended: boolean;
  tools_required: string[];
  parts_required: string[];
  safety_warnings: string[];
  real_world_tips: string[];
  steps: WorkflowStep[];
  generated_at: number;
}

// ---------- Safety policy --------------------------------------------------

const SAFETY_CRITICAL_KEYWORDS: Array<{ pattern: RegExp; reminder: string }> = [
  { pattern: /brake|caliper|rotor|pad|abs/i,         reminder: "Brakes are safety-critical — bleed and pump pedal until firm before driving. If unsure, escalate to a mechanic." },
  { pattern: /airbag|srs/i,                          reminder: "Airbag/SRS work can disable deployment. Disconnect battery and wait 10+ minutes before touching any yellow connector." },
  { pattern: /fuel|injector|fuel pump|gas tank/i,    reminder: "Fuel system work — relieve fuel pressure first, no sparks or open flames, work outdoors or with strong ventilation." },
  { pattern: /hybrid|ev |electric vehicle|hv /i,     reminder: "High-voltage hybrid/EV systems can be lethal. Do not touch orange cables. This work is for trained technicians only." },
  { pattern: /steering|tie rod|rack|knuckle/i,       reminder: "Steering components are safety-critical — torque to spec and have alignment checked before driving normally." },
  { pattern: /suspension|strut|shock|control arm/i,  reminder: "Suspension components carry vehicle weight under load — use jack stands, never just a jack, and torque to spec." },
  { pattern: /frame|rocker panel|subframe|structural rust/i, reminder: "Structural rust or frame damage is a safety failure — escalate to a body shop, do not patch over." },
  { pattern: /wiring harness|short circuit|burn(t|ed) wire/i, reminder: "Severe electrical issues can cause fires — disconnect battery and have a qualified shop diagnose before reconnecting." },
];

const GENERAL_SAFETY_REMINDERS: string[] = [
  "Wear safety glasses — fasteners, debris, and fluids can fly back unexpectedly.",
  "Use jack stands on a level surface whenever a wheel is off the ground — never trust a hydraulic jack alone.",
  "Disconnect the negative battery terminal before any electrical work to prevent shorts.",
];

const SAFETY_CRITICAL_WORKFLOWS: Set<RepairWorkflow> = new Set([
  "fluid_leak", // brake/fuel leaks fall here
]);

function isSafetyCritical(input: BuildWorkflowInput): boolean {
  if (SAFETY_CRITICAL_WORKFLOWS.has(input.workflow)) return true;
  const blob = [
    input.issue ?? "",
    ...(input.symptoms ?? []),
    ...(input.camera_findings ?? []),
    ...(input.inspection_findings ?? []),
  ].join(" ").toLowerCase();
  return SAFETY_CRITICAL_KEYWORDS.some((r) => r.pattern.test(blob));
}

/**
 * Adds any missing critical safety reminders based on detected keywords,
 * guarantees at least one general safety line, and de-duplicates.
 */
function hardenSafety(
  warnings: string[],
  input: BuildWorkflowInput,
): { warnings: string[]; mechanicRecommended: boolean } {
  const out = new Set<string>(warnings.filter(Boolean));
  let mechRequired = false;

  const blob = [
    input.issue ?? "",
    ...(input.symptoms ?? []),
    ...(input.camera_findings ?? []),
    ...(input.inspection_findings ?? []),
  ].join(" ").toLowerCase();

  for (const rule of SAFETY_CRITICAL_KEYWORDS) {
    if (rule.pattern.test(blob)) {
      out.add(rule.reminder);
      mechRequired = true;
    }
  }
  // Always include at least one general reminder if AI produced none.
  if (out.size === 0) {
    out.add(GENERAL_SAFETY_REMINDERS[0]);
  }
  // Battery/electrical hint if workflow mentions electrical without explicit reminder.
  if (/electrical|battery|alternator|fuse|sensor/i.test(blob) && ![...out].some((w) => /battery|disconnect|short/i.test(w))) {
    out.add(GENERAL_SAFETY_REMINDERS[2]);
  }

  return { warnings: Array.from(out).slice(0, 8), mechanicRecommended: mechRequired };
}

// ---------- Deterministic helpers -----------------------------------------

function vehicleContextString(v?: VehicleContext | null): string {
  if (!v) return "Generic vehicle";
  const parts = [v.year, v.make, v.model].filter(Boolean).join(" ").trim();
  if (!parts) return "Generic vehicle";
  return v.mileage ? `${parts} · ${v.mileage.toLocaleString()} km` : parts;
}

function pricingFor(input: BuildWorkflowInput): PricingResult {
  if (input.pricing) return input.pricing;
  return estimateRepairCost({
    issue_type: workflowToIssueType(input.workflow),
    severity: input.severity ?? "medium",
    vehicle_year: input.vehicle?.year ?? null,
    vehicle_make: input.vehicle?.make ?? null,
    vehicle_model: input.vehicle?.model ?? null,
    region: "canada",
  });
}

const WORKFLOW_TO_ISSUE: Record<RepairWorkflow, IssueType> = {
  dent_repair: "dent",
  rust_repair: "rust",
  paint_repair: "scratch_paint",
  tire_service: "tire_service",
  fluid_leak: "fluid_leak",
  warning_light_diagnostic: "warning_light_diagnostic",
  interior_repair: "interior_repair",
  battery_service: "battery",
  general_repair: "general_repair",
};

export function workflowToIssueType(w: RepairWorkflow): IssueType {
  return WORKFLOW_TO_ISSUE[w] ?? "general_repair";
}

// ---------- AI shape (loose — we never trust it directly) -----------------

interface AiWorkflowResponse {
  title?: string;
  issue_type?: string;
  vehicle_context?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  estimated_time?: string;
  estimated_cost_note?: string;
  diy_possible?: boolean;
  mechanic_recommended?: boolean;
  tools_required?: string[];
  parts_required?: string[];
  safety_warnings?: string[];
  real_world_tips?: string[];
  uncertain_steps?: number[];
  steps?: Array<{
    step_number?: number;
    title?: string;
    instruction?: string;
    why_it_matters?: string;
    tools_needed?: string[];
    warning?: string | null;
    completion_check?: string;
  }>;
}

// ---------- Prompt input shaping (controls AI cost) -----------------------

/** Summarize real-world insights down to short bullets so the prompt stays small. */
function summarizeInsights(rwi: BuildWorkflowInput["real_world_insights"]): string[] {
  if (!rwi) return [];
  const out: string[] = [];
  rwi.driver_reports?.slice(0, 3).forEach((r) => out.push(`Drivers report: ${r}`));
  rwi.common_fixes?.slice(0, 3).forEach((f) => out.push(`Common fix: ${f}`));
  rwi.watch_out_for?.slice(0, 3).forEach((w) => out.push(`Watch out: ${w}`));
  return out.slice(0, 8);
}

// ---------- Fallback workflow (used when AI fails) ------------------------

function fallbackWorkflow(
  input: BuildWorkflowInput,
  pricing: PricingResult,
  fallbackReason: string | null = null,
): GeneratedWorkflow {
  const baseSteps = FALLBACK_STEPS[input.workflow] ?? FALLBACK_STEPS.general_repair;
  const meta = GUIDE_META[input.workflow] ?? GUIDE_META.general_repair;
  const safety = hardenSafety(meta.safety, input);

  const steps: WorkflowStep[] = baseSteps.map((s) => ({
    step_number: s.step_number,
    title: s.title,
    instruction: s.instruction,
    why_it_matters: s.why_it_matters ?? "Doing this step correctly avoids rework and prevents the issue from coming back.",
    tools_needed: s.tools ?? [],
    warning: s.warning ?? null,
    completion_check: deriveCompletionCheck(s),
  }));

  return {
    workflow_id: makeWorkflowId(input),
    source: "fallback",
    fallback_reason: fallbackReason,
    pricing_source: "engine",
    title: meta.tools.length > 0 ? `${input.workflow.replace(/_/g, " ")} — guided walkthrough` : "Guided repair",
    issue_type: workflowToIssueType(input.workflow),
    workflow_kind: input.kind,
    vehicle_context: vehicleContextString(input.vehicle),
    difficulty: pricing.difficulty,
    estimated_time: meta.time_estimate,
    estimated_cost: pricing,
    diy_possible: pricing.diy_possible,
    mechanic_recommended: safety.mechanicRecommended || !pricing.diy_possible,
    tools_required: meta.tools.slice(0, 8),
    parts_required: FALLBACK_PARTS[input.workflow] ?? FALLBACK_PARTS.general_repair,
    safety_warnings: safety.warnings,
    real_world_tips: summarizeInsights(input.real_world_insights),
    steps,
    generated_at: Date.now(),
  };
}

function deriveCompletionCheck(s: EngineStep): string {
  // Heuristic: a generic, useful "you're done when…" line.
  return `Step ${s.step_number} complete when "${s.title}" is fully done and the area looks clean and reassembled.`;
}

function makeWorkflowId(input: BuildWorkflowInput): string {
  const v = input.vehicle ? `${input.vehicle.year ?? "x"}-${input.vehicle.make ?? "x"}-${input.vehicle.model ?? "x"}` : "no-vehicle";
  const issue = (input.issue ?? "no-issue").toLowerCase().replace(/\s+/g, "-").slice(0, 24);
  return `${input.kind}:${input.workflow}:${v}:${issue}:${Date.now().toString(36)}`
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, "-");
}

// ---------- Main entry -----------------------------------------------------

/**
 * Build a structured workflow. Always returns a valid GeneratedWorkflow.
 * Calls AI; if AI fails, returns the deterministic fallback. Pricing and
 * safety are ALWAYS deterministic regardless of what AI returned.
 */
export async function buildWorkflow(input: BuildWorkflowInput): Promise<GeneratedWorkflow> {
  const pricing = pricingFor(input);
  const safetyCritical = isSafetyCritical(input);

  // Compose payload — keep it compact to control AI cost.
  const payload: Record<string, unknown> = {
    workflow: input.workflow,
    workflow_kind: input.kind,
    issue: input.issue ?? null,
    severity: input.severity ?? "medium",
    obd2_codes: input.obd2_codes ?? [],
    symptoms: (input.symptoms ?? []).slice(0, 6),
    camera_findings: (input.camera_findings ?? []).slice(0, 6),
    inspection_findings: (input.inspection_findings ?? []).slice(0, 6),
    real_world_insights: summarizeInsights(input.real_world_insights),
    user_skill: input.user_skill ?? "intermediate",
    available_tools: input.available_tools ?? [],
    safety_critical: safetyCritical,
  };

  let ai: AiWorkflowResponse | null = null;
  try {
    ai = await callAi<AiWorkflowResponse>(
      "workflow_create",
      payload,
      input.vehicle ? (input.vehicle as unknown as Record<string, unknown>) : null,
    );
  } catch (err) {
    console.warn("[workflow-builder] AI call failed, using fallback:", err);
    const reason = err instanceof Error && /402|credit|quota|rate/i.test(err.message)
      ? "AI credits unavailable — showing the deterministic default workflow."
      : "AutoSage Brain couldn't reach the AI service — showing the deterministic default workflow.";
    return fallbackWorkflow(input, pricing, reason);
  }

  if (!ai || !Array.isArray(ai.steps) || ai.steps.length === 0) {
    return fallbackWorkflow(input, pricing, "AI returned no usable steps — showing the deterministic default workflow.");
  }

  // Normalize + harden steps. AI may produce partial fields — fill them in.
  const uncertainSet = new Set(ai.uncertain_steps ?? []);
  const steps: WorkflowStep[] = ai.steps.map((s, i) => {
    const stepNumber = typeof s.step_number === "number" ? s.step_number : i + 1;
    return {
      step_number: stepNumber,
      title: (s.title ?? "").trim() || `Step ${stepNumber}`,
      instruction: (s.instruction ?? "").trim() || "Follow the action described above carefully.",
      why_it_matters: (s.why_it_matters ?? "").trim() || "Doing this step correctly prevents the issue from returning.",
      tools_needed: Array.isArray(s.tools_needed) ? s.tools_needed.filter(Boolean).slice(0, 6) : [],
      warning: typeof s.warning === "string" && s.warning.trim() ? s.warning.trim() : null,
      completion_check: (s.completion_check ?? "").trim() || `Step ${stepNumber} complete when "${s.title ?? "the work"}" is done and verified.`,
      uncertain: uncertainSet.has(stepNumber),
    };
  });

  const hardenedSafety = hardenSafety(ai.safety_warnings ?? [], input);
  const mechanicRecommended =
    Boolean(ai.mechanic_recommended) ||
    hardenedSafety.mechanicRecommended ||
    !pricing.diy_possible;

  const tools = Array.from(new Set([
    ...((GUIDE_META[input.workflow]?.tools) ?? []),
    ...(ai.tools_required ?? []),
  ])).slice(0, 10);

  // Merge AI parts with deterministic fallback parts so the canonical
  // workflow-specific essentials (e.g. anti-corrosion grease, hold-down
  // hardware for battery_service) are always present even if AI omits them.
  const fallbackParts = FALLBACK_PARTS[input.workflow] ?? [];
  const aiParts = Array.isArray(ai.parts_required) ? ai.parts_required.filter(Boolean) : [];
  const partsLower = new Set<string>();
  const mergedParts: string[] = [];
  for (const p of [...aiParts, ...fallbackParts]) {
    const key = p.toLowerCase().trim();
    if (key && !partsLower.has(key)) {
      partsLower.add(key);
      mergedParts.push(p);
    }
  }

  return {
    workflow_id: makeWorkflowId(input),
    source: "ai",
    title: (ai.title ?? "").trim() || `${input.workflow.replace(/_/g, " ")} — guided workflow`,
    issue_type: workflowToIssueType(input.workflow),
    workflow_kind: input.kind,
    vehicle_context: (ai.vehicle_context ?? "").trim() || vehicleContextString(input.vehicle),
    difficulty: ai.difficulty ?? pricing.difficulty,
    estimated_time: (ai.estimated_time ?? "").trim() || GUIDE_META[input.workflow]?.time_estimate || "1–3 hrs",
    estimated_cost: pricing, // ALWAYS deterministic — never AI-set
    diy_possible: Boolean(ai.diy_possible) && pricing.diy_possible && !mechanicRecommended,
    mechanic_recommended: mechanicRecommended,
    tools_required: tools,
    parts_required: Array.isArray(ai.parts_required) ? ai.parts_required.slice(0, 10) : [],
    safety_warnings: hardenedSafety.warnings,
    real_world_tips: Array.isArray(ai.real_world_tips) ? ai.real_world_tips.slice(0, 6) : summarizeInsights(input.real_world_insights),
    steps,
    generated_at: Date.now(),
    pricing_source: "engine",
  };
}

/**
 * Convert a GeneratedWorkflow into the EngineStep[] consumed by StepEngine,
 * preserving step number, instruction, why_it_matters, tools, warning.
 * Adds a "Verify:" line to instruction so the completion_check is visible.
 */
export function workflowToEngineSteps(w: GeneratedWorkflow): EngineStep[] {
  return w.steps.map((s) => ({
    step_number: s.step_number,
    title: s.title,
    instruction: `${s.instruction}\n\nVerify: ${s.completion_check}`,
    why_it_matters: s.why_it_matters,
    tools: s.tools_needed,
    warning: s.warning ?? undefined,
  }));
}

/**
 * Short, user-facing pricing summary used in the workflow preview card.
 * Always derived from the deterministic pricing engine — never from AI.
 */
export function workflowPricingSummary(w: GeneratedWorkflow): string {
  const p = w.estimated_cost;
  return `${formatCAD(p.low_estimate)} – ${formatCAD(p.high_estimate)} (avg ${formatCAD(p.average_estimate)})`;
}

// ---------- Local cache (free-tier protection) ----------------------------

const CACHE_PREFIX = "autosage:workflow-cache:";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function cacheKey(input: BuildWorkflowInput): string {
  const v = input.vehicle ? `${input.vehicle.year ?? ""}-${input.vehicle.make ?? ""}-${input.vehicle.model ?? ""}` : "";
  return `${CACHE_PREFIX}${input.kind}:${input.workflow}:${v}:${(input.issue ?? "").toLowerCase()}:${input.severity ?? ""}:${input.user_skill ?? ""}`;
}

export function loadCachedWorkflow(input: BuildWorkflowInput): GeneratedWorkflow | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(input));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GeneratedWorkflow;
    if (!parsed?.generated_at || Date.now() - parsed.generated_at > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedWorkflow(input: BuildWorkflowInput, w: GeneratedWorkflow): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cacheKey(input), JSON.stringify(w));
  } catch {
    /* quota — ignore */
  }
}

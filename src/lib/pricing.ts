// AutoSage AI — Repair Pricing Engine (Canadian shop rates).
// Deterministic estimator used across Inspection, Repair, and Diagnosis modes.
// All amounts in CAD.

import type { Finding } from "./valuation";

export type IssueType =
  | "dent"
  | "rust"
  | "scratch_paint"
  | "tire_service"
  | "brake_service"
  | "fluid_leak"
  | "battery"
  | "alternator_starter"
  | "warning_light_diagnostic"
  | "misfire"
  | "suspension"
  | "cooling_system"
  | "transmission"
  | "interior_repair"
  | "general_repair";

export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type LaborLevel = "easy" | "moderate" | "complex";
export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface PricingInput {
  issue_type: IssueType;
  severity: Severity;
  vehicle_year?: number | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  region?: "canada";
  labor_level?: LaborLevel;     // optional override
  parts_required?: boolean;     // optional override
}

export interface PricingResult {
  low_estimate: number;
  average_estimate: number;
  high_estimate: number;
  labor_cost_range: [number, number];
  parts_cost_range: [number, number];
  time_estimate_hours: [number, number];
  difficulty: Difficulty;
  diy_possible: boolean;
  labor_rate_range: [number, number];
  issue_label: string;
  currency: "CAD";
  region: "canada";
  notes: string[];
}

// Canadian shop labor rates (CAD/hr) by complexity tier.
const LABOR_RATE: Record<LaborLevel, [number, number]> = {
  easy: [80, 100],
  moderate: [100, 130],
  complex: [130, 180],
};

// Per-issue base profile: time, labor tier, parts band, DIY hint.
interface IssueProfile {
  label: string;
  time_hours: Record<Severity, [number, number]>;
  labor: LaborLevel;
  parts_cad: Record<Severity, [number, number]>;
  difficulty: Difficulty;
  diy_possible: boolean;
}

const ISSUE_PROFILES: Record<IssueType, IssueProfile> = {
  dent: {
    label: "Dent / body repair",
    time_hours:  { info: [0,0], low: [0.5, 1], medium: [1, 2], high: [2, 4], critical: [4, 8] },
    labor: "moderate",
    parts_cad:   { info: [0,0], low: [0, 30], medium: [30, 120], high: [200, 600], critical: [600, 2000] },
    difficulty: "intermediate", diy_possible: true,
  },
  rust: {
    label: "Rust treatment",
    time_hours:  { info: [0,0], low: [1, 2], medium: [2, 4], high: [4, 8], critical: [8, 16] },
    labor: "moderate",
    parts_cad:   { info: [0,0], low: [20, 80], medium: [80, 250], high: [300, 900], critical: [900, 3000] },
    difficulty: "intermediate", diy_possible: true,
  },
  scratch_paint: {
    label: "Scratch / paint repair",
    time_hours:  { info: [0,0], low: [0.5, 1], medium: [1, 3], high: [3, 6], critical: [6, 12] },
    labor: "moderate",
    parts_cad:   { info: [0,0], low: [15, 60], medium: [60, 250], high: [300, 900], critical: [900, 2500] },
    difficulty: "beginner", diy_possible: true,
  },
  tire_service: {
    label: "Tire service",
    time_hours:  { info: [0,0], low: [0.3, 0.7], medium: [0.5, 1], high: [1, 2], critical: [1.5, 3] },
    labor: "easy",
    parts_cad:   { info: [0,0], low: [20, 80], medium: [120, 320], high: [400, 900], critical: [800, 1600] },
    difficulty: "beginner", diy_possible: true,
  },
  brake_service: {
    label: "Brake service",
    time_hours:  { info: [0,0], low: [0.5, 1], medium: [1, 2], high: [2, 4], critical: [3, 6] },
    labor: "moderate",
    parts_cad:   { info: [0,0], low: [40, 120], medium: [150, 400], high: [350, 900], critical: [800, 1800] },
    difficulty: "intermediate", diy_possible: true,
  },
  fluid_leak: {
    label: "Fluid leak repair",
    time_hours:  { info: [0,0], low: [0.5, 1.5], medium: [1.5, 3], high: [3, 6], critical: [6, 12] },
    labor: "complex",
    parts_cad:   { info: [0,0], low: [20, 80], medium: [80, 300], high: [250, 900], critical: [800, 3000] },
    difficulty: "advanced", diy_possible: false,
  },
  battery: {
    label: "Battery replacement",
    time_hours:  { info: [0,0], low: [0.3, 0.7], medium: [0.5, 1], high: [0.7, 1.5], critical: [1, 2] },
    labor: "easy",
    parts_cad:   { info: [0,0], low: [120, 220], medium: [180, 320], high: [220, 400], critical: [300, 600] },
    difficulty: "beginner", diy_possible: true,
  },
  alternator_starter: {
    label: "Alternator / starter service",
    time_hours:  { info: [0,0], low: [1, 2], medium: [2, 3], high: [3, 5], critical: [4, 8] },
    labor: "complex",
    parts_cad:   { info: [0,0], low: [120, 280], medium: [250, 500], high: [400, 900], critical: [700, 1600] },
    difficulty: "advanced", diy_possible: false,
  },
  warning_light_diagnostic: {
    label: "Warning light diagnostic",
    time_hours:  { info: [0,0], low: [0.5, 1], medium: [1, 2], high: [2, 4], critical: [3, 6] },
    labor: "moderate",
    parts_cad:   { info: [0,0], low: [0, 60], medium: [60, 250], high: [200, 700], critical: [500, 2000] },
    difficulty: "intermediate", diy_possible: true,
  },
  misfire: {
    label: "Engine misfire diagnostic & repair",
    time_hours:  { info: [0,0], low: [1, 1.5], medium: [1.5, 2.5], high: [2.5, 4], critical: [4, 7] },
    labor: "complex",
    parts_cad:   { info: [0,0], low: [60, 180], medium: [180, 450], high: [400, 1100], critical: [900, 2800] },
    difficulty: "intermediate", diy_possible: true,
  },
  suspension: {
    label: "Suspension service",
    time_hours:  { info: [0,0], low: [1, 2], medium: [2, 4], high: [4, 7], critical: [6, 12] },
    labor: "complex",
    parts_cad:   { info: [0,0], low: [60, 200], medium: [200, 600], high: [500, 1400], critical: [1200, 3500] },
    difficulty: "advanced", diy_possible: false,
  },
  cooling_system: {
    label: "Cooling system repair",
    time_hours:  { info: [0,0], low: [1, 2], medium: [2, 4], high: [4, 7], critical: [6, 14] },
    labor: "complex",
    parts_cad:   { info: [0,0], low: [40, 150], medium: [150, 500], high: [400, 1300], critical: [1100, 4000] },
    difficulty: "advanced", diy_possible: false,
  },
  transmission: {
    label: "Transmission service",
    time_hours:  { info: [0,0], low: [1, 2.5], medium: [2.5, 5], high: [5, 10], critical: [10, 20] },
    labor: "complex",
    parts_cad:   { info: [0,0], low: [80, 250], medium: [250, 800], high: [800, 2500], critical: [2500, 7000] },
    difficulty: "advanced", diy_possible: false,
  },
  interior_repair: {
    label: "Interior repair",
    time_hours:  { info: [0,0], low: [0.5, 1], medium: [1, 3], high: [3, 6], critical: [6, 12] },
    labor: "moderate",
    parts_cad:   { info: [0,0], low: [15, 80], medium: [80, 300], high: [300, 900], critical: [900, 3000] },
    difficulty: "intermediate", diy_possible: true,
  },
  general_repair: {
    label: "General repair",
    time_hours:  { info: [0,0], low: [1, 2], medium: [2, 4], high: [4, 7], critical: [7, 14] },
    labor: "moderate",
    parts_cad:   { info: [0,0], low: [30, 120], medium: [120, 400], high: [400, 1200], critical: [1100, 3500] },
    difficulty: "intermediate", diy_possible: true,
  },
};

// Vehicle class multiplier — older = parts harder; luxury = more $.
const LUXURY = ["bmw","mercedes","mercedes-benz","audi","lexus","porsche","tesla","cadillac","infiniti","acura","genesis","land rover","jaguar","volvo"];
const TRUCK = ["f-150","f-250","silverado","sierra","ram 1500","ram 2500","tundra","titan"];

function vehicleMultiplier(make?: string | null, model?: string | null, year?: number | null): number {
  const k = `${make ?? ""} ${model ?? ""}`.toLowerCase();
  let m = 1;
  if (LUXURY.some((t) => k.includes(t))) m *= 1.35;
  if (TRUCK.some((t) => k.includes(t))) m *= 1.15;
  if (year && year < 2008) m *= 1.10;       // older = harder to source parts
  if (year && year < 1995) m *= 1.20;
  return m;
}

export function estimateRepairCost(input: PricingInput): PricingResult {
  const profile = ISSUE_PROFILES[input.issue_type] ?? ISSUE_PROFILES.general_repair;
  const sev: Severity = input.severity === "info" ? "low" : input.severity;
  const labor: LaborLevel = input.labor_level ?? profile.labor;
  const [hLo, hHi] = profile.time_hours[sev];
  const [rLo, rHi] = LABOR_RATE[labor];
  const partsRequired = input.parts_required ?? (sev !== "low" || profile.parts_cad[sev][1] > 50);
  const [pLo, pHi] = partsRequired ? profile.parts_cad[sev] : [0, 0];

  const mult = vehicleMultiplier(input.vehicle_make, input.vehicle_model, input.vehicle_year);

  const laborLow  = Math.round(hLo * rLo * mult);
  const laborHigh = Math.round(hHi * rHi * mult);
  const partsLow  = Math.round(pLo * mult);
  const partsHigh = Math.round(pHi * mult);

  const avg = Math.round((laborLow + laborHigh) / 2 + (partsLow + partsHigh) / 2);
  const low = Math.round(avg * 0.8);
  const high = Math.round(avg * 1.2);

  const notes: string[] = [];
  if (mult > 1.2) notes.push("Premium / older vehicle — parts and labor priced higher.");
  if (!partsRequired) notes.push("Estimate assumes labor only (no parts replacement).");
  if (sev === "critical") notes.push("Critical severity — strongly recommend qualified mechanic.");

  return {
    low_estimate: low,
    average_estimate: avg,
    high_estimate: high,
    labor_cost_range: [laborLow, laborHigh],
    parts_cost_range: [partsLow, partsHigh],
    time_estimate_hours: [hLo, hHi],
    difficulty: profile.difficulty,
    diy_possible: profile.diy_possible && sev !== "critical",
    labor_rate_range: [rLo, rHi],
    issue_label: profile.label,
    currency: "CAD",
    region: "canada",
    notes,
  };
}

/* ---------------------------------------------------------------------- */
/*  Issue classification — maps free-text issues / findings → IssueType.  */
/* ---------------------------------------------------------------------- */

export function classifyIssueType(text: string, category?: Finding["category"]): IssueType {
  const t = text.toLowerCase();
  if (/dent|ding|crease/.test(t)) return "dent";
  if (/rust|corros|oxid/.test(t)) return "rust";
  if (/scratch|paint|chip|clear ?coat|repaint|mismatch|swirl/.test(t)) return "scratch_paint";
  if (/brake|rotor|caliper|pad|squeal/.test(t)) return "brake_service";
  if (/tire|tread|sidewall|wheel|rim|flat/.test(t)) return "tire_service";
  if (/battery|won['’]?t start|cranks/.test(t)) return "battery";
  if (/alternator|starter|charging/.test(t)) return "alternator_starter";
  if (/leak|seep|drip|coolant|oil pan|gasket|fluid/.test(t)) return "fluid_leak";
  if (/misfire|rough idle|hesitat/.test(t)) return "misfire";
  if (/shock|strut|suspension|bushing|control arm/.test(t)) return "suspension";
  if (/coolant|radiator|thermostat|overheat/.test(t)) return "cooling_system";
  if (/transmission|gear|slip|shift/.test(t)) return "transmission";
  if (/warning light|check engine|abs|airbag|srs|dashboard/.test(t)) return "warning_light_diagnostic";
  if (category === "tires") return "tire_service";
  if (category === "dashboard") return "warning_light_diagnostic";
  if (category === "interior") return "interior_repair";
  if (category === "engine") return "general_repair";
  return "general_repair";
}

export function pricingForFinding(f: Finding, vehicle?: { year?: number | null; make?: string | null; model?: string | null }): PricingResult {
  return estimateRepairCost({
    issue_type: classifyIssueType(f.issue, f.category),
    severity: f.severity,
    vehicle_year: vehicle?.year ?? null,
    vehicle_make: vehicle?.make ?? null,
    vehicle_model: vehicle?.model ?? null,
    region: "canada",
  });
}

/* ---------------------------------------------------------------------- */
/*  Canonical money formatting — CAD everywhere unless told otherwise.    */
/* ---------------------------------------------------------------------- */

export function formatCAD(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `CA$${Math.round(n).toLocaleString("en-CA")}`;
}

/** Format a low–high range as "CA$1,200 – CA$2,400" or single value if equal. */
export function formatCADRange(lo: number | null | undefined, hi: number | null | undefined): string {
  if (lo === null || lo === undefined || hi === null || hi === undefined) return "—";
  if (Math.round(lo) === Math.round(hi)) return formatCAD(lo);
  return `${formatCAD(lo)} – ${formatCAD(hi)}`;
}

/** Alias for app-wide consistency: prefer formatMoney() in new code. */
export const formatMoney = formatCAD;
export const formatMoneyRange = formatCADRange;

/* ---------------------------------------------------------------------- */
/*  Aggregate burden across many findings (CAD).                          */
/* ---------------------------------------------------------------------- */

export interface BurdenResult {
  low: number;
  high: number;
  average: number;
  currency: "CAD";
  breakdown: { issue: string; severity: Severity; pricing: PricingResult }[];
}

export function estimateBurdenCAD(
  findings: Finding[],
  vehicle?: { year?: number | null; make?: string | null; model?: string | null },
): BurdenResult {
  const breakdown = findings
    .filter((f) => f.severity !== "info")
    .map((f) => ({ issue: f.issue, severity: f.severity, pricing: pricingForFinding(f, vehicle) }));
  const low = breakdown.reduce((a, b) => a + b.pricing.low_estimate, 0);
  const high = breakdown.reduce((a, b) => a + b.pricing.high_estimate, 0);
  const average = breakdown.reduce((a, b) => a + b.pricing.average_estimate, 0);
  return { low, high, average, currency: "CAD", breakdown };
}

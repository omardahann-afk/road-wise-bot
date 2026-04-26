// Pure-TS valuation engine. Free-tier friendly: uses heuristic depreciation
// curves (no paid APIs). Tunable per make-class. Always returns a low/avg/high
// band plus a deal classification when an asking price is provided.

export type DealClass = "good_deal" | "fair" | "overpriced";
export type Decision = "BUY" | "NEGOTIATE" | "AVOID";

export interface ValuationInput {
  year: number;
  make?: string | null;
  model?: string | null;
  mileage: number;
  /** 0–100 condition score from inspection (higher = better) */
  condition_score: number;
  asking_price?: number | null;
}

export interface ValuationOutput {
  base_price: number;
  low_value: number;
  avg_value: number;
  high_value: number;
  deal: DealClass | null;
  decision: Decision;
  reasoning: string[];
  delta_vs_avg: number | null;
}

export interface RepairCostEstimate {
  low: number;
  high: number;
  currency: "CAD";
  breakdown: { issue: string; severity: Finding["severity"]; low: number; high: number }[];
}

// Make-class base MSRP heuristics (USD, new). Free, no API.
const LUXURY = ["bmw", "mercedes", "mercedes-benz", "audi", "lexus", "porsche", "tesla", "cadillac", "infiniti", "acura", "genesis", "land rover", "jaguar"];
const TRUCK = ["ford f", "chevrolet silverado", "ram", "gmc sierra", "toyota tundra", "nissan titan"];
const ECONOMY = ["nissan", "hyundai", "kia", "mitsubishi", "fiat", "mazda"];

function basePriceFor(make?: string | null, model?: string | null): number {
  const k = `${make ?? ""} ${model ?? ""}`.toLowerCase().trim();
  if (!k) return 28000;
  if (TRUCK.some((t) => k.includes(t))) return 48000;
  if (LUXURY.some((t) => k.includes(t))) return 55000;
  if (ECONOMY.some((t) => k.includes(t))) return 22000;
  return 32000; // mainstream
}

// Annual depreciation: 18% year 1, then ~12% diminishing.
function ageFactor(year: number): number {
  const age = Math.max(0, new Date().getFullYear() - year);
  if (age === 0) return 1;
  let v = 0.82; // year 1
  for (let i = 1; i < age; i++) v *= 0.88;
  return Math.max(v, 0.08);
}

// Mileage penalty: -1.2% per 10k over expected (12k/yr).
function mileageFactor(year: number, mileage: number): number {
  const age = Math.max(1, new Date().getFullYear() - year);
  const expected = age * 12000;
  const excess = mileage - expected;
  const pct = (excess / 10000) * 0.012;
  return Math.max(0.4, Math.min(1.1, 1 - pct));
}

// Condition factor: maps 0–100 to 0.65–1.08.
function conditionFactor(score: number): number {
  const s = Math.max(0, Math.min(100, score));
  return 0.65 + (s / 100) * 0.43;
}

export function estimateVehicleValue(input: ValuationInput): ValuationOutput {
  const base = basePriceFor(input.make, input.model);
  const aged = base * ageFactor(input.year);
  const m = aged * mileageFactor(input.year, input.mileage);
  const avg = Math.round(m * conditionFactor(input.condition_score));
  const low = Math.round(avg * 0.88);
  const high = Math.round(avg * 1.12);

  let deal: DealClass | null = null;
  let decision: Decision = "BUY";
  const reasoning: string[] = [];
  let delta: number | null = null;

  if (input.asking_price && input.asking_price > 0) {
    delta = input.asking_price - avg;
    const pct = delta / avg;
    if (pct <= -0.05) {
      deal = "good_deal";
      decision = "BUY";
      reasoning.push(`Asking price is ${Math.round(Math.abs(pct) * 100)}% below fair value.`);
    } else if (pct <= 0.08) {
      deal = "fair";
      decision = input.condition_score >= 70 ? "BUY" : "NEGOTIATE";
      reasoning.push(`Asking price is within ${Math.round(pct * 100)}% of fair value.`);
    } else if (pct <= 0.2) {
      deal = "overpriced";
      decision = "NEGOTIATE";
      reasoning.push(`Asking price is ${Math.round(pct * 100)}% above fair value — there is room to negotiate.`);
    } else {
      deal = "overpriced";
      decision = "AVOID";
      reasoning.push(`Asking price is ${Math.round(pct * 100)}% above fair value — walk away unless seller drops.`);
    }
  } else {
    decision = input.condition_score >= 70 ? "BUY" : input.condition_score >= 50 ? "NEGOTIATE" : "AVOID";
  }

  if (input.condition_score < 50) {
    reasoning.push("Inspection shows significant issues — factor repair costs into your offer.");
    if (decision === "BUY") decision = "NEGOTIATE";
  } else if (input.condition_score >= 85) {
    reasoning.push("Vehicle is in excellent inspected condition.");
  }

  const age = new Date().getFullYear() - input.year;
  if (age >= 12) reasoning.push("Older vehicle — expect higher maintenance frequency.");
  if (input.mileage > 150000) reasoning.push("High mileage — verify timing belt, transmission service history.");

  return {
    base_price: Math.round(base),
    low_value: low,
    avg_value: avg,
    high_value: high,
    deal,
    decision,
    reasoning,
    delta_vs_avg: delta === null ? null : Math.round(delta),
  };
}

// Translate a checklist of findings into per-system + overall scores.
export interface Finding {
  step: string;          // step id, e.g. "front_exterior"
  category: "exterior" | "interior" | "engine" | "tires" | "dashboard";
  issue: string;         // short label, e.g. "Scratch on bumper"
  severity: "info" | "low" | "medium" | "high" | "critical";
  notes?: string;
  detected_objects?: string[];
}

export interface InspectionScores {
  exterior_score: number;
  interior_score: number;
  engine_score: number;
  tire_score: number;
  overall_score: number;
  risk_flags: string[];
}

const SEV_PENALTY: Record<Finding["severity"], number> = {
  info: 0,
  low: 4,
  medium: 12,
  high: 25,
  critical: 45,
};

function scoreFor(findings: Finding[], cats: Finding["category"][]): number {
  const relevant = findings.filter((f) => cats.includes(f.category));
  const penalty = relevant.reduce((acc, f) => acc + SEV_PENALTY[f.severity], 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function computeInspectionScores(findings: Finding[]): InspectionScores {
  const exterior_score = scoreFor(findings, ["exterior"]);
  const interior_score = scoreFor(findings, ["interior"]);
  const engine_score = scoreFor(findings, ["engine", "dashboard"]);
  const tire_score = scoreFor(findings, ["tires"]);
  const overall_score = Math.round(
    exterior_score * 0.3 + interior_score * 0.2 + engine_score * 0.35 + tire_score * 0.15,
  );

  const risk_flags: string[] = [];
  const hi = findings.filter((f) => f.severity === "high" || f.severity === "critical");
  if (hi.some((f) => /rust/i.test(f.issue))) risk_flags.push("Significant rust — possible structural impact");
  if (hi.some((f) => /paint mismatch|repaint|panel gap/i.test(f.issue)))
    risk_flags.push("Possible accident history (paint mismatch / panel gaps)");
  if (hi.some((f) => /warning light|check engine|airbag/i.test(f.issue)))
    risk_flags.push("Active dashboard warning(s) — diagnose before purchase");
  if (hi.some((f) => f.category === "tires"))
    risk_flags.push("Tires need immediate attention — factor in replacement cost");
  if (hi.filter((f) => f.category === "engine").length >= 1)
    risk_flags.push("Engine bay shows mechanical risk");
  // Inconsistent wear: low interior score but high mileage-style exterior wear
  if (Math.abs(exterior_score - interior_score) >= 35)
    risk_flags.push("Inconsistent wear between interior and exterior — verify mileage history");

  return { exterior_score, interior_score, engine_score, tire_score, overall_score, risk_flags };
}

/* ------------------------------------------------------------------ */
/*  Deterministic repair-cost estimation per finding (USD).
/*  Heuristic ranges per category × severity. Tuned so a typical
/*  used-car inspection produces a believable repair burden total.
/* ------------------------------------------------------------------ */

const REPAIR_COST_TABLE: Record<Finding["category"], Record<Finding["severity"], [number, number]>> = {
  exterior: {
    info: [0, 0],
    low: [40, 150],       // small scratch, paint touch-up
    medium: [180, 600],   // dent / panel paint
    high: [600, 1800],    // multi-panel paint, bumper replace
    critical: [1500, 5000], // structural / accident repair
  },
  interior: {
    info: [0, 0],
    low: [20, 80],
    medium: [120, 400],
    high: [400, 1200],
    critical: [1200, 3500],
  },
  engine: {
    info: [0, 0],
    low: [60, 200],       // belt, fluid top-up
    medium: [250, 900],   // sensor, hose, gasket
    high: [900, 3000],    // major leak, alternator, starter
    critical: [3000, 9000], // head gasket / engine work
  },
  tires: {
    info: [0, 0],
    low: [25, 100],       // patch / rotation
    medium: [150, 400],   // 1–2 tires
    high: [500, 1000],    // full set
    critical: [800, 1600],
  },
  dashboard: {
    info: [0, 0],
    low: [40, 150],       // diagnostic scan
    medium: [200, 700],   // sensor / module
    high: [600, 2200],    // emissions / safety system
    critical: [1500, 4500],
  },
};

export function estimateRepairBurden(findings: Finding[]): RepairCostEstimate {
  const breakdown = findings
    .filter((f) => f.severity !== "info")
    .map((f) => {
      const [low, high] = REPAIR_COST_TABLE[f.category]?.[f.severity] ?? [0, 0];
      return { issue: f.issue, severity: f.severity, low, high };
    });
  const low = breakdown.reduce((a, b) => a + b.low, 0);
  const high = breakdown.reduce((a, b) => a + b.high, 0);
  return { low: Math.round(low), high: Math.round(high), currency: "CAD", breakdown };
}

/* ------------------------------------------------------------------ */
/*  Final decision engine — DETERMINISTIC FIRST.
/*  Combines valuation deal class, condition score, risk flags and
/*  critical findings. AI may add narrative but must NOT override.
/* ------------------------------------------------------------------ */

export interface FinalDecisionInput {
  valuation: ValuationOutput;
  scores: InspectionScores;
  findings: Finding[];
  repair: RepairCostEstimate;
  asking_price: number | null;
}

export interface FinalDecision {
  decision: Decision;
  reasons: string[];
  leverage_points: string[]; // negotiation leverage
  net_value: number | null;  // avg − repair_high (worst case)
}

export function computeFinalDecision(input: FinalDecisionInput): FinalDecision {
  const { valuation, scores, findings, repair, asking_price } = input;
  const reasons: string[] = [];
  const leverage: string[] = [];

  // Start from valuation's deal-based decision
  let decision: Decision = valuation.decision;
  reasons.push(...valuation.reasoning);

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;
  const hasRiskFlags = scores.risk_flags.length > 0;

  // Hard downgrades — risk flags + critical findings
  if (criticalCount >= 1) {
    decision = "AVOID";
    reasons.push(`${criticalCount} critical issue${criticalCount > 1 ? "s" : ""} detected — walk away or require fix before purchase.`);
  } else if (highCount >= 3 || (highCount >= 2 && hasRiskFlags)) {
    if (decision === "BUY") decision = "NEGOTIATE";
    if (decision === "NEGOTIATE" && hasRiskFlags) decision = "AVOID";
    reasons.push(`Multiple high-severity issues (${highCount}) combined with risk flags.`);
  } else if (scores.overall_score < 45) {
    if (decision === "BUY") decision = "NEGOTIATE";
    reasons.push(`Overall condition score ${scores.overall_score}/100 is below acceptable threshold.`);
  } else if (hasRiskFlags && decision === "BUY") {
    decision = "NEGOTIATE";
    reasons.push("Risk flags present — negotiate price or require repairs.");
  }

  // Repair-burden vs price guard
  if (asking_price && repair.high > asking_price * 0.25) {
    if (decision === "BUY") decision = "NEGOTIATE";
    reasons.push(`Worst-case repair cost (CA$${repair.high.toLocaleString("en-CA")}) exceeds 25% of asking price.`);
  }
  if (asking_price && repair.high > asking_price * 0.5) {
    decision = "AVOID";
    reasons.push("Repair burden exceeds half the asking price.");
  }

  // Leverage points for negotiation
  if (asking_price && valuation.delta_vs_avg !== null && valuation.delta_vs_avg > 0) {
    leverage.push(`Asking is CA$${valuation.delta_vs_avg.toLocaleString("en-CA")} above fair market average.`);
  }
  if (repair.high > 0) {
    leverage.push(`Repair burden up to CA$${repair.high.toLocaleString("en-CA")} — request equivalent reduction.`);
  }
  scores.risk_flags.forEach((rf) => leverage.push(rf));
  findings
    .filter((f) => f.severity === "high" || f.severity === "critical")
    .slice(0, 3)
    .forEach((f) => leverage.push(`${f.issue} (${f.severity})`));

  const net_value = asking_price ? Math.round(valuation.avg_value - repair.high) : null;

  return { decision, reasons, leverage_points: leverage, net_value };
}

/* ------------------------------------------------------------------ */
/*  Issue → Repair handoff mapping.
/*  Maps a finding to a repair workflow slug + preloaded context.
/* ------------------------------------------------------------------ */

export type RepairWorkflow =
  | "dent_repair"
  | "rust_repair"
  | "paint_repair"
  | "tire_service"
  | "fluid_leak"
  | "warning_light_diagnostic"
  | "interior_repair"
  | "battery_service"
  | "general_repair";

export interface RepairHandoff {
  workflow: RepairWorkflow;
  label: string;
  issue: string;
  severity: Finding["severity"];
  category: Finding["category"];
  location: string;
}

const WORKFLOW_LABEL: Record<RepairWorkflow, string> = {
  dent_repair: "Dent Repair",
  rust_repair: "Rust Treatment",
  paint_repair: "Paint & Scratch Repair",
  tire_service: "Tire Service",
  fluid_leak: "Fluid Leak Repair",
  warning_light_diagnostic: "Warning Light Diagnostic",
  interior_repair: "Interior Repair",
  battery_service: "Battery Replacement",
  general_repair: "General Repair",
};

export function classifyRepair(f: Finding): RepairHandoff {
  const t = f.issue.toLowerCase();
  let workflow: RepairWorkflow = "general_repair";

  if (/dent|ding|crease/.test(t)) workflow = "dent_repair";
  else if (/rust|corros|oxid/.test(t)) workflow = "rust_repair";
  else if (/scratch|paint|chip|clear ?coat|repaint|mismatch|swirl/.test(t)) workflow = "paint_repair";
  else if (f.category === "tires" || /tire|tread|sidewall|wheel|rim/.test(t)) workflow = "tire_service";
  else if (/battery|won['’]?t start|cranks slow|dead battery|no crank/.test(t)) workflow = "battery_service";
  else if (/leak|seep|drip|fluid|coolant|oil pan|gasket/.test(t)) workflow = "fluid_leak";
  else if (f.category === "dashboard" || /warning light|check engine|abs|airbag|srs/.test(t)) workflow = "warning_light_diagnostic";
  else if (f.category === "interior") workflow = "interior_repair";

  return {
    workflow,
    label: WORKFLOW_LABEL[workflow],
    issue: f.issue,
    severity: f.severity,
    category: f.category,
    location: f.step.replace(/_/g, " "),
  };
}

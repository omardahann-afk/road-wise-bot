// AutoSage AI — Decision Trust layer.
// Computes a deterministic confidence_score, separates condition / valuation /
// repair signals, and produces a transparent explanation block.
//
// The decision itself still comes from valuation.ts → computeFinalDecision.
// This layer wraps that decision with reasons + confidence + risk summary so
// the UI can be transparent about WHY.

import type { Finding, FinalDecision, InspectionScores, ValuationOutput } from "@/lib/valuation";
import type { BurdenResult } from "@/lib/pricing";

export interface DecisionTrust {
  /** 0-100 — how confident we are in the recommendation itself. */
  confidence_score: number;
  /** plain-English reasons that make the confidence high/low. */
  confidence_factors: string[];
  /** highlighted reasons supporting the decision. */
  key_reasons: string[];
  /** strong negatives the buyer must accept. */
  top_risks: string[];
  /** strong positives that support buying. */
  major_positives: string[];
  /** issues we did NOT inspect (gaps the user should know about). */
  unknown_areas: string[];
  /** structured signal triplet — kept visually separate from each other. */
  signals: {
    condition: { score: number; tone: "good" | "warn" | "bad"; label: string };
    valuation: { delta_vs_avg: number | null; tone: "good" | "warn" | "bad"; label: string };
    repair_burden: { low: number; high: number; tone: "good" | "warn" | "bad"; label: string };
  };
}

interface ComputeArgs {
  decision: FinalDecision;
  scores: InspectionScores;
  valuation: ValuationOutput;
  findings: Finding[];
  burden: BurdenResult | null;
  asking_price: number | null;
  /** how many of the inspection steps did the user actually capture? */
  steps_completed?: number;
  /** how many total inspection steps exist. */
  total_steps?: number;
}

const ALL_CATEGORIES: Finding["category"][] = ["exterior", "interior", "engine", "tires", "dashboard"];

function toneForCondition(score: number): "good" | "warn" | "bad" {
  if (score >= 75) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

function toneForValuation(delta: number | null): "good" | "warn" | "bad" {
  if (delta === null) return "warn";
  if (delta <= 0) return "good";
  return delta > 2500 ? "bad" : "warn";
}

function toneForBurden(high: number, asking: number | null): "good" | "warn" | "bad" {
  if (high <= 0) return "good";
  if (asking && asking > 0) {
    const pct = high / asking;
    if (pct < 0.1) return "good";
    if (pct < 0.25) return "warn";
    return "bad";
  }
  if (high < 1000) return "good";
  if (high < 3500) return "warn";
  return "bad";
}

export function computeDecisionTrust(args: ComputeArgs): DecisionTrust {
  const { decision, scores, valuation, findings, burden, asking_price } = args;

  // ---------- confidence_score ----------
  // Start from 100 and subtract penalties when signal is incomplete or noisy.
  let confidence = 100;
  const confidence_factors: string[] = [];

  const numFindings = findings.length;
  if (numFindings === 0) {
    confidence -= 25;
    confidence_factors.push("No findings recorded — inspection may be incomplete.");
  } else if (numFindings < 3) {
    confidence -= 10;
    confidence_factors.push(`Only ${numFindings} finding${numFindings === 1 ? "" : "s"} — limited data.`);
  } else {
    confidence_factors.push(`${numFindings} findings recorded — broad signal.`);
  }

  // Step coverage (if provided)
  if (args.total_steps && args.steps_completed !== undefined) {
    const cov = args.steps_completed / args.total_steps;
    if (cov < 0.5) {
      confidence -= 20;
      confidence_factors.push(`Only ${args.steps_completed}/${args.total_steps} inspection steps completed.`);
    } else if (cov < 0.85) {
      confidence -= 8;
      confidence_factors.push(`${args.steps_completed}/${args.total_steps} steps completed — some panels skipped.`);
    } else {
      confidence_factors.push(`Full ${args.total_steps}/${args.total_steps} step coverage.`);
    }
  }

  // Asking price absent reduces confidence in the deal-class part of the decision
  if (asking_price === null) {
    confidence -= 10;
    confidence_factors.push("No asking price provided — deal classification skipped.");
  } else {
    confidence_factors.push("Asking price available — deal class evaluated.");
  }

  // High severity distribution → still confident, just confident in the negative
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  if (critical >= 1) {
    confidence_factors.push(`${critical} critical issue(s) — strong negative signal.`);
  }
  if (high >= 2) {
    confidence_factors.push(`${high} high-severity issues — converging negative signal.`);
  }

  // Mileage anomaly (interior/exterior wear gap) lowers confidence
  if (scores.risk_flags.some((r) => /inconsistent wear/i.test(r))) {
    confidence -= 8;
    confidence_factors.push("Wear inconsistency detected — verify history before committing.");
  }

  confidence = Math.max(20, Math.min(100, Math.round(confidence)));

  // ---------- key reasons / positives / risks ----------
  const key_reasons: string[] = [];
  const major_positives: string[] = [];
  const top_risks: string[] = [];

  // Pull strongest valuation reason
  if (valuation.reasoning[0]) key_reasons.push(valuation.reasoning[0]);

  // Pull decision rationale
  if (decision.reasons[0] && !key_reasons.includes(decision.reasons[0])) {
    key_reasons.push(decision.reasons[0]);
  }

  // Positives
  if (scores.overall_score >= 80) {
    major_positives.push(`Excellent overall condition (${scores.overall_score}/100).`);
  } else if (scores.overall_score >= 65) {
    major_positives.push(`Solid overall condition (${scores.overall_score}/100).`);
  }
  if (valuation.deal === "good_deal") {
    major_positives.push("Asking price is below fair market average.");
  }
  if (burden && burden.high > 0 && asking_price && burden.high / asking_price < 0.08) {
    major_positives.push("Repair burden is small relative to asking price.");
  }
  if (critical === 0 && high === 0 && numFindings > 0) {
    major_positives.push("No high-severity issues found in this inspection.");
  }

  // Risks
  if (critical >= 1) {
    top_risks.push(`${critical} critical issue${critical > 1 ? "s" : ""} — expensive repairs likely.`);
  }
  if (scores.risk_flags.some((r) => /rust/i.test(r))) {
    top_risks.push("Significant rust detected — possible structural impact down the road.");
  }
  if (scores.risk_flags.some((r) => /accident|paint mismatch|panel gap/i.test(r))) {
    top_risks.push("Possible accident history — request a repair record.");
  }
  if (scores.risk_flags.some((r) => /warning light|dashboard/i.test(r))) {
    top_risks.push("Active dashboard warning(s) — diagnose before purchase.");
  }
  if (burden && asking_price && burden.high / asking_price > 0.25) {
    top_risks.push("Repair burden significantly reduces vehicle value.");
  }
  if (valuation.deal === "overpriced" && (decision.decision === "AVOID" || decision.decision === "NEGOTIATE")) {
    top_risks.push("Asking price is above fair market — limited room to recover value.");
  }

  // ---------- unknown areas (gaps) ----------
  const inspectedCategories = new Set(findings.map((f) => f.category));
  const unknown_areas: string[] = [];
  ALL_CATEGORIES.forEach((c) => {
    if (!inspectedCategories.has(c)) {
      unknown_areas.push(`${categoryLabel(c)} — not inspected in this session.`);
    }
  });

  // ---------- signal triplet ----------
  const cond_tone = toneForCondition(scores.overall_score);
  const val_tone = toneForValuation(valuation.delta_vs_avg);
  const burden_high = burden?.high ?? 0;
  const burden_tone = toneForBurden(burden_high, asking_price);

  return {
    confidence_score: confidence,
    confidence_factors,
    key_reasons,
    top_risks,
    major_positives,
    unknown_areas,
    signals: {
      condition: {
        score: scores.overall_score,
        tone: cond_tone,
        label: cond_tone === "good"
          ? "Condition supports purchase"
          : cond_tone === "warn"
          ? "Condition is mixed"
          : "Condition is poor",
      },
      valuation: {
        delta_vs_avg: valuation.delta_vs_avg,
        tone: val_tone,
        label: val_tone === "good"
          ? "Priced at or below fair market"
          : val_tone === "warn"
          ? "Slightly above fair market"
          : "Significantly above fair market",
      },
      repair_burden: {
        low: burden?.low ?? 0,
        high: burden_high,
        tone: burden_tone,
        label: burden_tone === "good"
          ? "Low repair burden"
          : burden_tone === "warn"
          ? "Moderate repair burden"
          : "Heavy repair burden",
      },
    },
  };
}

function categoryLabel(c: Finding["category"]): string {
  switch (c) {
    case "exterior": return "Exterior body";
    case "interior": return "Interior";
    case "engine": return "Engine bay";
    case "tires": return "Tires & wheels";
    case "dashboard": return "Dashboard warning lights";
  }
}

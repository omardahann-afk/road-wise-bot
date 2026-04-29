// ============================================================================
// Universal Diagnosis Orchestrator.
//
// Single entry point used by every flow (camera, symptom, OBD2, repair, quote).
// Layered execution:
//   1. Always run local fallback first (zero deps, always works).
//   2. Optionally enrich from Supabase lookup tables (obd2_codes, symptom_mappings).
//   3. Optionally enhance the explanation via AI (never required, never blocking).
//
// Hard rules:
//   - Local result is the floor. AI/Supabase can refine but never override
//     safety fields (severity, safeToDrive) downward.
//   - Every layer is wrapped in try/catch. UI never breaks.
//   - Returns a result shaped like DiagnosisResult.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";
import { callAiSafe } from "@/lib/ai";
import {
  runLocalDiagnosis,
  type DiagnosisInput,
  type DiagnosisResult,
  type DiagnosisSeverity,
  type DriveSafety,
} from "@/lib/local-diagnosis-fallback";

export type { DiagnosisInput, DiagnosisResult } from "@/lib/local-diagnosis-fallback";

const SEVERITY_RANK: Record<DiagnosisSeverity, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const DRIVE_RANK: Record<DriveSafety, number> = {
  unknown: 0,
  yes: 3,
  limited: 2,
  no: 1, // most restrictive wins
};

/** Keep the more restrictive safety values when merging layers. */
function mergeSafety(base: DiagnosisResult, addition: Partial<DiagnosisResult>): DiagnosisResult {
  const out: DiagnosisResult = { ...base, ...addition };
  // Severity — keep the higher one.
  if (addition.severity && SEVERITY_RANK[addition.severity] < SEVERITY_RANK[base.severity]) {
    out.severity = base.severity;
  }
  // Safe to drive — "no" beats "limited" beats "yes".
  if (addition.safeToDrive) {
    const baseRank = DRIVE_RANK[base.safeToDrive];
    const addRank = DRIVE_RANK[addition.safeToDrive];
    // lower rank = more restrictive (no=1)
    out.safeToDrive = addRank < baseRank ? addition.safeToDrive : base.safeToDrive;
  }
  // Warnings: union, dedup
  const w = new Set([...(base.warnings ?? []), ...(addition.warnings ?? [])]);
  if (w.size > 0) out.warnings = Array.from(w);
  return out;
}

interface Obd2Row {
  code: string;
  title: string;
  description: string | null;
  likely_causes: string[] | null;
  severity: string | null;
  safe_to_drive: string | null;
  estimated_cost_low: number | null;
  estimated_cost_high: number | null;
  next_step: string | null;
}

async function enrichWithSupabaseData(
  input: DiagnosisInput,
  base: DiagnosisResult,
): Promise<DiagnosisResult> {
  if (!input.obdCode) return base;
  try {
    const code = input.obdCode.trim().toUpperCase();
    const { data, error } = await supabase
      .from("obd2_codes" as never)
      .select(
        "code,title,description,likely_causes,severity,safe_to_drive,estimated_cost_low,estimated_cost_high,next_step",
      )
      .eq("code", code)
      .maybeSingle();
    if (error || !data) return base;
    const row = data as unknown as Obd2Row;
    const likely =
      Array.isArray(row.likely_causes) && row.likely_causes.length > 0
        ? row.likely_causes
        : base.likelyIssues;

    return mergeSafety(base, {
      summary: row.title || base.summary,
      likelyIssues: likely,
      severity: (row.severity as DiagnosisSeverity) || base.severity,
      safeToDrive: (row.safe_to_drive as DriveSafety) || base.safeToDrive,
      estimatedCostLow: row.estimated_cost_low ?? base.estimatedCostLow,
      estimatedCostHigh: row.estimated_cost_high ?? base.estimatedCostHigh,
      nextStep: row.next_step || base.nextStep,
      source: "supabase_enriched",
    });
  } catch {
    return base;
  }
}

interface AiEnhancement {
  summary?: string;
  explanation?: string;
  questionsToAskMechanic?: string[];
  warningSigns?: string[];
}

async function enhanceWithAI(
  input: DiagnosisInput,
  base: DiagnosisResult,
): Promise<DiagnosisResult> {
  // Only call AI if we have something meaningful to enhance with.
  if (!input.symptom && !input.obdCode) {
    return { ...base, aiUsed: false };
  }
  const result = await callAiSafe<AiEnhancement>(
    "symptom",
    {
      symptoms: input.symptom ?? "",
      obdCode: input.obdCode ?? "",
      base, // pass our floor so the model can riff but not override
      enhanceOnly: true,
    },
    input.vehicle ?? null,
    null,
    { timeoutMs: 8_000 },
  );
  if (!result.ok) {
    return {
      ...base,
      aiUsed: false,
      fallbackUsed: true,
      message: "AI enhancement unavailable. Showing reliable guidance.",
    };
  }
  const ai = result.data ?? {};
  return mergeSafety(base, {
    summary: ai.summary || base.summary,
    warnings: ai.warningSigns,
    aiUsed: true,
    fallbackUsed: false,
    source: "ai_enhanced",
    message: ai.explanation,
  });
}

/** Defensive final pass: never return a result missing required fields. */
function ensureSafeDiagnosis(r: DiagnosisResult): DiagnosisResult {
  return {
    severity: r.severity ?? "unknown",
    safeToDrive: r.safeToDrive ?? "unknown",
    likelyIssues: r.likelyIssues?.length ? r.likelyIssues : ["Unknown issue"],
    estimatedCostLow: Number.isFinite(r.estimatedCostLow) ? r.estimatedCostLow : 0,
    estimatedCostHigh: Number.isFinite(r.estimatedCostHigh) ? r.estimatedCostHigh : 0,
    confidence: Number.isFinite(r.confidence) ? Math.max(0, Math.min(100, r.confidence)) : 50,
    nextStep:
      r.nextStep ||
      "Gather more details or get a professional inspection before continuing.",
    source: r.source ?? "local_fallback",
    aiUsed: r.aiUsed ?? false,
    fallbackUsed: r.fallbackUsed ?? false,
    message: r.message,
    summary: r.summary,
    warnings: r.warnings,
  };
}

/**
 * Main entry point. Always returns a useful result.
 */
export async function runDiagnosis(input: DiagnosisInput): Promise<DiagnosisResult> {
  let result = runLocalDiagnosis(input);
  try {
    result = await enrichWithSupabaseData(input, result);
  } catch {
    // ignore — keep local result
  }
  try {
    result = await enhanceWithAI(input, result);
  } catch {
    // ignore — keep enriched/local result
  }
  return ensureSafeDiagnosis(result);
}

/**
 * Mechanic-quote checker. Pure local logic — no AI required.
 * Returns a verdict + explanation string the UI can render directly.
 */
export type QuoteVerdict =
  | "fair"
  | "high"
  | "very_high"
  | "suspiciously_low";

export interface QuoteCheckResult {
  verdict: QuoteVerdict;
  expectedLow: number;
  expectedHigh: number;
  /** Percent above the high end of the expected range. Negative if below low end. 0 if within range. */
  markupPct: number;
  /** Estimated dollars overpaid vs. high end (CAD). 0 if not overpaying. */
  overpayAmount: number;
  message: string;
  negotiationAdvice: string;
  questionsToAsk: string[];
  /** Short red flags the user should watch for. */
  redFlags: string[];
  /** Negotiation script lines the user can read aloud. */
  negotiationScript: string[];
  /** Whether to suggest a second opinion. */
  suggestSecondOpinion: boolean;
}

export function checkQuote(
  quote: number,
  low: number,
  high: number,
): QuoteCheckResult {
  let verdict: QuoteVerdict;
  if (quote > high * 1.35) verdict = "very_high";
  else if (quote > high) verdict = "high";
  else if (quote < low * 0.75) verdict = "suspiciously_low";
  else verdict = "fair";

  const expectedLow = Math.round(low);
  const expectedHigh = Math.round(high);

  // Markup % vs typical high end. Negative = below low end.
  let markupPct = 0;
  if (quote > expectedHigh) {
    markupPct = Math.round(((quote - expectedHigh) / expectedHigh) * 100);
  } else if (quote < expectedLow) {
    markupPct = -Math.round(((expectedLow - quote) / expectedLow) * 100);
  }
  const overpayAmount = quote > expectedHigh ? Math.round(quote - expectedHigh) : 0;

  const baseQs = [
    "Are parts and labor itemized on the invoice?",
    "Are taxes and shop supplies included in this number?",
    "What's the warranty on parts and on labor?",
    "Are OEM or aftermarket parts being used?",
  ];

  const baseRedFlags = [
    "Quote given verbally with no written breakdown",
    "Pressure to approve before you can get a second opinion",
    "Unrelated repairs added without explanation",
  ];

  const baseScript = [
    "Can you email me a written estimate with parts and labor itemized?",
    "What's your shop labor rate, and how many hours is this job booked for?",
    "If I bring my own OEM-equivalent part, what's the labor-only price?",
  ];

  switch (verdict) {
    case "very_high":
      return {
        verdict,
        expectedLow,
        expectedHigh,
        markupPct,
        overpayAmount,
        message: `You're paying about ${markupPct}% above typical. Expected range is $${expectedLow}–$${expectedHigh}.`,
        negotiationAdvice:
          "Get one or two more quotes before approving. Ask for a written breakdown of parts vs labor.",
        questionsToAsk: baseQs,
        redFlags: [
          ...baseRedFlags,
          "Quoted price is more than 35% above the typical high end",
        ],
        negotiationScript: [
          ...baseScript,
          `I have data showing this job typically runs $${expectedLow}–$${expectedHigh}. Can you match that or itemize the difference?`,
        ],
        suggestSecondOpinion: true,
      };
    case "high":
      return {
        verdict,
        expectedLow,
        expectedHigh,
        markupPct,
        overpayAmount,
        message: `Quote is about ${markupPct}% above typical. Expected range is $${expectedLow}–$${expectedHigh}.`,
        negotiationAdvice:
          "Ask the shop to walk through the line items. Request OEM-equivalent aftermarket parts if cost is the concern.",
        questionsToAsk: baseQs,
        redFlags: baseRedFlags,
        negotiationScript: baseScript,
        suggestSecondOpinion: false,
      };
    case "suspiciously_low":
      return {
        verdict,
        expectedLow,
        expectedHigh,
        markupPct,
        overpayAmount,
        message: `This quote is unusually low — about ${Math.abs(markupPct)}% under typical. Expected range is $${expectedLow}–$${expectedHigh}.`,
        negotiationAdvice:
          "Confirm exactly what's included — used parts, no warranty, or partial work can explain a low price.",
        questionsToAsk: [
          ...baseQs,
          "Are the parts new, refurbished, or used?",
        ],
        redFlags: [
          "Parts may be used or refurbished",
          "Warranty may be limited or excluded",
          "Scope of work may be smaller than you think",
        ],
        negotiationScript: [
          "Can you confirm in writing that the parts are new and the work is fully warrantied?",
          "What exactly is and isn't included at this price?",
        ],
        suggestSecondOpinion: false,
      };
    case "fair":
    default:
      return {
        verdict,
        expectedLow,
        expectedHigh,
        markupPct: 0,
        overpayAmount: 0,
        message: `Quote sits within typical range ($${expectedLow}–$${expectedHigh}). Looks fair.`,
        negotiationAdvice:
          "Pricing looks reasonable. Still confirm the warranty and what's included.",
        questionsToAsk: baseQs,
        redFlags: [],
        negotiationScript: baseScript,
        suggestSecondOpinion: false,
      };
  }
}

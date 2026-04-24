// =============================================================================
// Knowledge Layer — pluggable real-world insight sources.
//
// The result screens render insights through this single interface. Today the
// only adapter is "ai-common-patterns" (LLM-generated common-pattern content,
// honestly labeled — NEVER claimed as live forum data).
//
// Future adapters can be plugged in here without touching the UI:
//   - NHTSA / Transport Canada recall API
//   - parts/tools recommendation API (RockAuto, PartsAvatar)
//   - repair labour-time API (Mitchell, Motor)
//   - community/forum-style similar-case data source
//   - YouTube tutorial search
//   - manufacturer service manuals (where legally available)
//
// To register a new source, implement `InsightsAdapter` and call
// `registerInsightsSource()`. `getRealWorldInsights()` will fan out to all
// configured sources and merge their results.
// =============================================================================

export type InsightsContext = {
  /** Free-text issue summary (e.g. "P0301 misfire on cylinder 1"). */
  issue: string;
  /** Optional category hint to keep prompts focused. */
  topic: "diagnose" | "cleaning" | "inspection" | "obd2" | "symptom";
  /** Optional structured component name (e.g. "front brake pad"). */
  component?: string | null;
  /** Optional severity hint to bias estimates. */
  severity?: "info" | "low" | "medium" | "high" | "critical" | null;
  /** Vehicle profile, when available. */
  vehicle?: {
    year?: number | string | null;
    make?: string | null;
    model?: string | null;
    mileage_km?: number | null;
  } | null;
};

export type RealWorldInsights = {
  /** Bullet points: what drivers with this issue typically report. */
  driver_reports: string[];
  /** Common fixes ordered most→least common. */
  common_fixes: { fix: string; route: "diy" | "shop" | "either"; note?: string | null }[];
  /** Common mistakes / safety risks. */
  watch_out_for: string[];
  /** Time + cost context, CAD shop pricing. */
  time_and_cost: {
    diy_time?: string | null;
    shop_cost_cad?: { low: number; high: number } | null;
    notes?: string | null;
  };
  /** Honest labeling: "common patterns" vs "live forum data". */
  source_label: string;
  /** True when the model deliberately reduced detail (low confidence). */
  low_confidence?: boolean;
};

export interface InsightsAdapter {
  id: string;
  /** Human label shown in the "Sources" footer. */
  label: string;
  /** True when this adapter is callable in the current environment. */
  isAvailable(): boolean;
  /** Fetch insights for the given context. May throw — caller will fall back. */
  fetch(ctx: InsightsContext): Promise<RealWorldInsights>;
}

const adapters: InsightsAdapter[] = [];

export function registerInsightsSource(adapter: InsightsAdapter) {
  if (adapters.find((a) => a.id === adapter.id)) return;
  adapters.push(adapter);
}

export function listInsightsSources(): { id: string; label: string; available: boolean }[] {
  return adapters.map((a) => ({ id: a.id, label: a.label, available: a.isAvailable() }));
}

/**
 * Fetch insights from the first available adapter. When multiple adapters
 * become available later, this will merge their outputs (priority: factual
 * recall data > labour-time data > AI common patterns).
 */
export async function getRealWorldInsights(ctx: InsightsContext): Promise<RealWorldInsights> {
  const available = adapters.filter((a) => a.isAvailable());
  if (available.length === 0) {
    throw new Error("No insights adapter is configured.");
  }
  // Single-source today. When real APIs land, replace with merge logic.
  return available[0].fetch(ctx);
}

/** Future placeholder list shown in the UI. */
export const FUTURE_INSIGHT_SOURCES: { label: string; what: string }[] = [
  { label: "NHTSA / Transport Canada recalls", what: "Open recalls and TSBs for this vehicle" },
  { label: "Parts & tools (PartsAvatar / RockAuto)", what: "OEM part numbers + price ranges" },
  { label: "Labour-time databases", what: "Real shop hours per repair" },
  { label: "Community case data", what: "Anonymized similar-case outcomes" },
  { label: "YouTube tutorials", what: "Vetted video walkthroughs" },
  { label: "Manufacturer service manuals", what: "Where legally available" },
];

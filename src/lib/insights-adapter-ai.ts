// AI-backed insights adapter — uses the ai-diagnose edge function with a new
// "insights" task. Honestly labeled as "common patterns" — never claimed as
// live forum/community data.
import { callAi } from "@/lib/ai";
import {
  registerInsightsSource,
  type InsightsAdapter,
  type InsightsContext,
  type RealWorldInsights,
} from "@/lib/knowledge-layer";

const adapter: InsightsAdapter = {
  id: "ai-common-patterns",
  label: "AI common-pattern summary",
  isAvailable: () => true, // Edge function is always available in this app.
  async fetch(ctx: InsightsContext): Promise<RealWorldInsights> {
    const result = await callAi<RealWorldInsights>(
      "insights",
      {
        issue: ctx.issue,
        topic: ctx.topic,
        component: ctx.component ?? null,
        severity: ctx.severity ?? null,
      },
      ctx.vehicle ?? null,
    );
    // Defensive defaults — model is instructed to return this shape but we
    // never want a missing field to break the UI.
    return {
      driver_reports: result.driver_reports ?? [],
      common_fixes: result.common_fixes ?? [],
      watch_out_for: result.watch_out_for ?? [],
      time_and_cost: result.time_and_cost ?? {},
      source_label: result.source_label ?? "Common patterns (AI summary)",
      low_confidence: result.low_confidence ?? false,
    };
  },
};

registerInsightsSource(adapter);

export default adapter;

import { supabase } from "@/integrations/supabase/client";

export type AiTask =
  | "obd2"
  | "symptom"
  | "camera"
  | "valuation"
  | "repair_steps"
  | "inspection_frame"
  | "inspection_final"
  | "insights"
  | "workflow_create";

/**
 * Default per-call timeout for ANY AI request. Edge function or model can
 * occasionally hang — we never let the UI spin forever.
 */
export const AI_DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Standard message shown anywhere we fall back to local logic because AI
 * was unavailable, slow, or returned an unusable result. Keep this string
 * in one place so the whole app sounds consistent.
 */
export const AI_UNAVAILABLE_MESSAGE =
  "AI enhancement limited — core tools still active.";

/**
 * Throwing variant — kept for back-compat with existing callers. New code
 * should prefer `callAiSafe`, which never throws and reports a reason.
 */
export async function callAi<T = unknown>(
  task: AiTask,
  payload: Record<string, unknown>,
  vehicle?: Record<string, unknown> | null,
  knowledge?: unknown,
  options?: { timeoutMs?: number },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? AI_DEFAULT_TIMEOUT_MS;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("AI request timed out")), timeoutMs),
  );
  const invokePromise = supabase.functions.invoke("ai-diagnose", {
    body: { task, payload, vehicle, knowledge },
  });
  const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as Awaited<
    ReturnType<typeof supabase.functions.invoke>
  >;
  if (error) {
    throw new Error(error.message ?? "AI request failed");
  }
  if ((data as { error?: string })?.error) {
    throw new Error((data as { error: string }).error);
  }
  return (data as { result: T }).result;
}

export type AiSafeResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "timeout" | "quota" | "network" | "empty" | "unknown"; message: string };

/**
 * Non-throwing AI call. Always resolves; classifies the failure so callers
 * can decide between silently using a local fallback and surfacing a banner.
 */
export async function callAiSafe<T = unknown>(
  task: AiTask,
  payload: Record<string, unknown>,
  vehicle?: Record<string, unknown> | null,
  knowledge?: unknown,
  options?: { timeoutMs?: number },
): Promise<AiSafeResult<T>> {
  try {
    const data = await callAi<T>(task, payload, vehicle, knowledge, options);
    if (data === null || data === undefined) {
      return { ok: false, reason: "empty", message: AI_UNAVAILABLE_MESSAGE };
    }
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    const reason: "timeout" | "quota" | "network" | "unknown" =
      /timeout|timed out/.test(lower) ? "timeout"
      : /402|credit|quota|rate/.test(lower) ? "quota"
      : /network|fetch|failed to fetch|edge function|non-2xx/.test(lower) ? "network"
      : "unknown";
    return { ok: false, reason, message };
  }
}

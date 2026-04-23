import { supabase } from "@/integrations/supabase/client";

export type AiTask = "obd2" | "symptom" | "camera" | "valuation" | "repair_steps";

export async function callAi<T = unknown>(
  task: AiTask,
  payload: Record<string, unknown>,
  vehicle?: Record<string, unknown> | null,
  knowledge?: unknown,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ai-diagnose", {
    body: { task, payload, vehicle, knowledge },
  });
  if (error) {
    throw new Error(error.message ?? "AI request failed");
  }
  if ((data as { error?: string })?.error) {
    throw new Error((data as { error: string }).error);
  }
  return (data as { result: T }).result;
}

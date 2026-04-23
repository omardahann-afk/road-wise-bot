// AutoSage AI — universal AI diagnosis edge function
// Handles: OBD2 explanation, symptom diagnosis, camera frame reasoning, valuation
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are AutoSage AI, an expert automotive diagnostic assistant.
You ALWAYS respond with valid JSON ONLY — never with prose, markdown fences, or commentary.
You combine the structured datasets the user provides with your knowledge to produce safe, accurate, actionable diagnoses.
Never hallucinate part numbers or torque specs you are uncertain about; mark uncertain items with "verify": true.
Always include safety warnings for tasks involving fuel, electrical, suspension, brakes, or airbags.
Recommend a professional when severity is high or when work requires specialized tools.`;

interface Body {
  task: "obd2" | "symptom" | "camera" | "valuation" | "repair_steps";
  payload: Record<string, unknown>;
  vehicle?: Record<string, unknown> | null;
  knowledge?: unknown;
}

function buildUserPrompt(body: Body): string {
  const { task, payload, vehicle, knowledge } = body;
  const ctx = {
    vehicle: vehicle ?? null,
    knowledge: knowledge ?? null,
    input: payload,
  };

  switch (task) {
    case "obd2":
      return `Task: Explain OBD2 trouble code(s) and produce a diagnosis.
Return JSON with shape:
{
 "summary": string,
 "severity": "info"|"low"|"medium"|"high"|"critical",
 "issues": [{ "code": string, "title": string, "description": string, "system": string }],
 "likely_causes": string[],
 "diy_steps": [{ "step": string, "detail": string, "warning"?: string }],
 "tools_needed": string[],
 "estimated_cost": { "low": number, "high": number, "currency": "USD" },
 "professional_recommended": boolean,
 "safety": string[]
}
Context: ${JSON.stringify(ctx)}`;
    case "symptom":
      return `Task: Diagnose probable issues from user-reported symptoms.
Return JSON with shape:
{
 "summary": string,
 "severity": "info"|"low"|"medium"|"high"|"critical",
 "possible_issues": [{ "title": string, "likelihood": "low"|"medium"|"high", "description": string, "system": string }],
 "next_steps": [{ "step": string, "detail": string }],
 "questions_to_narrow": string[],
 "tools_needed": string[],
 "estimated_cost": { "low": number, "high": number, "currency": "USD" },
 "professional_recommended": boolean,
 "safety": string[]
}
Context: ${JSON.stringify(ctx)}`;
    case "camera":
      return `Task: Given a list of generic objects detected by a browser vision model in a car-related scene, infer what automotive component(s) are likely visible and what the user should inspect.
Return JSON with shape:
{
 "summary": string,
 "likely_components": [{ "name": string, "confidence": "low"|"medium"|"high", "what_to_check": string[] }],
 "warnings": string[],
 "next_action": string,
 "follow_up_questions": string[]
}
Context: ${JSON.stringify(ctx)}`;
    case "valuation":
      return `Task: Estimate fair market value and produce negotiation advice.
Return JSON with shape:
{
 "fair_value": { "low": number, "avg": number, "high": number, "currency": "USD" },
 "decision": "BUY"|"NEGOTIATE"|"AVOID",
 "negotiation_advice": string,
 "key_points": string[],
 "red_flags": string[]
}
Context: ${JSON.stringify(ctx)}`;
    case "repair_steps":
      return `Task: Generate repair steps for the given issue.
Return JSON with shape:
{
 "title": string,
 "difficulty": "beginner"|"intermediate"|"advanced",
 "steps": [{ "step": string, "detail": string, "warning"?: string }],
 "tools": string[],
 "parts": string[],
 "warnings": string[],
 "estimated_cost": { "low": number, "high": number, "currency": "USD" },
 "professional_recommended": boolean
}
Context: ${JSON.stringify(ctx)}`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPrompt = buildUserPrompt(body);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit reached. Please wait a moment and try again." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiRes.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Add credits in workspace settings." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI gateway error", aiRes.status, txt);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiRes.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { error: "Invalid JSON from model", raw: content };
    }

    return new Response(JSON.stringify({ result: parsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-diagnose error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

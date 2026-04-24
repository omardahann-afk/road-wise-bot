// AutoSage AI — universal AI diagnosis edge function
// Handles: OBD2 explanation, symptom diagnosis, camera frame reasoning, valuation
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are AutoSage AI, an expert automotive diagnostic assistant for Canadian drivers.
You ALWAYS respond with valid JSON ONLY — never with prose, markdown fences, or commentary.
You combine the structured datasets the user provides with your knowledge to produce safe, accurate, actionable diagnoses.

HONESTY RULES (NON-NEGOTIABLE):
- If a photo is unclear, blurry, glare-affected, dark, or you are not at least medium confidence about what you see, set overall_confidence to "low" and ask the user to recapture. NEVER invent components, codes, or part numbers.
- NEVER claim insights are sourced from forums, communities, scraped data, or live APIs unless the input explicitly includes such data. If the only source is your own knowledge, label it "Common patterns (AI summary)".
- NEVER invent torque specs, fluid capacities, or part numbers. If a value is vehicle-dependent, say so and tell the user to check their vehicle service manual.
- Always include safety warnings for tasks involving fuel, electrical, suspension, brakes, or airbags.
- Always tell the user when to STOP DIY and see a mechanic (brake, steering, airbag, frame, fuel, or repeated unexplained codes).

VOICE & TONE: Practical, mechanic-grade, no filler. Use Canadian wording (km, CAD). Talk like an experienced shop tech writing on a work order — short, specific, action-oriented.
ALL pricing is Canadian Dollars (CAD), reflecting typical Canadian independent shop labor + parts. Never return USD.
Recommend a professional when severity is high or when work requires specialized tools.`;

interface Body {
  task:
    | "obd2"
    | "symptom"
    | "camera"
    | "valuation"
    | "repair_steps"
    | "inspection_frame"
    | "inspection_final"
    | "insights";
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
 "estimated_cost": { "low": number, "high": number, "currency": "CAD" },
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
 "estimated_cost": { "low": number, "high": number, "currency": "CAD" },
 "professional_recommended": boolean,
 "safety": string[]
}
Context: ${JSON.stringify(ctx)}`;
    case "camera":
      return `Task: A user pointed their phone camera at part of their car. They captured a still photo (provided to you as an image). The browser also reported these generic objects from a small on-device vision model (low quality, treat as hints only): ${JSON.stringify((payload as { detected_objects?: unknown }).detected_objects ?? [])}.
Look at the IMAGE carefully. Identify the actual automotive component(s) visible. If the photo is too dark, blurry, has heavy glare, or does not clearly show a car part, SET overall_confidence:"low" and ask the user to recapture — do NOT invent components, do NOT pad likely_components with guesses.
Goal hint from app: "${(payload as { goal?: string }).goal ?? "diagnose"}". Area hint: "${(payload as { area?: string }).area ?? "n/a"}".
If goal === "cleaning", ALSO populate the optional "cleaning" object describing the material visible, risk_level, safe products, products to avoid, and ordered cleaning_steps. If goal !== "cleaning", set "cleaning" to null.
Pricing in any cost mention must be CAD (Canadian shop pricing).
Return JSON ONLY with shape:
{
 "summary": string,
 "overall_confidence": "low"|"medium"|"high",
 "image_quality": { "lighting": "poor"|"ok"|"good", "focus": "poor"|"ok"|"good", "framing": "poor"|"ok"|"good" },
 "likely_components": [{ "name": string, "confidence": "low"|"medium"|"high", "what_to_check": string[], "likely_issue": string|null }],
 "warnings": string[],
 "next_action": string,
 "recapture_tip": string|null,
 "follow_up_questions": string[],
 "cleaning": null | { "material": string, "risk_level": "low"|"medium"|"high", "safe_products": string[], "unsafe_products": string[], "cleaning_steps": string[] }
}
Context: ${JSON.stringify(ctx)}`;
    case "valuation":
      return `Task: Estimate fair market value and produce negotiation advice.
Return JSON with shape:
{
 "fair_value": { "low": number, "avg": number, "high": number, "currency": "CAD" },
 "decision": "BUY"|"NEGOTIATE"|"AVOID",
 "negotiation_advice": string,
 "key_points": string[],
 "red_flags": string[]
}
Context: ${JSON.stringify(ctx)}`;
    case "repair_steps":
      return `Task: Generate practical, mechanic-grade repair steps for the given issue.
Each step must be specific enough for a real garage workflow — no generic filler like "be careful" or "use proper tools".
Where torque or capacity is vehicle-dependent, say "check your vehicle service manual for exact torque specs" instead of inventing a number.
Include explicit "stop and see a mechanic" triggers in the warnings array when the work touches brakes, steering, airbags, fuel, or suspension.
Return JSON with shape:
{
 "title": string,
 "difficulty": "beginner"|"intermediate"|"advanced",
 "steps": [{ "step": string, "detail": string, "warning"?: string }],
 "tools": string[],
 "parts": string[],
 "warnings": string[],
 "estimated_cost": { "low": number, "high": number, "currency": "CAD" },
 "professional_recommended": boolean
}
Context: ${JSON.stringify(ctx)}`;
    case "inspection_frame":
      return `Task: You are inspecting a USED car for purchase. The user just captured a frame for inspection step "${(payload as { step?: string }).step ?? "unknown"}".
The browser vision model detected the listed generic objects. Infer LIKELY car-related issues visible at this step (scratches, dents, rust spots, paint mismatch, tire wear, cracked trim, fluid leaks, dashboard warning lights, interior wear).
Return JSON ONLY with shape:
{
 "step_summary": string,
 "findings": [{
   "issue": string,
   "category": "exterior"|"interior"|"engine"|"tires"|"dashboard",
   "severity": "info"|"low"|"medium"|"high"|"critical",
   "notes": string
 }],
 "what_to_check_manually": string[],
 "next_step_hint": string
}
Context: ${JSON.stringify(ctx)}`;
    case "inspection_final":
      return `Task: Produce a final used-car inspection report and negotiation guidance based on the structured findings, scores, and computed valuation provided in the input.
Return JSON ONLY with shape:
{
 "headline": string,
 "summary": string,
 "top_concerns": [{ "issue": string, "severity": "info"|"low"|"medium"|"high"|"critical", "impact": string }],
 "negotiation_advice": string,
 "talking_points": string[],
 "estimated_repair_cost": { "low": number, "high": number, "currency": "CAD" },
 "decision": "BUY"|"NEGOTIATE"|"AVOID",
 "decision_reason": string
}
Context: ${JSON.stringify(ctx)}`;
    case "insights":
      return `Task: Produce a "Real-world insights" knowledge panel for the issue/topic in the input. This replaces what a user would normally search for on a forum.
HARD RULES:
- Do NOT claim this is forum data, scraped content, or live community data. It is a common-pattern summary written from general automotive knowledge. Set "source_label" to "Common patterns (AI summary)".
- Do NOT invent rare scenarios. Stick to what is genuinely common for this issue/component on consumer vehicles.
- Pricing is CAD shop pricing in Canada. Diy_time should be a realistic range like "30–60 min" or "2–4 hrs".
- If the issue text is vague, generic, or you don't recognize the component well, set "low_confidence": true and return shorter, more general guidance instead of fabricating specifics.
- Use Canadian wording (km, CAD). Never say USD.
- If a vehicle (year/make/model/mileage) is provided, tailor reports/fixes/cost to that vehicle (e.g. mention typical mileage-related issues, common known-problem parts for that platform when truly common). If no vehicle is provided, give general guidance and avoid model-specific claims.
Return JSON ONLY with shape:
{
 "driver_reports": string[],            // 3–5 short bullets, what drivers typically notice
 "common_fixes": [                       // 3–5 fixes, ordered most common first
   { "fix": string, "route": "diy"|"shop"|"either", "note": string|null }
 ],
 "watch_out_for": string[],              // 2–4 mistakes / safety risks
 "time_and_cost": {
   "diy_time": string|null,              // e.g. "1–2 hrs" or null if shop-only
   "shop_cost_cad": { "low": number, "high": number }|null,
   "notes": string|null                  // optional brief context
 },
 "source_label": "Common patterns (AI summary)",
 "low_confidence": boolean
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

    // Multimodal: when the camera task includes an image, send it as an
    // image_url content block so Gemini can actually look at the photo.
    const imageB64 = (body.payload as { image_base64?: string })?.image_base64;
    const userContent: unknown =
      body.task === "camera" && typeof imageB64 === "string" && imageB64.length > 100
        ? [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: {
                url: imageB64.startsWith("data:")
                  ? imageB64
                  : `data:image/jpeg;base64,${imageB64}`,
              },
            },
          ]
        : userPrompt;

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
          { role: "user", content: userContent },
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

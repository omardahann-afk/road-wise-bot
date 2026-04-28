// VIN decoder edge function
// Calls NHTSA vPIC, normalizes the result, and (when authenticated) upserts
// into vehicle_profiles. Always returns within ~6s — never blocks the UI.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface NhtsaItem {
  ModelYear?: string;
  Make?: string;
  Model?: string;
  Trim?: string;
  DisplacementL?: string;
  EngineModel?: string;
  BodyClass?: string;
  ErrorCode?: string;
}

async function decodeVin(vin: string) {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`VIN decode HTTP ${res.status}`);
  const data = (await res.json()) as { Results?: NhtsaItem[] };
  const item = data.Results?.[0] ?? {};
  return {
    vin,
    year: item.ModelYear ? Number(item.ModelYear) || null : null,
    make: item.Make || null,
    model: item.Model || null,
    trim: item.Trim || null,
    engine: item.DisplacementL || item.EngineModel || null,
    bodyClass: item.BodyClass || null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { vin, mileage, region, persist } = await req.json();
    if (!vin || typeof vin !== "string" || vin.length < 11) {
      return new Response(
        JSON.stringify({ error: "VIN must be a string of at least 11 characters." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const decoded = await decodeVin(vin.trim().toUpperCase());

    // Optional persistence — only if the caller is authenticated.
    let vehicleId: string | null = null;
    if (persist) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
      if (SUPABASE_URL && SUPABASE_ANON_KEY && authHeader) {
        try {
          const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
          });
          const { data: userRes } = await client.auth.getUser();
          const userId = userRes?.user?.id;
          if (userId) {
            const { data: existing } = await client
              .from("vehicle_profiles")
              .select("id")
              .eq("user_id", userId)
              .eq("vin", decoded.vin)
              .maybeSingle();
            if (existing?.id) {
              await client
                .from("vehicle_profiles")
                .update({
                  year: decoded.year,
                  make: decoded.make,
                  model: decoded.model,
                  trim: decoded.trim,
                  engine: decoded.engine,
                  mileage: typeof mileage === "number" ? mileage : null,
                  region: region ?? null,
                })
                .eq("id", existing.id);
              vehicleId = existing.id as string;
            } else {
              const { data: inserted } = await client
                .from("vehicle_profiles")
                .insert({
                  user_id: userId,
                  vin: decoded.vin,
                  year: decoded.year,
                  make: decoded.make,
                  model: decoded.model,
                  trim: decoded.trim,
                  engine: decoded.engine,
                  mileage: typeof mileage === "number" ? mileage : null,
                  region: region ?? null,
                })
                .select("id")
                .single();
              vehicleId = (inserted?.id as string) ?? null;
            }
          }
        } catch (persistErr) {
          // Persistence is best-effort — never fail the whole call.
          console.error("vehicle_profiles persist failed:", persistErr);
        }
      }
    }

    return new Response(JSON.stringify({ result: { ...decoded, vehicleId } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "VIN decode failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// AutoSage AI — Repair Step Engine.
// Converts raw AI repair output into structured, navigable steps with
// progress tracking. Progress is keyed by user_id + workflow + issue
// (or workflow alone for generic guides) so users can resume later.
//
// Persistence strategy:
//   1) localStorage  — instant, offline, per-device fallback (always written).
//   2) sessions table — cross-device sync when the user is signed in.
//      Stored under kind='repair' with deterministic title so we can
//      upsert/find it again. Latest server progress wins on first load,
//      then local writes flush back up debounced.

import type { RepairWorkflow } from "@/lib/valuation";
import { supabase } from "@/integrations/supabase/client";

export interface EngineStep {
  step_number: number;
  title: string;
  instruction: string;
  why_it_matters?: string;
  tools?: string[];
  warning?: string;
}

export interface RepairProgress {
  workflow: RepairWorkflow;
  issue?: string;
  current_index: number;
  completed: number[]; // indices of completed steps
  total: number;
  updated_at: number;
}

const STORAGE_PREFIX = "autosage:repair-progress:";

function key(workflow: RepairWorkflow, issue?: string): string {
  return `${STORAGE_PREFIX}${workflow}::${(issue ?? "_default").toLowerCase().replace(/\s+/g, "-")}`;
}

export function loadProgress(workflow: RepairWorkflow, issue?: string): RepairProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(workflow, issue));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RepairProgress;
    if (typeof parsed?.current_index !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProgress(p: RepairProgress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(p.workflow, p.issue), JSON.stringify({ ...p, updated_at: Date.now() }));
  } catch {
    /* ignore quota */
  }
}

export function clearProgress(workflow: RepairWorkflow, issue?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(workflow, issue));
  } catch {
    /* ignore */
  }
}

/* ============================================================
   Cross-device progress sync via the `sessions` table.
   - kind = 'repair'
   - title = `repair:${workflow}:${issue||_default}` (deterministic)
   - data = full RepairProgress JSON
   RLS: sessions owner all → naturally scoped to the signed-in user.
   ============================================================ */

function sessionTitle(workflow: RepairWorkflow, issue?: string): string {
  return `repair:${workflow}:${(issue ?? "_default").toLowerCase().replace(/\s+/g, "-")}`;
}

/** Pull progress from the database for the signed-in user. Returns null on miss. */
export async function fetchRemoteProgress(
  userId: string,
  workflow: RepairWorkflow,
  issue: string | undefined,
  vehicleId: string | null,
): Promise<RepairProgress | null> {
  try {
    const title = sessionTitle(workflow, issue);
    let q = supabase
      .from("sessions")
      .select("data, updated_at")
      .eq("user_id", userId)
      .eq("kind", "repair")
      .eq("title", title)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (vehicleId) q = q.eq("vehicle_id", vehicleId);
    const { data, error } = await q.maybeSingle();
    if (error || !data?.data) return null;
    const parsed = data.data as unknown as RepairProgress;
    if (typeof parsed?.current_index !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Push progress to the database. Idempotent upsert by (user, kind, title, vehicle). */
export async function pushRemoteProgress(
  userId: string,
  progress: RepairProgress,
  vehicleId: string | null,
): Promise<void> {
  try {
    const title = sessionTitle(progress.workflow, progress.issue);
    const payload = { ...progress, updated_at: Date.now() };
    // Find existing row first (no unique constraint to upsert on).
    let q = supabase
      .from("sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "repair")
      .eq("title", title)
      .limit(1);
    if (vehicleId) q = q.eq("vehicle_id", vehicleId);
    const { data: existing } = await q.maybeSingle();
    if (existing?.id) {
      await supabase
        .from("sessions")
        .update({
          data: payload as never,
          status: progress.completed.length >= progress.total ? "complete" : "active",
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("sessions").insert({
        user_id: userId,
        kind: "repair",
        title,
        vehicle_id: vehicleId,
        status: progress.completed.length >= progress.total ? "complete" : "active",
        data: payload as never,
      });
    }
  } catch {
    /* network / RLS issues silently fall back to local */
  }
}

/**
 * Normalize raw AI step output (which may be plain {step, detail, warning}[])
 * into the EngineStep shape the UI consumes.
 */
export function normalizeAiSteps(
  raw: { step: string; detail: string; warning?: string }[] | undefined,
  fallbackSteps: EngineStep[],
): EngineStep[] {
  if (!raw || raw.length === 0) return fallbackSteps;
  return raw.map((s, i) => ({
    step_number: i + 1,
    title: s.step,
    instruction: s.detail,
    warning: s.warning,
  }));
}

/* ---------- deterministic fallback step packs per workflow ----------
   Used when AI hasn't generated steps yet, so the engine ALWAYS has a
   real workflow to walk users through (never a blank screen). */
export const FALLBACK_STEPS: Record<RepairWorkflow, EngineStep[]> = {
  dent_repair: [
    { step_number: 1, title: "Inspect & clean the panel", instruction: "Wash, dry, and inspect the dent in good light from multiple angles.", why_it_matters: "Hidden creases or paint cracks change the technique you should use.", tools: ["microfiber cloth", "panel cleaner"] },
    { step_number: 2, title: "Choose technique", instruction: "Decide between paintless dent removal (PDR) for shallow dents or filler for deep/creased dents.", why_it_matters: "Picking the wrong technique can damage the clear coat further." },
    { step_number: 3, title: "Apply method", instruction: "For PDR, use a slide hammer or suction puller. For filler, sand, fill, and shape.", warning: "Wear safety glasses when using a slide hammer." },
    { step_number: 4, title: "Sand & feather", instruction: "Block-sand the area smooth, feathering the edge into the surrounding paint.", tools: ["320–600 grit sandpaper"] },
    { step_number: 5, title: "Prime & paint", instruction: "Apply primer, then color-matched paint, then clear coat in thin layers.", why_it_matters: "Thick coats run and look obvious." },
    { step_number: 6, title: "Polish & verify", instruction: "After 24–48h cure, polish the area and inspect from multiple angles.", tools: ["polishing compound"] },
  ],
  rust_repair: [
    { step_number: 1, title: "Assess severity", instruction: "Press the area firmly. Surface rust stays solid; perforation is structural.", why_it_matters: "Structural rust is unsafe — escalate to a body shop." },
    { step_number: 2, title: "Mask the area", instruction: "Tape and paper-mask 6 inches around the rust to protect surrounding paint." },
    { step_number: 3, title: "Remove rust", instruction: "Sand or wire-wheel down to bare, bright metal.", warning: "Wear N95 + eye protection — rust dust is harmful." },
    { step_number: 4, title: "Apply rust converter", instruction: "Brush on rust converter and let it cure per label (usually 24h)." },
    { step_number: 5, title: "Prime & paint", instruction: "Apply etching primer, then color-matched paint, then clear coat." },
    { step_number: 6, title: "Seal undercarriage if needed", instruction: "For wheel arches and rocker panels, apply rubberized undercoat after paint cures." },
  ],
  paint_repair: [
    { step_number: 1, title: "Assess depth", instruction: "Run a fingernail across the scratch. If it catches, the scratch is past the clear coat.", why_it_matters: "Determines if polishing alone will work." },
    { step_number: 2, title: "Wash & decon", instruction: "Wash the panel and clay-bar to remove embedded contaminants." },
    { step_number: 3, title: "Polish (clear-coat scratches)", instruction: "Use medium polish on a foam pad, working in 2-ft sections.", tools: ["DA polisher", "polishing pads"] },
    { step_number: 4, title: "Touch-up (deeper scratches)", instruction: "Apply matched paint with a fine brush or pen, building up in layers.", warning: "Avoid overfilling — wipe excess with a solvent before it dries." },
    { step_number: 5, title: "Clear coat", instruction: "Apply clear coat over the touched-up area and let cure 24h." },
    { step_number: 6, title: "Wax and seal", instruction: "Apply wax or sealant to protect the repair." },
  ],
  tire_service: [
    { step_number: 1, title: "Visual inspection", instruction: "Check tread depth (penny test), sidewalls (cracks/bulges), and wear pattern." },
    { step_number: 2, title: "Check pressure", instruction: "Set tire pressure to the door-jamb spec (cold tires).", tools: ["tire pressure gauge"] },
    { step_number: 3, title: "Rotate (if even wear)", instruction: "Rotate front-to-back per manual. Torque lug nuts to spec in a star pattern.", warning: "Use a torque wrench — over-tightening warps rotors." },
    { step_number: 4, title: "Replace if needed", instruction: "Replace tires below 4/32\" tread, or in pairs if AWD." },
    { step_number: 5, title: "Alignment check", instruction: "If wear was uneven, get an alignment after the new tires are mounted." },
  ],
  fluid_leak: [
    { step_number: 1, title: "Identify the fluid", instruction: "Color: clear/amber = brake; pink = trans; green/orange = coolant; brown/black = oil.", why_it_matters: "Fluid type determines urgency and which seal failed." },
    { step_number: 2, title: "Locate the source", instruction: "Clean the area, then run the engine to spot the leak's origin from above and below." },
    { step_number: 3, title: "Decide DIY vs shop", instruction: "Brake or transmission leaks → shop. Oil pan / valve cover → DIY.", warning: "Brake leaks are a safety emergency — do not drive." },
    { step_number: 4, title: "Replace gasket / seal", instruction: "Drain the affected fluid, remove the cover, replace gasket, torque to spec." },
    { step_number: 5, title: "Refill & verify", instruction: "Refill with the correct spec fluid, run engine, recheck for leaks at 24h." },
  ],
  warning_light_diagnostic: [
    { step_number: 1, title: "Read codes", instruction: "Plug in OBD2 scanner, ignition ON. Record every stored & pending code." },
    { step_number: 2, title: "Research codes", instruction: "Look up each code's meaning, common causes, and severity for your make/model." },
    { step_number: 3, title: "Inspect related components", instruction: "For O2 codes, inspect upstream/downstream sensors and exhaust leaks. For misfires, check coils + plugs." },
    { step_number: 4, title: "Repair root cause", instruction: "Replace the failing component or repair the wiring/connector identified in step 3." },
    { step_number: 5, title: "Clear & verify", instruction: "Clear codes and drive the readiness cycle. Confirm the light stays off." },
  ],
  interior_repair: [
    { step_number: 1, title: "Identify damage", instruction: "Tear, burn, scuff, or wear? Each needs a different kit." },
    { step_number: 2, title: "Clean the area", instruction: "Use leather/vinyl cleaner appropriate to the surface, dry fully." },
    { step_number: 3, title: "Apply repair compound", instruction: "Trim loose fibers; fill the damage with matched compound from a kit.", tools: ["leather/vinyl repair kit"] },
    { step_number: 4, title: "Color match", instruction: "Mix dye to match. Apply in thin coats with a sponge applicator." },
    { step_number: 5, title: "Seal", instruction: "Apply the kit's sealer to lock in color and texture." },
  ],
  general_repair: [
    { step_number: 1, title: "Diagnose precisely", instruction: "Reproduce the symptom, note conditions (cold start, highway, braking)." },
    { step_number: 2, title: "Check service info", instruction: "Look up TSBs and known issues for this make/model/year." },
    { step_number: 3, title: "Plan the repair", instruction: "List parts, tools, and time. Decide DIY vs mechanic." },
    { step_number: 4, title: "Execute repair", instruction: "Follow OEM service procedure. Torque to spec." },
    { step_number: 5, title: "Verify fix", instruction: "Reproduce the original test and confirm symptom is gone." },
  ],
};

/* ============================================================
   Per-workflow guide metadata for the "Fix it" repair guide screen.
   Provides deterministic, mechanic-grade safety, tools, common
   mistakes, and tutorial video summaries so the screen always has
   real content to render — even before the AI generator runs.
   ============================================================ */

export interface RepairGuideMeta {
  /** Mandatory safety reminders shown at the very top of the guide. */
  safety: string[];
  /** Tool list (3–6 items). Kept short and human-readable. */
  tools: string[];
  /** Common mistakes & risks shown in the "Watch out for" section. */
  watch_out: string[];
  /** Short AI-style tutorial-video summaries (no live API yet). */
  videos: { title: string; channel: string; summary: string; duration: string }[];
  /** Estimated time range for the whole repair. */
  time_estimate: string;
  /** "When to stop and see a mechanic" — clear escalation triggers. 2–4 bullets. */
  when_to_stop: string[];
  /** Torque / spec note — vehicle-dependent reminder. */
  torque_note?: string;
}

export const GUIDE_META: Record<RepairWorkflow, RepairGuideMeta> = {
  dent_repair: {
    safety: [
      "Wear safety glasses when using slide hammers or pulling tools — metal can snap back.",
      "Work in a well-ventilated area when sanding or applying fillers and primers.",
      "Let body filler and paint cure fully before sanding to avoid clogging and gummed pads.",
    ],
    tools: ["Microfiber cloth", "Panel cleaner", "Slide hammer or PDR puller", "Body filler & spreader", "320–600 grit sandpaper", "Color-matched paint + clear coat"],
    watch_out: [
      "Don't try paintless dent removal on creased or cracked paint — it will tear the clear coat.",
      "Avoid heavy filler layers; build up in thin passes to keep the panel flat.",
      "Mismatched touch-up paint stands out forever — verify the paint code on the door jamb sticker.",
    ],
    videos: [
      { title: "Paintless dent removal basics", channel: "Common patterns (AI summary)", summary: "Identify shallow dents, warm the panel, pull from the deepest point outward in small steps, then tap down high spots.", duration: "6–8 min" },
      { title: "Body filler done right", channel: "Common patterns (AI summary)", summary: "Sand to bare metal, mix filler with hardener, apply thin coats, block-sand smooth, then prime, paint, and clear-coat.", duration: "10–12 min" },
    ],
    time_estimate: "1–4 hrs",
  },
  rust_repair: {
    safety: [
      "Wear an N95 mask, gloves, and eye protection — rust dust and converters are harmful.",
      "If rust has perforated the panel or affects structural areas, escalate to a body shop.",
      "Work outdoors or with strong ventilation when using rust converters and primers.",
    ],
    tools: ["Wire wheel or sandpaper", "Rust converter", "Masking tape & paper", "Etching primer", "Color-matched paint + clear coat", "Rubberized undercoat (optional)"],
    watch_out: [
      "Painting over rust without converting it traps moisture and rust returns within months.",
      "Skipping the etching primer step causes paint to peel off bare metal.",
      "Don't sand through to thin metal on rocker panels or wheel arches — perforation is unsafe.",
    ],
    videos: [
      { title: "Treating surface rust the right way", channel: "Common patterns (AI summary)", summary: "Mask the area, sand to bright metal, apply rust converter, prime, paint, and clear in thin layers.", duration: "8–10 min" },
      { title: "Sealing wheel arches against future rust", channel: "Common patterns (AI summary)", summary: "After paint cures, apply rubberized undercoat to wheel wells and rocker panels to block stone chips and salt.", duration: "5–7 min" },
    ],
    time_estimate: "2–5 hrs",
  },
  paint_repair: {
    safety: [
      "Solvents and clear-coat fumes are flammable — no open flames or smoking nearby.",
      "Use nitrile gloves; touch-up paint and thinners irritate skin.",
      "Avoid direct sunlight while painting — it flashes the surface and traps solvents.",
    ],
    tools: ["Wash mitt & clay bar", "DA polisher + foam pads", "Polishing compound", "Touch-up paint pen (matched code)", "Clear-coat brush or pen", "Microfiber cloths"],
    watch_out: [
      "Pressing too hard with a polisher burns through clear coat — keep the pad moving.",
      "Overfilling deep scratches leaves a visible bump — wipe excess before it dries.",
      "Skipping the clay-bar step leaves contaminants under the polish swirl.",
    ],
    videos: [
      { title: "Polishing out clear-coat scratches", channel: "Common patterns (AI summary)", summary: "Wash, decon, polish in 2-ft sections at low speed, wipe down, then seal with wax.", duration: "5–8 min" },
      { title: "Touch-up paint that actually blends", channel: "Common patterns (AI summary)", summary: "Layer matched paint with a fine brush, let each coat flash, then top with clear and polish flush after curing.", duration: "7–9 min" },
    ],
    time_estimate: "30 min – 2 hrs",
  },
  tire_service: {
    safety: [
      "Use jack stands — never trust a hydraulic jack alone when wheels are off.",
      "Chock the opposite-corner wheel before jacking to prevent rolling.",
      "Always torque lug nuts with a torque wrench in a star pattern — over-tightening warps brake rotors.",
    ],
    tools: ["Tire pressure gauge", "Floor jack + jack stands", "Lug wrench or impact", "Torque wrench", "Tread-depth gauge or quarter"],
    watch_out: [
      "Mixing tire brands or tread depths on AWD vehicles can damage the differential.",
      "Driving on tires below 4/32\" tread loses grip in rain — replace before winter.",
      "Don't ignore uneven wear — it almost always means alignment or suspension wear.",
    ],
    videos: [
      { title: "Rotating tires in 20 minutes", channel: "Common patterns (AI summary)", summary: "Lift one corner at a time, swap front-to-back per the manual's pattern, torque lugs in a star.", duration: "4–6 min" },
      { title: "Reading tire wear like a mechanic", channel: "Common patterns (AI summary)", summary: "Center wear = overinflation, edge wear = underinflation, cupping = worn shocks, inner wear = alignment.", duration: "5–7 min" },
    ],
    time_estimate: "30–60 min",
  },
  fluid_leak: {
    safety: [
      "Never crawl under a car supported only by a jack — use jack stands on a level surface.",
      "Hot fluids (coolant, oil) cause burns — let the engine cool before touching anything.",
      "Brake fluid leaks are a safety emergency. Do not drive — tow the car.",
    ],
    tools: ["Cardboard sheet (catch drip)", "Flashlight", "Nitrile gloves", "Drain pan", "New gasket / seal", "Torque wrench"],
    watch_out: [
      "Don't confuse condensation drips from A/C with a leak — A/C water is clear and odorless.",
      "Reusing old gaskets almost always leaks again — replace every time.",
      "Over-torquing oil pan or valve cover bolts cracks the housing — follow spec.",
    ],
    videos: [
      { title: "Identify any car leak by color", channel: "Common patterns (AI summary)", summary: "Clear/amber = brake, pink/red = trans, green/orange = coolant, brown/black = oil — diagnose before you pull anything.", duration: "5–6 min" },
      { title: "Replacing a leaking valve cover gasket", channel: "Common patterns (AI summary)", summary: "Remove cover bolts in sequence, scrape the old gasket clean, set new gasket dry, torque to spec in pattern.", duration: "10–14 min" },
    ],
    time_estimate: "1–3 hrs",
  },
  warning_light_diagnostic: {
    safety: [
      "Don't keep driving with red warning lights (oil pressure, temperature, brake) — pull over.",
      "Disconnect the battery before unplugging sensors to avoid setting more codes.",
      "When working near the engine, wait for it to cool — exhaust can stay 200°C+ for 30 min.",
    ],
    tools: ["OBD2 scanner", "Multimeter", "Penlight & inspection mirror", "Basic socket set", "Anti-seize for oxygen sensors"],
    watch_out: [
      "Just clearing codes without fixing the cause — the light returns within a drive cycle.",
      "Replacing the oxygen sensor every time a code shows up — often the real issue is an exhaust leak.",
      "Ignoring pending codes — they become active codes and harder to trace.",
    ],
    videos: [
      { title: "Reading OBD2 codes like a pro", channel: "Common patterns (AI summary)", summary: "Pull both stored and pending codes, note freeze-frame data, then research the most likely failed component before swapping parts.", duration: "6–8 min" },
      { title: "Diagnosing a misfire (P0300 / P030x)", channel: "Common patterns (AI summary)", summary: "Swap coils between cylinders, recheck which cylinder misfires, then replace the failed coil and matching plug.", duration: "8–10 min" },
    ],
    time_estimate: "30 min – 2 hrs",
  },
  interior_repair: {
    safety: [
      "Disconnect the battery before removing trim near airbags or wiring harnesses.",
      "Use plastic trim tools — metal pry bars crack clips and scratch panels.",
      "Adhesives and dyes are flammable and need ventilation.",
    ],
    tools: ["Plastic trim removal tools", "Leather/vinyl repair kit", "Heat gun (low setting)", "Microfiber cloth", "Color-matched dye", "Sealer"],
    watch_out: [
      "Skipping the cleaning step — dye and compound won't bond to oily leather.",
      "Heating vinyl too long or too hot melts the grain pattern.",
      "Mismatched color stands out in daylight — test on a hidden spot first.",
    ],
    videos: [
      { title: "Repairing a leather seat tear", channel: "Common patterns (AI summary)", summary: "Trim loose fibers, glue a backing patch, fill the tear with compound, color-match dye, then seal.", duration: "10–12 min" },
      { title: "Fixing burn marks in cloth seats", channel: "Common patterns (AI summary)", summary: "Trim the burn, harvest fibers from a hidden area, glue them in, blend, and seal with fabric protector.", duration: "6–8 min" },
    ],
    time_estimate: "1–2 hrs",
  },
  general_repair: {
    safety: [
      "Always disconnect the battery negative terminal before electrical work.",
      "Use jack stands when working under the car — never just a jack.",
      "Wear safety glasses and gloves; vehicles have sharp edges and pressurized fluids.",
    ],
    tools: ["Basic socket set", "Torque wrench", "Multimeter", "Jack + jack stands", "OBD2 scanner", "Service manual or repair guide"],
    watch_out: [
      "Skipping diagnosis and replacing parts based on guesses wastes time and money.",
      "Ignoring torque specs — too tight strips threads, too loose causes leaks or rattles.",
      "Rushing a verification drive — confirm the symptom is fully gone before closing the job.",
    ],
    videos: [
      { title: "How to diagnose any car problem", channel: "Common patterns (AI summary)", summary: "Reproduce the symptom, gather conditions, check TSBs, narrow to a system, then test before swapping parts.", duration: "8–10 min" },
      { title: "Torque specs explained", channel: "Common patterns (AI summary)", summary: "Use a torque wrench in a star pattern for wheels and head bolts; over-torque warps and strips, under-torque leaks.", duration: "5–7 min" },
    ],
    time_estimate: "1–4 hrs",
  },
};

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
    { step_number: 1, title: "Inspect & clean the panel", instruction: "Wash and dry the panel, then look at the dent from several angles in good light. You'll usually spot creases or paint cracks you missed at first glance.", why_it_matters: "Hidden creases change the technique — pulling a creased dent without addressing the paint will tear the clear coat.", tools: ["microfiber cloth", "panel cleaner"] },
    { step_number: 2, title: "Choose your technique", instruction: "If the paint is intact and the dent is shallow, paintless dent removal (PDR) is your best shot. Deep, sharp, or creased dents almost always need filler and respray.", why_it_matters: "Most dents on door skins and quarter panels are PDR-friendly — bumper dents usually need heat or filler." },
    { step_number: 3, title: "Pull or push the dent", instruction: "For PDR, work from the deepest point outward in small steps with a slide hammer or glue puller — don't try to pop it in one shot. Take a photo every few pulls so you can see progress.", warning: "Wear safety glasses — slide hammers can snap back hard if the tab releases." },
    { step_number: 4, title: "Sand & feather the area", instruction: "Block-sand the area smooth and feather the edge well into the surrounding paint. Expect this to take longer than you think — rushing here shows up as a halo after paint.", tools: ["320–600 grit sandpaper"] },
    { step_number: 5, title: "Prime, paint, clear", instruction: "Apply primer, then color-matched paint in 2–3 thin coats letting each flash, then 2 coats of clear. Thin coats every time — heavy coats run and look obvious in daylight.", why_it_matters: "Verify the paint code on the door-jamb sticker before buying — generic 'silver' from a parts store almost never matches." },
    { step_number: 6, title: "Cure, polish, verify", instruction: "Let the clear cure 24–48h before polishing. Wet-sand any orange peel with 2000 grit, then polish with a foam pad. Inspect from multiple angles in sunlight.", tools: ["polishing compound"] },
  ],
  rust_repair: [
    { step_number: 1, title: "Assess severity honestly", instruction: "Press the panel firmly with your thumb. Surface rust stays solid; if it flexes, crunches, or you can push a screwdriver through, it's perforated.", why_it_matters: "Perforated metal on rocker panels, frame rails, or strut towers is a structural failure — escalate to a body shop, don't try to cover it." },
    { step_number: 2, title: "Mask off and contain dust", instruction: "Tape and paper-mask 6 inches around the rust. If you're in the wheel well or under the car, lay down cardboard — rust dust gets everywhere.", warning: "Wear N95, gloves, and eye protection. Rust dust is harmful long-term." },
    { step_number: 3, title: "Strip down to bright metal", instruction: "Use a wire wheel or 80-grit until you see clean, shiny steel. Don't stop early — any rust left under the paint will keep eating outward and bubble back through within months.", why_it_matters: "This step takes the longest and is the one most people skip. Don't." },
    { step_number: 4, title: "Apply rust converter", instruction: "Brush on rust converter and let it cure per the label (usually 24h). The treated metal will turn black — that's the chemical reaction working." },
    { step_number: 5, title: "Etch primer, paint, clear", instruction: "Etching primer first — paint won't bond to bare metal without it. Then color-matched paint in thin coats, then clear. Match the paint code from your door-jamb sticker.", warning: "Don't skip etching primer. Paint will lift in sheets within a year if you do." },
    { step_number: 6, title: "Seal and protect", instruction: "After paint cures, apply rubberized undercoat to wheel arches, rocker panels, and the underside if exposed. This blocks stone chips and salt — the two things that started the rust.", tools: ["rubberized undercoat spray"] },
  ],
  paint_repair: [
    { step_number: 1, title: "Assess scratch depth", instruction: "Run a fingernail across the scratch. If it doesn't catch, it's clear-coat only and polishes out. If it catches but you don't see metal or primer, it's into the base coat. If you see white or grey, it's down to primer.", why_it_matters: "Polish only fixes clear-coat scratches. Anything deeper needs touch-up paint or it'll keep getting worse." },
    { step_number: 2, title: "Wash and decontaminate", instruction: "Wash the panel and clay-bar the area. Skipping this drags grit into your polish and adds new swirl marks." },
    { step_number: 3, title: "Polish (clear-coat scratches)", instruction: "Use medium polish on a foam pad in 2-ft sections at low speed. Keep the pad moving — staying in one spot burns through the clear coat.", tools: ["DA polisher", "polishing pads"], warning: "Pressing too hard or stalling burns through the clear in seconds." },
    { step_number: 4, title: "Touch-up (deeper scratches)", instruction: "Verify your paint code on the door-jamb sticker before ordering paint. Apply with a fine brush or pen, building up in thin layers — flash between coats. Wipe excess with a solvent stick before it dries.", warning: "Generic colors from parts stores rarely match — get OEM-matched paint." },
    { step_number: 5, title: "Clear coat the touch-up", instruction: "Apply clear over the touched-up area only and let it cure 24h. Don't rush — soft clear scratches as soon as you wax it." },
    { step_number: 6, title: "Polish flush and seal", instruction: "After full cure, lightly polish the touch-up flush with the surrounding panel, then wax or seal. In bright daylight you should barely see it from 3 feet away — that's a successful blend." },
  ],
  tire_service: [
    { step_number: 1, title: "Visual inspection", instruction: "Check tread depth (penny test or 4/32\" gauge), look at the sidewalls for cracks or bulges, and read the wear pattern. Center wear means overinflation, edge wear means under, cupping means worn shocks." },
    { step_number: 2, title: "Set tire pressure cold", instruction: "Set pressure to the door-jamb spec — not the number molded into the sidewall (that's the maximum). Always check cold, before driving more than a few km.", tools: ["tire pressure gauge"] },
    { step_number: 3, title: "Rotate front-to-back", instruction: "Chock the opposite-corner wheel before lifting. Take wheels off one corner at a time and rotate per your owner's manual pattern. Use a torque wrench in a star pattern.", warning: "Use a torque wrench — over-tightening warps brake rotors and you'll feel pulsation under braking within weeks." },
    { step_number: 4, title: "Replace if needed", instruction: "Replace tires below 4/32\" tread before winter, or in pairs (same axle) if AWD. Mismatched tread depths on AWD can damage the centre differential." },
    { step_number: 5, title: "Re-torque after 80–100 km", instruction: "Drive 80–100 km, then re-torque the lug nuts. Wheels can settle and lose torque after the first drive — this 5-minute check prevents wheels from coming loose." },
  ],
  fluid_leak: [
    { step_number: 1, title: "Identify the fluid by color", instruction: "Slip a piece of cardboard under the car overnight. Clear/amber = brake or power steering, pink or red = transmission, green/orange = coolant, brown/black = engine oil, clear and odorless = A/C condensation (not a leak).", why_it_matters: "Fluid type tells you both what failed and how urgent it is." },
    { step_number: 2, title: "Locate the source from above and below", instruction: "Clean the area with brake cleaner, then run the engine and look for fresh wet spots. A flashlight from below and a mirror from above usually finds it within 5 minutes." },
    { step_number: 3, title: "Decide DIY vs shop", instruction: "Oil pan, valve cover, or differential gaskets are DIY-friendly. Brake, transmission, power steering, or fuel leaks should go to a shop — these are safety-critical or labour-heavy.", warning: "Brake or fuel leaks are a safety emergency — do not drive, tow it." },
    { step_number: 4, title: "Replace the gasket or seal", instruction: "Drain the affected fluid, remove the cover bolts in sequence, scrape the old gasket clean (don't gouge the mating surface), set the new gasket dry, and torque to spec in the proper pattern. Expect bolts to be snug — don't crank them, low torque is normal here.", warning: "Over-torquing oil pan or valve cover bolts cracks the housing or strips threads." },
    { step_number: 5, title: "Refill and verify at 24h", instruction: "Refill with the exact spec fluid (check your manual — using the wrong ATF or coolant causes serious damage). Run the engine to temperature, then recheck for leaks the next morning when the car has sat overnight." },
  ],
  warning_light_diagnostic: [
    { step_number: 1, title: "Pull every code", instruction: "Plug in your OBD2 scanner with the ignition ON, engine off. Record both stored AND pending codes, plus any freeze-frame data. Take a photo of the screen so you have it for reference." },
    { step_number: 2, title: "Research before you swap parts", instruction: "Look up each code's meaning AND the most common cause for your specific make and model. A P0420 on one platform is usually a tired catalytic converter, on another it's a known O2 sensor issue.", why_it_matters: "Replacing parts based on the code alone is the #1 way to waste money — the code points to a system, not a specific part." },
    { step_number: 3, title: "Inspect related components", instruction: "For misfire codes, swap coils between cylinders and recheck which cylinder misfires — that confirms the bad coil. For O2 codes, check for exhaust leaks first. For lean codes, check intake boots and vacuum lines." },
    { step_number: 4, title: "Repair the root cause", instruction: "Replace the failing part or fix the wiring/connector you identified. Use anti-seize on oxygen sensors and torque to spec — they strip and seize easily." },
    { step_number: 5, title: "Clear and verify", instruction: "Clear codes, then drive a full readiness cycle (mix of city + highway, 20–30 min). If the light stays off and monitors are ready, the fix held." },
  ],
  interior_repair: [
    { step_number: 1, title: "Identify the damage type", instruction: "Tear, burn, scuff, or wear all need different repairs. A clean tear glues and patches well; a burn needs trimming and fibre-fill; deep wear usually needs a panel swap." },
    { step_number: 2, title: "Clean the area thoroughly", instruction: "Use a leather or vinyl cleaner appropriate for the surface and let it dry fully. Repair compound and dye won't bond to oils, conditioner residue, or dirt — this step is non-negotiable." },
    { step_number: 3, title: "Apply repair compound", instruction: "Trim loose fibres or melted edges flush, then fill the damage in thin layers with the kit's compound. Build up flush with the surrounding surface — overfill leaves a visible bump.", tools: ["leather/vinyl repair kit"] },
    { step_number: 4, title: "Color match in thin coats", instruction: "Mix the dye to match — test on a hidden spot like under the seat first. Apply in light coats with a sponge applicator; multiple thin layers always look better than one heavy one.", warning: "Mismatched color stands out forever in daylight. Take time to test." },
    { step_number: 5, title: "Seal and protect", instruction: "Apply the kit's sealer to lock in color and texture. Avoid sitting on the seat or touching the area for 24h while it cures." },
  ],
  battery_service: [
    { step_number: 1, title: "Confirm the battery is the failure", instruction: "Test resting voltage with a multimeter (key off, 5+ min). Healthy = 12.6V+; weak = 12.2–12.4V; dead < 12.0V. Also load-test if you have a tester. Rule out the alternator (charging voltage 13.8–14.6V at idle) and starter before swapping the battery.", why_it_matters: "Replacing a good battery wastes $200+. Most no-start issues are corroded terminals or a bad alternator, not the battery itself.", tools: ["Multimeter"] },
    { step_number: 2, title: "Locate the battery and access path", instruction: "Find your battery (under hood, under seat, in trunk, or — on some Chrysler/Dodge platforms like the Journey, Avenger, Sebring — behind the driver-side front wheel well). For wheel-well access, turn the wheel fully and remove the inner fender liner clips with a trim tool.", why_it_matters: "Wheel-well batteries have no top-side access; trying to reach from above wastes time and risks scratching the fender.", tools: ["Trim removal tool", "10mm socket"], warning: "Park on level ground with the parking brake on before removing any fender liner." },
    { step_number: 3, title: "Disconnect the battery safely", instruction: "Disconnect the NEGATIVE (−, black) terminal first, then the POSITIVE (+, red). Tape the negative cable end so it can't swing back and touch the post. Note any memory-saver plug you might want for radio/seat presets.", why_it_matters: "Negative-first disconnect prevents a wrench bridging hot-to-chassis, which can spark, weld, or pop fuses.", tools: ["10mm socket", "Battery terminal puller"], warning: "Wear safety glasses and remove jewelry — a slipped wrench across the positive post can flash-weld and burn." },
    { step_number: 4, title: "Free the hold-down hardware (often rusted)", instruction: "Soak the hold-down bolts/clamp with penetrating oil, wait 10–15 min (24h is ideal if you can). Use a long-reach socket and extension to back them out slowly. If a bolt feels gritty or binds, stop and re-soak — don't force it.", why_it_matters: "Hold-down bolts on wheel-well batteries are exposed to road salt and seize commonly. Snapping one turns a 30-min job into 3 hours of extraction.", tools: ["Penetrating oil", "Long-reach 10mm socket", "Extension"], warning: "If the bolt head rounds off or the bolt feels like it's about to shear, stop. Replacement hold-down hardware is cheap; an extracted broken bolt is not." },
    { step_number: 5, title: "Lift out the old battery and clean the tray", instruction: "Lift with both hands — group-size batteries weigh 35–50 lb. Inspect the tray and cables: replace bolts/clamp if heavily corroded, brush terminals with a wire brush or terminal cleaner until shiny, and apply anti-corrosion grease or felt washers to the posts before reinstalling.", why_it_matters: "Corroded terminals cause voltage drop that mimics a bad battery. Cleaning now prevents repeating the job in 6 months.", tools: ["Wire brush / battery terminal cleaner"] },
    { step_number: 6, title: "Install the new battery, reconnect in reverse", instruction: "Drop the new battery in with the same terminal orientation. Reinstall the hold-down (anti-seize on the threads). Connect POSITIVE first, then NEGATIVE. Snug the terminal clamps — tight enough you can't twist them by hand, not so tight you crush the post.", why_it_matters: "Reverse-order reconnection (positive first) avoids sparks at the chassis ground.", tools: ["10mm socket", "Anti-seize compound", "Anti-corrosion pads or grease"] },
    { step_number: 7, title: "Verify and reset", instruction: "Start the engine — should crank strong on the first try. Check charging voltage at idle (13.8–14.6V) and after a short rev (should not exceed 15V). Reset the clock, radio presets, and any window auto-up if needed. Reinstall the fender liner.", why_it_matters: "Catching an over-charging alternator now saves you from cooking the new battery in a week.", tools: ["Multimeter"] },
  ],
  general_repair: [
    { step_number: 1, title: "Reproduce and document the symptom", instruction: "Reproduce the issue and note exactly when it happens — cold start, after 20 min of highway, only when braking, only over bumps. Take a phone video if it's intermittent.", why_it_matters: "Half of any repair is accurate diagnosis. Vague symptoms lead to parts-cannon repairs." },
    { step_number: 2, title: "Check service info and TSBs", instruction: "Look up technical service bulletins (TSBs), recalls, and known issues for your year/make/model. There's a good chance someone has documented exactly what you're dealing with." },
    { step_number: 3, title: "Plan the repair", instruction: "List the parts, tools, and realistic time. Take a photo of any connector or hose you'll unplug — reassembly is much faster with reference photos." },
    { step_number: 4, title: "Execute carefully", instruction: "Follow the OEM service procedure if you have it. Spray penetrating oil on rusty fasteners 10 min before turning them. Torque to spec — don't gorilla anything, especially on aluminum threads.", warning: "If a bolt feels wrong (binding, gritty), stop and inspect. Cross-threading or breaking it off costs hours." },
    { step_number: 5, title: "Verify the fix held", instruction: "Reproduce the original symptom test — cold start, road test, scan for codes. Confirm it's actually gone before calling the job done." },
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
      { title: "Paintless dent removal — start to finish", channel: "Common patterns (AI summary)", summary: "Shows how to identify a PDR-friendly dent, warm the panel, glue-pull from the deepest point outward, and tap down high spots. Straightforward but requires patience and the right tabs.", duration: "6–8 min" },
      { title: "Body filler done right", channel: "Common patterns (AI summary)", summary: "Walks through sanding to bare metal, mixing filler with hardener, applying thin coats, block-sanding flat, then priming and painting. Beginner-friendly if you take your time on the sanding.", duration: "10–12 min" },
    ],
    time_estimate: "1–4 hrs",
    when_to_stop: [
      "The dent has cracked or chipped paint exposing bare metal — needs proper bodywork, not PDR.",
      "The panel is creased sharply or has multiple high/low spots that won't pull out.",
      "The damage is on a structural area (A/B/C pillar, frame rail) — get it inspected for hidden frame damage.",
    ],
    torque_note: "No torque-critical fasteners on a typical PDR job; if you remove a panel, check your vehicle service manual for exact bolt torque before reinstalling.",
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
      { title: "Treating surface rust the right way", channel: "Common patterns (AI summary)", summary: "Shows masking, sanding to bright metal, applying rust converter, etching primer, paint, and clear in thin layers. Realistic on the time it takes — the sanding is the long part.", duration: "8–10 min" },
      { title: "Sealing wheel arches against future rust", channel: "Common patterns (AI summary)", summary: "Walks through applying rubberized undercoat to wheel wells and rocker panels after the paint cures. Easy job, big payoff against road salt.", duration: "5–7 min" },
    ],
    time_estimate: "2–5 hrs",
    when_to_stop: [
      "You can push a screwdriver through the panel — perforation means structural rust, escalate to a body shop.",
      "Rust is on rocker panels, frame rails, subframe, brake/fuel lines, or strut towers — these are safety-critical.",
      "Bubbling paint covers a large area; cutting and welding in fresh metal is a shop job.",
    ],
    torque_note: "If you remove suspension or subframe bolts to access rust, check your vehicle service manual for exact torque specs and replacement-bolt requirements.",
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
      { title: "Polishing out clear-coat scratches", channel: "Common patterns (AI summary)", summary: "Shows the full wash → clay-bar → polish workflow with a DA polisher in 2-ft sections. Beginner-friendly with the right pads; just keep the polisher moving.", duration: "5–8 min" },
      { title: "Touch-up paint that actually blends", channel: "Common patterns (AI summary)", summary: "Walks through layering matched paint with a fine brush, letting each coat flash, topping with clear, and polishing flush after curing. Patience is the whole skill here.", duration: "7–9 min" },
    ],
    time_estimate: "30 min – 2 hrs",
    when_to_stop: [
      "The scratch goes through clear coat AND base coat to primer or metal — needs body-shop blend, not a touch-up pen.",
      "You see fish-eyes, runs, or orange-peel after spraying — strip and respray is a shop-grade job.",
      "Damage covers more than a hand-sized area; spot blending rarely matches in daylight.",
    ],
    torque_note: "No torque specs apply to paint work itself; if you removed trim or door handles, refer to your vehicle service manual before reinstalling.",
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
      { title: "Rotating tires in 20 minutes", channel: "Common patterns (AI summary)", summary: "Shows how to chock, lift one corner at a time, swap front-to-back per the manual's pattern, and torque lugs in a star. Straightforward beginner job with basic tools.", duration: "4–6 min" },
      { title: "Reading tire wear like a mechanic", channel: "Common patterns (AI summary)", summary: "Walks through what center wear, edge wear, cupping, and inner-edge wear actually mean — and which suspension or alignment issue causes each. Pure diagnosis, no tools needed.", duration: "5–7 min" },
    ],
    time_estimate: "30–60 min",
    when_to_stop: [
      "You see sidewall bulges, cord showing, or cracks — the tire is unsafe at any speed, replace immediately.",
      "Wheel studs are stretched, cross-threaded, or a lug seat is damaged — a shop must repair before driving.",
      "Uneven wear keeps coming back after rotation — there's an alignment, suspension, or bearing issue.",
    ],
    torque_note: "Lug-nut torque varies by vehicle (commonly 100–140 Nm / 75–105 lb-ft). Always check your vehicle service manual or door-jamb sticker for the exact spec, then re-torque after 80–100 km of driving.",
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
      { title: "Identify any car leak by color", channel: "Common patterns (AI summary)", summary: "Shows how to drop cardboard, identify the fluid by color and smell, and narrow down which seal failed before pulling anything apart. Pure diagnosis — no tools needed.", duration: "5–6 min" },
      { title: "Replacing a leaking valve cover gasket", channel: "Common patterns (AI summary)", summary: "Walks through removing the cover bolts in sequence, scraping the old gasket clean without gouging, setting a new gasket dry, and torquing in pattern. Doable for a confident beginner.", duration: "10–14 min" },
    ],
    time_estimate: "1–3 hrs",
    when_to_stop: [
      "Brake fluid, power steering, or fuel is leaking — do NOT drive, tow it. Brake failure is a life-safety risk.",
      "The leak is from the transmission pan, rear main seal, or transfer case — labour-heavy, escalate to a shop.",
      "Coolant is leaking internally (white smoke from exhaust, milky oil) — head gasket / cracked head, shop only.",
    ],
    torque_note: "Oil pan, valve cover, and transmission pan bolts have low, specific torque values that strip easily. Always check your vehicle service manual for exact torque and tightening sequence.",
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
      { title: "Reading OBD2 codes like a pro", channel: "Common patterns (AI summary)", summary: "Shows how to pull stored AND pending codes plus freeze-frame data, then research the most likely failed component before swapping parts. Anyone with a scanner can follow it.", duration: "6–8 min" },
      { title: "Diagnosing a misfire (P0300 / P030x)", channel: "Common patterns (AI summary)", summary: "Walks through swapping coils between cylinders to confirm which one is bad, then replacing the coil and matching plug. Straightforward, but tight access on some engines.", duration: "8–10 min" },
    ],
    time_estimate: "30 min – 2 hrs",
    when_to_stop: [
      "Red lights are on (oil pressure, temperature, brake, charging) — pull over safely and stop driving.",
      "Codes return immediately after clearing, or a misfire is severe under load — risk of catalytic converter damage.",
      "You're chasing intermittent electrical faults across multiple systems — a shop with a bidirectional scan tool is faster and cheaper.",
    ],
    torque_note: "Oxygen sensors, knock sensors, and spark plugs have specific torque specs and often require anti-seize. Check your vehicle service manual for exact values before reinstalling.",
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
      { title: "Repairing a leather seat tear", channel: "Common patterns (AI summary)", summary: "Shows how to trim loose fibers, glue a backing patch under the tear, fill with compound, color-match dye, and seal. Patient work — colour matching is the hardest part.", duration: "10–12 min" },
      { title: "Fixing burn marks in cloth seats", channel: "Common patterns (AI summary)", summary: "Walks through trimming the burn, harvesting fibres from a hidden area, gluing them in, blending, and sealing with fabric protector. Forgiving repair — easy to retry if the first pass looks off.", duration: "6–8 min" },
    ],
    time_estimate: "1–2 hrs",
    when_to_stop: [
      "Trim covers an airbag (door, headliner, A-pillar) — incorrect reassembly can disable airbag deployment.",
      "Wiring harnesses or seat heater elements are damaged — shop diagnosis prevents short circuits or fires.",
      "Headliner is sagging across the whole roof — it's a full re-skin job, not a spot repair.",
    ],
    torque_note: "Seat-mount bolts and seat-belt anchors are safety-critical. If you remove either, check your vehicle service manual for exact torque specs before driving.",
  },
  battery_service: {
    safety: [
      "Disconnect the NEGATIVE (−) terminal first and the POSITIVE (+) last to avoid shorting a wrench across the chassis.",
      "Wear safety glasses and remove rings/watches — a slipped wrench across the positive post can flash-weld and burn.",
      "If the battery case is cracked, swollen, or leaking acid, use gloves, neutralize spills with baking soda + water, and ventilate the area.",
    ],
    tools: ["Multimeter", "10mm socket + ratchet", "Long-reach 10mm socket and extension", "Trim removal tool", "Battery terminal cleaner / wire brush", "Penetrating oil"],
    watch_out: [
      "Reversing terminal order on reconnect (negative first, positive last) sparks at chassis ground — always positive-first to reconnect.",
      "Forcing rusted hold-down bolts shears the head off — soak with penetrating oil and use a long-reach socket.",
      "Skipping the charging-system check (13.8–14.6V at idle) — a bad alternator will cook your new battery in days.",
    ],
    videos: [
      { title: "Battery test before replacement", channel: "Common patterns (AI summary)", summary: "Walks through resting voltage and load testing so you don't replace a healthy battery. 5–10 minutes with a basic multimeter.", duration: "5–7 min" },
      { title: "Wheel-well battery access (Chrysler/Dodge platforms)", channel: "Common patterns (AI summary)", summary: "Shows turning the wheel, popping fender liner clips, and reaching the battery with a long extension. Beginner-friendly once you've seen it once.", duration: "8–10 min" },
    ],
    time_estimate: "30–60 min (add 30 min if hold-down bolts are seized)",
    when_to_stop: [
      "Hold-down bolt has snapped or rounded off and you don't have an extractor — a shop can pull it without chewing the tray.",
      "Charging voltage stays above 15V or below 13.5V at idle after install — alternator/regulator issue, not a DIY guess.",
      "Battery case is cracked, swollen, or vented acid into the tray — neutralize, glove up, and consider professional handling.",
    ],
    torque_note: "Battery hold-down hardware torque is light — typically 60–100 in-lb (7–11 Nm). Do not gorilla it; over-tightening cracks the case. Terminal clamp bolts: snug + ¼ turn, never crush the post.",
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
      { title: "How to diagnose any car problem", channel: "Common patterns (AI summary)", summary: "Shows the mechanic's approach: reproduce the symptom, document conditions, check TSBs, narrow to a system, and test before swapping parts. Mostly thinking — no tools needed.", duration: "8–10 min" },
      { title: "Torque specs explained", channel: "Common patterns (AI summary)", summary: "Walks through using a torque wrench properly in a star pattern for wheels and head bolts. Beginner-friendly — explains why over-torque warps and under-torque leaks.", duration: "5–7 min" },
    ],
    time_estimate: "1–4 hrs",
    when_to_stop: [
      "The repair touches brakes, steering, suspension, airbags, or fuel system and you're not 100% sure of the procedure.",
      "You don't have a torque wrench, jack stands, or service-manual specs — postpone instead of guessing.",
      "Symptom is intermittent, getting worse, or affects vehicle control — a shop scan and road test save time and risk.",
    ],
    torque_note: "Most fasteners on modern vehicles are torque-critical. Always check your vehicle service manual for exact torque specs and tightening sequence before reinstalling.",
  },
};

/* ============================================================
   Per-workflow fallback PARTS lists. Used when the AI workflow
   path returns no parts (or AI is unavailable) so the user always
   sees an obvious shopping list. Keep entries short, generic, and
   skill-appropriate; vehicle-specific part numbers live in the
   AI-drafted path or the user's notes.
   ============================================================ */
export const FALLBACK_PARTS: Record<RepairWorkflow, string[]> = {
  dent_repair: [
    "Body filler + hardener",
    "Color-matched paint (verify code on door-jamb sticker)",
    "Clear coat",
    "320 / 600 / 2000 grit sandpaper",
  ],
  rust_repair: [
    "Rust converter",
    "Etching primer",
    "Color-matched paint (verify code on door-jamb sticker)",
    "Rubberized undercoat spray",
  ],
  paint_repair: [
    "OEM-matched touch-up paint (verify code on door-jamb sticker)",
    "Clear coat pen or bottle",
    "Polishing compound",
    "Microfiber applicators",
  ],
  tire_service: [
    "Replacement tire(s) — match size, load, and speed rating",
    "Valve stem(s)",
    "Wheel weights (if rebalancing)",
  ],
  fluid_leak: [
    "Replacement gasket or seal kit (match part number)",
    "Correct-spec fluid (check owner's manual)",
    "Brake cleaner / degreaser",
    "Shop rags",
  ],
  warning_light_diagnostic: [
    "Suspect sensor or part identified by code (only buy after confirming)",
    "Anti-seize compound (for O2 sensors)",
    "Dielectric grease (for connectors)",
  ],
  interior_repair: [
    "Leather/vinyl repair kit (color-matched)",
    "Adhesive backing patch",
    "Sealer / fabric protector",
  ],
  battery_service: [
    "Replacement battery (match group size, CCA, and terminal layout)",
    "Battery terminal cleaner / wire brush",
    "Anti-corrosion grease or felt washer pads",
    "Replacement hold-down hardware (if existing bolts are rusted)",
  ],
  general_repair: [
    "Replacement part(s) — confirm exact part number for your VIN",
    "Penetrating oil (e.g. PB Blaster) for rusted fasteners",
    "Anti-seize compound",
    "Shop rags",
  ],
};

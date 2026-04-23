// AutoSage AI — Repair Step Engine.
// Converts raw AI repair output into structured, navigable steps with
// progress tracking. Progress is keyed by user_id + workflow + issue
// (or workflow alone for generic guides) so users can resume later.

import type { RepairWorkflow } from "@/lib/valuation";

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

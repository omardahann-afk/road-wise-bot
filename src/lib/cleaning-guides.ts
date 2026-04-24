export type CleaningAreaId =
  | "interior"
  | "wheels_tires"
  | "paint_body"
  | "glass_trim"
  | "engine_bay";

export interface CleaningGuide {
  id: CleaningAreaId;
  title: string;
  description: string;
  cameraStepId: string;
  /** Typical material(s) being cleaned for context. */
  material: string;
  /** Risk level if the wrong product is used or technique is poor. */
  riskLevel: "low" | "medium" | "high";
  tools: string[];
  /** Products that are safe to use on this area. */
  safeProducts: string[];
  /** Products / household items to AVOID on this area. */
  unsafeProducts: string[];
  /** Generic safety tips. */
  safety: string[];
  steps: { title: string; detail: string }[];
}

export const CLEANING_GUIDES: CleaningGuide[] = [
  {
    id: "interior",
    title: "Interior Cabin",
    description: "Seats, dashboard, touch points, trim, and carpets.",
    cameraStepId: "interior",
    material: "Plastics, fabric, leather, electronics",
    riskLevel: "medium",
    tools: ["Microfiber towels", "Soft interior brush", "Vacuum with crevice tool", "Detailing swabs"],
    safeProducts: [
      "pH-neutral interior cleaner",
      "Dedicated leather cleaner & conditioner",
      "Fabric / upholstery shampoo",
      "Water-based UV protectant for plastics",
    ],
    unsafeProducts: [
      "Bleach or chlorine cleaners",
      "Glass cleaner with ammonia on touchscreens",
      "Silicone-heavy dressings on steering wheel / pedals (slippery)",
      "Solvents like acetone or paint thinner",
    ],
    safety: [
      "Test cleaners on a hidden spot first",
      "Avoid soaking switches, screens, and seat electronics",
      "Open windows for ventilation while cleaning",
    ],
    steps: [
      { title: "Vacuum first", detail: "Remove loose debris from seats, carpets, cup holders, and seams before using liquid cleaners." },
      { title: "Clean top-down", detail: "Wipe dash, door cards, and console first, then move to seats and carpets to avoid re-soiling surfaces." },
      { title: "Agitate lightly", detail: "Use a soft brush on textured plastics and fabric, then wipe with a clean microfiber." },
      { title: "Protect high-touch surfaces", detail: "Finish with a low-sheen protectant on plastics to reduce future dust and UV fading." },
    ],
  },
  {
    id: "wheels_tires",
    title: "Wheels & Tires",
    description: "Brake dust, road grime, sidewalls, and tire dressing prep.",
    cameraStepId: "wheels_tires",
    material: "Painted / clear-coated alloy, rubber",
    riskLevel: "medium",
    tools: ["Wheel brush", "Dedicated tire brush", "Microfiber drying towel", "Pressure rinse or hose"],
    safeProducts: [
      "pH-balanced (acid-free) wheel cleaner",
      "Dedicated tire cleaner",
      "Water-based tire dressing",
    ],
    unsafeProducts: [
      "Acid-based wheel cleaners on coated / polished wheels",
      "Oven cleaner or degreaser on clear-coated wheels",
      "Solvent-based tire shine on the tread (causes slippage)",
    ],
    safety: [
      "Let hot brakes cool before spraying cleaner",
      "Use a separate wash mitt and towels from paintwork",
      "Never let wheel cleaner dry on the surface",
    ],
    steps: [
      { title: "Cool and rinse", detail: "Rinse the wheel face, barrel, and tire first to knock off grit before scrubbing." },
      { title: "Clean tires separately", detail: "Scrub the sidewall until old dressing and brown residue lift away." },
      { title: "Agitate wheel faces", detail: "Use a soft wheel brush around spokes, lug areas, and barrels without letting cleaner dry." },
      { title: "Dry before dressing", detail: "Dry thoroughly and apply tire dressing only to a clean, dry sidewall." },
    ],
  },
  {
    id: "paint_body",
    title: "Paint & Body Panels",
    description: "Road film, bug splatter, fingerprints, and light contamination.",
    cameraStepId: "front_exterior",
    material: "Clear-coated automotive paint",
    riskLevel: "high",
    tools: ["Two wash mitts", "Drying towel", "Detailing brush", "Clay mitt or clay bar for bonded contaminants"],
    safeProducts: [
      "pH-neutral car shampoo",
      "Quick-detail spray with lubricants",
      "Dedicated bug & tar remover",
      "Spray sealant or carnauba wax",
    ],
    unsafeProducts: [
      "Dish soap (strips wax / sealant)",
      "Household all-purpose cleaners",
      "Abrasive sponges or paper towels",
      "Vinegar or citrus-acid cleaners on bare clear coat",
    ],
    safety: [
      "Never scrub dry paint",
      "Work out of direct sun when possible to avoid spotting and streaking",
      "Use the two-bucket method (wash + rinse) to avoid swirl marks",
    ],
    steps: [
      { title: "Pre-rinse the panel", detail: "Lift loose grit before touching the paint to reduce swirl marks." },
      { title: "Wash with plenty of lubrication", detail: "Use a quality shampoo and straight-line motions rather than circular scrubbing." },
      { title: "Spot-treat contamination", detail: "Use bug remover or clay only where needed, then re-wipe with lubrication." },
      { title: "Protect the finish", detail: "Dry completely and apply a spray sealant or wax to add gloss and easier future cleaning." },
    ],
  },
  {
    id: "glass_trim",
    title: "Glass & Trim",
    description: "Windows, glossy trim, mirror housings, and weather stripping.",
    cameraStepId: "side_panels",
    material: "Glass, rubber seals, painted / piano-black trim",
    riskLevel: "low",
    tools: ["Two glass towels", "Soft trim brush", "Detail swabs"],
    safeProducts: [
      "Streak-free automotive glass cleaner",
      "Rubber / weatherstrip conditioner",
      "Plastic-safe trim restorer",
    ],
    unsafeProducts: [
      "Ammonia-based cleaners on tinted windows",
      "Razor blades on coated glass",
      "Dressings containing petroleum distillates on rubber seals",
    ],
    safety: [
      "Do not overspray cleaner onto electronics or suede headliners",
      "Use a separate towel for final buffing to avoid smears",
    ],
    steps: [
      { title: "Spray towel, not glass", detail: "Apply cleaner to the towel first to reduce overspray on trim and dashboard materials." },
      { title: "Wipe in passes", detail: "Clean in overlapping passes, then buff dry with a second towel for a clear finish." },
      { title: "Detail edges and seals", detail: "Use swabs or a soft brush around trim gaps and mirror edges where residue collects." },
      { title: "Condition trim", detail: "Apply a light trim conditioner to rubber seals if they look dry or chalky." },
    ],
  },
  {
    id: "engine_bay",
    title: "Engine Bay",
    description: "Dust, oil residue, and plastic trim around the bay.",
    cameraStepId: "engine_bay",
    material: "Plastics, painted metal, rubber hoses, exposed electronics",
    riskLevel: "high",
    tools: ["Soft detailing brushes", "Microfiber towels", "Low-pressure rinse or damp towel"],
    safeProducts: [
      "Water-based engine-safe degreaser",
      "Plastic / vinyl dressing rated for engine plastics",
    ],
    unsafeProducts: [
      "High-pressure water near connectors, alternator, or fuse box",
      "Solvent-based degreasers on rubber hoses",
      "Tire shine on engine plastics (greasy + flammable)",
    ],
    safety: [
      "Ensure the engine is fully cool before cleaning",
      "Cover or avoid the alternator, intake, fuse box, and exposed connectors",
      "Do not use high pressure in the engine bay",
    ],
    steps: [
      { title: "Work only on a cool engine", detail: "Heat can flash chemicals and create staining or cracking on plastics." },
      { title: "Dry-clean first", detail: "Use brushes and towels to remove loose dust before introducing any cleaner." },
      { title: "Degrease targeted areas", detail: "Apply cleaner sparingly to oily sections, agitate gently, and wipe away residue." },
      { title: "Dry and inspect", detail: "Dry all surfaces fully before starting the vehicle, then check for loose caps, hoses, or leaks." },
    ],
  },
];

export function getCleaningGuide(areaId: CleaningAreaId) {
  return CLEANING_GUIDES.find((guide) => guide.id === areaId) ?? CLEANING_GUIDES[0];
}

/** Map a free-form area string (from a deep link) to a known cleaning area id. */
export function matchCleaningArea(text?: string | null): CleaningAreaId | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/wheel|tire|tread|sidewall|rim/.test(t)) return "wheels_tires";
  if (/paint|dent|scratch|bumper|panel|body|hood|door/.test(t)) return "paint_body";
  if (/glass|window|mirror|trim|seal/.test(t)) return "glass_trim";
  if (/engine|bay|hood|under hood|belt|coolant/.test(t)) return "engine_bay";
  if (/seat|dash|cabin|interior|carpet|upholstery|leather/.test(t)) return "interior";
  return null;
}

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
  tools: string[];
  products: string[];
  safety: string[];
  steps: { title: string; detail: string }[];
}

export const CLEANING_GUIDES: CleaningGuide[] = [
  {
    id: "interior",
    title: "Interior Cabin",
    description: "Seats, dashboard, touch points, trim, and carpets.",
    cameraStepId: "interior",
    tools: ["Microfiber towels", "Soft interior brush", "Vacuum with crevice tool", "Detailing swabs"],
    products: ["Interior cleaner safe for plastics", "Fabric or leather cleaner", "UV-protectant dressing"],
    safety: ["Test cleaners on a hidden spot first", "Avoid soaking switches, screens, and seat electronics"],
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
    tools: ["Wheel brush", "Dedicated tire brush", "Microfiber drying towel", "Pressure rinse or hose"],
    products: ["pH-balanced wheel cleaner", "Tire cleaner", "Water-based tire dressing"],
    safety: ["Let hot brakes cool before spraying cleaner", "Use a separate wash mitt and towels from paintwork"],
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
    tools: ["Two wash mitts", "Drying towel", "Detailing brush", "Clay mitt or clay bar for bonded contaminants"],
    products: ["pH-neutral shampoo", "Quick detail spray", "Bug remover", "Spray sealant"],
    safety: ["Never scrub dry paint", "Work out of direct sun when possible to avoid spotting and streaking"],
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
    tools: ["Two glass towels", "Soft trim brush", "Detail swabs"],
    products: ["Streak-free glass cleaner", "Rubber/trim conditioner"],
    safety: ["Do not overspray cleaner onto electronics or suede headliners", "Use a separate towel for final buffing to avoid smears"],
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
    tools: ["Soft detailing brushes", "Microfiber towels", "Low-pressure rinse or damp towel"],
    products: ["Engine-safe degreaser", "Plastic dressing for engine plastics"],
    safety: ["Ensure the engine is cool before cleaning", "Avoid direct spray on exposed electrical connectors, alternator, and fuse boxes", "Do not use high pressure in the engine bay"],
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

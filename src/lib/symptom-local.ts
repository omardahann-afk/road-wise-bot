// ============================================================================
// Local symptom-checker fallback.
//
// Used when the AI-backed `symptom` task is unavailable (no network, quota
// exhausted, timeout, edge function down). Pure-TS keyword classifier — no
// network calls, no React. Returns a result shaped EXACTLY like the AI
// response so the existing UI can render it without code paths diverging.
//
// Coverage target: the most common consumer questions (start/no-start, brakes,
// overheating, rough running, electrical, leaks). Anything we don't match
// returns a generic safe-guidance result rather than nothing.
// ============================================================================
import type { Severity } from "@/lib/pricing";

export interface LocalSymptomResult {
  summary: string;
  severity: Severity;
  possible_issues: { title: string; likelihood: string; description: string; system: string }[];
  next_steps: { step: string; detail: string }[];
  questions_to_narrow: string[];
  tools_needed: string[];
  professional_recommended: boolean;
  safety: string[];
  /** True when we matched no specific rule and returned generic guidance. */
  generic: boolean;
}

interface Rule {
  id: string;
  match: RegExp;
  severity: Severity;
  professional_recommended: boolean;
  summary: string;
  possible_issues: LocalSymptomResult["possible_issues"];
  next_steps: LocalSymptomResult["next_steps"];
  questions_to_narrow: string[];
  tools_needed: string[];
  safety: string[];
}

const RULES: Rule[] = [
  {
    id: "no_start_crank",
    match: /(crank(s|ing)?\s+(but\s+)?(won'?t|wont|doesn'?t)\s+start|won'?t\s+start|no\s+start|engine\s+won'?t\s+turn\s+over)/i,
    severity: "high",
    professional_recommended: false,
    summary: "Engine turns over but won't start — most often fuel, spark, or a weak battery.",
    possible_issues: [
      { title: "Weak or dead battery", likelihood: "high", description: "Cranks slowly or clicks under load.", system: "electrical" },
      { title: "Bad spark (plugs, coils)", likelihood: "medium", description: "Fuel reaches the cylinder but doesn't ignite.", system: "ignition" },
      { title: "Fuel delivery (pump, filter, injectors)", likelihood: "medium", description: "Spark is fine but no fuel pressure.", system: "fuel" },
    ],
    next_steps: [
      { step: "Test the battery", detail: "Should read 12.4V+ at rest and stay above 9.6V while cranking." },
      { step: "Listen for the fuel pump", detail: "Key on, engine off — you should hear a 2-second hum from the tank." },
      { step: "Check for spark", detail: "Pull a coil/plug and check for blue spark while cranking." },
    ],
    questions_to_narrow: [
      "Does it crank fast or slow?",
      "Did it happen suddenly or worsen over days?",
      "Any fuel/burn smell while cranking?",
    ],
    tools_needed: ["Multimeter", "OBD2 scanner", "Spark tester"],
    safety: ["Never crank with the air intake removed and your hand near moving parts."],
  },
  {
    id: "brake_grinding",
    match: /(grind|squeal|squeak|metal\s+(on|to)\s+metal).{0,30}(brake|brak)|brake.{0,30}(grind|squeal|squeak|metal)/i,
    severity: "high",
    professional_recommended: true,
    summary: "Braking noise — likely worn pads or rotor damage. Stop driving if metal-on-metal.",
    possible_issues: [
      { title: "Worn brake pads", likelihood: "high", description: "Wear indicators have reached the rotor.", system: "brakes" },
      { title: "Scored / glazed rotors", likelihood: "medium", description: "Often paired with worn pads.", system: "brakes" },
      { title: "Stuck caliper or slide pins", likelihood: "low", description: "Pad wears unevenly; pulls to one side.", system: "brakes" },
    ],
    next_steps: [
      { step: "Inspect pad thickness", detail: "Less than 3mm of friction material means replace now." },
      { step: "Look at the rotor surface", detail: "Deep grooves or a sharp lip mean rotors need machining or replacement." },
      { step: "Don't postpone", detail: "Driving on metal-on-metal damages the rotors fast and reduces stopping power." },
    ],
    questions_to_narrow: [
      "Front or rear? Or both?",
      "Constant noise or only when braking?",
      "Pull to one side under braking?",
    ],
    tools_needed: ["Lug wrench", "Jack & stands", "Flashlight", "Brake measuring tool"],
    safety: ["Never work on brakes without proper jack stands.", "Test brakes at low speed after any service before driving normally."],
  },
  {
    id: "overheating",
    match: /(overheat|running\s+hot|temperature\s+(gauge|warning)|coolant\s+(low|leak|warning))/i,
    severity: "critical",
    professional_recommended: true,
    summary: "Cooling problem — pull over if the gauge is in the red. Continued driving can warp the head.",
    possible_issues: [
      { title: "Low coolant / leak", likelihood: "high", description: "Most common cause of overheating.", system: "cooling" },
      { title: "Stuck thermostat", likelihood: "medium", description: "Engine reaches high temp quickly with no warning.", system: "cooling" },
      { title: "Failed water pump or radiator fan", likelihood: "medium", description: "Often paired with overheating at idle.", system: "cooling" },
    ],
    next_steps: [
      { step: "Stop driving", detail: "Pull over safely and let it cool for 30+ minutes before opening anything." },
      { step: "Check coolant level (cold engine only)", detail: "Top off with the right coolant if low — do NOT use plain water long-term." },
      { step: "Look for visible leaks", detail: "Hoses, radiator, water pump area, and under the car after parking." },
    ],
    questions_to_narrow: [
      "Does it overheat at idle, on the highway, or both?",
      "Any white smoke from the exhaust or sweet smell?",
      "How fast does it climb to red?",
    ],
    tools_needed: ["Coolant", "Funnel", "Flashlight", "OBD2 scanner"],
    safety: ["NEVER open a hot radiator cap — pressurized coolant can cause severe burns."],
  },
  {
    id: "battery_dies",
    match: /(battery\s+(dies|drained|dead|won'?t\s+hold|keeps\s+dying)|jump\s+start)/i,
    severity: "medium",
    professional_recommended: false,
    summary: "Battery drain — could be the battery itself, the alternator, or a parasitic draw.",
    possible_issues: [
      { title: "Aged battery", likelihood: "high", description: "Most batteries last 4–6 years.", system: "electrical" },
      { title: "Failing alternator", likelihood: "medium", description: "Battery is healthy but isn't getting recharged while driving.", system: "charging" },
      { title: "Parasitic draw", likelihood: "low", description: "Something stays powered when the car is off.", system: "electrical" },
    ],
    next_steps: [
      { step: "Test battery voltage", detail: "12.4V+ at rest. Below 12.0V means it's discharged or failing." },
      { step: "Test charging voltage", detail: "Engine running should read 13.8–14.6V at the battery." },
      { step: "Check for parasitic draw", detail: "With everything off, current draw should be under ~50mA." },
    ],
    questions_to_narrow: [
      "How old is the battery?",
      "Does it die only after sitting overnight, or even after a long drive?",
      "Any aftermarket electronics installed?",
    ],
    tools_needed: ["Multimeter", "Battery load tester"],
    safety: ["Wear eye protection when working near a battery — they can vent acid mist."],
  },
  {
    id: "vibration_highway",
    match: /(vibrat|shake|wobble).{0,30}(60|65|70|highway|speed|mph|km\/?h)|(60|highway|speed).{0,30}(vibrat|shake|wobble)/i,
    severity: "medium",
    professional_recommended: false,
    summary: "Speed-related vibration — most often a tire balance, alignment, or suspension issue.",
    possible_issues: [
      { title: "Out-of-balance tire", likelihood: "high", description: "Vibration appears in a narrow speed range and stays steady.", system: "tires" },
      { title: "Bent rim or tire damage", likelihood: "medium", description: "Often after hitting a pothole.", system: "tires" },
      { title: "Worn suspension or wheel bearing", likelihood: "low", description: "Usually paired with noise or pulling.", system: "suspension" },
    ],
    next_steps: [
      { step: "Inspect the tires", detail: "Look for bulges, uneven wear, or visible balance weights missing." },
      { step: "Get a balance & rotation", detail: "Cheap, quick, and fixes the majority of speed vibrations." },
      { step: "Check wheel torque", detail: "Loose lug nuts can mimic balance issues — torque to spec." },
    ],
    questions_to_narrow: [
      "Felt in the steering wheel or in the seat?",
      "Worse under braking?",
      "Recently hit a pothole or curb?",
    ],
    tools_needed: ["Torque wrench", "Tire pressure gauge"],
    safety: ["Don't ignore vibration that worsens over weeks — failing bearings can fail catastrophically."],
  },
  {
    id: "white_smoke",
    match: /(white\s+smoke|steam\s+from\s+exhaust|sweet\s+smell.*exhaust)/i,
    severity: "high",
    professional_recommended: true,
    summary: "White smoke from the exhaust suggests coolant getting into the combustion chamber.",
    possible_issues: [
      { title: "Blown head gasket", likelihood: "high", description: "Coolant + combustion gases mix.", system: "engine" },
      { title: "Cracked head or block", likelihood: "low", description: "Less common but serious.", system: "engine" },
      { title: "Condensation on cold start", likelihood: "low", description: "If it disappears within a minute, this is normal.", system: "exhaust" },
    ],
    next_steps: [
      { step: "Check coolant level", detail: "Repeated coolant loss with white smoke is a strong head-gasket signal." },
      { step: "Look at the oil cap", detail: "Milky residue suggests coolant in the oil." },
      { step: "Plan a compression / leak-down test", detail: "Confirms or rules out a head-gasket failure." },
    ],
    questions_to_narrow: [
      "Does the smoke clear after warm-up or stay constant?",
      "Has the coolant level been dropping?",
      "Any overheating?",
    ],
    tools_needed: ["Compression tester", "Coolant pressure tester"],
    safety: ["Stop driving if combined with overheating — continued running causes catastrophic engine damage."],
  },
  {
    id: "check_engine_flashing",
    match: /(check\s+engine\s+(light\s+)?flash|flashing\s+(check\s+engine|cel)|cel\s+flash)/i,
    severity: "critical",
    professional_recommended: true,
    summary: "Flashing check-engine light = active misfire. Driving on it can destroy the catalytic converter.",
    possible_issues: [
      { title: "Active cylinder misfire", likelihood: "high", description: "Coil, plug, injector, or compression problem.", system: "ignition" },
      { title: "Severe vacuum leak", likelihood: "low", description: "Lean misfire across multiple cylinders.", system: "fuel" },
    ],
    next_steps: [
      { step: "Reduce load and head home or to a shop", detail: "Avoid hard acceleration and high RPM." },
      { step: "Pull the codes", detail: "P0300 series identifies which cylinder(s) are misfiring." },
      { step: "Inspect plugs / coils on the affected cylinder", detail: "Swapping a coil to a different cylinder confirms the failure." },
    ],
    questions_to_narrow: [
      "Was there any recent service (plugs, coils, fuel)?",
      "Does the engine shake at idle?",
      "Any unusual smell from the exhaust?",
    ],
    tools_needed: ["OBD2 scanner", "Spark plug socket"],
    safety: ["Continued driving can damage the catalytic converter — an expensive repair."],
  },
  {
    id: "leak_under_car",
    match: /(leak|drip|puddle|fluid\s+(under|on\s+the\s+ground))/i,
    severity: "medium",
    professional_recommended: false,
    summary: "Fluid loss — color helps identify the source.",
    possible_issues: [
      { title: "Engine oil leak", likelihood: "medium", description: "Brown/black, slick to the touch.", system: "engine" },
      { title: "Coolant leak", likelihood: "medium", description: "Bright green, orange, or pink — sweet smell.", system: "cooling" },
      { title: "Brake or power-steering fluid", likelihood: "low", description: "Light amber, slick — brake leaks are urgent.", system: "brakes" },
    ],
    next_steps: [
      { step: "Identify the color and location", detail: "Place cardboard under the car overnight to map the source." },
      { step: "Check fluid levels", detail: "Engine oil, coolant, brake, and power steering reservoirs." },
      { step: "Don't ignore a brake leak", detail: "If the brake pedal feels soft or sinks, do not drive." },
    ],
    questions_to_narrow: [
      "What color is the fluid?",
      "Where on the ground does it pool — front, middle, rear?",
      "How fast is it leaking?",
    ],
    tools_needed: ["Cardboard", "Flashlight", "Nitrile gloves"],
    safety: ["Brake-fluid leaks can mean total brake failure — get the car towed if the pedal feels soft."],
  },
];

const GENERIC: LocalSymptomResult = {
  summary:
    "Symptom doesn't match a known pattern. Below are safe general steps you can take while you investigate further.",
  severity: "medium",
  possible_issues: [
    {
      title: "Multiple possible causes",
      likelihood: "unknown",
      description: "Without more detail, it's safer to gather information before guessing.",
      system: "unknown",
    },
  ],
  next_steps: [
    { step: "Pull OBD2 codes", detail: "Even without a check-engine light, stored codes often hint at the cause." },
    { step: "Note when it happens", detail: "Cold/hot, idle/highway, after how many minutes, in rain, etc." },
    { step: "Check fluids and tire pressure", detail: "Cheap basics that rule out the most common surprises." },
  ],
  questions_to_narrow: [
    "When did it start?",
    "Does it happen every drive or only sometimes?",
    "Any recent service or repair?",
  ],
  tools_needed: ["OBD2 scanner", "Tire pressure gauge", "Flashlight"],
  professional_recommended: false,
  safety: [
    "If the car feels unsafe to drive (steering, brakes, smoke, fire), stop and call for help.",
  ],
  generic: true,
};

/**
 * Pure-JS symptom classifier. Always returns a usable result, even when no
 * rule matches (returns a generic safe-guidance result with `generic: true`).
 */
export function localSymptomDiagnose(symptoms: string, conditions?: string): LocalSymptomResult {
  const text = `${symptoms ?? ""} ${conditions ?? ""}`.trim();
  if (!text) return { ...GENERIC };
  for (const rule of RULES) {
    if (rule.match.test(text)) {
      return {
        summary: rule.summary,
        severity: rule.severity,
        possible_issues: rule.possible_issues,
        next_steps: rule.next_steps,
        questions_to_narrow: rule.questions_to_narrow,
        tools_needed: rule.tools_needed,
        professional_recommended: rule.professional_recommended,
        safety: rule.safety,
        generic: false,
      };
    }
  }
  return { ...GENERIC };
}

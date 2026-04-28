// ============================================================================
// Local diagnosis fallback engine.
//
// Pure-JS, zero-network, zero-AI. Always returns a useful, safe result.
// Used as the FIRST result the orchestrator returns — AI/Supabase only
// enrich on top. If everything else fails, the user still sees this.
//
// Coverage focus: the most common consumer issues. Any unmatched input
// returns a generic safe-guidance result rather than nothing.
// ============================================================================

export type DiagnosisSeverity = "low" | "medium" | "high" | "critical" | "unknown";
export type DriveSafety = "yes" | "limited" | "no" | "unknown";

export interface DiagnosisInput {
  symptom?: string;
  obdCode?: string;
  imageHints?: string[]; // tags from local damage detection
  vehicle?: {
    make?: string | null;
    model?: string | null;
    year?: number | null;
  } | null;
}

export interface DiagnosisResult {
  severity: DiagnosisSeverity;
  safeToDrive: DriveSafety;
  likelyIssues: string[];
  estimatedCostLow: number;
  estimatedCostHigh: number;
  confidence: number; // 0-100
  nextStep: string;
  source:
    | "local_fallback"
    | "supabase_enriched"
    | "ai_enhanced"
    | "generic_safety_fallback";
  aiUsed?: boolean;
  fallbackUsed?: boolean;
  message?: string;
  summary?: string;
  warnings?: string[];
}

interface Rule {
  id: string;
  match: RegExp;
  result: Omit<DiagnosisResult, "source" | "aiUsed" | "fallbackUsed">;
}

const RULES: Rule[] = [
  {
    id: "dead_battery",
    match: /(dead\s+battery|battery\s+dead|won'?t\s+turn\s+over|click(s|ing)?\s+when\s+(starting|key)|jump\s+start)/i,
    result: {
      severity: "medium",
      safeToDrive: "limited",
      likelyIssues: ["Dead or weak battery", "Loose terminals", "Parasitic drain"],
      estimatedCostLow: 150,
      estimatedCostHigh: 400,
      confidence: 80,
      nextStep: "Test battery voltage (12.4V+ at rest). Replace if weak or 4+ years old.",
      summary: "Battery isn't holding charge or starting the car reliably.",
      warnings: ["Wear eye protection near batteries — they can vent acid mist."],
    },
  },
  {
    id: "alternator",
    match: /(alternator|battery\s+light|charge\s+(warning|light)|dim\s+headlights\s+at\s+idle)/i,
    result: {
      severity: "high",
      safeToDrive: "limited",
      likelyIssues: ["Failing alternator", "Worn serpentine belt", "Bad voltage regulator"],
      estimatedCostLow: 350,
      estimatedCostHigh: 900,
      confidence: 75,
      nextStep: "Test charging voltage with engine running — should be 13.8–14.6V.",
      summary: "Charging system isn't keeping up — battery will eventually die.",
    },
  },
  {
    id: "starter",
    match: /(bad\s+starter|starter\s+(motor|fail)|grinding\s+when\s+starting|clicking\s+but\s+no\s+crank)/i,
    result: {
      severity: "high",
      safeToDrive: "no",
      likelyIssues: ["Failed starter motor", "Bad solenoid", "Worn starter contacts"],
      estimatedCostLow: 350,
      estimatedCostHigh: 800,
      confidence: 75,
      nextStep: "Confirm battery is good first; then have the starter draw-tested.",
      summary: "Starter motor likely failing.",
    },
  },
  {
    id: "brake_grinding",
    match: /(grinding|metal\s+(on|to)\s+metal).{0,30}(brake|brak)|brake.{0,30}(grind|metal)/i,
    result: {
      severity: "high",
      safeToDrive: "no",
      likelyIssues: ["Worn brake pads", "Rotor damage", "Stuck caliper"],
      estimatedCostLow: 250,
      estimatedCostHigh: 900,
      confidence: 88,
      nextStep: "Stop driving — metal-on-metal damages rotors fast and reduces stopping power.",
      summary: "Active brake damage — service immediately.",
      warnings: ["Do not continue driving if braking performance is reduced."],
    },
  },
  {
    id: "warped_rotors",
    match: /(warped\s+rotor|brake\s+pulsation|steering\s+wheel\s+shake.{0,20}brake|brake\s+pedal\s+pulsat)/i,
    result: {
      severity: "medium",
      safeToDrive: "limited",
      likelyIssues: ["Warped or scored rotors", "Uneven pad deposits"],
      estimatedCostLow: 200,
      estimatedCostHigh: 700,
      confidence: 78,
      nextStep: "Have rotors measured; resurface or replace if out of spec.",
      summary: "Rotors no longer flat — pulsation under braking.",
    },
  },
  {
    id: "worn_pads",
    match: /(squeak|squeal|chirp).{0,30}(brake|brak)|brake.{0,30}(squeak|squeal|chirp)|worn\s+pads/i,
    result: {
      severity: "medium",
      safeToDrive: "limited",
      likelyIssues: ["Worn brake pads (wear indicator engaged)"],
      estimatedCostLow: 180,
      estimatedCostHigh: 500,
      confidence: 82,
      nextStep: "Inspect pad thickness. Less than 3mm of friction material means replace now.",
      summary: "Brake pads at or near the wear indicator.",
    },
  },
  {
    id: "misfire",
    match: /(misfire|p030[0-9]|engine\s+(stumble|hesitat)|rough\s+idle|cylinder\s+\d\s+misfire)/i,
    result: {
      severity: "high",
      safeToDrive: "limited",
      likelyIssues: ["Bad spark plug", "Failing ignition coil", "Fuel injector", "Vacuum leak"],
      estimatedCostLow: 100,
      estimatedCostHigh: 900,
      confidence: 78,
      nextStep: "Avoid long drives — flashing CEL means stop driving. Pull codes and inspect plugs/coils.",
      summary: "Engine misfire detected.",
      warnings: ["Flashing check-engine light = stop driving. Continued running damages the catalytic converter."],
    },
  },
  {
    id: "overheating",
    match: /(overheat|running\s+hot|temperature\s+(gauge|warning)\s+(red|high)|coolant\s+(low|leak))/i,
    result: {
      severity: "critical",
      safeToDrive: "no",
      likelyIssues: ["Low coolant / leak", "Stuck thermostat", "Failed water pump", "Bad radiator fan"],
      estimatedCostLow: 150,
      estimatedCostHigh: 1500,
      confidence: 80,
      nextStep: "Pull over now. Continued driving warps the head and destroys the engine.",
      summary: "Cooling system failure — pull over immediately.",
      warnings: ["NEVER open a hot radiator cap — pressurized coolant causes severe burns."],
    },
  },
  {
    id: "low_tire_pressure",
    match: /(tire\s+pressure|tpms|low\s+tire|flat\s+tire)/i,
    result: {
      severity: "low",
      safeToDrive: "limited",
      likelyIssues: ["Slow leak", "Cold weather pressure drop", "Failing TPMS sensor"],
      estimatedCostLow: 0,
      estimatedCostHigh: 200,
      confidence: 90,
      nextStep: "Check pressure cold; inflate to door-jamb spec. If it drops again, look for a puncture.",
      summary: "Tire pressure low or sensor warning active.",
    },
  },
  {
    id: "vibration_highway",
    match: /(shake|vibrat|wobble).{0,30}(60|65|70|highway|speed|mph|km\/?h)|car\s+shaking/i,
    result: {
      severity: "medium",
      safeToDrive: "limited",
      likelyIssues: ["Out-of-balance tire", "Bent rim", "Worn suspension or wheel bearing"],
      estimatedCostLow: 50,
      estimatedCostHigh: 600,
      confidence: 75,
      nextStep: "Get tires balanced and rotated first — fixes most highway vibrations.",
      summary: "Speed-related vibration.",
    },
  },
  {
    id: "no_start",
    match: /(no\s+start|won'?t\s+start|engine\s+(won'?t|doesn'?t)\s+(start|crank))/i,
    result: {
      severity: "high",
      safeToDrive: "no",
      likelyIssues: ["Dead battery", "Bad starter", "Fuel delivery issue", "Bad ignition switch"],
      estimatedCostLow: 150,
      estimatedCostHigh: 1000,
      confidence: 70,
      nextStep: "Test battery voltage first; then check for spark and fuel pump priming.",
      summary: "Engine won't start.",
    },
  },
  {
    id: "cel_generic",
    match: /(check\s+engine\s+light|cel\b|engine\s+warning\s+light)/i,
    result: {
      severity: "medium",
      safeToDrive: "limited",
      likelyIssues: ["Stored fault code in engine computer"],
      estimatedCostLow: 50,
      estimatedCostHigh: 800,
      confidence: 60,
      nextStep: "Pull the codes with an OBD2 scanner — title alone tells you the system.",
      summary: "Check engine light is on.",
      warnings: ["If the light is FLASHING, stop driving — that's an active misfire."],
    },
  },
  {
    id: "oil_warning",
    match: /(oil\s+(light|warning|pressure)|low\s+oil|oil\s+pressure\s+(light|warning))/i,
    result: {
      severity: "critical",
      safeToDrive: "no",
      likelyIssues: ["Low oil level", "Oil pump failure", "Worn engine bearings"],
      estimatedCostLow: 30,
      estimatedCostHigh: 4000,
      confidence: 80,
      nextStep: "Stop the engine NOW. Check oil level. Do not restart if oil pressure light is on.",
      summary: "Oil pressure warning — risk of catastrophic engine damage.",
      warnings: ["Continuing to drive with no oil pressure can destroy the engine within minutes."],
    },
  },
  {
    id: "coolant_leak",
    match: /(coolant\s+leak|antifreeze|green\s+puddle|orange\s+puddle|sweet\s+smell)/i,
    result: {
      severity: "high",
      safeToDrive: "limited",
      likelyIssues: ["Leaking radiator hose", "Bad water pump", "Cracked radiator", "Heater core"],
      estimatedCostLow: 100,
      estimatedCostHigh: 1200,
      confidence: 75,
      nextStep: "Find the source. Drive only short distances and watch the temperature gauge.",
      summary: "Coolant is leaking somewhere.",
    },
  },
];

const GENERIC: Omit<DiagnosisResult, "source"> = {
  severity: "unknown",
  safeToDrive: "limited",
  likelyIssues: ["Multiple possible causes — more detail needed"],
  estimatedCostLow: 0,
  estimatedCostHigh: 0,
  confidence: 40,
  nextStep:
    "Gather more details (when it happens, any noises/smells), pull OBD2 codes, or get a professional inspection.",
  summary: "Symptom doesn't match a known pattern.",
  warnings: ["If the car feels unsafe (steering, brakes, smoke, fire), stop and call for help."],
};

/** Apply OBD2 lookup if the input has a code we recognize. */
function obd2Lookup(code: string | undefined): DiagnosisResult | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  // P03xx is misfire family — high severity, may not be safe to drive.
  if (/^P030\d$/.test(c)) {
    return {
      severity: "high",
      safeToDrive: "limited",
      likelyIssues: ["Cylinder misfire", "Spark plug", "Ignition coil", "Injector"],
      estimatedCostLow: 100,
      estimatedCostHigh: 900,
      confidence: 80,
      nextStep: `Code ${c}: pull related freeze-frame data and inspect plugs/coils. Stop driving if CEL is flashing.`,
      summary: `OBD2 ${c} — engine misfire.`,
      source: "local_fallback",
      warnings: ["Flashing check-engine light: stop driving immediately."],
    };
  }
  // Common catalyst code
  if (c === "P0420" || c === "P0430") {
    return {
      severity: "medium",
      safeToDrive: "yes",
      likelyIssues: ["Failing catalytic converter", "Bad O2 sensor", "Exhaust leak"],
      estimatedCostLow: 200,
      estimatedCostHigh: 2200,
      confidence: 75,
      nextStep: `Code ${c}: verify with O2 sensor data before replacing the cat — sensors fail more often than the cat.`,
      summary: `OBD2 ${c} — catalyst efficiency below threshold.`,
      source: "local_fallback",
    };
  }
  return null;
}

/**
 * Pure-JS diagnosis. Always returns a usable result.
 */
export function runLocalDiagnosis(input: DiagnosisInput): DiagnosisResult {
  // OBD2 takes priority if present
  const obd = obd2Lookup(input.obdCode);
  if (obd) return obd;

  const text = [
    input.symptom ?? "",
    input.obdCode ?? "",
    ...(input.imageHints ?? []),
  ]
    .join(" ")
    .trim();

  if (!text) {
    return { ...GENERIC, source: "generic_safety_fallback" };
  }

  for (const rule of RULES) {
    if (rule.match.test(text)) {
      return { ...rule.result, source: "local_fallback" };
    }
  }
  return { ...GENERIC, source: "generic_safety_fallback" };
}

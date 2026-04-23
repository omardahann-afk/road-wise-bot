// Local OBD2 dataset — deterministic ground truth for the most common P/B/C/U
// codes. Used to ground the AI explanation. AI never overrides the title or
// system; it only enriches DIY steps and tools.

import type { IssueType } from "./pricing";

export interface Obd2Entry {
  code: string;
  title: string;
  system: "powertrain" | "body" | "chassis" | "network" | "emissions" | "fuel" | "ignition";
  severity: "info" | "low" | "medium" | "high" | "critical";
  description: string;
  common_causes: string[];
  drivable: boolean;
  pricing_issue: IssueType;
}

// Curated subset — covers ~80% of real-world consumer lookups. AI fills gaps.
export const OBD2_DATASET: Record<string, Obd2Entry> = {
  P0010: { code: "P0010", title: "Camshaft Position Actuator Circuit (Bank 1)", system: "powertrain", severity: "medium", description: "Variable valve timing solenoid circuit fault on bank 1.", common_causes: ["Failed VVT solenoid", "Low oil level", "Wiring issue"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0011: { code: "P0011", title: "Camshaft Position — Timing Over-Advanced (Bank 1)", system: "powertrain", severity: "medium", description: "VVT cam timing is more advanced than commanded on bank 1.", common_causes: ["Stuck VVT solenoid", "Dirty oil", "Timing chain stretch"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0016: { code: "P0016", title: "Crankshaft / Camshaft Correlation (Bank 1 Sensor A)", system: "powertrain", severity: "high", description: "Cam and crank sensor signals don't align.", common_causes: ["Stretched timing chain", "Faulty sensor", "VVT issue"], drivable: false, pricing_issue: "misfire" },
  P0017: { code: "P0017", title: "Crankshaft / Camshaft Correlation (Bank 1 Sensor B)", system: "powertrain", severity: "high", description: "Cam and crank sensor B alignment fault.", common_causes: ["Timing chain wear", "Sensor failure"], drivable: false, pricing_issue: "misfire" },
  P0030: { code: "P0030", title: "HO2S Heater Control Circuit (Bank 1, Sensor 1)", system: "emissions", severity: "low", description: "Oxygen sensor heater circuit fault.", common_causes: ["Bad O2 sensor", "Blown fuse", "Wiring"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0101: { code: "P0101", title: "Mass Air Flow Sensor Range/Performance", system: "fuel", severity: "medium", description: "MAF sensor reading out of expected range.", common_causes: ["Dirty MAF sensor", "Air leak", "Bad sensor"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0128: { code: "P0128", title: "Coolant Temperature Below Thermostat Regulating Temp", system: "powertrain", severity: "low", description: "Engine isn't reaching operating temp in expected time.", common_causes: ["Stuck-open thermostat", "Bad coolant temp sensor"], drivable: true, pricing_issue: "cooling_system" },
  P0171: { code: "P0171", title: "System Too Lean (Bank 1)", system: "fuel", severity: "medium", description: "Air/fuel mixture has too much air or too little fuel.", common_causes: ["Vacuum leak", "Dirty MAF", "Weak fuel pump", "Failing O2 sensor"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0172: { code: "P0172", title: "System Too Rich (Bank 1)", system: "fuel", severity: "medium", description: "Air/fuel mixture has too much fuel.", common_causes: ["Leaky injector", "Bad O2 sensor", "Stuck fuel pressure regulator"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0174: { code: "P0174", title: "System Too Lean (Bank 2)", system: "fuel", severity: "medium", description: "Lean mixture on bank 2.", common_causes: ["Vacuum leak", "Dirty MAF", "Weak fuel pump"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0175: { code: "P0175", title: "System Too Rich (Bank 2)", system: "fuel", severity: "medium", description: "Rich mixture on bank 2.", common_causes: ["Leaky injector", "Bad O2 sensor"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0300: { code: "P0300", title: "Random / Multiple Cylinder Misfire", system: "ignition", severity: "high", description: "ECU detected misfires across multiple cylinders.", common_causes: ["Worn spark plugs", "Failing coils", "Vacuum leak", "Low fuel pressure"], drivable: false, pricing_issue: "misfire" },
  P0301: { code: "P0301", title: "Cylinder 1 Misfire Detected", system: "ignition", severity: "high", description: "Misfire on cylinder 1.", common_causes: ["Spark plug", "Ignition coil", "Injector", "Compression"], drivable: false, pricing_issue: "misfire" },
  P0302: { code: "P0302", title: "Cylinder 2 Misfire Detected", system: "ignition", severity: "high", description: "Misfire on cylinder 2.", common_causes: ["Spark plug", "Ignition coil", "Injector"], drivable: false, pricing_issue: "misfire" },
  P0303: { code: "P0303", title: "Cylinder 3 Misfire Detected", system: "ignition", severity: "high", description: "Misfire on cylinder 3.", common_causes: ["Spark plug", "Ignition coil", "Injector"], drivable: false, pricing_issue: "misfire" },
  P0304: { code: "P0304", title: "Cylinder 4 Misfire Detected", system: "ignition", severity: "high", description: "Misfire on cylinder 4.", common_causes: ["Spark plug", "Ignition coil", "Injector"], drivable: false, pricing_issue: "misfire" },
  P0305: { code: "P0305", title: "Cylinder 5 Misfire Detected", system: "ignition", severity: "high", description: "Misfire on cylinder 5.", common_causes: ["Spark plug", "Ignition coil", "Injector"], drivable: false, pricing_issue: "misfire" },
  P0306: { code: "P0306", title: "Cylinder 6 Misfire Detected", system: "ignition", severity: "high", description: "Misfire on cylinder 6.", common_causes: ["Spark plug", "Ignition coil", "Injector"], drivable: false, pricing_issue: "misfire" },
  P0335: { code: "P0335", title: "Crankshaft Position Sensor Circuit", system: "powertrain", severity: "high", description: "ECU is not seeing the CKP signal.", common_causes: ["Bad CKP sensor", "Wiring"], drivable: false, pricing_issue: "warning_light_diagnostic" },
  P0340: { code: "P0340", title: "Camshaft Position Sensor Circuit", system: "powertrain", severity: "high", description: "Camshaft position sensor signal fault.", common_causes: ["Bad CMP sensor", "Wiring"], drivable: false, pricing_issue: "warning_light_diagnostic" },
  P0401: { code: "P0401", title: "EGR Insufficient Flow", system: "emissions", severity: "low", description: "Exhaust gas recirculation flow is too low.", common_causes: ["Clogged EGR passages", "Bad EGR valve", "DPFE sensor"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0420: { code: "P0420", title: "Catalyst System Efficiency Below Threshold (Bank 1)", system: "emissions", severity: "medium", description: "Catalytic converter not working efficiently.", common_causes: ["Failing catalytic converter", "Bad O2 sensor", "Exhaust leak"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0430: { code: "P0430", title: "Catalyst System Efficiency Below Threshold (Bank 2)", system: "emissions", severity: "medium", description: "Catalyst inefficient on bank 2.", common_causes: ["Failing cat", "Bad O2 sensor"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0440: { code: "P0440", title: "EVAP Emission Control System Fault", system: "emissions", severity: "low", description: "Leak in evaporative emissions system.", common_causes: ["Loose gas cap", "Cracked EVAP hose", "Faulty purge valve"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0442: { code: "P0442", title: "EVAP System Small Leak", system: "emissions", severity: "low", description: "Small leak detected in EVAP system.", common_causes: ["Loose gas cap", "Small hose crack"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0455: { code: "P0455", title: "EVAP System Large Leak", system: "emissions", severity: "low", description: "Large EVAP leak.", common_causes: ["Missing gas cap", "Disconnected EVAP hose"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0500: { code: "P0500", title: "Vehicle Speed Sensor Malfunction", system: "powertrain", severity: "medium", description: "VSS signal fault.", common_causes: ["Bad VSS", "Wiring"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0506: { code: "P0506", title: "Idle Air Control RPM Lower Than Expected", system: "powertrain", severity: "low", description: "Idle is too low.", common_causes: ["Vacuum leak", "Dirty throttle body", "IAC valve"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0507: { code: "P0507", title: "Idle Air Control RPM Higher Than Expected", system: "powertrain", severity: "low", description: "Idle is too high.", common_causes: ["Vacuum leak", "Throttle body fouling", "PCV"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  P0700: { code: "P0700", title: "Transmission Control System Malfunction", system: "powertrain", severity: "high", description: "TCM has stored a fault — pull TCM-side codes.", common_causes: ["Internal trans fault", "Solenoid", "Sensor"], drivable: true, pricing_issue: "transmission" },
  P0740: { code: "P0740", title: "Torque Converter Clutch Circuit", system: "powertrain", severity: "high", description: "TCC circuit malfunction.", common_causes: ["Bad TCC solenoid", "Wiring"], drivable: true, pricing_issue: "transmission" },
  B0001: { code: "B0001", title: "Driver Frontal Stage 1 Deployment Control", system: "body", severity: "critical", description: "Airbag system fault — safety critical.", common_causes: ["Clock spring", "Connector under seat", "Airbag module"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  C0035: { code: "C0035", title: "Left Front Wheel Speed Sensor Circuit", system: "chassis", severity: "medium", description: "ABS wheel-speed sensor fault.", common_causes: ["Damaged sensor", "Hub bearing", "Wiring"], drivable: true, pricing_issue: "warning_light_diagnostic" },
  U0100: { code: "U0100", title: "Lost Communication with ECM/PCM", system: "network", severity: "high", description: "CAN bus communication lost.", common_causes: ["Wiring", "Bad ECM", "Connector"], drivable: false, pricing_issue: "warning_light_diagnostic" },
  U0101: { code: "U0101", title: "Lost Communication with TCM", system: "network", severity: "high", description: "CAN bus to TCM lost.", common_causes: ["Wiring", "TCM failure"], drivable: false, pricing_issue: "transmission" },
};

export function lookupObd2(code: string): Obd2Entry | null {
  return OBD2_DATASET[code.trim().toUpperCase()] ?? null;
}

// Heuristic fallback when code isn't in dataset — derive system + severity
// from the code prefix so AI gets structured grounding hints.
export function inferObd2Stub(code: string): Obd2Entry | null {
  const c = code.trim().toUpperCase();
  if (!/^[PBCU]\d{4}$/.test(c)) return null;
  const prefix = c[0];
  const system =
    prefix === "P" ? "powertrain"
    : prefix === "B" ? "body"
    : prefix === "C" ? "chassis"
    : "network";
  return {
    code: c,
    title: `${system[0].toUpperCase()}${system.slice(1)} fault — code ${c}`,
    system: system as Obd2Entry["system"],
    severity: prefix === "B" ? "high" : "medium",
    description: "Code not in offline dataset. AI explanation provided below.",
    common_causes: [],
    drivable: prefix !== "B",
    pricing_issue: "warning_light_diagnostic",
  };
}

// AutoSage AI — Beginner mode reference content.
// Six core topics every new driver should know. Kept entirely client-side
// so the screen always works, even if AI is unavailable. The "Explain like
// I'm new" helper enriches a topic on demand via the AI gateway.

export type BeginnerTopicId =
  | "dashboard_lights"
  | "engine_basics"
  | "tires"
  | "fluids"
  | "battery"
  | "brakes";

export interface BeginnerTopic {
  id: BeginnerTopicId;
  title: string;
  tagline: string;
  what: string;
  why: string;
  /** Things any owner can check without tools. */
  checks: { title: string; detail: string }[];
  /** Common warning signs that mean "stop and have it checked". */
  warnings: string[];
  /** A short cheat-sheet of jargon that comes up. */
  glossary: { term: string; meaning: string }[];
}

export const BEGINNER_TOPICS: BeginnerTopic[] = [
  {
    id: "dashboard_lights",
    title: "Dashboard warning lights",
    tagline: "What every symbol on the cluster actually means.",
    what: "Your instrument cluster shows symbols when a system needs attention. Color matters: green or blue is informational, yellow/amber means service soon, red means stop safely as soon as possible.",
    why: "Knowing the difference between a reminder and a real warning prevents both panic and expensive damage.",
    checks: [
      { title: "Self-test", detail: "Turn the key to ON (not start). All warning lights should briefly illuminate, then go out. Lights that stay on indicate active faults." },
      { title: "Color rule", detail: "Red = stop and inspect. Amber = drive carefully and book service. Green/blue = system is on (lights, cruise, etc.)." },
      { title: "Check engine", detail: "Steady = a stored fault, drive home gently. Flashing = severe misfire — pull over and avoid driving." },
    ],
    warnings: [
      "Red oil-can icon — stop the engine immediately, low oil pressure can destroy the engine.",
      "Red battery icon while driving — alternator may have failed; you may only have minutes of charge.",
      "Brake warning + ABS together — both braking systems are degraded, drive to a shop slowly.",
    ],
    glossary: [
      { term: "MIL", meaning: "Malfunction Indicator Lamp — the check engine light." },
      { term: "ABS", meaning: "Anti-lock braking system — keeps wheels from locking under hard braking." },
      { term: "SRS", meaning: "Supplemental Restraint System — airbags and seatbelt pretensioners." },
    ],
  },
  {
    id: "engine_basics",
    title: "Engine basics",
    tagline: "How the engine breathes, fires, and stays cool.",
    what: "An engine mixes air and fuel inside cylinders, ignites the mix, and uses the resulting pressure to spin a crankshaft. Oil lubricates, coolant carries away heat, and an electronic system (ECU) controls fuel and timing.",
    why: "Most 'expensive' engine repairs come from neglecting fluids, ignoring small leaks, or driving with overheating warnings.",
    checks: [
      { title: "Listen at idle", detail: "After warm-up the engine should sound steady. Ticking or rough idle that wasn't there before is worth checking." },
      { title: "Smell test", detail: "Sweet smell = coolant leak. Burning oil = oil hitting hot exhaust. Strong gas smell = leak — do not ignore." },
      { title: "Look for fluid spots", detail: "Park on clean pavement overnight. New brown spots = oil. Bright green/orange = coolant. Reddish = transmission." },
    ],
    warnings: [
      "Steam from the hood — pull over, let it cool fully before opening.",
      "Coolant temperature in the red — stop. Driving overheated can warp the head and total the engine.",
      "Knocking sound that gets faster with revs — internal damage possible, stop driving and have it checked.",
    ],
    glossary: [
      { term: "ECU", meaning: "Engine Control Unit — the computer that runs fueling and timing." },
      { term: "OBD2", meaning: "On-Board Diagnostics — the standard port that reads fault codes." },
      { term: "Misfire", meaning: "A cylinder failing to ignite cleanly — causes vibration and a flashing check engine light." },
    ],
  },
  {
    id: "tires",
    title: "Tires",
    tagline: "The only thing connecting your car to the road.",
    what: "Tires carry the weight of the car, transmit braking and steering forces, and wear out with use. Pressure, tread depth, and age all matter.",
    why: "Worn or under-inflated tires cause longer stops, blowouts, and poor fuel economy. Most tire failures are preventable with a 60-second monthly check.",
    checks: [
      { title: "Pressure (cold)", detail: "Use the door-jamb sticker, not the sidewall. Check once a month with the tires cold (before driving)." },
      { title: "Tread with a coin", detail: "Insert a quarter upside-down into the tread. If you can see the top of the head, the tread is too low — replace soon." },
      { title: "Even wear", detail: "Wear only on the inside or outside edge = alignment problem. Wear in the center only = over-inflated. Both edges = under-inflated." },
    ],
    warnings: [
      "Bulges or cracks on the sidewall — replace immediately, the tire can fail without warning.",
      "Vibration only at highway speed — likely a bent rim or out-of-balance wheel.",
      "Tires older than 6 years — rubber hardens regardless of tread, replace even if they look fine.",
    ],
    glossary: [
      { term: "PSI", meaning: "Pounds per square inch — the pressure unit on the door-jamb sticker." },
      { term: "Tread depth", meaning: "How much rubber is left to grip the road." },
      { term: "DOT date", meaning: "4-digit code on the sidewall — last two digits = year of manufacture." },
    ],
  },
  {
    id: "fluids",
    title: "Fluids",
    tagline: "Oil, coolant, brake, transmission, washer.",
    what: "Cars use several fluids that each do a specific job: lubricate, transfer heat, transfer force, or clean glass. Most are easy to check yourself.",
    why: "Driving low on oil or coolant can destroy the engine. Brake fluid that's too low or too old can lead to pedal failure.",
    checks: [
      { title: "Engine oil", detail: "Park level, engine off, wait 5 min. Pull the dipstick, wipe, re-insert, pull again. Oil should be between MIN and MAX, amber to medium-brown." },
      { title: "Coolant", detail: "Look at the overflow tank only when the engine is COOL. Level should sit between MIN and MAX. Never open a hot radiator." },
      { title: "Brake fluid", detail: "Check the reservoir under the hood. Level should be between MIN and MAX. Dark brown or black fluid means it's overdue for service." },
      { title: "Washer fluid", detail: "The blue/pink reservoir. Top up when low — a clear windshield is a safety item." },
    ],
    warnings: [
      "Oil that is milky or foamy — coolant is mixing with oil (head gasket failure). Stop driving.",
      "Coolant that you keep topping up — there's a leak somewhere; have the system pressure-tested.",
      "Soft or sinking brake pedal — air or a leak in the brake system. Do not drive.",
    ],
    glossary: [
      { term: "Viscosity", meaning: "How thick the oil is (e.g. 5W-30). The owner's manual lists the correct grade." },
      { term: "DOT 3/4/5.1", meaning: "Brake fluid types. Use only what the manual specifies." },
      { term: "Coolant mix", meaning: "Usually 50/50 antifreeze and distilled water — pre-mixed jugs save guessing." },
    ],
  },
  {
    id: "battery",
    title: "Battery & charging",
    tagline: "What keeps your electronics alive.",
    what: "The battery starts the engine and runs electronics when the engine is off. Once running, the alternator recharges it and powers everything else.",
    why: "Most 'won't start' problems are battery-related and can be diagnosed in 30 seconds. Replacing a dying battery is much cheaper than a tow.",
    checks: [
      { title: "Cranking sound", detail: "Slow, lazy cranking = weak battery. Single click and nothing = dead battery or loose terminal. Healthy crank is brisk and even." },
      { title: "Headlights at idle", detail: "Lights that dim noticeably when idling and brighten when revving = alternator may be weak." },
      { title: "Terminal corrosion", detail: "White or blue-green powder on the terminals creates resistance. Disconnect, clean with a wire brush and baking soda water, reconnect." },
    ],
    warnings: [
      "Battery icon that stays on while driving — alternator is not charging. You may only have minutes before electronics shut down.",
      "Battery that is more than 5 years old — capacity drops sharply with age, especially in cold climates.",
      "Frequent jump-starts needed — the battery is on its way out, replace it before it strands you.",
    ],
    glossary: [
      { term: "CCA", meaning: "Cold Cranking Amps — how much current the battery delivers in cold weather." },
      { term: "Alternator", meaning: "Belt-driven generator that recharges the battery while the engine runs." },
      { term: "Parasitic drain", meaning: "Something that keeps drawing current with the key off and slowly drains the battery." },
    ],
  },
  {
    id: "brakes",
    title: "Brakes",
    tagline: "How your car actually stops.",
    what: "When you press the pedal, hydraulic pressure squeezes brake pads against rotors. Pads wear down and rotors get thinner over time — both are normal wear items.",
    why: "Worn brakes are the most common cause of long stops and crash damage. Catching wear early keeps replacement cheap (just pads, not rotors too).",
    checks: [
      { title: "Pedal feel", detail: "Should be firm and consistent. Soft, spongy, or sinking pedal = service immediately." },
      { title: "Sound on light braking", detail: "A high-pitched squeal at low brake pressure usually means the wear indicator is hitting the rotor — pads are due." },
      { title: "Visual through the wheel", detail: "Look at the pad thickness — less than ~3 mm of friction material means replace soon." },
    ],
    warnings: [
      "Grinding noise — metal-on-metal, the pads are gone and the rotor is being damaged. Stop driving.",
      "Pulling to one side under braking — a stuck caliper or a stuck pad. Could overheat and fail.",
      "Vibration through the steering wheel under braking — warped rotors. Worth replacing for safety and comfort.",
    ],
    glossary: [
      { term: "Pads", meaning: "The friction blocks that get squeezed against the rotor — wear items." },
      { term: "Rotors", meaning: "The metal discs the pads grab. Get thinner with use, replaced in pairs." },
      { term: "Caliper", meaning: "The hydraulic clamp that holds the pads. Can stick if neglected." },
    ],
  },
];

export function getBeginnerTopic(id: BeginnerTopicId) {
  return BEGINNER_TOPICS.find((t) => t.id === id) ?? BEGINNER_TOPICS[0];
}

// AutoSage AI — per-vehicle health derivation + maintenance reminders.
// Pure-TS, runs client-side off recently-loaded diagnostic/inspection data.
// Health rules (per spec):
//   - Critical: any critical-severity diagnostic or inspection finding in last 90d
//   - Needs attention: any high-severity OR 2+ medium-severity entries in last 90d
//   - Good: otherwise
// Reminders are derived from vehicle mileage + a fixed cadence map. Entirely
// in-app: no email, no push.

export type HealthStatus = "good" | "attention" | "critical";

export interface HealthInputItem {
  severity: string | null | undefined;
  created_at: string;
}

export interface HealthSummary {
  status: HealthStatus;
  label: string;
  reason: string;
  recent_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function computeVehicleHealth(items: HealthInputItem[]): HealthSummary {
  const cutoff = Date.now() - NINETY_DAYS_MS;
  const recent = items.filter((it) => {
    const t = +new Date(it.created_at);
    return Number.isFinite(t) && t >= cutoff;
  });

  const critical_count = recent.filter((r) => r.severity === "critical").length;
  const high_count = recent.filter((r) => r.severity === "high").length;
  const medium_count = recent.filter((r) => r.severity === "medium").length;

  if (critical_count > 0) {
    return {
      status: "critical",
      label: "Critical",
      reason: `${critical_count} critical issue${critical_count === 1 ? "" : "s"} in the last 90 days.`,
      recent_count: recent.length,
      critical_count,
      high_count,
      medium_count,
    };
  }
  if (high_count > 0 || medium_count >= 2) {
    return {
      status: "attention",
      label: "Needs attention",
      reason:
        high_count > 0
          ? `${high_count} high-severity issue${high_count === 1 ? "" : "s"} in the last 90 days.`
          : `${medium_count} medium-severity findings in the last 90 days.`,
      recent_count: recent.length,
      critical_count,
      high_count,
      medium_count,
    };
  }
  return {
    status: "good",
    label: "Good",
    reason:
      recent.length === 0
        ? "No recent issues — keep up scheduled maintenance."
        : `${recent.length} minor item${recent.length === 1 ? "" : "s"} on file. Nothing urgent.`,
    recent_count: recent.length,
    critical_count,
    high_count,
    medium_count,
  };
}

export function healthToneClass(status: HealthStatus): string {
  if (status === "critical") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (status === "attention") return "border-warning/40 bg-warning/10 text-warning";
  return "border-success/40 bg-success/10 text-success";
}

/* ------------------------------------------------------------------
 * Maintenance reminders (in-app only).
 *
 * Cadence is mileage-based. For each task we know:
 *   - interval_km: how often the task should happen
 *   - lead_km:     how far ahead of "due" we should start nudging
 * Status:
 *   - overdue:  current_km >= last_done + interval
 *   - due_soon: current_km >= last_done + interval - lead
 *   - ok:       otherwise
 *
 * For now we treat last_done as 0 (we have no service history table yet),
 * so the FIRST cycle of each task surfaces based on mileage alone. Once a
 * service log exists, we can subtract that without any UI changes.
 * ------------------------------------------------------------------ */

export type ReminderStatus = "overdue" | "due_soon" | "ok";

export interface ReminderTaskDef {
  id: string;
  title: string;
  description: string;
  interval_km: number;
  lead_km: number;
}

export const REMINDER_TASKS: ReminderTaskDef[] = [
  {
    id: "oil_change",
    title: "Oil change",
    description: "Conventional oil ~8,000 km, synthetic ~12,000 km. Check your owner's manual.",
    interval_km: 8000,
    lead_km: 1000,
  },
  {
    id: "tire_rotation",
    title: "Tire rotation",
    description: "Even tread wear extends tire life and improves grip in winter.",
    interval_km: 10000,
    lead_km: 1500,
  },
  {
    id: "brake_inspection",
    title: "Brake inspection",
    description: "Pads, rotors, and fluid level. Catch wear before rotors get scored.",
    interval_km: 20000,
    lead_km: 2500,
  },
  {
    id: "cabin_air_filter",
    title: "Cabin air filter",
    description: "Cleaner cabin air; less load on the HVAC blower motor.",
    interval_km: 25000,
    lead_km: 3000,
  },
  {
    id: "engine_air_filter",
    title: "Engine air filter",
    description: "Restores airflow, fuel economy, and throttle response.",
    interval_km: 30000,
    lead_km: 3000,
  },
  {
    id: "transmission_service",
    title: "Transmission service",
    description: "Fluid + filter on most automatics. Skipping this kills transmissions early.",
    interval_km: 60000,
    lead_km: 5000,
  },
  {
    id: "coolant_flush",
    title: "Coolant flush",
    description: "Old coolant becomes acidic and corrodes the radiator and water pump.",
    interval_km: 80000,
    lead_km: 5000,
  },
];

export interface Reminder {
  task: ReminderTaskDef;
  status: ReminderStatus;
  due_at_km: number;
  km_remaining: number; // negative when overdue
}

export function computeReminders(currentKm: number | null | undefined): Reminder[] {
  if (!currentKm || currentKm <= 0) return [];
  return REMINDER_TASKS.map<Reminder>((task) => {
    // First-cycle due odometer: round up to next interval boundary.
    // If currentKm lands exactly on a boundary, push to the NEXT interval
    // so we never show "Overdue by 0 km".
    const raw_due = Math.ceil(currentKm / task.interval_km) * task.interval_km;
    const due_at_km = raw_due === currentKm ? raw_due + task.interval_km : raw_due;
    const km_remaining = due_at_km - currentKm;
    let status: ReminderStatus = "ok";
    if (km_remaining <= 0) status = "overdue";
    else if (km_remaining <= task.lead_km) status = "due_soon";
    return { task, status, due_at_km, km_remaining };
  })
    .filter((r) => r.status !== "ok")
    .sort((a, b) => a.km_remaining - b.km_remaining);
}

export function reminderToneClass(status: ReminderStatus): string {
  if (status === "overdue") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (status === "due_soon") return "border-warning/40 bg-warning/10 text-warning";
  return "border-border bg-muted text-muted-foreground";
}

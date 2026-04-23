import { Card, CardContent } from "@/components/ui/card";
import { ScanLine, ShieldAlert, ShieldCheck, Cpu, AlertTriangle } from "lucide-react";
import type { Obd2Entry } from "@/lib/obd2-dataset";
import { severityClass } from "@/lib/severity";

/**
 * Deterministic OBD2 result header. Shows code, title, system, severity,
 * and drivability flag from the local dataset BEFORE any AI enrichment.
 * This is the source of truth — AI never overrides these values.
 */
export function Obd2ResultCard({ entry, fromAi }: { entry: Obd2Entry; fromAi?: boolean }) {
  return (
    <Card className="overflow-hidden border-2 border-primary/30 bg-gradient-elevated shadow-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
              <ScanLine className="h-6 w-6" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                {fromAi ? "Inferred" : "Verified"} OBD2 Code
              </div>
              <h2 className="mt-0.5 font-mono text-2xl font-black tracking-tight">{entry.code}</h2>
              <p className="text-sm font-semibold leading-tight">{entry.title}</p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${severityClass(
              entry.severity,
            )}`}
          >
            {entry.severity}
          </span>
        </div>

        <p className="text-sm text-muted-foreground">{entry.description}</p>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-2">
          <Chip icon={Cpu} label={`System: ${entry.system}`} />
          {entry.drivable ? (
            <Chip icon={ShieldCheck} label="Drivable with caution" tone="success" />
          ) : (
            <Chip icon={ShieldAlert} label="Do not drive" tone="destructive" />
          )}
          {fromAi && (
            <Chip icon={AlertTriangle} label="Not in offline dataset — AI inferred" tone="warning" />
          )}
        </div>

        {entry.common_causes.length > 0 && (
          <div>
            <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Common causes
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {entry.common_causes.map((c, i) => (
                <span
                  key={i}
                  className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[11px]"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Chip({
  icon: Icon, label, tone = "neutral",
}: { icon: React.ComponentType<{ className?: string }>; label: string; tone?: "neutral" | "success" | "warning" | "destructive" }) {
  const cls =
    tone === "success" ? "border-success/40 bg-success/10 text-success"
    : tone === "warning" ? "border-warning/40 bg-warning/10 text-warning"
    : tone === "destructive" ? "border-destructive/40 bg-destructive/10 text-destructive"
    : "border-border/60 bg-background/40 text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

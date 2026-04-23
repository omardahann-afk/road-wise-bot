import type { PricingResult } from "@/lib/pricing";
import { formatCAD } from "@/lib/pricing";
import { Card, CardContent } from "@/components/ui/card";
import { Wrench, Clock, HardHat, ShieldCheck, AlertTriangle, Hammer } from "lucide-react";

/**
 * Shared mechanic-cost card. Renders Canadian shop pricing with a
 * low / avg / high band, labor vs parts split, time + difficulty,
 * and a transparency disclaimer. Used by Inspection, Repair, OBD2,
 * Symptom and Camera diagnose modes for visual consistency.
 */
export function RepairPricingCard({
  pricing,
  title = "Repair pricing",
  compact = false,
}: {
  pricing: PricingResult;
  title?: string;
  compact?: boolean;
}) {
  const [hLo, hHi] = pricing.time_estimate_hours;
  const [lLo, lHi] = pricing.labor_cost_range;
  const [pLo, pHi] = pricing.parts_cost_range;
  const [rLo, rHi] = pricing.labor_rate_range;
  const diffTone =
    pricing.difficulty === "beginner" ? "border-success/40 bg-success/10 text-success"
    : pricing.difficulty === "intermediate" ? "border-primary/40 bg-primary/10 text-primary"
    : "border-destructive/40 bg-destructive/10 text-destructive";

  return (
    <Card className="bg-gradient-card shadow-card">
      <CardContent className={compact ? "space-y-3 p-4" : "space-y-4 p-5"}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Wrench className="h-3.5 w-3.5" /> {title}
          </h3>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${diffTone}`}>
            {pricing.difficulty}
          </span>
        </div>

        {/* Low / Avg / High */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <PriceTile label="Low"  value={pricing.low_estimate} />
          <PriceTile label="Avg"  value={pricing.average_estimate} highlight />
          <PriceTile label="High" value={pricing.high_estimate} />
        </div>

        {/* Labor vs Parts */}
        <div className="grid grid-cols-2 gap-2">
          <Split icon={HardHat} label="Labor" lo={lLo} hi={lHi} subtitle={`CA$${rLo}–${rHi}/hr · ${hLo === hHi ? `${hLo}h` : `${hLo}–${hHi}h`}`} />
          <Split icon={Hammer}  label="Parts" lo={pLo} hi={pHi} subtitle={pHi === 0 ? "No parts required" : "Estimated"} />
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2 py-1 text-muted-foreground">
            <Clock className="h-3 w-3" /> {hLo === hHi ? `${hLo}h` : `${hLo}–${hHi}h`} shop time
          </span>
          {pricing.diy_possible ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-1 text-success">
              <ShieldCheck className="h-3 w-3" /> DIY possible
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-warning">
              <AlertTriangle className="h-3 w-3" /> Mechanic recommended
            </span>
          )}
        </div>

        {pricing.notes.length > 0 && (
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {pricing.notes.map((n, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="border-t border-border/60 pt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Estimates based on typical Canadian shop pricing
        </p>
      </CardContent>
    </Card>
  );
}

function PriceTile({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border-2 p-3 ${highlight ? "border-primary/40 bg-primary/10" : "border-border/60 bg-background/40"}`}>
      <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-black leading-tight ${highlight ? "text-primary" : ""}`}>
        {formatCAD(value)}
      </div>
    </div>
  );
}

function Split({
  icon: Icon, label, lo, hi, subtitle,
}: { icon: React.ComponentType<{ className?: string }>; label: string; lo: number; hi: number; subtitle: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-sm font-bold">
        {formatCAD(lo)} – {formatCAD(hi)}
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</div>
    </div>
  );
}

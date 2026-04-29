// AutoSage AI — Instant Repair Intelligence Panel.
//
// Shown after EVERY diagnosis flow (camera, symptom, OBD2). Pure deterministic
// output from the pricing engine + diagnosis result — no loading, no AI
// dependency, never empty. This is the "always useful" guarantee surface.

import { Card, CardContent } from "@/components/ui/card";
import { formatCAD } from "@/lib/pricing";
import {
  Wrench,
  AlertTriangle,
  ShieldCheck,
  Gauge,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export type RepairUrgency = "low" | "medium" | "high" | "critical";

export interface InstantRepairPanelProps {
  /** Top-line cause / what's likely wrong (one short sentence). */
  likelyCause: string;
  /** Estimated cost low/high in CAD. */
  costLow: number;
  costHigh: number;
  /** Urgency level — drives color + label. */
  urgency: RepairUrgency;
  /** Single recommended next action. */
  nextAction: string;
  /** Optional supporting line (e.g. "Based on real repair data"). */
  hint?: string;
  /** Optional click handler for the next-action CTA. */
  onAction?: () => void;
  /** Action button label. Defaults to "Open repair guide". */
  actionLabel?: string;
}

const URGENCY_TONE: Record<RepairUrgency, { bg: string; text: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  low:      { bg: "border-success/40 bg-success/10",   text: "text-success",     label: "Low urgency",      icon: ShieldCheck },
  medium:   { bg: "border-primary/40 bg-primary/10",   text: "text-primary",     label: "Medium urgency",   icon: Gauge },
  high:     { bg: "border-warning/40 bg-warning/10",   text: "text-warning",     label: "High urgency",     icon: AlertTriangle },
  critical: { bg: "border-destructive/40 bg-destructive/10", text: "text-destructive", label: "Critical",   icon: AlertTriangle },
};

export function InstantRepairPanel({
  likelyCause,
  costLow,
  costHigh,
  urgency,
  nextAction,
  hint,
  onAction,
  actionLabel = "Take next step",
}: InstantRepairPanelProps) {
  const tone = URGENCY_TONE[urgency];
  const Icon = tone.icon;
  const sameCost = Math.round(costLow) === Math.round(costHigh);

  return (
    <Card className="bg-gradient-card shadow-card">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Wrench className="h-3.5 w-3.5" /> Instant repair intelligence
          </h3>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone.bg} ${tone.text}`}
          >
            <Icon className="h-3 w-3" /> {tone.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border-2 border-primary/40 bg-primary/10 p-3">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Estimated cost
            </div>
            <div className="text-base font-black leading-tight text-primary">
              {sameCost ? formatCAD(costLow) : `${formatCAD(costLow)} – ${formatCAD(costHigh)}`}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">CAD · typical shop</div>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/40 p-3">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Likely cause
            </div>
            <div className="mt-0.5 line-clamp-3 text-xs font-medium leading-tight">
              {likelyCause}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            <ArrowRight className="h-3 w-3" /> Recommended next action
          </div>
          <p className="mt-1 text-sm">{nextAction}</p>
          {onAction && (
            <button
              type="button"
              onClick={onAction}
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {actionLabel}
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>

        {hint && (
          <p className="flex items-center gap-1.5 border-t border-border/60 pt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" /> {hint}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

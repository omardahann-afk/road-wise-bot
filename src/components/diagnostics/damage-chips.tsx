import { AlertTriangle, Plus, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DamageCandidate } from "@/lib/damage-detection";

/**
 * Damage candidates surfaced by the browser-side image-processing layer
 * (NOT COCO/object detection). Shown beneath the captured photo so the user
 * can confirm and add to findings with one tap.
 *
 * Low confidence is communicated explicitly — never silently — to keep the
 * camera-diagnose experience honest.
 */
export function DamageChips({
  candidates,
  onAdd,
  added,
}: {
  candidates: DamageCandidate[];
  onAdd: (cand: DamageCandidate) => void;
  /** Set of damage_type values already added — locks the chip after add. */
  added?: Set<string>;
}) {
  if (candidates.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-warning/40 bg-warning/5 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-warning" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-warning">
          Possible damage detected ({candidates.length})
        </span>
      </div>
      <ul className="space-y-2">
        {candidates.map((c, i) => {
          const pct = Math.round(c.confidence * 100);
          const lowConf = c.confidence < 0.55;
          const tone =
            c.severity === "high" || c.severity === "critical"
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : "border-warning/50 bg-warning/10 text-warning";
          const isAdded = !!added && added.has(c.damage_type);
          return (
            <li
              key={`${c.damage_type}-${i}`}
              className={`rounded-xl border p-2.5 ${
                isAdded ? "border-success/40 bg-success/10 opacity-90" : "border-border bg-background/60"
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}
                >
                  {pct}%
                </span>
                <div className="flex-1 leading-tight">
                  <div className="text-xs font-semibold">{c.label}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {c.location} · {c.note}
                  </div>
                  {lowConf && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] font-medium text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      Possible damage detected — confirm manually.
                    </div>
                  )}
                </div>
                {isAdded ? (
                  <span className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-success/40 bg-success/15 px-2 text-[10px] font-bold uppercase tracking-wider text-success">
                    <Check className="h-3 w-3" /> Added
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 border-warning/40 text-warning hover:bg-warning/10"
                    onClick={() => onAdd(c)}
                  >
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Detected from the captured photo (not the live preview). Adding sends it to your repair workflow.
      </p>
    </div>
  );
}

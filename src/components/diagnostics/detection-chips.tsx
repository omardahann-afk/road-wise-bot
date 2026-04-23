import { Check, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type InterpretedDetection,
  surfaceIssueLabel,
  confidenceTone,
} from "@/lib/camera-intelligence";
import type { Finding } from "@/lib/valuation";

/**
 * Per-detection chips that float beneath the camera viewfinder.
 *
 * Each chip shows: automotive label + confidence + a one-tap
 * "add to findings" button when a candidate issue exists.
 *
 * `addedIssues` lets the parent pass the set of already-added issue labels so
 * we can lock the chip (prevent duplicates) and show a clear "Added" state.
 */
export function DetectionChips({
  detections,
  onAddFinding,
  addedIssues,
}: {
  detections: InterpretedDetection[];
  onAddFinding: (issue: string, severity: Finding["severity"]) => void;
  addedIssues?: Set<string>;
}) {
  if (detections.length === 0) return null;

  // Show top 4 most-confident, deduped by category+issue
  const seen = new Set<string>();
  const items = detections
    .slice()
    .sort((a, b) => b.score - a.score)
    .filter((d) => {
      const k = `${d.category}::${d.suggestedIssue ?? "info"}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 4);

  return (
    <div className="mb-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Live detections ({detections.length})
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map((d, i) => {
          const issueLabel = surfaceIssueLabel(d.suggestedIssue);
          const canAdd = !!d.suggestedIssue && issueLabel.length > 0;
          const alreadyAdded =
            canAdd && !!addedIssues && addedIssues.has(issueLabel.toLowerCase());
          return (
            <li
              key={`${d.class}-${i}`}
              className={`flex items-center gap-2 rounded-xl border p-2 text-xs transition-opacity ${
                alreadyAdded
                  ? "border-success/40 bg-success/10 opacity-80"
                  : "border-border/60 bg-background/50"
              }`}
            >
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${confidenceTone(
                  d.confidence,
                )}`}
              >
                {d.confidence} · {d.confidencePct}%
              </span>
              <div className="flex-1 leading-tight">
                <div className="font-medium">{d.label}</div>
                <div className="text-[10px] text-muted-foreground">{d.prompt}</div>
              </div>
              {alreadyAdded ? (
                <span className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-success/40 bg-success/15 px-2 text-[10px] font-bold uppercase tracking-wider text-success">
                  <Check className="h-3 w-3" /> Added
                </span>
              ) : canAdd ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 border-primary/40 text-primary hover:bg-primary/10"
                  onClick={() => onAddFinding(issueLabel, d.suggestedSeverity)}
                >
                  <Plus className="h-3 w-3" /> Add
                </Button>
              ) : (
                <span className="flex h-7 items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 text-[10px] font-semibold text-success">
                  <Check className="h-3 w-3" /> ok
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================================
// Workflow Feedback Dialog — shown after StepEngine completes. Captures:
//   - Did this fix the problem? (worked / didn't / partial)
//   - Was anything confusing or missing?
//   - Actual cost (optional, CAD)
//   - A real-world tip the user wants future users to see
//
// Persists to:
//   - learning_events (one row, source='workflow_feedback') with structured metadata
//   - sessions (status flips to 'complete' or 'failed' so History reflects outcome)
//
// Privacy: tied to auth.uid() via RLS — only the user sees their own feedback.
// ============================================================================
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sparkles, ThumbsUp, ThumbsDown, MinusCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { GeneratedWorkflow } from "@/lib/workflow-builder";

type Outcome = "worked" | "partial" | "failed";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: GeneratedWorkflow;
  userId: string;
  vehicleId?: string | null;
}

export function WorkflowFeedbackDialog({ open, onOpenChange, workflow, userId, vehicleId }: Props) {
  const [outcome, setOutcome] = useState<Outcome>("worked");
  const [confusingStep, setConfusingStep] = useState("");
  const [missingTools, setMissingTools] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [realWorldTip, setRealWorldTip] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const cost = actualCost ? Number(actualCost) : null;
      const costMatchedEstimate =
        cost !== null && !Number.isNaN(cost)
          ? cost >= workflow.estimated_cost.low_estimate * 0.8 &&
            cost <= workflow.estimated_cost.high_estimate * 1.2
          : null;

      // Write a single rich learning_event row per workflow completion.
      await supabase.from("learning_events").insert({
        user_id: userId,
        vehicle_id: vehicleId ?? null,
        source: "workflow_feedback",
        step_id: workflow.workflow_id,
        issue_detected: workflow.title,
        issue_confirmed_by_user: outcome !== "failed",
        metadata: {
          workflow_id: workflow.workflow_id,
          workflow_kind: workflow.workflow_kind,
          issue_type: workflow.issue_type,
          source: workflow.source,
          difficulty: workflow.difficulty,
          outcome,
          confusing_step: confusingStep || null,
          missing_tools: missingTools || null,
          actual_cost_cad: cost,
          estimated_cost_cad_avg: workflow.estimated_cost.average_estimate,
          cost_matched_estimate: costMatchedEstimate,
          real_world_tip: realWorldTip || null,
          step_count: workflow.steps.length,
        } as never,
      });

      // Mark the resumable session row as complete or failed.
      await supabase
        .from("sessions")
        .update({ status: outcome === "failed" ? "failed" : "complete" })
        .eq("user_id", userId)
        .eq("kind", "repair")
        .like("title", `repair:${workflow.issue_type}%`);

      toast.success(
        outcome === "worked"
          ? "Thanks — your feedback improves future workflows."
          : outcome === "partial"
            ? "Logged — we'll factor that into future workflows."
            : "Logged — sorry it didn't work. Consider escalating to a mechanic.",
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save feedback");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            How did it go?
          </DialogTitle>
          <DialogDescription>
            Your feedback helps AutoSage Brain build better workflows for you and others.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs font-semibold">Did this fix the problem?</Label>
            <RadioGroup
              value={outcome}
              onValueChange={(v) => setOutcome(v as Outcome)}
              className="mt-2 grid grid-cols-3 gap-2"
            >
              <label className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-2 text-center text-[11px] transition ${outcome === "worked" ? "border-success bg-success/10 text-success" : "border-border"}`}>
                <RadioGroupItem value="worked" className="sr-only" />
                <ThumbsUp className="h-4 w-4" />
                Worked
              </label>
              <label className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-2 text-center text-[11px] transition ${outcome === "partial" ? "border-warning bg-warning/10 text-warning" : "border-border"}`}>
                <RadioGroupItem value="partial" className="sr-only" />
                <MinusCircle className="h-4 w-4" />
                Partial
              </label>
              <label className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-2 text-center text-[11px] transition ${outcome === "failed" ? "border-destructive bg-destructive/10 text-destructive" : "border-border"}`}>
                <RadioGroupItem value="failed" className="sr-only" />
                <ThumbsDown className="h-4 w-4" />
                Didn't fix
              </label>
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="confusing" className="text-xs font-semibold">Was any step confusing?</Label>
            <Textarea
              id="confusing"
              value={confusingStep}
              onChange={(e) => setConfusingStep(e.target.value)}
              placeholder="Which step or instruction was unclear? (optional)"
              maxLength={500}
              rows={2}
              className="mt-1 text-sm"
            />
          </div>

          <div>
            <Label htmlFor="tools" className="text-xs font-semibold">Were tools missing from the list?</Label>
            <Input
              id="tools"
              value={missingTools}
              onChange={(e) => setMissingTools(e.target.value)}
              placeholder="e.g. 17mm crowfoot wrench (optional)"
              maxLength={200}
              className="mt-1 text-sm"
            />
          </div>

          <div>
            <Label htmlFor="cost" className="text-xs font-semibold">
              What did it actually cost? <span className="text-muted-foreground">CAD, optional</span>
            </Label>
            <Input
              id="cost"
              type="number"
              inputMode="numeric"
              value={actualCost}
              onChange={(e) => setActualCost(e.target.value)}
              placeholder={`Estimate was CA$${workflow.estimated_cost.low_estimate}–${workflow.estimated_cost.high_estimate}`}
              min={0}
              max={50000}
              className="mt-1 text-sm"
            />
          </div>

          <div>
            <Label htmlFor="tip" className="text-xs font-semibold">Any real-world tip to add for future users?</Label>
            <Textarea
              id="tip"
              value={realWorldTip}
              onChange={(e) => setRealWorldTip(e.target.value)}
              placeholder="e.g. Bolts were rusted, soak with penetrating oil 24h ahead. (optional)"
              maxLength={500}
              rows={2}
              className="mt-1 text-sm"
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Skip
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Saving…" : "Submit feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

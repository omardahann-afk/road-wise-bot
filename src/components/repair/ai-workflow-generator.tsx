// ============================================================================
// AI Workflow Generator — "Generate Workflow" button + preview + cache.
// Sits above StepEngine on the repair screen. When the user generates, the
// workflow is built (AI + safety + pricing), cached locally, optionally saved
// to repair_guides, and surfaced through the existing StepEngine via the
// onWorkflowReady callback. Never blocks: falls back deterministically.
// ============================================================================
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Wrench, Clock, ShieldAlert, Lightbulb, Save, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  buildWorkflow,
  loadCachedWorkflow,
  saveCachedWorkflow,
  workflowPricingSummary,
  type BuildWorkflowInput,
  type GeneratedWorkflow,
} from "@/lib/workflow-builder";

interface Props {
  input: BuildWorkflowInput;
  userId: string | null;
  onWorkflowReady: (w: GeneratedWorkflow) => void;
}

export function AiWorkflowGenerator({ input, userId, onWorkflowReady }: Props) {
  const [workflow, setWorkflow] = useState<GeneratedWorkflow | null>(() => loadCachedWorkflow(input));
  const [loading, setLoading] = useState(false);

  async function generate(forceFresh = false) {
    setLoading(true);
    try {
      // Reuse cache to protect free tier unless user explicitly re-generates.
      const cached = forceFresh ? null : loadCachedWorkflow(input);
      const w = cached ?? (await buildWorkflow(input));
      saveCachedWorkflow(input, w);
      setWorkflow(w);
      onWorkflowReady(w);

      // Persist the generated workflow to repair_guides for the user.
      if (userId) {
        await supabase.from("repair_guides").insert({
          user_id: userId,
          title: w.title,
          steps: w.steps as never,
          tools: w.tools_required as never,
          parts: w.parts_required as never,
          warnings: w.safety_warnings as never,
          estimated_cost: {
            low: w.estimated_cost.low_estimate,
            high: w.estimated_cost.high_estimate,
            currency: "CAD",
          } as never,
          difficulty: w.difficulty,
        });
      }

      toast.success(
        w.source === "ai" ? "AutoSage Brain workflow ready" :
        w.source === "fallback" ? "Showing reliable default workflow" :
        "Workflow ready",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate workflow");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Badge variant="outline" className="mb-1.5 border-primary/40 bg-primary/10 text-primary">
              <Sparkles className="mr-1 h-3 w-3" /> AutoSage Brain
            </Badge>
            <h3 className="text-sm font-bold">Generate a tailored workflow</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Combines your vehicle, the issue, camera/inspection findings, and real-world insights into a structured guide.
            </p>
          </div>
          {workflow?.source === "ai" && (
            <Badge className="shrink-0 bg-success/15 text-success">AI</Badge>
          )}
          {workflow?.source === "fallback" && (
            <Badge className="shrink-0 bg-muted text-muted-foreground">Default</Badge>
          )}
        </div>

        {!workflow && (
          <Button
            onClick={() => generate(false)}
            disabled={loading}
            size="sm"
            className="w-full shadow-glow"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Building your workflow…</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Generate workflow</>
            )}
          </Button>
        )}

        {workflow && (
          <div className="space-y-3">
            <WorkflowPreview workflow={workflow} />
            <div className="flex gap-2">
              <Button
                onClick={() => generate(true)}
                disabled={loading}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Re-generating…</>
                ) : (
                  <><RefreshCw className="h-4 w-4" /> Re-generate</>
                )}
              </Button>
              {userId && (
                <Button
                  onClick={() => toast.success("Saved — resume any time from History")}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Save className="h-4 w-4" /> Saved
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkflowPreview({ workflow }: { workflow: GeneratedWorkflow }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-background/40 p-3">
      <div>
        <h4 className="text-sm font-semibold leading-tight">{workflow.title}</h4>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{workflow.vehicle_context}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <Stat icon={<Clock className="h-3 w-3" />} label="Time" value={workflow.estimated_time} />
        <Stat icon={<Wrench className="h-3 w-3" />} label="Difficulty" value={workflow.difficulty} />
        <Stat
          icon={<span className="text-[10px]">$</span>}
          label="Cost (CAD)"
          value={workflowPricingSummary(workflow).split(" (")[0]}
        />
      </div>

      {workflow.mechanic_recommended && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Mechanic recommended for this work — review steps but consider professional service.</span>
        </div>
      )}

      {workflow.safety_warnings.length > 0 && (
        <div>
          <h5 className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-warning">
            <ShieldAlert className="h-3 w-3" /> Safety
          </h5>
          <ul className="space-y-1 text-[11px]">
            {workflow.safety_warnings.slice(0, 3).map((w, i) => (
              <li key={i} className="flex gap-1.5"><span>•</span><span>{w}</span></li>
            ))}
          </ul>
        </div>
      )}

      {workflow.real_world_tips.length > 0 && (
        <div>
          <h5 className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
            <Lightbulb className="h-3 w-3" /> Real-world tips
          </h5>
          <ul className="space-y-1 text-[11px]">
            {workflow.real_world_tips.slice(0, 3).map((t, i) => (
              <li key={i} className="flex gap-1.5"><span>•</span><span>{t}</span></li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        {workflow.steps.length} steps · {workflow.tools_required.length} tool{workflow.tools_required.length === 1 ? "" : "s"}
        {workflow.parts_required.length > 0 ? ` · ${workflow.parts_required.length} part${workflow.parts_required.length === 1 ? "" : "s"}` : ""}
      </p>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-2">
      <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      <div className="mt-0.5 text-[11px] font-semibold capitalize leading-tight">{value}</div>
    </div>
  );
}

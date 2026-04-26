import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wrench,
  Sparkles,
  Loader2,
  ChevronLeft,
  Hammer,
  Droplet,
  PaintBucket,
  CircleDot,
  Gauge,
  Sofa,
  AlertTriangle,
  BatteryCharging,
} from "lucide-react";
import { toast } from "sonner";
import { callAi } from "@/lib/ai";
import { severityClass } from "@/lib/severity";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import type { RepairWorkflow } from "@/lib/valuation";
import { estimateRepairCost, type IssueType, type Severity } from "@/lib/pricing";
import { RepairPricingCard } from "@/components/diagnostics/repair-pricing-card";
import { StepEngine } from "@/components/repair/step-engine";
import { normalizeAiSteps, FALLBACK_STEPS, GUIDE_META } from "@/lib/repair-engine";
import {
  RepairGuideHeader,
  SafetySection,
  ToolsSection,
  WatchOutSection,
  VideoGuideSection,
  WhenToStopSection,
  TorqueNoteSection,
} from "@/components/repair/repair-guide-sections";
import { AiWorkflowGenerator } from "@/components/repair/ai-workflow-generator";
import { WorkflowFeedbackDialog } from "@/components/repair/workflow-feedback";
import { workflowToEngineSteps, type GeneratedWorkflow, type BuildWorkflowInput } from "@/lib/workflow-builder";

// Maps repair workflow → pricing IssueType (deterministic).
const WORKFLOW_TO_ISSUE: Record<RepairWorkflow, IssueType> = {
  dent_repair: "dent",
  rust_repair: "rust",
  paint_repair: "scratch_paint",
  tire_service: "tire_service",
  fluid_leak: "fluid_leak",
  warning_light_diagnostic: "warning_light_diagnostic",
  interior_repair: "interior_repair",
  battery_service: "battery",
  general_repair: "general_repair",
};

const searchSchema = z.object({
  workflow: z
    .enum([
      "dent_repair",
      "rust_repair",
      "paint_repair",
      "tire_service",
      "fluid_leak",
      "warning_light_diagnostic",
      "interior_repair",
      "battery_service",
      "general_repair",
    ])
    .optional(),
  issue: z.string().optional(),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  location: z.string().optional(),
  category: z.enum(["exterior", "interior", "engine", "tires", "dashboard"]).optional(),
  inspection_id: z.string().optional(),
});

export const Route = createFileRoute("/repair")({
  validateSearch: (s) => searchSchema.parse(s),
  component: RepairMode,
});

interface WorkflowMeta {
  id: RepairWorkflow;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  difficulty: "beginner" | "intermediate" | "advanced";
  diy_friendly: boolean;
}

const WORKFLOWS: WorkflowMeta[] = [
  { id: "dent_repair", title: "Dent Repair", description: "Paintless dent removal & body filler", icon: Hammer, difficulty: "intermediate", diy_friendly: true },
  { id: "rust_repair", title: "Rust Treatment", description: "Surface rust, undercoat & conversion", icon: AlertTriangle, difficulty: "intermediate", diy_friendly: true },
  { id: "paint_repair", title: "Paint & Scratch", description: "Touch-up, polishing, clear-coat", icon: PaintBucket, difficulty: "beginner", diy_friendly: true },
  { id: "tire_service", title: "Tire Service", description: "Inspection, rotation, replacement", icon: CircleDot, difficulty: "beginner", diy_friendly: true },
  { id: "fluid_leak", title: "Fluid Leak", description: "Identify & seal common leaks", icon: Droplet, difficulty: "advanced", diy_friendly: false },
  { id: "warning_light_diagnostic", title: "Warning Light", description: "OBD2 scan & fault tracing", icon: Gauge, difficulty: "intermediate", diy_friendly: true },
  { id: "interior_repair", title: "Interior Repair", description: "Trim, upholstery, plastic", icon: Sofa, difficulty: "intermediate", diy_friendly: true },
  { id: "battery_service", title: "Battery Replacement", description: "Test, swap, terminal cleaning", icon: BatteryCharging, difficulty: "beginner", diy_friendly: true },
  { id: "general_repair", title: "General Repair", description: "Custom guided diagnostic & repair", icon: Wrench, difficulty: "intermediate", diy_friendly: true },
];

function RepairMode() {
  const search = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const preloaded = !!search.workflow;

  if (preloaded) {
    return <RepairWorkflowDetail
      workflowId={search.workflow!}
      issue={search.issue}
      severity={search.severity}
      location={search.location}
      category={search.category}
      inspectionId={search.inspection_id}
      userId={user?.id ?? null}
      onBack={() => navigate({ to: "/repair", search: {} })}
    />;
  }

  return (
    <AppShell title="Repair Mode">
      <div className="mb-6">
        <Badge variant="outline" className="mb-3 border-primary/40 bg-primary/10 text-primary">
          <Wrench className="mr-1 h-3 w-3" /> Repair Mode
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">Fix it like a pro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a repair workflow or jump in from an inspection finding.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {WORKFLOWS.map((w) => {
          const Icon = w.icon;
          return (
            <Link
              key={w.id}
              to="/repair"
              search={{ workflow: w.id }}
              className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-card/50 p-4 transition-all hover:border-primary/40 hover:shadow-glow"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold">{w.title}</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{w.description}</p>
              <div className="mt-2 flex gap-1">
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                  {w.difficulty}
                </span>
                {w.diy_friendly && (
                  <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-success">
                    DIY
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <Card className="mt-6 border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold">Have an inspection report?</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Issues from the Used Car Inspection feed directly into the right repair workflow.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link to="/inspection">Open Inspection</Link>
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}

interface AiRepair {
  title: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  steps: { step: string; detail: string; warning?: string }[];
  tools: string[];
  parts: string[];
  warnings: string[];
  estimated_cost: { low: number; high: number; currency: string };
  professional_recommended: boolean;
}

function RepairWorkflowDetail(props: {
  workflowId: RepairWorkflow;
  issue?: string;
  severity?: "info" | "low" | "medium" | "high" | "critical";
  location?: string;
  category?: string;
  inspectionId?: string;
  userId: string | null;
  onBack: () => void;
}) {
  const meta = useMemo(() => WORKFLOWS.find((w) => w.id === props.workflowId)!, [props.workflowId]);
  const [ai, setAi] = useState<AiRepair | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatedWorkflow, setGeneratedWorkflow] = useState<GeneratedWorkflow | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const Icon = meta.icon;

  async function generateGuide() {
    setLoading(true);
    try {
      const result = await callAi<AiRepair>("repair_steps", {
        workflow: props.workflowId,
        workflow_label: meta.title,
        issue: props.issue,
        severity: props.severity,
        location: props.location,
        category: props.category,
      });
      setAi(result);
      if (props.userId) {
        await supabase.from("repair_guides").insert({
          user_id: props.userId,
          title: result.title,
          steps: result.steps as never,
          tools: result.tools as never,
          parts: result.parts as never,
          warnings: result.warnings as never,
          estimated_cost: result.estimated_cost as never,
          difficulty: result.difficulty,
        });
        toast.success("Repair guide saved");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate repair guide");
    } finally {
      setLoading(false);
    }
  }

  const guideMeta = GUIDE_META[props.workflowId];
  // Prefer the AutoSage Brain generated workflow when present; fall back to
  // the older AI-tailored steps; finally to deterministic FALLBACK_STEPS.
  const engineSteps = generatedWorkflow
    ? workflowToEngineSteps(generatedWorkflow)
    : normalizeAiSteps(ai?.steps, FALLBACK_STEPS[props.workflowId]);
  const issue = WORKFLOW_TO_ISSUE[props.workflowId];
  const sev: Severity = props.severity ?? "medium";
  const pricing = estimateRepairCost({ issue_type: issue, severity: sev, region: "canada" });

  // Build the input for the AutoSage Brain workflow generator. Real-world
  // insights are intentionally omitted here — the existing RealWorldInsights
  // card already drives those, and we keep prompt size small.
  const builderInput: BuildWorkflowInput = {
    workflow: props.workflowId,
    kind: "repair",
    issue: props.issue,
    severity: sev,
    user_skill: "intermediate",
  };

  // Combine deterministic safety with any AI-generated warnings, de-duped.
  const safetyItems = Array.from(
    new Set([...(guideMeta?.safety ?? []), ...((ai?.warnings ?? []) as string[])]),
  );
  // Combine deterministic tools with any AI-suggested tools, de-duped, capped.
  const toolItems = Array.from(
    new Set([...(guideMeta?.tools ?? []), ...((ai?.tools ?? []) as string[])]),
  ).slice(0, 6);

  const headerSubtitle = props.issue
    ? props.issue
    : meta.description;
  const timeEstimate = guideMeta?.time_estimate ?? "1–2 hrs";

  return (
    <AppShell title="Repair">
      <Button variant="ghost" size="sm" onClick={props.onBack} className="mb-3 -ml-2">
        <ChevronLeft className="h-4 w-4" /> All workflows
      </Button>

      <div className="space-y-4">
        {/* 1. PREMIUM HEADER — title, difficulty, estimated time */}
        <RepairGuideHeader
          title={ai?.title ?? meta.title}
          subtitle={headerSubtitle}
          difficulty={ai?.difficulty ?? meta.difficulty}
          timeEstimate={timeEstimate}
          icon={Icon}
        />

        {/* Confidence line — sets expectations before diving in */}
        <div className={`rounded-xl border-2 px-3 py-2.5 text-[12px] font-medium leading-snug ${
          (ai?.difficulty ?? meta.difficulty) === "beginner"
            ? "border-success/40 bg-success/5 text-success"
            : (ai?.difficulty ?? meta.difficulty) === "intermediate"
              ? "border-warning/40 bg-warning/5 text-warning"
              : "border-destructive/40 bg-destructive/5 text-destructive"
        }`}>
          {confidenceLine(ai?.difficulty ?? meta.difficulty, !!ai?.professional_recommended)}
        </div>

        {/* Inspection context badge (when deep-linked from inspection) */}
        {props.issue && (props.severity || props.location) && (
          <Card>
            <CardContent className="p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  From inspection
                </span>
                {props.severity && (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${severityClass(props.severity)}`}
                  >
                    {props.severity}
                  </span>
                )}
              </div>
              {props.location && (
                <p className="text-[11px] text-muted-foreground">
                  Location: {props.location}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* 2. MANDATORY SAFETY — always shown at top */}
        <SafetySection items={safetyItems} />

        {/* 3. TOOLS REQUIRED */}
        <ToolsSection items={toolItems} />

        {/* 4. AI generator CTA — optional tailoring */}
        <Card className="bg-gradient-card">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold">Let's walk through it</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {ai
                    ? "Tailored to your vehicle and finding — you've got this."
                    : "Mechanic-grade default steps. Generate a tailored guide for your specific vehicle and finding."}
                </p>
              </div>
              {ai?.professional_recommended && (
                <Badge variant="destructive" className="shrink-0 text-[10px]">
                  Pro recommended
                </Badge>
              )}
            </div>

            <Button
              onClick={generateGuide}
              disabled={loading}
              variant={ai ? "outline" : "default"}
              size="sm"
              className={ai ? "" : "w-full shadow-glow"}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating tailored guide…</>
              ) : ai ? (
                <><Sparkles className="h-4 w-4" /> Re-generate AI guide</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Generate AI repair guide</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 4b. AUTOSAGE BRAIN — structured workflow generator (AI + safety + pricing) */}
        {props.userId && (
          <AiWorkflowGenerator
            input={builderInput}
            userId={props.userId}
            onWorkflowReady={setGeneratedWorkflow}
          />
        )}

        {/* 5. STEPS — full engine for signed-in users, preview + lock for guests */}
        {props.userId ? (
          <StepEngine
            workflow={props.workflowId}
            issue={props.issue}
            steps={engineSteps}
            userId={props.userId}
            onAllComplete={() => generatedWorkflow && setFeedbackOpen(true)}
          />
        ) : (
          <GuestStepPreview
            previewStep={engineSteps[0]}
            totalSteps={engineSteps.length}
          />
        )}

        {/* Feedback dialog — opens when a generated workflow is fully completed */}
        {props.userId && generatedWorkflow && (
          <WorkflowFeedbackDialog
            open={feedbackOpen}
            onOpenChange={setFeedbackOpen}
            workflow={generatedWorkflow}
            userId={props.userId}
          />
        )}

        {/* 6. WATCH OUT FOR — common mistakes & risks */}
        <WatchOutSection items={guideMeta?.watch_out ?? []} />

        {/* 6b. WHEN TO STOP — escalate to mechanic */}
        <WhenToStopSection items={guideMeta?.when_to_stop ?? []} />

        {/* 6c. TORQUE / SPEC NOTE — vehicle-dependent */}
        <TorqueNoteSection note={guideMeta?.torque_note} />

        {/* 7. VIDEO GUIDE — AI-summary tutorials (no live API yet) */}
        <VideoGuideSection videos={guideMeta?.videos ?? []} />

        {/* 8. Deterministic CAD pricing for this workflow */}
        <RepairPricingCard pricing={pricing} title={`${meta.title} — typical pricing`} />

        {/* 9. AI parts — only when generator has run */}
        {ai && ai.parts.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Parts you may need
              </h4>
              <ul className="space-y-1 text-xs">
                {ai.parts.map((p, i) => <li key={i}>• {p}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

/**
 * Short confidence line shown above the safety section so users know what
 * they're walking into before they commit to the repair.
 */
function confidenceLine(
  difficulty: "beginner" | "intermediate" | "advanced",
  proRecommended: boolean,
): string {
  if (proRecommended) {
    return "This one's better handled by a mechanic — review the steps first, then decide.";
  }
  if (difficulty === "beginner") {
    return "This is a common repair and can be done with basic tools — you've got this.";
  }
  if (difficulty === "intermediate") {
    return "This requires some experience and the right tools — proceed carefully and read each step before acting.";
  }
  return "Advanced repair — only attempt if you've done similar work before. Otherwise, take it to a shop.";
}

import { Lock, LogIn, Eye } from "lucide-react";
import type { EngineStep } from "@/lib/repair-engine";

/**
 * Guest preview: shows step 1 of the repair guide and locks the rest behind a
 * sign-in. Free account gate — no payments. Core scan/diagnose features are
 * never blocked; only the multi-step interactive walkthrough requires sign-in.
 */
function GuestStepPreview({
  previewStep,
  totalSteps,
}: {
  previewStep: EngineStep | undefined;
  totalSteps: number;
}) {
  if (!previewStep) return null;
  return (
    <div className="space-y-3">
      <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-base font-black text-primary-foreground shadow-glow">
              1
            </div>
            <div className="flex-1">
              <Badge variant="outline" className="mb-1 text-[10px]">
                <Eye className="mr-1 h-3 w-3" /> Free preview · Step 1 of {totalSteps}
              </Badge>
              <h3 className="text-lg font-bold leading-tight">{previewStep.title}</h3>
            </div>
          </div>
          <p className="text-sm text-foreground/90">{previewStep.instruction}</p>
        </CardContent>
      </Card>

      <Card className="border-primary/40 bg-gradient-to-br from-primary/15 via-card to-card shadow-glow">
        <CardContent className="space-y-3 p-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold">Unlock the full repair guide</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalSteps - 1} more step{totalSteps - 1 === 1 ? "" : "s"} with tools, warnings, and progress
              tracking. Free — sign in to continue and we'll save your progress across devices.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link to="/auth">
              <LogIn className="h-4 w-4" /> Sign in to unlock
            </Link>
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Scanning and basic diagnoses always stay free.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
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
  ShieldAlert,
  ChevronLeft,
  Hammer,
  Droplet,
  PaintBucket,
  CircleDot,
  Gauge,
  Sofa,
  AlertTriangle,
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
import { normalizeAiSteps, FALLBACK_STEPS } from "@/lib/repair-engine";

// Maps repair workflow → pricing IssueType (deterministic).
const WORKFLOW_TO_ISSUE: Record<RepairWorkflow, IssueType> = {
  dent_repair: "dent",
  rust_repair: "rust",
  paint_repair: "scratch_paint",
  tire_service: "tire_service",
  fluid_leak: "fluid_leak",
  warning_light_diagnostic: "warning_light_diagnostic",
  interior_repair: "interior_repair",
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

  return (
    <AppShell title="Repair">
      <Button variant="ghost" size="sm" onClick={props.onBack} className="mb-3 -ml-2">
        <ChevronLeft className="h-4 w-4" /> All workflows
      </Button>

      {/* Workflow header */}
      <Card className="mb-4 overflow-hidden border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
              <Icon className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <Badge variant="outline" className="mb-1 text-[10px]">
                {meta.difficulty}
              </Badge>
              <h2 className="text-xl font-bold">{meta.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{meta.description}</p>
            </div>
          </div>

          {/* Preloaded inspection context */}
          {props.issue && (
            <div className="mt-4 rounded-xl border border-border bg-background/50 p-3">
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
              <p className="text-sm font-medium">{props.issue}</p>
              {props.location && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Location: {props.location}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deterministic pricing for this workflow */}
      {(() => {
        const issue = WORKFLOW_TO_ISSUE[props.workflowId];
        const sev: Severity = props.severity ?? "medium";
        const pricing = estimateRepairCost({
          issue_type: issue,
          severity: sev,
          region: "canada",
        });
        return (
          <div className="mb-4">
            <RepairPricingCard pricing={pricing} title={`${meta.title} — typical pricing`} />
          </div>
        );
      })()}

      {/* Step engine — ALWAYS available, uses fallback steps until AI enriches them */}
      {(() => {
        const engineSteps = normalizeAiSteps(ai?.steps, FALLBACK_STEPS[props.workflowId]);
        return (
          <Card className="mb-4 bg-gradient-card">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold">{ai?.title ?? `${meta.title} — guided steps`}</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {ai
                      ? "AI-tailored to your vehicle and finding."
                      : "Deterministic step pack — generate AI guide for vehicle-specific tweaks."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {ai?.difficulty ?? meta.difficulty}
                  </Badge>
                  {ai?.professional_recommended && (
                    <Badge variant="destructive" className="text-[10px]">Pro recommended</Badge>
                  )}
                  {ai?.estimated_cost && (
                    <Badge variant="outline" className="text-[10px]">
                      CA${ai.estimated_cost.low}–CA${ai.estimated_cost.high}
                    </Badge>
                  )}
                </div>
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
        );
      })()}

      {props.userId ? (
        <StepEngine
          workflow={props.workflowId}
          issue={props.issue}
          steps={normalizeAiSteps(ai?.steps, FALLBACK_STEPS[props.workflowId])}
          userId={props.userId}
        />
      ) : (
        <GuestStepPreview
          previewStep={normalizeAiSteps(ai?.steps, FALLBACK_STEPS[props.workflowId])[0]}
          totalSteps={normalizeAiSteps(ai?.steps, FALLBACK_STEPS[props.workflowId]).length}
        />
      )}
      {ai && ai.warnings.length > 0 && (
        <Card className="mt-4 border-warning/40 bg-warning/5">
          <CardContent className="p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning">
              <ShieldAlert className="h-4 w-4" /> Safety
            </h4>
            <ul className="list-disc space-y-1 pl-5 text-xs">
              {ai.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {ai && (ai.tools.length > 0 || ai.parts.length > 0) && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tools
              </h4>
              <ul className="space-y-1 text-xs">
                {ai.tools.map((t, i) => <li key={i}>• {t}</li>)}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Parts
              </h4>
              <ul className="space-y-1 text-xs">
                {ai.parts.map((p, i) => <li key={i}>• {p}</li>)}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

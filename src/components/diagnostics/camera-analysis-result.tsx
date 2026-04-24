import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import type { RepairWorkflow } from "@/lib/valuation";
import { severityClass } from "@/lib/severity";
import { cameraConfidenceTone, type AiCameraResult } from "@/lib/camera-analysis";
import {
  ShieldAlert,
  Wrench,
  Sparkles,
  Save,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";

interface ActionConfig {
  /** Show "View repair steps" button + map to a workflow on /repair. */
  showRepair?: boolean;
  /** Show "Cleaning tips" link to /cleaning. */
  showCleaning?: boolean;
  /** Show "Save report" button (already wired by parent). */
  onSave?: () => void;
  saving?: boolean;
  saved?: boolean;
}

export function CameraAnalysisResult({
  result,
  label = "AI insight",
  actions,
}: {
  result: AiCameraResult;
  label?: string;
  actions?: ActionConfig;
}) {
  // Derive headline urgency from confidence + presence of warnings.
  const urgency = useMemo<"low" | "medium" | "high">(() => {
    if (result.warnings && result.warnings.length >= 2) return "high";
    const issueCount = result.likely_components?.filter((c) => !!c.likely_issue).length ?? 0;
    if (issueCount >= 2 || result.warnings?.length === 1) return "medium";
    return "low";
  }, [result]);

  const lowConfidence = result.overall_confidence === "low";
  const primaryComponent = result.likely_components?.[0];
  const repairWorkflow = primaryComponent
    ? mapToWorkflow(primaryComponent.name, primaryComponent.likely_issue)
    : null;

  return (
    <Card className="overflow-hidden border-primary/30">
      <CardContent className="space-y-4 p-4">
        {/* Header banner */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <span
              className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityClass("info")}`}
            >
              {label}
            </span>
            <p className="mt-2 text-sm leading-relaxed">{result.summary}</p>
          </div>
          {result.overall_confidence && (
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cameraConfidenceTone(result.overall_confidence)}`}
            >
              {result.overall_confidence} confidence
            </span>
          )}
        </div>

        {/* Low-confidence honest fallback */}
        {lowConfidence && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3">
            <div className="mb-1 flex items-center gap-2 text-warning">
              <HelpCircle className="h-4 w-4" />
              <strong className="text-sm">Not confident enough</strong>
            </div>
            <p className="text-xs leading-relaxed text-foreground">
              {result.recapture_tip ??
                "I'm not sure what I'm looking at. Try again with better lighting, less glare, and the part centered in frame."}
            </p>
          </div>
        )}

        {/* Image quality strip */}
        {result.image_quality && (
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <QualityCell label="Lighting" value={result.image_quality.lighting ?? "ok"} />
            <QualityCell label="Focus" value={result.image_quality.focus ?? "ok"} />
            <QualityCell label="Framing" value={result.image_quality.framing ?? "ok"} />
          </div>
        )}

        {/* Structured detected component(s) */}
        {result.likely_components?.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Detected
            </h4>
            <ul className="space-y-2">
              {result.likely_components.map((component, index) => (
                <li
                  key={index}
                  className="rounded-xl border border-border bg-muted/30 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold">{component.name}</span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cameraConfidenceTone(component.confidence as "low" | "medium" | "high")}`}
                    >
                      {component.confidence}
                    </span>
                  </div>
                  {component.likely_issue && (
                    <div className="mt-2 flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                      <p className="text-xs text-foreground">{component.likely_issue}</p>
                    </div>
                  )}
                  {component.what_to_check?.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                      {component.what_to_check.map((item, itemIndex) => (
                        <li key={itemIndex}>{item}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Urgency badge */}
        {!lowConfidence && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background/40 px-3 py-2 text-xs">
            <UrgencyDot level={urgency} />
            <span className="font-semibold">Urgency:</span>
            <span className="capitalize text-muted-foreground">{urgency}</span>
          </div>
        )}

        {/* Safety */}
        {result.warnings?.length > 0 && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-3">
            <div className="mb-1 flex items-center gap-2 text-warning">
              <ShieldAlert className="h-4 w-4" />
              <h4 className="text-xs font-bold uppercase tracking-wider">Safety</h4>
            </div>
            <ul className="list-disc space-y-0.5 pl-4 text-xs">
              {result.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommended next step */}
        {result.next_action && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recommended next step
            </h4>
            <p className="mt-1 text-sm">{result.next_action}</p>
          </div>
        )}

        {/* Action buttons */}
        {actions && (actions.showRepair || actions.showCleaning || actions.onSave) && !lowConfidence && (
          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            {actions.showRepair && (
              <Button asChild size="sm" className="flex-1">
                <Link
                  to="/repair"
                  search={
                    repairWorkflow
                      ? {
                          workflow: repairWorkflow,
                          issue: primaryComponent?.likely_issue ?? primaryComponent?.name,
                        }
                      : {}
                  }
                >
                  <Wrench className="h-4 w-4" /> View repair steps
                </Link>
              </Button>
            )}
            {actions.showCleaning && (
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link
                  to="/cleaning"
                  search={{
                    area: primaryComponent?.name,
                    issue: primaryComponent?.likely_issue ?? undefined,
                  }}
                >
                  <Sparkles className="h-4 w-4" /> Cleaning tips
                </Link>
              </Button>
            )}
            {actions.onSave && (
              <Button
                size="sm"
                variant={actions.saved ? "outline" : "secondary"}
                onClick={actions.onSave}
                disabled={actions.saving || actions.saved}
                className="flex-1"
              >
                {actions.saved ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Saved
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Save report
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QualityCell({ label, value }: { label: string; value: string }) {
  const tone =
    value === "good" ? "text-success" : value === "poor" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-2 py-2 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-xs font-semibold capitalize ${tone}`}>{value}</div>
    </div>
  );
}

function UrgencyDot({ level }: { level: "low" | "medium" | "high" }): ReactNode {
  const color =
    level === "high" ? "bg-destructive" : level === "medium" ? "bg-warning" : "bg-success";
  return <span className={`h-2 w-2 rounded-full ${color}`} />;
}

/** Map an AI-described component / issue into a workflow slug for /repair. */
function mapToWorkflow(name?: string, issue?: string | null): RepairWorkflow | null {
  const text = `${name ?? ""} ${issue ?? ""}`.toLowerCase();
  if (!text.trim()) return null;
  if (/dent|ding|crease/.test(text)) return "dent_repair";
  if (/rust|corros|oxid/.test(text)) return "rust_repair";
  if (/scratch|paint|chip|clear ?coat|swirl/.test(text)) return "paint_repair";
  if (/tire|tread|sidewall|wheel|rim/.test(text)) return "tire_service";
  if (/leak|seep|drip|coolant|oil pan|gasket/.test(text)) return "fluid_leak";
  if (/warning light|check engine|abs|airbag/.test(text)) return "warning_light_diagnostic";
  if (/seat|trim|upholstery|dashboard plastic/.test(text)) return "interior_repair";
  return "general_repair";
}

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import type { RepairWorkflow } from "@/lib/valuation";
import { severityClass } from "@/lib/severity";
import { cameraConfidenceTone, type AiCameraResult } from "@/lib/camera-analysis";
import {
  estimateRepairCost,
  classifyIssueType,
  formatCAD,
  type Severity,
} from "@/lib/pricing";
import { RealWorldInsights } from "@/components/diagnostics/real-world-insights";
import { useActiveVehicleProfile } from "@/hooks/use-active-vehicle-profile";
import {
  ShieldAlert,
  Wrench,
  Sparkles,
  Save,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Banknote,
  Clock,
  Car,
  XCircle,
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
  topic = "diagnose",
}: {
  result: AiCameraResult;
  label?: string;
  actions?: ActionConfig;
  /** Knowledge-layer topic — controls insights prompt focus. */
  topic?: "diagnose" | "cleaning" | "inspection";
}) {
  const vehicle = useActiveVehicleProfile();
  // Derive headline urgency from confidence + presence of warnings.
  const urgency = useMemo<"low" | "medium" | "high" | "critical">(() => {
    const warningCount = result.warnings?.length ?? 0;
    if (warningCount >= 3) return "critical";
    if (warningCount >= 2) return "high";
    const issueCount = result.likely_components?.filter((c) => !!c.likely_issue).length ?? 0;
    if (issueCount >= 2 || warningCount === 1) return "medium";
    return "low";
  }, [result]);

  const lowConfidence = result.overall_confidence === "low";
  const primaryComponent = result.likely_components?.[0];
  const repairWorkflow = primaryComponent
    ? mapToWorkflow(primaryComponent.name, primaryComponent.likely_issue)
    : null;

  // Confidence % (rough mapping for the headline badge).
  const confidencePct =
    result.overall_confidence === "high"
      ? 92
      : result.overall_confidence === "medium"
        ? 72
        : 45;

  // Map AI urgency → pricing severity for the cost/time row.
  const severityForPricing: Severity =
    urgency === "critical" ? "critical" : urgency === "high" ? "high" : urgency === "medium" ? "medium" : "low";

  // Deterministic CAD pricing + time estimate for the primary issue.
  const issueText = primaryComponent
    ? `${primaryComponent.name} ${primaryComponent.likely_issue ?? ""}`
    : result.summary;
  const pricing = useMemo(
    () =>
      estimateRepairCost({
        issue_type: classifyIssueType(issueText ?? ""),
        severity: severityForPricing,
        region: "canada",
      }),
    [issueText, severityForPricing],
  );

  // "Safe to drive" derives from urgency + warnings vocabulary.
  const safeToDrive = isSafeToDrive(urgency, result.warnings ?? []);

  return (
    <>
    <Card className="overflow-hidden border-primary/30">
      <CardContent className="space-y-4 p-4">
        {/* PREMIUM HEADER: detected part as title, confidence + severity badges */}
        <div className="space-y-2">
          <span
            className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityClass("info")}`}
          >
            {label}
          </span>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h2 className="text-2xl font-bold leading-tight tracking-tight">
                {primaryComponent?.name ?? "Analysis"}
              </h2>
              {primaryComponent?.likely_issue && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {primaryComponent.likely_issue}
                </p>
              )}
            </div>
            {result.overall_confidence && (
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${cameraConfidenceTone(result.overall_confidence)}`}
                >
                  {confidencePct}% confidence
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${severityClass(severityForPricing)}`}
                >
                  {urgency}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* MAIN INSIGHT */}
        <p className="rounded-xl border border-border bg-muted/30 p-3 text-sm leading-relaxed">
          {result.summary}
        </p>

        {/* INFO ROW: cost / time / safe-to-drive — only shown when we have a real diagnosis */}
        {!lowConfidence && primaryComponent && (
          <div className="grid grid-cols-3 gap-2">
            <InfoCell
              icon={<Banknote className="h-3.5 w-3.5" />}
              label="Est. cost"
              value={`${formatCAD(pricing.low_estimate)}–${formatCAD(pricing.high_estimate)}`}
              tone="text-foreground"
            />
            <InfoCell
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Time to fix"
              value={formatHours(pricing.time_estimate_hours)}
              tone="text-foreground"
            />
            <InfoCell
              icon={
                safeToDrive ? (
                  <Car className="h-3.5 w-3.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )
              }
              label="Safe to drive"
              value={safeToDrive ? "Yes" : "No"}
              tone={safeToDrive ? "text-success" : "text-destructive"}
            />
          </div>
        )}

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

        {/* Structured detected component(s) — secondary detail */}
        {result.likely_components?.length > 1 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Other detections
            </h4>
            <ul className="space-y-2">
              {result.likely_components.slice(1).map((component, index) => (
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

        {/* "What to check" for primary component */}
        {primaryComponent?.what_to_check && primaryComponent.what_to_check.length > 0 && (
          <div className="rounded-xl border border-border bg-background/40 p-3">
            <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              What to check
            </h4>
            <ul className="list-disc space-y-0.5 pl-4 text-xs">
              {primaryComponent.what_to_check.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
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

        {/* ACTION HUB — decision guidance + urgency clarity + prominent CTA */}
        {actions && (actions.showRepair || actions.showCleaning || actions.onSave) && !lowConfidence && (
          <div className="space-y-3 pt-2">
            {/* Decision guidance line */}
            {primaryComponent && (
              <DecisionGuidance
                urgency={urgency}
                safeToDrive={safeToDrive}
                showRepair={!!actions.showRepair}
                showCleaning={!!actions.showCleaning}
              />
            )}

            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                What do you want to do next?
              </h4>

              {/* Primary action — Fix it gets full visual priority */}
              {actions.showRepair && (
                <Button asChild size="lg" className="h-12 w-full text-base shadow-glow">
                  <Link
                    to="/repair"
                    search={
                      repairWorkflow
                        ? {
                            workflow: repairWorkflow,
                            issue: primaryComponent?.likely_issue ?? primaryComponent?.name,
                            severity: severityForPricing,
                          }
                        : {}
                    }
                  >
                    <Wrench className="h-5 w-5" /> Start the fix
                  </Link>
                </Button>
              )}
              {actions.showCleaning && !actions.showRepair && (
                <Button asChild size="lg" className="h-12 w-full text-base shadow-glow">
                  <Link
                    to="/cleaning"
                    search={{
                      area: primaryComponent?.name,
                      issue: primaryComponent?.likely_issue ?? undefined,
                    }}
                  >
                    <Sparkles className="h-5 w-5" /> Start cleaning now
                  </Link>
                </Button>
              )}

              {/* Secondary actions row */}
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                {actions.showCleaning && actions.showRepair && (
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
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Real-world insights — pluggable knowledge layer (AI common patterns today) */}
    <RealWorldInsights
      enabled={!lowConfidence && !!primaryComponent}
      context={{
        topic,
        issue:
          primaryComponent?.likely_issue ||
          primaryComponent?.name ||
          result.summary ||
          "",
        component: primaryComponent?.name ?? null,
        severity: severityForPricing,
        vehicle: vehicle ?? null,
      }}
    />
    </>
  );
}

function InfoCell({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 px-2 py-2 text-center">
      <div className="flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-[11px] font-bold leading-tight ${tone}`}>{value}</div>
    </div>
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

function formatHours(range: [number, number]): string {
  const [lo, hi] = range;
  if (lo === 0 && hi === 0) return "—";
  const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));
  if (Math.abs(lo - hi) < 0.01) return `${fmt(lo)} h`;
  return `${fmt(lo)}–${fmt(hi)} h`;
}

function isSafeToDrive(
  urgency: "low" | "medium" | "high" | "critical",
  warnings: string[],
): boolean {
  if (urgency === "critical") return false;
  const text = warnings.join(" ").toLowerCase();
  if (/brake|airbag|steering|fire|fuel leak|do not drive|tow/i.test(text)) return false;
  if (urgency === "high" && /leak|smoke|overheat/.test(text)) return false;
  return true;
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

/**
 * Short decision-guidance line shown above the action hub.
 * Combines DIY confidence + urgency so users know how to act, not just what's wrong.
 */
function DecisionGuidance({
  urgency,
  safeToDrive,
  showRepair,
  showCleaning,
}: {
  urgency: "low" | "medium" | "high" | "critical";
  safeToDrive: boolean;
  showRepair: boolean;
  showCleaning: boolean;
}) {
  // DIY recommendation: cleaning is always DIY-friendly; repair depends on urgency.
  const diyFriendly =
    showCleaning && !showRepair
      ? true
      : urgency === "low" || urgency === "medium";
  const diyLine = diyFriendly
    ? "If you're comfortable with basic tools, you can handle this yourself."
    : "This is better handled by a mechanic — DIY is risky here.";

  // Urgency line: clear, calm, action-oriented.
  const urgencyLine =
    urgency === "critical"
      ? "Address this immediately — do not drive until it's resolved."
      : urgency === "high"
        ? "Address this soon to avoid further damage or higher repair costs."
        : urgency === "medium"
          ? safeToDrive
            ? "You're safe to drive for now, but plan to address this within a few weeks."
            : "Get this looked at before driving further."
          : "Safe for now. Monitor over the next few weeks and address at your next service.";

  const tone =
    urgency === "critical" || urgency === "high"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : urgency === "medium"
        ? "border-warning/40 bg-warning/5 text-warning"
        : "border-success/40 bg-success/5 text-success";

  return (
    <div className={`rounded-xl border-2 px-3 py-2.5 ${tone}`}>
      <div className="text-[13px] font-semibold leading-snug">{urgencyLine}</div>
      <div className="mt-0.5 text-[11px] opacity-90">{diyLine}</div>
    </div>
  );
}

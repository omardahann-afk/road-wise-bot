import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  ShieldCheck,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wrench,
  Gauge,
  Banknote,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { formatCAD } from "@/lib/pricing";
import type { DecisionTrust } from "@/lib/decision-trust";

/**
 * Decision Trust card cluster.
 *
 * Visually separates the three signals (condition / valuation / repair burden),
 * shows a confidence_score with reasoning, and lists positives / risks /
 * unknown-areas in plain language. Designed to sit just below the BUY/
 * NEGOTIATE/AVOID hero card on the inspection report.
 */
export function DecisionTrustBlock({ trust }: { trust: DecisionTrust }) {
  return (
    <>
      {/* ----------- Signal triplet ----------- */}
      <Card className="mb-4 bg-gradient-card shadow-card">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Decision signals
            </h3>
            <ConfidencePill score={trust.confidence_score} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SignalTile
              icon={Gauge}
              title="Condition"
              tone={trust.signals.condition.tone}
              value={`${trust.signals.condition.score}/100`}
              label={trust.signals.condition.label}
            />
            <SignalTile
              icon={Banknote}
              title="Valuation"
              tone={trust.signals.valuation.tone}
              value={
                trust.signals.valuation.delta_vs_avg === null
                  ? "—"
                  : `${trust.signals.valuation.delta_vs_avg > 0 ? "+" : ""}${formatCAD(trust.signals.valuation.delta_vs_avg)}`
              }
              label={trust.signals.valuation.label}
            />
            <SignalTile
              icon={Wrench}
              title="Repair burden"
              tone={trust.signals.repair_burden.tone}
              value={
                trust.signals.repair_burden.high === 0
                  ? "—"
                  : `${formatCAD(trust.signals.repair_burden.low)}–${formatCAD(trust.signals.repair_burden.high)}`
              }
              label={trust.signals.repair_burden.label}
            />
          </div>

          <p className="mt-4 text-[11px] text-muted-foreground">
            We keep these three signals separate so a strong number in one area
            doesn’t hide weakness in another.
          </p>
        </CardContent>
      </Card>

      {/* ----------- Confidence factors ----------- */}
      {trust.confidence_factors.length > 0 && (
        <Card className="mb-4 bg-gradient-card shadow-card">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold">Why we’re {confidenceWord(trust.confidence_score)} confident</h3>
            </div>
            <Progress value={trust.confidence_score} className="mb-3 h-2" />
            <ul className="space-y-1.5">
              {trust.confidence_factors.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ----------- Positives / Risks / Reasons ----------- */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {trust.major_positives.length > 0 && (
          <Card className="border-success/30 bg-success/5">
            <CardContent className="p-4">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-success">
                <ShieldCheck className="h-4 w-4" /> Major positives
              </h4>
              <ul className="space-y-1.5 text-[12px]">
                {trust.major_positives.map((p, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        {trust.top_risks.length > 0 && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-destructive">
                <ShieldAlert className="h-4 w-4" /> Top risks
              </h4>
              <ul className="space-y-1.5 text-[12px]">
                {trust.top_risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ----------- Unknown areas (gaps) ----------- */}
      {trust.unknown_areas.length > 0 && (
        <Card className="mb-4 border-warning/30 bg-warning/5">
          <CardContent className="p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-warning">
              <EyeOff className="h-4 w-4" /> Areas not inspected
            </h4>
            <ul className="space-y-1 text-[12px]">
              {trust.unknown_areas.map((u, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Eye className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
                  <span>{u}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Confidence drops when systems are skipped — re-run the inspection
              for full coverage.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function SignalTile({
  icon: Icon,
  title,
  tone,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tone: "good" | "warn" | "bad";
  value: string;
  label: string;
}) {
  const cls =
    tone === "good"
      ? "border-success/40 bg-success/10 text-success"
      : tone === "warn"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-destructive/40 bg-destructive/10 text-destructive";
  return (
    <div className={`rounded-2xl border-2 p-4 ${cls}`}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">{title}</span>
      </div>
      <div className="text-xl font-black tracking-tight">{value}</div>
      <div className="mt-1 text-[11px] opacity-95">{label}</div>
    </div>
  );
}

function ConfidencePill({ score }: { score: number }) {
  const tone =
    score >= 75
      ? "border-success/50 bg-success/15 text-success"
      : score >= 55
        ? "border-primary/50 bg-primary/15 text-primary"
        : "border-warning/50 bg-warning/15 text-warning";
  const Icon = score >= 75 ? TrendingUp : score >= 55 ? Sparkles : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${tone}`}>
      <Icon className="h-3 w-3" /> Confidence {score}%
    </span>
  );
}

function confidenceWord(score: number): string {
  if (score >= 80) return "highly";
  if (score >= 60) return "fairly";
  if (score >= 40) return "moderately";
  return "lightly";
}

import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { formatCAD } from "@/lib/pricing";
import { severityClass } from "@/lib/severity";
import {
  Banknote,
  Wrench,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Loader2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import type { Finding, FinalDecision, ValuationOutput, InspectionScores } from "@/lib/valuation";
import { computeDecisionTrust } from "@/lib/decision-trust";
import { DecisionTrustBlock } from "@/components/diagnostics/decision-trust-block";

export const Route = createFileRoute("/history/inspection/$id")({
  component: InspectionDetailPage,
});

interface SavedInspection {
  id: string;
  created_at: string;
  asking_price: number | null;
  recommendation: string | null;
  notes: string | null;
  vehicle_info: { year?: number; make?: string; model?: string; mileage?: number };
  findings: Finding[] | null;
  scores: {
    overall_score?: number;
    exterior_score?: number;
    interior_score?: number;
    engine_score?: number;
    tire_score?: number;
    risk_flags?: string[];
    repair_burden?: { low: number; high: number };
    burden_cad?: { low: number; high: number; average: number };
    final_decision?: FinalDecision;
  } | null;
}

interface SavedValuation {
  fair_value_low: number | null;
  fair_value_avg: number | null;
  fair_value_high: number | null;
  decision: string | null;
  negotiation_advice: string | null;
  ai_output: { ai?: { summary?: string; negotiation_advice?: string }; deterministic?: FinalDecision; valuation?: ValuationOutput } | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  exterior: "Exterior",
  interior: "Interior",
  engine: "Engine",
  tires: "Tires & Wheels",
  dashboard: "Dashboard",
};

function InspectionDetailPage() {
  const { id } = useParams({ from: "/history/inspection/$id" });
  const { user, loading: authLoading } = useAuth();
  const [insp, setInsp] = useState<SavedInspection | null>(null);
  const [val, setVal] = useState<SavedValuation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      setLoading(true);
      const { data, error: e1 } = await supabase
        .from("inspections")
        .select("id,created_at,asking_price,recommendation,notes,vehicle_info,findings,scores")
        .eq("id", id)
        .maybeSingle();
      if (e1 || !data) {
        setError(e1?.message ?? "Inspection not found.");
        setLoading(false);
        return;
      }
      setInsp(data as unknown as SavedInspection);

      const { data: vData } = await supabase
        .from("valuation_reports")
        .select("fair_value_low,fair_value_avg,fair_value_high,decision,negotiation_advice,ai_output")
        .eq("inspection_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (vData) setVal(vData as unknown as SavedValuation);
      setLoading(false);
    })();
  }, [id, user, authLoading]);

  const grouped = useMemo(() => {
    const map: Record<string, Finding[]> = {};
    (insp?.findings ?? []).forEach((f) => {
      if (f.severity === "info") return;
      if (!map[f.category]) map[f.category] = [];
      map[f.category].push(f);
    });
    return map;
  }, [insp]);

  const decision = insp?.recommendation as "BUY" | "NEGOTIATE" | "AVOID" | null;
  const burden = insp?.scores?.burden_cad ?? null;
  const fd = insp?.scores?.final_decision ?? null;

  const decisionMeta = decision
    ? {
        BUY: { tone: "border-success/40 text-success bg-success/10", grad: "bg-gradient-to-br from-success/15 via-card to-card", icon: ShieldCheck, label: "Good deal — proceed" },
        NEGOTIATE: { tone: "border-warning/40 text-warning bg-warning/10", grad: "bg-gradient-to-br from-warning/15 via-card to-card", icon: TrendingDown, label: "Negotiate the price" },
        AVOID: { tone: "border-destructive/40 text-destructive bg-destructive/10", grad: "bg-gradient-to-br from-destructive/15 via-card to-card", icon: ShieldAlert, label: "Walk away" },
      }[decision]
    : null;

  return (
    <AppShell title="Inspection Report">

      {!user && !authLoading && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Sign in to view this report.</CardContent></Card>
      )}
      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      )}
      {error && !loading && (
        <Card><CardContent className="p-6 text-center text-sm text-destructive">{error}</CardContent></Card>
      )}

      {insp && !loading && (
        <>
          {/* Header */}
          <div className="mb-4">
            <Badge variant="outline" className="mb-2 text-[10px]">Saved inspection · {new Date(insp.created_at).toLocaleDateString()}</Badge>
            <h1 className="text-2xl font-bold tracking-tight">
              {insp.vehicle_info?.year ?? "?"} {insp.vehicle_info?.make ?? ""} {insp.vehicle_info?.model ?? ""}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {insp.vehicle_info?.mileage ? `${insp.vehicle_info.mileage.toLocaleString()} mi` : "Mileage —"}
              {insp.asking_price ? ` · Asking ${formatCAD(insp.asking_price)}` : ""}
            </p>
          </div>

          {/* Decision banner */}
          {decisionMeta && decision && (
            <Card className={`mb-4 border-2 ${decisionMeta.tone} ${decisionMeta.grad}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-current bg-background/30">
                    <decisionMeta.icon className="h-7 w-7" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">{decisionMeta.label}</div>
                    <div className="mt-1 text-4xl font-black tracking-tight">{decision}</div>
                    {fd?.reasons?.[0] && <p className="mt-2 text-sm opacity-95">{fd.reasons[0]}</p>}
                    {fd?.net_value !== undefined && fd?.net_value !== null && (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-current bg-background/40 px-3 py-1.5 text-xs font-semibold">
                        Net value after repairs: {formatCAD(fd.net_value)}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Decision Trust block — confidence + signals + risks (rehydrated from saved data) */}
          {fd && insp.scores?.overall_score !== undefined && val && (
            <DecisionTrustBlock
              trust={computeDecisionTrust({
                decision: fd,
                scores: {
                  overall_score: insp.scores.overall_score ?? 0,
                  exterior_score: insp.scores.exterior_score ?? 0,
                  interior_score: insp.scores.interior_score ?? 0,
                  engine_score: insp.scores.engine_score ?? 0,
                  tire_score: insp.scores.tire_score ?? 0,
                  risk_flags: insp.scores.risk_flags ?? [],
                } as InspectionScores,
                valuation: {
                  base_price: 0,
                  low_value: val.fair_value_low ?? 0,
                  avg_value: val.fair_value_avg ?? 0,
                  high_value: val.fair_value_high ?? 0,
                  delta_vs_avg: insp.asking_price && val.fair_value_avg ? insp.asking_price - val.fair_value_avg : null,
                  deal: (val.ai_output?.valuation?.deal as ValuationOutput["deal"]) ?? "fair",
                  reasoning: val.ai_output?.valuation?.reasoning ?? [],
                } as ValuationOutput,
                findings: insp.findings ?? [],
                burden: burden ? { low: burden.low, high: burden.high, average: burden.average, currency: "CAD", breakdown: [] } : null,
                asking_price: insp.asking_price,
              })}
            />
          )}

          {/* Score + burden grid */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <ScoreTile label="Overall score" value={insp.scores?.overall_score ?? null} suffix="/100" highlight />
            {burden && (
              <Card className="border-warning/30 bg-warning/5">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-warning/80"><Wrench className="h-3 w-3" /> Repair burden</div>
                  <div className="mt-1 text-base font-black text-warning">{formatCAD(burden.low)}–{formatCAD(burden.high)}</div>
                  <div className="text-[10px] text-muted-foreground">avg {formatCAD(burden.average)}</div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sub-scores */}
          {insp.scores && (insp.scores.exterior_score !== undefined) && (
            <Card className="mb-4 bg-gradient-card">
              <CardContent className="p-4">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Category scores</h3>
                <div className="grid grid-cols-4 gap-2">
                  <ScoreTile label="Ext" value={insp.scores.exterior_score ?? null} compact />
                  <ScoreTile label="Int" value={insp.scores.interior_score ?? null} compact />
                  <ScoreTile label="Eng" value={insp.scores.engine_score ?? null} compact />
                  <ScoreTile label="Tire" value={insp.scores.tire_score ?? null} compact />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Valuation snapshot */}
          {val && (val.fair_value_low !== null || val.fair_value_avg !== null) && (
            <Card className="mb-4 bg-gradient-card shadow-card">
              <CardContent className="p-4">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fair market value</h3>
                <div className="grid grid-cols-3 gap-2">
                  <ValueCell label="Low" value={val.fair_value_low ?? 0} />
                  <ValueCell label="Avg" value={val.fair_value_avg ?? 0} highlight />
                  <ValueCell label="High" value={val.fair_value_high ?? 0} />
                </div>
                {insp.asking_price && val.fair_value_avg && (
                  <div className="mt-3 flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-2.5 text-sm">
                    <span className="text-muted-foreground">Asking vs fair avg</span>
                    <span className={`flex items-center gap-1 font-semibold ${insp.asking_price > val.fair_value_avg ? "text-destructive" : "text-success"}`}>
                      {insp.asking_price > val.fair_value_avg ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {insp.asking_price > val.fair_value_avg ? "+" : ""}{formatCAD(insp.asking_price - val.fair_value_avg)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Risk flags */}
          {insp.scores?.risk_flags && insp.scores.risk_flags.length > 0 && (
            <Card className="mb-4 border-destructive/30 bg-destructive/5">
              <CardContent className="p-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-destructive">
                  <AlertTriangle className="h-3 w-3" /> Risk flags
                </h3>
                <ul className="space-y-1 text-xs">
                  {insp.scores.risk_flags.map((r, i) => (
                    <li key={i} className="flex gap-2"><span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-destructive" />{r}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Findings grouped */}
          {Object.keys(grouped).length > 0 && (
            <div className="mb-4 space-y-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Findings by area</h3>
              {Object.entries(grouped).map(([cat, items]) => (
                <Card key={cat} className="bg-gradient-card">
                  <CardContent className="p-4">
                    <h4 className="mb-2 text-sm font-bold">{CATEGORY_LABEL[cat] ?? cat} <span className="ml-1 text-[10px] font-normal text-muted-foreground">({items.length})</span></h4>
                    <ul className="space-y-1.5">
                      {items.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/40 p-2.5">
                          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${severityClass(f.severity)}`}>{f.severity}</span>
                          <div className="flex-1 text-xs">
                            <p>{f.issue}</p>
                            {f.notes && <p className="mt-0.5 text-[10px] text-muted-foreground">{f.notes}</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Negotiation leverage */}
          {fd?.leverage_points && fd.leverage_points.length > 0 && (
            <Card className="mb-4 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
              <CardContent className="p-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold"><Sparkles className="h-4 w-4 text-primary" /> Negotiation leverage</h3>
                <ul className="space-y-1.5 text-sm">
                  {fd.leverage_points.map((l, i) => (
                    <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{l}</li>
                  ))}
                </ul>
                {(val?.negotiation_advice || val?.ai_output?.ai?.negotiation_advice) && (
                  <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    {val.negotiation_advice ?? val.ai_output?.ai?.negotiation_advice}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* AI summary */}
          {insp.notes && (
            <Card className="mb-4 bg-gradient-card">
              <CardContent className="p-4">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Summary</h3>
                <p className="text-sm">{insp.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* CTAs */}
          <div className="mb-4 flex gap-2">
            <Button asChild variant="outline" className="flex-1">
              <Link to="/repair"><Wrench className="h-4 w-4" /> Repair workflows</Link>
            </Button>
            <Button asChild className="flex-1 shadow-glow">
              <Link to="/valuation"><Banknote className="h-4 w-4" /> Re-value</Link>
            </Button>
          </div>

          <p className="pb-4 text-center text-[10px] text-muted-foreground">
            Deterministic scoring + Canadian shop pricing. AI summaries are advisory only.
          </p>
        </>
      )}
    </AppShell>
  );
}

function ScoreTile({ label, value, suffix = "", highlight = false, compact = false }: { label: string; value: number | null; suffix?: string; highlight?: boolean; compact?: boolean }) {
  const tone =
    value === null ? "border-border/60 bg-background/40 text-muted-foreground"
    : value >= 80 ? "border-success/40 bg-success/10 text-success"
    : value >= 60 ? "border-primary/40 bg-primary/10 text-primary"
    : value >= 40 ? "border-warning/40 bg-warning/10 text-warning"
    : "border-destructive/40 bg-destructive/10 text-destructive";
  return (
    <div className={`rounded-xl border-2 ${tone} ${compact ? "p-2" : "p-3"} text-center`}>
      <div className="text-[9px] font-bold uppercase tracking-wider opacity-80">{label}</div>
      <div className={`${compact ? "text-base" : "text-2xl"} font-black leading-tight`}>
        {value === null ? "—" : value}{value !== null && suffix}
      </div>
      {highlight && value !== null && (
        <div className="mt-0.5 text-[9px] uppercase tracking-wider opacity-80">
          {value >= 80 ? "Strong" : value >= 60 ? "Average" : value >= 40 ? "Weak" : "Poor"}
        </div>
      )}
    </div>
  );
}

function ValueCell({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border-2 p-3 text-center ${highlight ? "border-primary/40 bg-primary/10" : "border-border/60 bg-background/40"}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-black ${highlight ? "text-primary" : ""}`}>{formatCAD(value)}</div>
    </div>
  );
}

// Re-export icon to satisfy build
export { ScanSearch as _ };

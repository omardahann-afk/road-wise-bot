import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { formatCAD } from "@/lib/pricing";
import {
  ArrowLeft, Banknote, ScanSearch, ShieldAlert, ShieldCheck, TrendingDown, TrendingUp,
  Loader2, Sparkles, Crosshair, Wrench,
} from "lucide-react";
import type { FinalDecision, Finding, InspectionScores, ValuationOutput } from "@/lib/valuation";
import type { BurdenResult } from "@/lib/pricing";
import { computeDecisionTrust } from "@/lib/decision-trust";
import { DecisionTrustBlock } from "@/components/diagnostics/decision-trust-block";

export const Route = createFileRoute("/history/valuation/$id")({
  component: ValuationDetailPage,
});

interface SavedValuation {
  id: string;
  created_at: string;
  inspection_id: string | null;
  vehicle_info: { year?: number; make?: string; model?: string; mileage?: number };
  base_price: number | null;
  fair_value_low: number | null;
  fair_value_avg: number | null;
  fair_value_high: number | null;
  asking_price: number | null;
  decision: string | null;
  negotiation_advice: string | null;
  ai_output: {
    ai?: { summary?: string; negotiation_advice?: string };
    deterministic?: FinalDecision;
    valuation?: ValuationOutput;
    findings?: Finding[];
    scores?: InspectionScores;
    burden_cad?: BurdenResult;
  } | null;
}

function ValuationDetailPage() {
  const { id } = useParams({ from: "/history/valuation/$id" });
  const { user, loading: authLoading } = useAuth();
  const [val, setVal] = useState<SavedValuation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      const { data, error: e1 } = await supabase
        .from("valuation_reports")
        .select("id,created_at,inspection_id,vehicle_info,base_price,fair_value_low,fair_value_avg,fair_value_high,asking_price,decision,negotiation_advice,ai_output")
        .eq("id", id)
        .maybeSingle();
      if (e1 || !data) {
        setError(e1?.message ?? "Valuation report not found.");
      } else {
        setVal(data as unknown as SavedValuation);
      }
      setLoading(false);
    })();
  }, [id, user, authLoading]);

  const decision = val?.decision as "BUY" | "NEGOTIATE" | "AVOID" | null;
  const fd = val?.ai_output?.deterministic ?? null;
  const meta = decision ? {
    BUY: { tone: "border-success/40 text-success bg-success/10", grad: "bg-gradient-to-br from-success/15 via-card to-card", icon: ShieldCheck, label: "Good deal — proceed" },
    NEGOTIATE: { tone: "border-warning/40 text-warning bg-warning/10", grad: "bg-gradient-to-br from-warning/15 via-card to-card", icon: TrendingDown, label: "Negotiate the price" },
    AVOID: { tone: "border-destructive/40 text-destructive bg-destructive/10", grad: "bg-gradient-to-br from-destructive/15 via-card to-card", icon: ShieldAlert, label: "Walk away" },
  }[decision] : null;

  const delta = (val?.asking_price && val?.fair_value_avg) ? val.asking_price - val.fair_value_avg : null;

  return (
    <AppShell title="Valuation Report">
      <div className="mb-4">
        <Link to="/history" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to history
        </Link>
      </div>

      {!user && !authLoading && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Sign in to view this report.</CardContent></Card>
      )}
      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      )}
      {error && !loading && (
        <Card><CardContent className="p-6 text-center text-sm text-destructive">{error}</CardContent></Card>
      )}

      {val && !loading && (
        <>
          <div className="mb-4">
            <Badge variant="outline" className="mb-2 text-[10px]">Saved valuation · {new Date(val.created_at).toLocaleDateString()}</Badge>
            <h1 className="text-2xl font-bold tracking-tight">
              {val.vehicle_info?.year ?? "?"} {val.vehicle_info?.make ?? ""} {val.vehicle_info?.model ?? ""}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {val.vehicle_info?.mileage ? `${val.vehicle_info.mileage.toLocaleString()} mi` : "Mileage —"}
              {val.asking_price ? ` · Asking ${formatCAD(val.asking_price)}` : ""}
            </p>
          </div>

          {meta && decision && (
            <Card className={`mb-4 border-2 ${meta.tone} ${meta.grad}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-current bg-background/30">
                    <meta.icon className="h-7 w-7" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">{meta.label}</div>
                    <div className="mt-1 text-4xl font-black tracking-tight">{decision}</div>
                    {fd?.reasons?.[0] && <p className="mt-2 text-sm opacity-95">{fd.reasons[0]}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="mb-4 bg-gradient-card shadow-card">
            <CardContent className="p-5">
              <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fair market value</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <ValueCell label="Low" value={val.fair_value_low ?? 0} />
                <ValueCell label="Avg" value={val.fair_value_avg ?? 0} highlight />
                <ValueCell label="High" value={val.fair_value_high ?? 0} />
              </div>

              {val.asking_price && (
                <div className="mt-4 rounded-xl border border-border/60 bg-background/40 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground"><Banknote className="h-3.5 w-3.5" /> Asking price</span>
                    <span className="font-bold">{formatCAD(val.asking_price)}</span>
                  </div>
                  {delta !== null && (
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">vs fair avg</span>
                      <span className={`flex items-center gap-1 font-semibold ${delta > 0 ? "text-destructive" : "text-success"}`}>
                        {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {delta > 0 ? "+" : ""}{formatCAD(delta)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {fd?.leverage_points && fd.leverage_points.length > 0 && (
            <Card className="mb-4 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
              <CardContent className="p-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold"><Sparkles className="h-4 w-4 text-primary" /> Negotiation leverage</h3>
                <ul className="space-y-1.5 text-sm">
                  {fd.leverage_points.map((l, i) => (
                    <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{l}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {(val.negotiation_advice || val.ai_output?.ai?.summary) && (
            <Card className="mb-4 bg-gradient-card">
              <CardContent className="p-4 text-sm">
                <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Crosshair className="h-3 w-3" /> Negotiation advice</h3>
                {val.ai_output?.ai?.summary && <p className="mb-2">{val.ai_output.ai.summary}</p>}
                {val.negotiation_advice && <p className="text-muted-foreground">{val.negotiation_advice}</p>}
              </CardContent>
            </Card>
          )}

          <div className="mb-4 flex gap-2">
            {val.inspection_id && (
              <Button asChild variant="outline" className="flex-1">
                <Link to="/history/inspection/$id" params={{ id: val.inspection_id }}><ScanSearch className="h-4 w-4" /> View inspection</Link>
              </Button>
            )}
            <Button asChild className="flex-1 shadow-glow">
              <Link to="/repair"><Wrench className="h-4 w-4" /> Repair workflows</Link>
            </Button>
          </div>

          <p className="pb-4 text-center text-[10px] text-muted-foreground">
            Heuristic depreciation curve + Canadian shop pricing. Local market may vary.
          </p>
        </>
      )}
    </AppShell>
  );
}

function ValueCell({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border-2 p-3 ${highlight ? "border-primary/40 bg-primary/10" : "border-border/60 bg-background/40"}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-black ${highlight ? "text-primary" : ""}`}>{formatCAD(value)}</div>
    </div>
  );
}

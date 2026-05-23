import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  estimateVehicleValue,
  estimateRepairBurden,
  computeFinalDecision,
  computeInspectionScores,
  type ValuationOutput,
  type FinalDecision,
  type RepairCostEstimate,
  type Finding,
} from "@/lib/valuation";
import { estimateBurdenCAD, formatCAD, type BurdenResult } from "@/lib/pricing";
import {
  Banknote,
  Calculator,
  Crosshair,
  Gauge,
  History as HistoryIcon,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/valuation")({
  component: ValuationPage,
});

interface ValForm {
  year: string;
  make: string;
  model: string;
  mileage: string;
  asking_price: string;
  condition: string; // 0–100
}

interface SavedInspection {
  id: string;
  vehicle_info: { year?: number; make?: string; model?: string; mileage?: number };
  asking_price: number | null;
  scores: { overall_score?: number } | null;
  findings: Finding[] | null;
}

function ValuationPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<ValForm>({
    year: "", make: "", model: "", mileage: "", asking_price: "", condition: "75",
  });
  const [valuation, setValuation] = useState<ValuationOutput | null>(null);
  const [burdenCAD, setBurdenCAD] = useState<BurdenResult | null>(null);
  const [decision, setDecision] = useState<FinalDecision | null>(null);
  const [recentInspections, setRecentInspections] = useState<SavedInspection[]>([]);

  useEffect(() => { if (!authLoading && !user) navigate({ to: "/auth" }); }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("inspections")
        .select("id,vehicle_info,asking_price,scores,findings")
        .order("created_at", { ascending: false })
        .limit(5);
      setRecentInspections((data as SavedInspection[] | null) ?? []);
    })();
  }, [user]);

  function loadFromInspection(insp: SavedInspection) {
    const v = insp.vehicle_info ?? {};
    setForm((f) => ({
      ...f,
      year: v.year ? String(v.year) : "",
      make: v.make ?? "",
      model: v.model ?? "",
      mileage: v.mileage ? String(v.mileage) : "",
      asking_price: insp.asking_price ? String(insp.asking_price) : "",
      condition: insp.scores?.overall_score ? String(insp.scores.overall_score) : "75",
    }));
    toast.success(`Loaded ${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`);
  }

  function calculate() {
    const year = Number(form.year);
    const mileage = Number(form.mileage);
    const condition = Math.max(0, Math.min(100, Number(form.condition) || 75));
    const askingPrice = form.asking_price ? Number(form.asking_price) : null;
    if (!year || !form.make || !mileage) {
      toast.error("Year, make and mileage are required");
      return;
    }
    const val = estimateVehicleValue({
      year, make: form.make, model: form.model, mileage,
      condition_score: condition, asking_price: askingPrice,
    });
    // Lightweight repair burden: derive a synthetic mid-severity finding pool
    // from the gap between perfect (100) and the entered condition.
    const synthFindings: Finding[] = condition < 100 ? [{
      step: "overall", category: "exterior",
      issue: condition < 50 ? "Significant condition issues" : condition < 75 ? "Moderate wear" : "Minor wear",
      severity: condition < 40 ? "critical" : condition < 60 ? "high" : condition < 80 ? "medium" : "low",
    }] : [];
    const repair = estimateRepairBurden(synthFindings);
    const scores = computeInspectionScores(synthFindings);
    const cad = estimateBurdenCAD(synthFindings, { year, make: form.make, model: form.model });
    const fd = computeFinalDecision({
      valuation: val, scores, findings: synthFindings,
      repair, asking_price: askingPrice,
    });
    setValuation(val);
    setBurdenCAD(cad);
    setDecision(fd);
  }

  const dealMeta = useMemo(() => {
    if (!decision) return null;
    return {
      BUY: { tone: "border-success/40 text-success bg-success/10", grad: "bg-gradient-to-br from-success/15 via-card to-card", icon: ShieldCheck, label: "Good deal — proceed" },
      NEGOTIATE: { tone: "border-warning/40 text-warning bg-warning/10", grad: "bg-gradient-to-br from-warning/15 via-card to-card", icon: TrendingDown, label: "Negotiate the price" },
      AVOID: { tone: "border-destructive/40 text-destructive bg-destructive/10", grad: "bg-gradient-to-br from-destructive/15 via-card to-card", icon: ShieldAlert, label: "Walk away" },
    }[decision.decision];
  }, [decision]);

  const askingPriceNum = form.asking_price ? Number(form.asking_price) : null;
  const targetOffer = useMemo(() => {
    if (!valuation || !burdenCAD) return null;
    // Target = avg fair value − worst-case repair burden, floored at low fair value.
    const raw = valuation.avg_value - burdenCAD.high;
    return Math.max(valuation.low_value * 0.95, raw);
  }, [valuation, burdenCAD]);

  return (
    <AppShell title="Value & Negotiate">
      <div className="mb-6">
        <Badge variant="outline" className="mb-2 text-[10px]">Buying tool</Badge>
        <h1 className="text-3xl font-bold tracking-tight">
          Value & <span className="text-gradient">negotiate</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fair market value, repair burden, and a target offer — built on Canadian shop pricing.
        </p>
      </div>

      {recentInspections.length > 0 && (
        <Card className="mb-4 border-primary/20 bg-gradient-card">
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <HistoryIcon className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Pull from a saved inspection
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentInspections.map((i) => {
                const v = i.vehicle_info ?? {};
                return (
                  <button
                    key={i.id}
                    onClick={() => loadFromInspection(i)}
                    className="rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-[11px] font-medium transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                  >
                    {v.year ?? "?"} {v.make ?? ""} {v.model ?? ""}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4 bg-gradient-card shadow-card">
        <CardContent className="space-y-3 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Vehicle & price
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="year" className="text-[11px]">Year</Label>
              <Input id="year" inputMode="numeric" placeholder="2018" value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="make" className="text-[11px]">Make</Label>
              <Input id="make" placeholder="Toyota" value={form.make}
                onChange={(e) => setForm({ ...form, make: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="model" className="text-[11px]">Model</Label>
            <Input id="model" placeholder="Camry SE" value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mileage" className="text-[11px]">Mileage (km)</Label>
              <Input id="mileage" inputMode="numeric" placeholder="125,000" value={form.mileage}
                onChange={(e) => setForm({ ...form, mileage: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="asking" className="text-[11px]">Asking price (CAD)</Label>
              <Input id="asking" inputMode="numeric" placeholder="14,500" value={form.asking_price}
                onChange={(e) => setForm({ ...form, asking_price: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="cond" className="text-[11px]">
              Condition score: <span className="font-bold text-foreground">{form.condition}/100</span>
            </Label>
            <input
              id="cond" type="range" min={0} max={100} step={1} value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value })}
              className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              0 = scrap · 50 = needs work · 75 = average used · 100 = like new
            </p>
          </div>
          <Button className="mt-2 h-12 w-full text-base font-semibold shadow-glow" onClick={calculate}>
            <Calculator className="h-5 w-5" /> Calculate fair value
          </Button>
        </CardContent>
      </Card>

      {valuation && decision && burdenCAD && dealMeta && (
        <>
          {/* Decision card */}
          <Card className={`mb-4 border-2 ${dealMeta.tone} ${dealMeta.grad}`}>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-current bg-background/30">
                  <dealMeta.icon className="h-7 w-7" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">
                    {dealMeta.label}
                  </div>
                  <div className="mt-1 text-4xl font-black tracking-tight">{decision.decision}</div>
                  <p className="mt-2 text-sm opacity-95">{decision.reasons[0] ?? ""}</p>
                  {decision.net_value !== null && (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-current bg-background/40 px-3 py-1.5 text-xs font-semibold">
                      Net value after repairs: {formatCAD(decision.net_value)}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Value snapshot */}
          <Card className="mb-4 bg-gradient-card shadow-card">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  <Gauge className="h-4 w-4" /> Fair market value
                </h3>
                {valuation.deal && (
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    valuation.deal === "good_deal" ? "border-success/40 bg-success/15 text-success"
                    : valuation.deal === "fair" ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-destructive/40 bg-destructive/15 text-destructive"
                  }`}>
                    {valuation.deal.replace("_", " ")}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <ValueCell label="Low" value={valuation.low_value} />
                <ValueCell label="Avg" value={valuation.avg_value} highlight />
                <ValueCell label="High" value={valuation.high_value} />
              </div>

              {askingPriceNum && (
                <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Banknote className="h-3.5 w-3.5" /> Asking price
                    </span>
                    <span className="font-bold">{formatCAD(askingPriceNum)}</span>
                  </div>
                  {valuation.delta_vs_avg !== null && (
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">vs fair avg</span>
                      <span className={`flex items-center gap-1 font-semibold ${
                        valuation.delta_vs_avg > 0 ? "text-destructive" : "text-success"
                      }`}>
                        {valuation.delta_vs_avg > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {valuation.delta_vs_avg > 0 ? "+" : ""}{formatCAD(valuation.delta_vs_avg)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Repair burden */}
              {burdenCAD.high > 0 && (
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-warning">
                      <Wrench className="h-3.5 w-3.5" /> Estimated repair burden
                    </span>
                    <span className="font-bold text-warning">
                      {formatCAD(burdenCAD.low)}–{formatCAD(burdenCAD.high)}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Based on entered condition. For accurate estimates, run a full inspection.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Target offer */}
          {targetOffer !== null && askingPriceNum && (
            <Card className="mb-4 border-primary/40 bg-gradient-to-br from-primary/15 via-card to-card shadow-card">
              <CardContent className="p-5">
                <div className="flex items-center gap-2">
                  <Crosshair className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
                    Suggested target offer
                  </h3>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-primary">{formatCAD(targetOffer)}</span>
                  <span className="text-xs text-muted-foreground">
                    ({formatCAD(targetOffer * 0.95)} – {formatCAD(targetOffer * 1.03)} range)
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Calculated as average fair value minus worst-case repair burden, floored at low fair value.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Negotiation leverage */}
          {decision.leverage_points.length > 0 && (
            <Card className="mb-4 bg-gradient-card shadow-card">
              <CardContent className="p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <Sparkles className="h-4 w-4 text-primary" /> Negotiation leverage
                </h3>
                <ul className="space-y-1.5">
                  {decision.leverage_points.map((l, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Reasoning */}
          <Card className="mb-4 bg-gradient-card shadow-card">
            <CardContent className="p-5">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                What affected this valuation
              </h3>
              <ul className="space-y-1.5 text-sm">
                {decision.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    <span>{r}</span>
                  </li>
                ))}
                <li className="flex items-start gap-2 text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                  <span>Mileage vs expected age: depreciation curve applied.</span>
                </li>
                <li className="flex items-start gap-2 text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                  <span>Condition score: {form.condition}/100 (mapped to value factor).</span>
                </li>
              </ul>
              <p className="mt-3 text-[10px] text-muted-foreground">
                Estimates based on typical Canadian shop pricing. Local market may vary.
              </p>
            </CardContent>
          </Card>

          <div className="flex gap-2 pb-4">
            <Button asChild variant="outline" className="flex-1">
              <Link to="/inspection"><ScanSearch className="h-4 w-4" /> Full inspection</Link>
            </Button>
            <Button asChild className="flex-1 shadow-glow">
              <Link to="/history">View history</Link>
            </Button>
          </div>
        </>
      )}
    </AppShell>
  );
}

function ValueCell({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border-2 p-3 ${
      highlight ? "border-primary/40 bg-primary/10" : "border-border/60 bg-background/40"
    }`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-black ${highlight ? "text-primary" : ""}`}>
        {formatCAD(value)}
      </div>
    </div>
  );
}

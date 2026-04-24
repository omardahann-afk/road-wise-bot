import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  History as HistoryIcon,
  Camera,
  ScanLine,
  Stethoscope,
  ScanSearch,
  ShieldCheck,
  ShieldAlert,
  TrendingDown,
  Wrench,
  Banknote,
  Filter,
} from "lucide-react";
import { severityClass } from "@/lib/severity";
import { formatCAD } from "@/lib/pricing";
import { SignInEmptyState } from "@/components/layout/sign-in-empty-state";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

interface DiagRow {
  id: string;
  mode: "camera" | "obd2" | "symptom" | "inspection";
  summary: string | null;
  severity: string | null;
  created_at: string;
  vehicle_id: string | null;
  ai_output: { pricing?: { low_estimate: number; average_estimate: number; high_estimate: number; issue_label?: string } } | null;
}

interface VehicleLite {
  id: string;
  nickname: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
}

interface InspectionRow {
  id: string;
  vehicle_info: { year?: number; make?: string; model?: string; mileage?: number };
  asking_price: number | null;
  scores: {
    overall_score?: number;
    risk_flags?: string[];
    repair_burden?: { low: number; high: number };
    burden_cad?: { low: number; high: number; average: number };
    final_decision?: { decision?: string; net_value?: number | null };
  } | null;
  recommendation: string | null;
  created_at: string;
  findings: { severity: string }[] | null;
}

interface ValRow {
  id: string;
  vehicle_info: { year?: number; make?: string; model?: string };
  asking_price: number | null;
  fair_value_low: number | null;
  fair_value_avg: number | null;
  fair_value_high: number | null;
  decision: string | null;
  created_at: string;
}

type SortMode = "newest" | "highest_burden" | "decision";

function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const [diags, setDiags] = useState<DiagRow[]>([]);
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [valuations, setValuations] = useState<ValRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>("newest");
  const [decisionFilter, setDecisionFilter] = useState<"ALL" | "BUY" | "NEGOTIATE" | "AVOID">("ALL");

  const [vehicles, setVehicles] = useState<VehicleLite[]>([]);
  const [groupByVehicle, setGroupByVehicle] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    (async () => {
      const [d, i, v, veh] = await Promise.all([
        supabase.from("diagnostics").select("id,mode,summary,severity,created_at,vehicle_id,ai_output")
          .order("created_at", { ascending: false }).limit(50),
        supabase.from("inspections").select("id,vehicle_info,asking_price,scores,recommendation,findings,created_at")
          .order("created_at", { ascending: false }).limit(50),
        supabase.from("valuation_reports").select("id,vehicle_info,asking_price,fair_value_low,fair_value_avg,fair_value_high,decision,created_at")
          .order("created_at", { ascending: false }).limit(50),
        supabase.from("vehicles").select("id,nickname,year,make,model"),
      ]);
      setDiags((d.data as DiagRow[] | null) ?? []);
      setInspections((i.data as InspectionRow[] | null) ?? []);
      setValuations((v.data as ValRow[] | null) ?? []);
      setVehicles((veh.data as VehicleLite[] | null) ?? []);
      setLoading(false);
    })();
  }, [user, authLoading]);

  const diagsByVehicle = useMemo(() => {
    const map = new Map<string | null, DiagRow[]>();
    diags.forEach((d) => {
      const k = d.vehicle_id ?? null;
      const list = map.get(k) ?? [];
      list.push(d);
      map.set(k, list);
    });
    return map;
  }, [diags]);

  const vehicleLabel = (id: string | null): string => {
    if (!id) return "Unassigned";
    const v = vehicles.find((x) => x.id === id);
    if (!v) return "Vehicle";
    return v.nickname || `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim() || "Vehicle";
  };

  const sortedInspections = useMemo(() => {
    let rows = [...inspections];
    if (decisionFilter !== "ALL") {
      rows = rows.filter((r) => r.recommendation === decisionFilter);
    }
    if (sort === "highest_burden") {
      rows.sort((a, b) => (b.scores?.burden_cad?.high ?? 0) - (a.scores?.burden_cad?.high ?? 0));
    } else if (sort === "decision") {
      const order: Record<string, number> = { AVOID: 0, NEGOTIATE: 1, BUY: 2 };
      rows.sort((a, b) => (order[a.recommendation ?? ""] ?? 99) - (order[b.recommendation ?? ""] ?? 99));
    } else {
      rows.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    }
    return rows;
  }, [inspections, sort, decisionFilter]);

  return (
    <AppShell title="History">
      <div className="mb-6">
        <Badge variant="outline" className="mb-2 text-[10px]">Activity</Badge>
        <h1 className="text-3xl font-bold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Diagnostics, inspections, and valuation reports — with repair impact at a glance.
        </p>
      </div>

      {!user && <SignInEmptyState context="diagnostics, vehicles, inspections, and reports" />}
      {user && loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {user && !loading && inspections.length > 0 && (
        <section className="mb-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Saved inspections ({sortedInspections.length})
            </h2>
            <Filter className="h-3 w-3 text-muted-foreground" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="rounded-md border border-border bg-background px-2 py-1 text-[11px]"
            >
              <option value="newest">Newest</option>
              <option value="highest_burden">Highest burden</option>
              <option value="decision">Avoid → Buy</option>
            </select>
            <select
              value={decisionFilter}
              onChange={(e) => setDecisionFilter(e.target.value as typeof decisionFilter)}
              className="rounded-md border border-border bg-background px-2 py-1 text-[11px]"
            >
              <option value="ALL">All decisions</option>
              <option value="BUY">Buy</option>
              <option value="NEGOTIATE">Negotiate</option>
              <option value="AVOID">Avoid</option>
            </select>
          </div>
          <ul className="space-y-3">
            {sortedInspections.map((r) => <InspectionCard key={r.id} row={r} />)}
          </ul>
        </section>
      )}

      {user && !loading && valuations.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Valuation reports ({valuations.length})
          </h2>
          <ul className="space-y-2">
            {valuations.map((r) => <ValuationCard key={r.id} row={r} />)}
          </ul>
        </section>
      )}

      {user && !loading && diags.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="mr-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Diagnostics ({diags.length})
            </h2>
            <button
              type="button"
              onClick={() => setGroupByVehicle((v) => !v)}
              className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium hover:border-primary/40"
            >
              {groupByVehicle ? "Show flat list" : "Group by vehicle"}
            </button>
          </div>
          {groupByVehicle ? (
            <div className="space-y-4">
              {Array.from(diagsByVehicle.entries()).map(([vehId, rows]) => (
                <div key={vehId ?? "_none"}>
                  <h3 className="mb-1.5 text-[11px] font-bold text-foreground">
                    {vehicleLabel(vehId)} <span className="text-muted-foreground">({rows.length})</span>
                  </h3>
                  <ul className="space-y-2">
                    {rows.map((r) => <DiagnosticCard key={r.id} row={r} />)}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {diags.map((r) => <DiagnosticCard key={r.id} row={r} />)}
            </ul>
          )}
        </section>
      )}

      {user && !loading && inspections.length === 0 && diags.length === 0 && valuations.length === 0 && (
        <Card className="bg-gradient-card">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <HistoryIcon className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No history yet — try the OBD2 lookup, symptom checker, or used car inspection.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button asChild size="sm" variant="outline"><Link to="/inspection">Inspection</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/diagnose">Diagnose</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/valuation">Valuation</Link></Button>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

function DiagnosticCard({ row }: { row: DiagRow }) {
  const Icon = row.mode === "camera" ? Camera : row.mode === "obd2" ? ScanLine : Stethoscope;
  const pricing = row.ai_output?.pricing;
  return (
    <li>
      <Link
        to="/history/diagnostic/$id"
        params={{ id: row.id }}
        className="flex items-start gap-3 rounded-2xl border border-border bg-gradient-card p-3 transition-colors hover:border-primary/40"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {row.mode}
            </p>
            {row.severity && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${severityClass(row.severity)}`}>
                {row.severity}
              </span>
            )}
          </div>
          <p className="text-sm">{row.summary ?? "—"}</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {new Date(row.created_at).toLocaleString()}
            </p>
            {pricing && (
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                <Banknote className="mr-1 inline h-3 w-3" />
                {formatCAD(pricing.low_estimate)}–{formatCAD(pricing.high_estimate)}
              </span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function InspectionCard({ row }: { row: InspectionRow }) {
  const v = row.vehicle_info ?? {};
  const overall = row.scores?.overall_score ?? null;
  const burdenCad = row.scores?.burden_cad ?? null;
  const burdenUsd = row.scores?.repair_burden ?? null;
  const burden = burdenCad ?? burdenUsd; // prefer CAD snapshot
  const riskCount = row.scores?.risk_flags?.length ?? 0;
  const findingsCount = row.findings?.length ?? 0;
  const decision = row.recommendation as "BUY" | "NEGOTIATE" | "AVOID" | null;
  const netValue = row.scores?.final_decision?.net_value ?? null;

  const meta = decision ? {
    BUY: { tone: "border-success/40 bg-success/10 text-success", icon: ShieldCheck },
    NEGOTIATE: { tone: "border-warning/40 bg-warning/10 text-warning", icon: TrendingDown },
    AVOID: { tone: "border-destructive/40 bg-destructive/10 text-destructive", icon: ShieldAlert },
  }[decision] : null;
  const DecisionIcon = meta?.icon ?? ScanSearch;

  return (
    <li>
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-elevated shadow-card transition-colors hover:border-primary/40">
        <Link to="/history/inspection/$id" params={{ id: row.id }} className="block">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
            <ScanSearch className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold">
                  {v.year ?? "?"} {v.make ?? ""} {v.model ?? ""}
                </h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {v.mileage ? `${v.mileage.toLocaleString()} km` : ""}
                  {row.asking_price ? ` · Asking ${formatCAD(row.asking_price)}` : ""}
                </p>
              </div>
              {meta && decision && (
                <span className={`flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${meta.tone}`}>
                  <DecisionIcon className="h-3 w-3" />
                  {decision}
                </span>
              )}
            </div>

            {/* Pricing strip */}
            {(burden || netValue !== null) && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {burden && (
                  <div className="rounded-lg border border-warning/30 bg-warning/5 px-2.5 py-1.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-warning/80">Repair burden</div>
                    <div className="text-xs font-black text-warning">
                      {formatCAD(burden.low)}–{formatCAD(burden.high)}
                    </div>
                  </div>
                )}
                {netValue !== null && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-primary/80">Net value</div>
                    <div className="text-xs font-black text-primary">{formatCAD(netValue)}</div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {overall !== null && (
                <span className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] font-semibold">
                  Score {overall}/100
                </span>
              )}
              <span className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] font-semibold">
                {findingsCount} finding{findingsCount === 1 ? "" : "s"}
              </span>
              {riskCount > 0 && (
                <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                  {riskCount} risk flag{riskCount === 1 ? "" : "s"}
                </span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {new Date(row.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
        </Link>
        <div className="flex gap-1 border-t border-border/60 bg-background/30 px-2 py-1.5">
          <Link to="/history/inspection/$id" params={{ id: row.id }} className="flex-1 rounded-lg px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
            <ScanSearch className="mr-1 inline h-3 w-3" /> Open report
          </Link>
          <Link to="/repair" className="flex-1 rounded-lg px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
            <Wrench className="mr-1 inline h-3 w-3" /> Repair
          </Link>
          <Link to="/valuation" className="flex-1 rounded-lg px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
            <Banknote className="mr-1 inline h-3 w-3" /> Re-value
          </Link>
        </div>
      </div>
    </li>
  );
}

function ValuationCard({ row }: { row: ValRow }) {
  const v = row.vehicle_info ?? {};
  const decision = row.decision as "BUY" | "NEGOTIATE" | "AVOID" | null;
  const meta = decision ? {
    BUY: { tone: "border-success/40 bg-success/10 text-success" },
    NEGOTIATE: { tone: "border-warning/40 bg-warning/10 text-warning" },
    AVOID: { tone: "border-destructive/40 bg-destructive/10 text-destructive" },
  }[decision] : null;

  return (
    <li>
    <Link
      to="/history/valuation/$id"
      params={{ id: row.id }}
      className="flex items-start gap-3 rounded-2xl border border-border bg-gradient-card p-3 transition-colors hover:border-primary/40"
    >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Banknote className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold">
              {v.year ?? "?"} {v.make ?? ""} {v.model ?? ""}
            </p>
            {meta && decision && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${meta.tone}`}>
                {decision}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Fair value {formatCAD(row.fair_value_low ?? 0)}–{formatCAD(row.fair_value_high ?? 0)}
            {row.asking_price ? ` · Asking ${formatCAD(row.asking_price)}` : ""}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {new Date(row.created_at).toLocaleString()}
          </p>
        </div>
    </Link>
    </li>
  );
}

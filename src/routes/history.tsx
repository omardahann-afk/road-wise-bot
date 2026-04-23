import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { severityClass } from "@/lib/severity";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

interface DiagRow {
  id: string;
  mode: "camera" | "obd2" | "symptom" | "inspection";
  summary: string | null;
  severity: string | null;
  created_at: string;
}

interface InspectionRow {
  id: string;
  vehicle_info: { year?: number; make?: string; model?: string; mileage?: number };
  asking_price: number | null;
  scores: { overall_score?: number; risk_flags?: string[] } | null;
  recommendation: string | null;
  created_at: string;
  findings: { severity: string }[] | null;
}

function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const [diags, setDiags] = useState<DiagRow[]>([]);
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    (async () => {
      const [d, i] = await Promise.all([
        supabase.from("diagnostics").select("id,mode,summary,severity,created_at")
          .order("created_at", { ascending: false }).limit(50),
        supabase.from("inspections").select("id,vehicle_info,asking_price,scores,recommendation,findings,created_at")
          .order("created_at", { ascending: false }).limit(50),
      ]);
      setDiags((d.data as DiagRow[] | null) ?? []);
      setInspections((i.data as InspectionRow[] | null) ?? []);
      setLoading(false);
    })();
  }, [user, authLoading]);

  return (
    <AppShell title="History">
      <div className="mb-6">
        <Badge variant="outline" className="mb-2 text-[10px]">Activity</Badge>
        <h1 className="text-3xl font-bold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All your diagnostics, inspections, and saved reports.
        </p>
      </div>

      {!user && <p className="text-sm text-muted-foreground">Sign in to view your history.</p>}
      {user && loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {user && !loading && inspections.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Saved inspections ({inspections.length})
          </h2>
          <ul className="space-y-3">
            {inspections.map((r) => <InspectionCard key={r.id} row={r} />)}
          </ul>
        </section>
      )}

      {user && !loading && diags.length > 0 && (
        <section>
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Diagnostics ({diags.length})
          </h2>
          <ul className="space-y-2">
            {diags.map((r) => {
              const Icon = r.mode === "camera" ? Camera : r.mode === "obd2" ? ScanLine : Stethoscope;
              return (
                <li key={r.id} className="flex items-start gap-3 rounded-2xl border border-border bg-gradient-card p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {r.mode}
                      </p>
                      {r.severity && (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${severityClass(r.severity)}`}>
                          {r.severity}
                        </span>
                      )}
                    </div>
                    <p className="text-sm">{r.summary ?? "—"}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {user && !loading && inspections.length === 0 && diags.length === 0 && (
        <Card className="bg-gradient-card">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <HistoryIcon className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No history yet — try the OBD2 lookup, symptom checker, or used car inspection.
            </p>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

function InspectionCard({ row }: { row: InspectionRow }) {
  const v = row.vehicle_info ?? {};
  const overall = row.scores?.overall_score ?? null;
  const riskCount = row.scores?.risk_flags?.length ?? 0;
  const findingsCount = row.findings?.length ?? 0;
  const decision = row.recommendation as "BUY" | "NEGOTIATE" | "AVOID" | null;

  const meta = decision ? {
    BUY: { tone: "border-success/40 bg-success/10 text-success", icon: ShieldCheck },
    NEGOTIATE: { tone: "border-warning/40 bg-warning/10 text-warning", icon: TrendingDown },
    AVOID: { tone: "border-destructive/40 bg-destructive/10 text-destructive", icon: ShieldAlert },
  }[decision] : null;
  const DecisionIcon = meta?.icon ?? ScanSearch;

  return (
    <li>
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-elevated shadow-card">
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
                  {v.mileage ? `${v.mileage.toLocaleString()} mi` : ""}
                  {row.asking_price ? ` · Asking $${row.asking_price.toLocaleString()}` : ""}
                </p>
              </div>
              {meta && decision && (
                <span className={`flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${meta.tone}`}>
                  <DecisionIcon className="h-3 w-3" />
                  {decision}
                </span>
              )}
            </div>
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
        <div className="flex gap-1 border-t border-border/60 bg-background/30 px-2 py-1.5">
          <Link to="/repair" className="flex-1 rounded-lg px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
            <Wrench className="mr-1 inline h-3 w-3" /> Repair workflows
          </Link>
        </div>
      </div>
    </li>
  );
}

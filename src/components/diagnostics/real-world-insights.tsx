// =============================================================================
// RealWorldInsights — collapsible "knowledge layer" card shown under every
// AI result screen (diagnose, cleaning, inspection, OBD2, symptom).
//
// Sections:
//   1. What drivers with this issue report
//   2. Common fixes (DIY vs shop)
//   3. Watch out for
//   4. Typical time & cost (CAD)
//   + Future external data sources (placeholder, honestly labeled)
//
// All content is fetched through the pluggable knowledge layer. Today the
// adapter is AI-generated "common patterns" — clearly labeled as such, never
// faked as live forum data.
// =============================================================================
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Users,
  Wrench,
  ShieldAlert,
  Clock,
  ChevronDown,
  Plug,
  RefreshCw,
  Info,
  Car,
  AlertCircle,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  getRealWorldInsights,
  FUTURE_INSIGHT_SOURCES,
  type InsightsContext,
  type RealWorldInsights as Insights,
} from "@/lib/knowledge-layer";
// Side-effect import: registers the AI adapter on first load.
import "@/lib/insights-adapter-ai";
import { formatCAD } from "@/lib/pricing";

interface Props {
  context: InsightsContext;
  /** When false, the card is hidden entirely (e.g. low-confidence parent). */
  enabled?: boolean;
}

export function RealWorldInsights({ context, enabled = true }: Props) {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stable cache key so we don't re-fetch on every render.
  const cacheKey = JSON.stringify({
    i: context.issue,
    t: context.topic,
    c: context.component ?? "",
    s: context.severity ?? "",
    v: context.vehicle
      ? `${context.vehicle.year ?? ""}-${context.vehicle.make ?? ""}-${context.vehicle.model ?? ""}`
      : "",
  });

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !context.issue?.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    getRealWorldInsights(context)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load insights");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, enabled]);

  if (!enabled) return null;

  const hasVehicle = !!(
    context.vehicle?.make ||
    context.vehicle?.model ||
    context.vehicle?.year
  );

  return (
    <Card className="mt-4 overflow-hidden border-primary/20 bg-gradient-card">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Users className="h-4 w-4" />
              <h3 className="text-sm font-bold uppercase tracking-wider">Real-world insights</h3>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {data?.source_label ?? "Common patterns from AI summary — not live forum data."}
            </p>
          </div>
          {!loading && data && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setData(null);
                setLoading(true);
                getRealWorldInsights(context)
                  .then(setData)
                  .catch((e) =>
                    setError(e instanceof Error ? e.message : "Could not refresh"),
                  )
                  .finally(() => setLoading(false));
              }}
              aria-label="Refresh insights"
              className="h-7 w-7"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {!hasVehicle && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-2.5 text-[11px]">
            <Car className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="flex-1">
              <span className="text-muted-foreground">
                Add your vehicle (make, model, year, km) for tailored insights.
              </span>{" "}
              <Link to="/vehicles" className="font-medium text-primary hover:underline">
                Add vehicle →
              </Link>
            </div>
          </div>
        )}

        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-[11px] text-warning">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {data && !loading && (
          <>
            {data.low_confidence && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-[11px]">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <span>
                  Limited detail — the underlying diagnosis is low confidence. Capture a clearer
                  photo or add vehicle info for better insights.
                </span>
              </div>
            )}

            <InsightSection
              icon={<Users className="h-3.5 w-3.5 text-primary" />}
              title="What drivers with this issue report"
              count={data.driver_reports.length}
              defaultOpen
            >
              {data.driver_reports.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4 text-sm">
                  {data.driver_reports.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No common reports found.</p>
              )}
            </InsightSection>

            <InsightSection
              icon={<Wrench className="h-3.5 w-3.5 text-primary" />}
              title="Common fixes"
              count={data.common_fixes.length}
            >
              {data.common_fixes.length > 0 ? (
                <ul className="space-y-1.5">
                  {data.common_fixes.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-border bg-background/40 p-2"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{f.fix}</p>
                        {f.note && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{f.note}</p>
                        )}
                      </div>
                      <RouteBadge route={f.route} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No common fixes available.</p>
              )}
            </InsightSection>

            <InsightSection
              icon={<ShieldAlert className="h-3.5 w-3.5 text-warning" />}
              title="Watch out for"
              count={data.watch_out_for.length}
            >
              {data.watch_out_for.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4 text-sm">
                  {data.watch_out_for.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No common pitfalls reported.</p>
              )}
            </InsightSection>

            <InsightSection
              icon={<Clock className="h-3.5 w-3.5 text-primary" />}
              title="Typical repair time & cost"
              count={
                (data.time_and_cost.diy_time ? 1 : 0) +
                (data.time_and_cost.shop_cost_cad ? 1 : 0)
              }
            >
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Stat
                    label="DIY time"
                    value={data.time_and_cost.diy_time ?? "—"}
                  />
                  <Stat
                    label="Shop cost (CAD)"
                    value={
                      data.time_and_cost.shop_cost_cad
                        ? `${formatCAD(data.time_and_cost.shop_cost_cad.low)}–${formatCAD(data.time_and_cost.shop_cost_cad.high)}`
                        : "—"
                    }
                  />
                </div>
                {data.time_and_cost.notes && (
                  <p className="text-[11px] text-muted-foreground">
                    {data.time_and_cost.notes}
                  </p>
                )}
              </div>
            </InsightSection>

            <InsightSection
              icon={<Plug className="h-3.5 w-3.5 text-muted-foreground" />}
              title="Related resources (coming soon)"
              count={FUTURE_INSIGHT_SOURCES.length}
            >
              <ul className="space-y-1 text-[11px]">
                {FUTURE_INSIGHT_SOURCES.map((s) => (
                  <li key={s.label} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                    <span>
                      <strong className="text-foreground">{s.label}:</strong>{" "}
                      <span className="text-muted-foreground">{s.what}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] italic text-muted-foreground">
                These external sources will plug into the same panel once configured — no UI
                changes required.
              </p>
            </InsightSection>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function InsightSection({
  icon,
  title,
  count,
  children,
  defaultOpen,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-left transition-colors hover:bg-background/70"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-semibold">{title}</span>
          {count > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
              {count}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-1 pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function RouteBadge({ route }: { route: "diy" | "shop" | "either" }) {
  const meta =
    route === "diy"
      ? { label: "DIY", cls: "border-success/40 bg-success/10 text-success" }
      : route === "shop"
        ? { label: "Shop", cls: "border-warning/40 bg-warning/10 text-warning" }
        : { label: "Either", cls: "border-border bg-muted/40 text-muted-foreground" };
  return (
    <span
      className={`shrink-0 rounded-full border px-1.5 py-0 text-[10px] font-bold uppercase tracking-wider ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-2.5 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

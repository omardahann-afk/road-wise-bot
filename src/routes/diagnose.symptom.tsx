import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Stethoscope, Info } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { callAiSafe, AI_UNAVAILABLE_MESSAGE } from "@/lib/ai";
import { localSymptomDiagnose } from "@/lib/symptom-local";
import { severityClass } from "@/lib/severity";
import { classifyIssueType, estimateRepairCost, type Severity } from "@/lib/pricing";
import { RepairPricingCard } from "@/components/diagnostics/repair-pricing-card";
import { RealWorldInsights } from "@/components/diagnostics/real-world-insights";
import { useActiveVehicleProfile } from "@/hooks/use-active-vehicle-profile";

export const Route = createFileRoute("/diagnose/symptom")({
  component: SymptomChecker,
});

interface AiSymptomResult {
  summary: string;
  severity: string;
  possible_issues?: { title: string; likelihood: string; description: string; system: string }[];
  next_steps?: { step: string; detail: string }[];
  questions_to_narrow?: string[];
  tools_needed?: string[];
  estimated_cost?: { low: number; high: number; currency: string };
  professional_recommended?: boolean;
  safety?: string[];
}

const QUICK = [
  "Engine cranks but won't start",
  "Squealing noise when braking",
  "Vibration above 60 mph",
  "White smoke from exhaust",
  "Battery dies overnight",
  "Check engine light flashing",
];

function SymptomChecker() {
  const [symptoms, setSymptoms] = useState("");
  const [conditions, setConditions] = useState("");
  const [vehicle, setVehicle] = useState({ year: "", make: "", model: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiSymptomResult | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const { user } = useAuth();
  const activeVehicle = useActiveVehicleProfile();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!symptoms.trim()) return;
    setBusy(true);
    setResult(null);
    setUsedFallback(false);

    // Always have a local result ready — if AI succeeds we replace it.
    const local = localSymptomDiagnose(symptoms, conditions);

    try {
      const ai = await callAiSafe<AiSymptomResult>(
        "symptom",
        { symptoms, conditions },
        vehicle.make ? vehicle : null,
      );

      let final: AiSymptomResult;
      let fellBack = false;
      if (ai.ok) {
        final = ai.data;
      } else {
        final = local;
        fellBack = true;
        toast.info(AI_UNAVAILABLE_MESSAGE);
      }
      setResult(final);
      setUsedFallback(fellBack);

      if (user) {
        // Compute deterministic pricing from top likely issue, persist for history.
        const top = final.possible_issues?.[0];
        const pricingSnapshot = top
          ? estimateRepairCost({
              issue_type: classifyIssueType(top.title),
              severity: ((["info","low","medium","high","critical"].includes(final.severity)
                ? final.severity : "medium") as Severity),
              vehicle_year: vehicle.year ? Number(vehicle.year) : null,
              vehicle_make: vehicle.make || null,
              vehicle_model: vehicle.model || null,
              region: "canada",
            })
          : null;
        try {
          await supabase.from("diagnostics").insert({
            user_id: user.id,
            mode: "symptom",
            input: { symptoms, conditions, vehicle },
            ai_output: { ...final, pricing: pricingSnapshot, source: fellBack ? "local_fallback" : "ai" } as never,
            severity:
              (["info", "low", "medium", "high", "critical"].includes(final.severity)
                ? final.severity
                : "medium") as "info" | "low" | "medium" | "high" | "critical",
            summary: final.summary,
          });
        } catch (persistErr) {
          // Persistence failure must never block showing the result.
          console.warn("Symptom persist failed:", persistErr);
        }
      }
    } catch (err) {
      // Last-resort safety net — should be unreachable given callAiSafe.
      console.error("Symptom flow unexpected error:", err);
      setResult(local);
      setUsedFallback(true);
      toast.info(AI_UNAVAILABLE_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Symptom Checker">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Symptom Checker</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Describe what's happening — sounds, smells, when it occurs.
      </p>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label>What are you experiencing?</Label>
          <Textarea
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            placeholder="e.g. There's a grinding sound from the front-right when I brake hard at low speeds…"
            rows={4}
            required
          />
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button
                type="button"
                key={q}
                onClick={() => setSymptoms((s) => (s ? `${s} ${q}` : q))}
                className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] hover:border-primary/40"
              >
                + {q}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>When does it happen? (optional)</Label>
          <Input
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            placeholder="Cold starts, after 20 min driving, in rain…"
          />
        </div>

        <div className="space-y-2">
          <Label>Vehicle (optional)</Label>
          <div className="grid grid-cols-3 gap-2">
            <Input
              placeholder="Year"
              inputMode="numeric"
              value={vehicle.year}
              onChange={(e) => setVehicle({ ...vehicle, year: e.target.value })}
            />
            <Input
              placeholder="Make"
              value={vehicle.make}
              onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })}
            />
            <Input
              placeholder="Model"
              value={vehicle.model}
              onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })}
            />
          </div>
        </div>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Diagnosing…
            </>
          ) : (
            <>
              <Stethoscope className="h-4 w-4" /> Diagnose
            </>
          )}
        </Button>
      </form>

      {result && (
        <Card className="mt-6">
          <CardContent className="space-y-4 p-4">
            {usedFallback && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>{AI_UNAVAILABLE_MESSAGE}</span>
              </div>
            )}
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm">{result.summary}</p>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityClass(result.severity)}`}
              >
                {result.severity}
              </span>
            </div>

            {/* Pricing for top likely issue — deterministic */}
            {(() => {
              const top = result.possible_issues?.[0];
              if (!top) return null;
              const sev: Severity = (["info","low","medium","high","critical"].includes(result.severity) ? result.severity : "medium") as Severity;
              const pricing = estimateRepairCost({
                issue_type: classifyIssueType(top.title),
                severity: sev,
                vehicle_year: vehicle.year ? Number(vehicle.year) : null,
                vehicle_make: vehicle.make || null,
                vehicle_model: vehicle.model || null,
                region: "canada",
              });
              return (
                <div className="-mx-4 sm:mx-0">
                  <RepairPricingCard pricing={pricing} title={`Estimated cost — ${top.title}`} compact />
                </div>
              );
            })()}

            {result.possible_issues && result.possible_issues.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Possible issues
                </h4>
                <ul className="space-y-2">
                  {result.possible_issues.map((p, i) => (
                    <li key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{p.title}</p>
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {p.likelihood}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.next_steps && result.next_steps.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Next steps
                </h4>
                <ol className="space-y-1.5 text-sm">
                  {result.next_steps.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-bold text-primary">{i + 1}.</span>
                      <span>
                        <strong>{s.step}</strong>
                        {s.detail && <span className="text-muted-foreground"> — {s.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {result.questions_to_narrow && result.questions_to_narrow.length > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <h4 className="mb-1 text-xs font-semibold text-primary">
                  Help me narrow it down
                </h4>
                <ul className="list-disc pl-4 text-xs">
                  {result.questions_to_narrow.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>
            )}

            {result.professional_recommended && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
                <Sparkles className="mb-1 inline h-4 w-4 text-warning" /> A professional check-up is
                recommended.
              </div>
            )}

            {result.safety && result.safety.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <h4 className="text-xs font-semibold text-destructive">Safety</h4>
                <ul className="mt-1 list-disc pl-4 text-xs">
                  {result.safety.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Real-world insights — pluggable knowledge layer */}
      {result && result.possible_issues && result.possible_issues.length > 0 && (
        <RealWorldInsights
          context={{
            topic: "symptom",
            issue:
              result.possible_issues[0].title ||
              symptoms ||
              result.summary ||
              "",
            component: result.possible_issues[0].system ?? null,
            severity:
              (["info", "low", "medium", "high", "critical"].includes(result.severity)
                ? result.severity
                : "medium") as Severity,
            vehicle: vehicle.make
              ? {
                  year: vehicle.year ? Number(vehicle.year) : null,
                  make: vehicle.make,
                  model: vehicle.model,
                  mileage_km: null,
                }
              : (activeVehicle ?? null),
          }}
        />
      )}
    </AppShell>
  );
}

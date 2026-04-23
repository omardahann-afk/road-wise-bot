import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Sparkles, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { callAi } from "@/lib/ai";
import { lookupObd2, inferObd2Stub, type Obd2Entry } from "@/lib/obd2-dataset";
import { estimateRepairCost } from "@/lib/pricing";
import { Obd2ResultCard } from "@/components/diagnostics/obd2-result-card";
import { RepairPricingCard } from "@/components/diagnostics/repair-pricing-card";

export const Route = createFileRoute("/diagnose/obd2")({
  component: Obd2Lookup,
});

interface AiObd2Result {
  summary: string;
  severity?: string;
  likely_causes?: string[];
  diy_steps?: { step: string; detail: string; warning?: string }[];
  tools_needed?: string[];
  professional_recommended?: boolean;
  safety?: string[];
}

const POPULAR = ["P0301", "P0420", "P0171", "P0700", "P0455", "P0128"];

function Obd2Lookup() {
  const [code, setCode] = useState("");
  const [grounded, setGrounded] = useState<{ entry: Obd2Entry; fromAi: boolean } | null>(null);
  const [aiResult, setAiResult] = useState<AiObd2Result | null>(null);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();

  async function lookup(rawCode?: string, e?: React.FormEvent) {
    e?.preventDefault();
    const q = (rawCode ?? code).trim().toUpperCase();
    if (!q) return;
    setBusy(true);
    setAiResult(null);
    setGrounded(null);

    try {
      // STEP 1 — DETERMINISTIC LOOKUP (local dataset truth)
      let entry = lookupObd2(q);
      let fromAi = false;
      if (!entry) {
        // STEP 2 — Heuristic stub from prefix (still deterministic structure)
        const stub = inferObd2Stub(q);
        if (!stub) {
          toast.error("Invalid code — must be P/B/C/U followed by 4 digits.");
          return;
        }
        entry = stub;
        fromAi = true;
      }
      setGrounded({ entry, fromAi });

      // STEP 3 — AI ENRICHMENT ONLY (never overrides title/severity/system/drivable)
      try {
        const result = await callAi<AiObd2Result>("obd2", {
          code: q,
          // Pass deterministic ground truth so AI grounds its explanation on it.
          grounded_truth: entry,
        });
        setAiResult(result);

        if (user) {
          // Persist deterministic pricing snapshot so history can show cost impact.
          const pricingSnapshot = estimateRepairCost({
            issue_type: entry.pricing_issue,
            severity: entry.severity,
            region: "canada",
          });
          await supabase.from("diagnostics").insert({
            user_id: user.id,
            mode: "obd2",
            input: { code: q } as never,
            ai_output: { grounded: entry, ai: result, pricing: pricingSnapshot } as never,
            severity: entry.severity,
            summary: `${entry.code} — ${entry.title}`,
          });
        }
      } catch (aiErr) {
        // AI failed — deterministic result still shows.
        console.warn("AI enrichment failed, using deterministic only:", aiErr);
        toast.info("Showing offline data. AI enrichment unavailable right now.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  // Deterministic pricing comes from the grounded entry's pricing_issue mapping.
  const pricing = grounded
    ? estimateRepairCost({
        issue_type: grounded.entry.pricing_issue,
        severity: grounded.entry.severity,
        region: "canada",
      })
    : null;

  return (
    <AppShell title="OBD2 Lookup">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">OBD2 Code Lookup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deterministic dataset first. AI explains and adds DIY steps. Severity and drivability are
          never overridden by AI.
        </p>
      </div>

      <form onSubmit={(e) => lookup(undefined, e)} className="mb-3 flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="P0301"
          autoCapitalize="characters"
          maxLength={8}
          className="font-mono uppercase tracking-wider"
        />
        <Button type="submit" disabled={busy || !code.trim()} className="shadow-glow">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
          Look up
        </Button>
      </form>

      {/* Popular codes */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {POPULAR.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => { setCode(p); lookup(p); }}
            className="rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 font-mono text-[11px] hover:border-primary/40 hover:text-primary"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Deterministic grounded card */}
      {grounded && (
        <div className="mb-4">
          <Obd2ResultCard entry={grounded.entry} fromAi={grounded.fromAi} />
        </div>
      )}

      {/* Pricing card */}
      {pricing && (
        <div className="mb-4">
          <RepairPricingCard pricing={pricing} title="Repair pricing for this code" />
        </div>
      )}

      {/* AI enrichment */}
      {aiResult && (
        <Card className="bg-gradient-card shadow-card">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                AI Explanation
              </span>
            </div>
            <p className="text-sm">{aiResult.summary}</p>

            {aiResult.likely_causes && aiResult.likely_causes.length > 0 && (
              <Section title="Likely causes (AI)">
                <ul className="list-disc space-y-1 pl-4 text-sm">
                  {aiResult.likely_causes.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </Section>
            )}

            {aiResult.diy_steps && aiResult.diy_steps.length > 0 && (
              <Section title="DIY steps">
                <ol className="space-y-2">
                  {aiResult.diy_steps.map((s, i) => (
                    <li key={i} className="rounded-lg border border-border/60 bg-background/40 p-3">
                      <div className="flex items-start gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{s.step}</p>
                          {s.detail && <p className="mt-0.5 text-xs text-muted-foreground">{s.detail}</p>}
                          {s.warning && (
                            <p className="mt-1 rounded bg-warning/15 px-2 py-1 text-[11px] text-warning">
                              ⚠ {s.warning}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            {aiResult.tools_needed && aiResult.tools_needed.length > 0 && (
              <Section title="Tools needed">
                <div className="flex flex-wrap gap-1.5">
                  {aiResult.tools_needed.map((t, i) => (
                    <span key={i} className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px]">
                      {t}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {(aiResult.professional_recommended || (grounded && !grounded.entry.drivable)) && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
                <Sparkles className="mb-1 inline h-4 w-4 text-warning" /> Professional inspection
                recommended for this code.
              </div>
            )}

            {aiResult.safety && aiResult.safety.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <h4 className="text-xs font-semibold text-destructive">Safety</h4>
                <ul className="mt-1 list-disc pl-4 text-xs">
                  {aiResult.safety.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

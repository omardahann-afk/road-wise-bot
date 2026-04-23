import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { severityClass } from "@/lib/severity";
import { Obd2ResultCard } from "@/components/diagnostics/obd2-result-card";
import { RepairPricingCard } from "@/components/diagnostics/repair-pricing-card";
import type { Obd2Entry } from "@/lib/obd2-dataset";
import type { PricingResult } from "@/lib/pricing";
import { ArrowLeft, Camera, ScanLine, Stethoscope, Loader2, Sparkles, Wrench } from "lucide-react";

export const Route = createFileRoute("/history/diagnostic/$id")({
  component: DiagnosticDetailPage,
});

interface AiObd2 { summary?: string; likely_causes?: string[]; diy_steps?: { step: string; detail: string; warning?: string }[]; tools_needed?: string[]; safety?: string[]; }
interface AiSymptom { summary?: string; possible_issues?: { title: string; likelihood: string; description: string; system?: string }[]; next_steps?: { step: string; detail: string }[]; safety?: string[]; }
interface AiCamera { summary?: string; detected_issues?: { issue: string; severity?: string; location?: string; description?: string }[]; safety?: string[]; }

interface SavedDiagnostic {
  id: string;
  created_at: string;
  mode: "camera" | "obd2" | "symptom" | "inspection";
  summary: string | null;
  severity: string | null;
  input: Record<string, unknown>;
  ai_output: {
    grounded?: Obd2Entry;
    ai?: AiObd2 | AiSymptom | AiCamera;
    pricing?: PricingResult;
    // legacy: symptom inserts spread fields onto ai_output directly
    summary?: string;
    possible_issues?: AiSymptom["possible_issues"];
    next_steps?: AiSymptom["next_steps"];
    safety?: string[];
    detected_issues?: AiCamera["detected_issues"];
    likely_causes?: string[];
    diy_steps?: AiObd2["diy_steps"];
  } | null;
}

function DiagnosticDetailPage() {
  const { id } = useParams({ from: "/history/diagnostic/$id" });
  const { user, loading: authLoading } = useAuth();
  const [diag, setDiag] = useState<SavedDiagnostic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      const { data, error: e1 } = await supabase
        .from("diagnostics")
        .select("id,created_at,mode,summary,severity,input,ai_output")
        .eq("id", id)
        .maybeSingle();
      if (e1 || !data) setError(e1?.message ?? "Diagnostic not found.");
      else setDiag(data as unknown as SavedDiagnostic);
      setLoading(false);
    })();
  }, [id, user, authLoading]);

  const ModeIcon = diag?.mode === "camera" ? Camera : diag?.mode === "obd2" ? ScanLine : Stethoscope;
  const grounded = diag?.ai_output?.grounded;
  const pricing = diag?.ai_output?.pricing;
  // OBD2 enrichment lives at ai_output.ai for new inserts
  const ai = (diag?.ai_output?.ai ?? diag?.ai_output) as (AiObd2 & AiSymptom & AiCamera) | undefined;

  return (
    <AppShell title="Diagnostic Report">

      {!user && !authLoading && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Sign in to view this report.</CardContent></Card>
      )}
      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      )}
      {error && !loading && (
        <Card><CardContent className="p-6 text-center text-sm text-destructive">{error}</CardContent></Card>
      )}

      {diag && !loading && (
        <>
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-primary/5 text-primary">
              <ModeIcon className="h-6 w-6" />
            </div>
            <div>
              <Badge variant="outline" className="mb-1 text-[10px] uppercase">{diag.mode} · {new Date(diag.created_at).toLocaleDateString()}</Badge>
              <h1 className="text-xl font-bold tracking-tight">{diag.summary ?? "Diagnostic"}</h1>
              {diag.severity && (
                <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${severityClass(diag.severity)}`}>
                  {diag.severity}
                </span>
              )}
            </div>
          </div>

          {/* Input context */}
          {Object.keys(diag.input ?? {}).length > 0 && (
            <Card className="mb-4 bg-gradient-card">
              <CardContent className="p-4">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Input</h3>
                <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-muted-foreground">{JSON.stringify(diag.input, null, 2)}</pre>
              </CardContent>
            </Card>
          )}

          {/* OBD2 grounded card */}
          {grounded && (
            <div className="mb-4">
              <Obd2ResultCard entry={grounded} />
            </div>
          )}

          {/* Pricing snapshot */}
          {pricing && (
            <div className="mb-4">
              <RepairPricingCard pricing={pricing} title="Repair pricing snapshot" />
            </div>
          )}

          {/* AI enrichment */}
          {ai && (
            <Card className="mb-4 bg-gradient-card shadow-card">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">AI Explanation</span>
                </div>
                {ai.summary && <p className="text-sm">{ai.summary}</p>}

                {ai.possible_issues && ai.possible_issues.length > 0 && (
                  <Section title="Possible issues">
                    <ul className="space-y-1.5">
                      {ai.possible_issues.map((p, i) => (
                        <li key={i} className="rounded-lg border border-border/60 bg-background/40 p-2.5">
                          <div className="flex items-center justify-between"><span className="text-sm font-medium">{p.title}</span><span className="text-[10px] uppercase text-muted-foreground">{p.likelihood}</span></div>
                          <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {ai.detected_issues && ai.detected_issues.length > 0 && (
                  <Section title="Detected issues">
                    <ul className="space-y-1.5">
                      {ai.detected_issues.map((d, i) => (
                        <li key={i} className="rounded-lg border border-border/60 bg-background/40 p-2.5 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{d.issue}</span>
                            {d.severity && <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase ${severityClass(d.severity)}`}>{d.severity}</span>}
                          </div>
                          {d.location && <p className="mt-0.5 text-[11px] text-muted-foreground">{d.location}</p>}
                          {d.description && <p className="mt-1 text-xs text-muted-foreground">{d.description}</p>}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {ai.likely_causes && ai.likely_causes.length > 0 && (
                  <Section title="Likely causes">
                    <ul className="list-disc space-y-1 pl-4 text-sm">
                      {ai.likely_causes.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </Section>
                )}

                {ai.next_steps && ai.next_steps.length > 0 && (
                  <Section title="Next steps">
                    <ol className="space-y-1.5 text-sm">
                      {ai.next_steps.map((s, i) => (
                        <li key={i} className="flex gap-2"><span className="font-bold text-primary">{i + 1}.</span><span><strong>{s.step}</strong>{s.detail && <span className="text-muted-foreground"> — {s.detail}</span>}</span></li>
                      ))}
                    </ol>
                  </Section>
                )}

                {ai.diy_steps && ai.diy_steps.length > 0 && (
                  <Section title="DIY steps">
                    <ol className="space-y-1.5">
                      {ai.diy_steps.map((s, i) => (
                        <li key={i} className="rounded-lg border border-border/60 bg-background/40 p-2.5">
                          <p className="text-sm font-medium">{i + 1}. {s.step}</p>
                          {s.detail && <p className="mt-0.5 text-xs text-muted-foreground">{s.detail}</p>}
                          {s.warning && <p className="mt-1 rounded bg-warning/15 px-2 py-1 text-[11px] text-warning">⚠ {s.warning}</p>}
                        </li>
                      ))}
                    </ol>
                  </Section>
                )}

                {ai.safety && ai.safety.length > 0 && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                    <h4 className="text-xs font-semibold text-destructive">Safety</h4>
                    <ul className="mt-1 list-disc pl-4 text-xs">
                      {ai.safety.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="mb-4 flex gap-2">
            <Button asChild variant="outline" className="flex-1">
              <Link to="/diagnose"><Stethoscope className="h-4 w-4" /> New diagnosis</Link>
            </Button>
            <Button asChild className="flex-1 shadow-glow">
              <Link to="/repair"><Wrench className="h-4 w-4" /> Repair workflows</Link>
            </Button>
          </div>

          <p className="pb-4 text-center text-[10px] text-muted-foreground">
            Deterministic data first; AI enrichment is advisory.
          </p>
        </>
      )}
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

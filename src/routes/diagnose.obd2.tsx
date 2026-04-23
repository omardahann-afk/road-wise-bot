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
import { severityClass } from "@/lib/severity";

export const Route = createFileRoute("/diagnose/obd2")({
  component: Obd2Lookup,
});

interface KnowledgeRow {
  key: string;
  title: string;
  body: Record<string, unknown>;
}

interface AiObd2Result {
  summary: string;
  severity: string;
  issues?: { code: string; title: string; description: string; system: string }[];
  likely_causes?: string[];
  diy_steps?: { step: string; detail: string; warning?: string }[];
  tools_needed?: string[];
  estimated_cost?: { low: number; high: number; currency: string };
  professional_recommended?: boolean;
  safety?: string[];
}

function Obd2Lookup() {
  const [code, setCode] = useState("");
  const [knowledge, setKnowledge] = useState<KnowledgeRow | null>(null);
  const [aiResult, setAiResult] = useState<AiObd2Result | null>(null);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();

  async function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    const q = code.trim().toUpperCase();
    if (!q) return;
    setBusy(true);
    setAiResult(null);
    setKnowledge(null);
    try {
      // 1. Hit local dataset
      const { data, error } = await supabase
        .from("knowledge_sources")
        .select("key,title,body")
        .eq("source_type", "obd2")
        .eq("key", q)
        .maybeSingle();
      if (error) throw error;
      const row = data
        ? { key: data.key, title: data.title, body: data.body as Record<string, unknown> }
        : null;
      setKnowledge(row);

      // 2. Ask AI to enrich/explain
      const result = await callAi<AiObd2Result>("obd2", { code: q, local_record: row });
      setAiResult(result);

      if (user) {
        await supabase.from("diagnostics").insert({
          user_id: user.id,
          mode: "obd2",
          input: { code: q },
          ai_output: result as never,
          severity:
            (["info", "low", "medium", "high", "critical"].includes(result.severity)
              ? result.severity
              : "medium") as "info" | "low" | "medium" | "high" | "critical",
          summary: result.summary,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="OBD2 Lookup">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">OBD2 Code Lookup</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Enter any P/B/C/U code (e.g. <code>P0301</code>). We combine an offline dataset with AI
        explanation.
      </p>

      <form onSubmit={lookup} className="mb-4 flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="P0301"
          autoCapitalize="characters"
          maxLength={8}
          className="font-mono uppercase tracking-wider"
        />
        <Button type="submit" disabled={busy || !code.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
          Look up
        </Button>
      </form>

      {knowledge && (
        <Card className="mb-4">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">
                <span className="font-mono">{knowledge.key}</span> — {knowledge.title}
              </h3>
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                local
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {(knowledge.body as { description?: string }).description}
            </p>
          </CardContent>
        </Card>
      )}

      {aiResult && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm">{aiResult.summary}</p>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityClass(aiResult.severity)}`}
              >
                {aiResult.severity ?? "—"}
              </span>
            </div>

            {aiResult.likely_causes && aiResult.likely_causes.length > 0 && (
              <Section title="Likely causes">
                <ul className="list-disc space-y-1 pl-4 text-sm">
                  {aiResult.likely_causes.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </Section>
            )}

            {aiResult.diy_steps && aiResult.diy_steps.length > 0 && (
              <Section title="DIY steps">
                <ol className="space-y-2">
                  {aiResult.diy_steps.map((s, i) => (
                    <li key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="flex items-start gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{s.step}</p>
                          {s.detail && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{s.detail}</p>
                          )}
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
                    <span key={i} className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px]">
                      {t}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {aiResult.estimated_cost && (
              <Section title="Estimated cost">
                <p className="text-sm">
                  ${aiResult.estimated_cost.low}–${aiResult.estimated_cost.high}{" "}
                  <span className="text-xs text-muted-foreground">
                    {aiResult.estimated_cost.currency}
                  </span>
                </p>
              </Section>
            )}

            {aiResult.professional_recommended && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
                <Sparkles className="mb-1 inline h-4 w-4 text-warning" /> A professional inspection
                is recommended for this issue.
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

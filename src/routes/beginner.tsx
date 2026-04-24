import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  GraduationCap,
  Lightbulb,
  Cog,
  CircleDot,
  Droplet,
  BatteryFull,
  Disc3,
  ShieldAlert,
  Sparkles,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { BEGINNER_TOPICS, getBeginnerTopic, type BeginnerTopicId } from "@/lib/beginner-content";
import { callAi } from "@/lib/ai";

export const Route = createFileRoute("/beginner")({
  component: BeginnerMode,
});

const TOPIC_ICONS: Record<BeginnerTopicId, React.ComponentType<{ className?: string }>> = {
  dashboard_lights: Lightbulb,
  engine_basics: Cog,
  tires: CircleDot,
  fluids: Droplet,
  battery: BatteryFull,
  brakes: Disc3,
};

interface BeginnerExplanation {
  plain_english: string;
  analogy?: string;
  step_by_step?: string[];
  watch_outs?: string[];
}

function BeginnerMode() {
  const [topicId, setTopicId] = useState<BeginnerTopicId>("dashboard_lights");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<BeginnerExplanation | null>(null);
  const topic = useMemo(() => getBeginnerTopic(topicId), [topicId]);
  const Icon = TOPIC_ICONS[topic.id];

  async function explainLikeImNew() {
    setAiBusy(true);
    setAiResult(null);
    try {
      const result = await callAi<BeginnerExplanation>("symptom", {
        beginner_topic: topic.title,
        topic_summary: topic.what,
        instruction:
          "The user is brand-new to cars. Re-explain this topic in plain language, " +
          "give a relatable analogy, then list 3-5 simple steps they could do themselves, " +
          "and 2-3 things to watch out for. Return JSON only with shape: " +
          "{ plain_english: string, analogy: string, step_by_step: string[], watch_outs: string[] }.",
      });
      setAiResult(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate explanation");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <AppShell title="Beginner mode" showBack>
      <section className="mb-6">
        <Badge variant="outline" className="mb-3 border-primary/40 bg-primary/10 text-primary">
          <GraduationCap className="mr-1 h-3 w-3" /> Beginner mode
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">Learn your car</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The six basics every owner should understand — written for new drivers, not mechanics.
        </p>
      </section>

      {/* Topic selector */}
      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Topics
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {BEGINNER_TOPICS.map((t) => {
            const TopicIcon = TOPIC_ICONS[t.id];
            const active = t.id === topicId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTopicId(t.id);
                  setAiResult(null);
                }}
                className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition-all ${
                  active
                    ? "border-primary/50 bg-primary/10 shadow-glow"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    active
                      ? "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground"
                      : "bg-accent text-accent-foreground"
                  }`}
                >
                  <TopicIcon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{t.title}</div>
                  <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                    {t.tagline}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Topic detail */}
      <Card className="mb-4">
        <CardContent className="space-y-5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">{topic.title}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{topic.tagline}</p>
            </div>
          </div>

          <div className="space-y-3">
            <Section title="What it is">
              <p className="text-sm leading-relaxed text-foreground">{topic.what}</p>
            </Section>
            <Section title="Why it matters">
              <p className="text-sm leading-relaxed text-foreground">{topic.why}</p>
            </Section>
          </div>

          <Section title="What you can check yourself">
            <div className="space-y-2">
              {topic.checks.map((c) => (
                <div
                  key={c.title}
                  className="rounded-xl border border-border bg-muted/30 p-3"
                >
                  <div className="text-sm font-semibold text-foreground">{c.title}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{c.detail}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Stop and get help if you see…">
            <div className="rounded-xl border border-warning/30 bg-warning/10 p-3">
              <ul className="space-y-1.5">
                {topic.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-2 text-sm text-foreground">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          <Section title="Glossary">
            <dl className="space-y-1.5">
              {topic.glossary.map((g) => (
                <div
                  key={g.term}
                  className="rounded-lg border border-border bg-background/40 px-3 py-2 text-xs"
                >
                  <dt className="font-semibold text-foreground">{g.term}</dt>
                  <dd className="text-muted-foreground">{g.meaning}</dd>
                </div>
              ))}
            </dl>
          </Section>

          {/* AI helper */}
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-4">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4" />
              <h3 className="text-sm font-bold">Explain like I'm new</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Ask AI to re-explain this topic in plain language with an analogy and a quick checklist.
            </p>
            <Button
              className="mt-3 w-full"
              onClick={explainLikeImNew}
              disabled={aiBusy}
            >
              {aiBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Explaining…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Explain in plain English
                </>
              )}
            </Button>

            {aiResult && (
              <div className="mt-4 space-y-3 rounded-xl border border-border bg-background/60 p-4">
                <p className="text-sm leading-relaxed">{aiResult.plain_english}</p>
                {aiResult.analogy && (
                  <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs italic text-muted-foreground">
                    <strong className="not-italic text-foreground">Think of it like:</strong>{" "}
                    {aiResult.analogy}
                  </p>
                )}
                {aiResult.step_by_step && aiResult.step_by_step.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Step by step
                    </h4>
                    <ol className="mt-1.5 space-y-1.5 pl-4 text-sm">
                      {aiResult.step_by_step.map((step, i) => (
                        <li key={i} className="list-decimal">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {aiResult.watch_outs && aiResult.watch_outs.length > 0 && (
                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                    <h4 className="text-xs font-semibold text-warning">Watch out for</h4>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                      {aiResult.watch_outs.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

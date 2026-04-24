import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ShieldAlert,
  Wrench,
  Sparkles,
  PartyPopper,
  Camera,
  Save,
} from "lucide-react";
import {
  type EngineStep,
  type RepairProgress,
  loadProgress,
  saveProgress,
  clearProgress,
  fetchRemoteProgress,
  pushRemoteProgress,
} from "@/lib/repair-engine";
import type { RepairWorkflow } from "@/lib/valuation";

/**
 * Step Engine — checklist-style, navigable repair walkthrough.
 *
 * - Persists progress per (workflow, issue) in localStorage so users can resume.
 * - Syncs progress to the `sessions` table for cross-device resume when a
 *   userId is provided. Local writes are debounced before being pushed up.
 * - Shows step number, title, instruction, why it matters, tools, warnings.
 * - Visible progress bar + Next / Back / Mark complete CTAs.
 */
export function StepEngine({
  workflow,
  issue,
  steps,
  userId,
  vehicleId,
  onAllComplete,
}: {
  workflow: RepairWorkflow;
  issue?: string;
  steps: EngineStep[];
  /** When provided, progress also syncs to the database for cross-device resume. */
  userId?: string | null;
  /** Optional vehicle scope so progress is tracked per vehicle. */
  vehicleId?: string | null;
  onAllComplete?: () => void;
}) {
  const total = steps.length;
  const initial = useMemo<RepairProgress>(() => {
    const loaded = loadProgress(workflow, issue);
    if (loaded && loaded.total === total) return loaded;
    return { workflow, issue, current_index: 0, completed: [], total, updated_at: Date.now() };
  }, [workflow, issue, total]);

  const [progress, setProgress] = useState<RepairProgress>(initial);
  const [syncedRemote, setSyncedRemote] = useState(false);

  // On mount: try to pull a fresher copy from the server. Server wins if newer
  // than the local copy — this is what enables cross-device resume.
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setSyncedRemote(true);
      return;
    }
    (async () => {
      const remote = await fetchRemoteProgress(userId, workflow, issue, vehicleId ?? null);
      if (cancelled) return;
      if (remote && remote.total === total && remote.updated_at > progress.updated_at) {
        setProgress(remote);
        saveProgress(remote);
      }
      setSyncedRemote(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, workflow, issue, vehicleId, total]);

  // Local persistence — instant, every change.
  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  // Remote sync — debounced. Only after we've reconciled with the server once.
  useEffect(() => {
    if (!userId || !syncedRemote) return;
    const t = window.setTimeout(() => {
      void pushRemoteProgress(userId, progress, vehicleId ?? null);
    }, 600);
    return () => window.clearTimeout(t);
  }, [progress, userId, vehicleId, syncedRemote]);

  const idx = Math.min(progress.current_index, total - 1);
  const step = steps[idx];
  const completed = progress.completed.includes(idx);
  const allDone = progress.completed.length >= total;
  const pct = Math.round((progress.completed.length / total) * 100);

  function markComplete() {
    setProgress((p) => {
      const next = new Set(p.completed);
      next.add(idx);
      const allDone = next.size >= total;
      if (allDone) onAllComplete?.();
      return { ...p, completed: Array.from(next) };
    });
  }

  function goNext() {
    if (!progress.completed.includes(idx)) {
      // auto-mark on next so the bar advances
      setProgress((p) => {
        const next = new Set(p.completed);
        next.add(idx);
        return {
          ...p,
          completed: Array.from(next),
          current_index: Math.min(total - 1, idx + 1),
        };
      });
    } else {
      setProgress((p) => ({ ...p, current_index: Math.min(total - 1, idx + 1) }));
    }
  }

  function goPrev() {
    setProgress((p) => ({ ...p, current_index: Math.max(0, idx - 1) }));
  }

  function reset() {
    clearProgress(workflow, issue);
    setProgress({ workflow, issue, current_index: 0, completed: [], total, updated_at: Date.now() });
  }

  if (!step) return null;

  return (
    <div className="space-y-4">
      {/* Progress + meta header */}
      <Card className="bg-gradient-elevated shadow-card">
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                Repair engine
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              Step {idx + 1} / {total} · {pct}% complete
            </div>
          </div>
          <Progress value={pct} className="h-1.5" />
          {/* Progress motivation line — keeps users moving, not just reading */}
          <p className="mt-2 text-[11px] font-medium text-primary/90">
            {motivationLine(progress.completed.length, total)}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {steps.map((_, i) => {
              const isDone = progress.completed.includes(i);
              const isActive = i === idx;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setProgress((p) => ({ ...p, current_index: i }))}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] font-bold transition-all ${
                    isActive
                      ? "border-primary bg-primary text-primary-foreground shadow-glow"
                      : isDone
                        ? "border-success/40 bg-success/15 text-success"
                        : "border-border/60 bg-background/30 text-muted-foreground hover:border-primary/40"
                  }`}
                  aria-label={`Go to step ${i + 1}`}
                >
                  {isDone && !isActive ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </button>
              );
            })}
          </div>
          {progress.completed.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="mt-3 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" /> Reset progress
            </button>
          )}
        </CardContent>
      </Card>

      {/* Active step card */}
      <Card className={`border-2 ${completed ? "border-success/40 bg-success/5" : "border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card"}`}>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-base font-black shadow-glow ${
              completed
                ? "bg-success text-success-foreground"
                : "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground"
            }`}>
              {completed ? <Check className="h-5 w-5" /> : step.step_number}
            </div>
            <div className="flex-1">
              <Badge variant="outline" className="mb-1 text-[10px]">
                Step {step.step_number} of {total}
              </Badge>
              <h3 className="text-lg font-bold leading-tight">{step.title}</h3>
            </div>
          </div>

          <p className="text-sm text-foreground/90">{step.instruction}</p>

          {step.why_it_matters && (
            <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <h4 className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                <Sparkles className="h-3 w-3" /> Why it matters
              </h4>
              <p className="text-xs">{step.why_it_matters}</p>
            </div>
          )}

          {step.tools && step.tools.length > 0 && (
            <div className="mt-3">
              <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Tools required
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {step.tools.map((t, i) => (
                  <span key={i} className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px]">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {step.warning && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-warning">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-xs">{step.warning}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CTAs — sticky above the bottom nav, fits 320px screens */}
      <div className="sticky bottom-20 z-10 -mx-1 flex items-stretch gap-1.5 rounded-2xl border border-border bg-card/95 p-1.5 shadow-card backdrop-blur sm:gap-2 sm:p-2">
        <Button variant="outline" size="sm" onClick={goPrev} disabled={idx === 0} aria-label="Previous step" className="px-2 sm:px-3">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant={completed ? "secondary" : "outline"}
          size="sm"
          onClick={markComplete}
          disabled={completed}
          className={`px-2 sm:px-3 ${completed ? "" : "border-success/40 text-success hover:bg-success/10"}`}
        >
          <Check className="h-4 w-4" />
          <span className="ml-1 text-xs sm:text-sm">{completed ? "Done" : "Mark"}</span>
        </Button>
        <Button size="sm" className="flex-1 shadow-glow" onClick={goNext} disabled={idx >= total - 1 && completed}>
          {idx >= total - 1 ? "Finish" : "Next step"} <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {allDone && (
        <Card className="border-success/40 bg-gradient-to-br from-success/15 via-card to-card shadow-glow">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-success/20 text-success">
                <PartyPopper className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-success">Nice work — this issue should now be resolved</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Verify the repair matches the original symptom and take a photo for your records.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild size="sm" className="w-full">
                <Link to="/diagnose">
                  <Camera className="h-4 w-4" /> Scan again
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link to="/history">
                  <Save className="h-4 w-4" /> Save report
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Friendly progress motivation line that updates as the user advances.
 * Keeps users moving — small wins matter on a long repair.
 */
function motivationLine(done: number, total: number): string {
  if (total === 0) return "Let's get started.";
  if (done === 0) return "Let's walk through it — one step at a time.";
  if (done === total) return "All steps complete — nice work.";
  const pct = done / total;
  if (done === total - 1) return "Final step — almost there.";
  if (pct >= 0.66) return "You're in the home stretch — keep going.";
  if (pct >= 0.5) return "You're halfway done — great pace.";
  if (pct >= 0.33) return "Solid progress — you've got this.";
  return "Good start — keep going.";
}

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Hand, Sun, Footprints, ScanSearch, X, Check, ChevronRight } from "lucide-react";

const STORAGE_KEY = "autosage.walkthrough.dismissed.v1";

interface WalkStep {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}

const STEPS: WalkStep[] = [
  { icon: Footprints, title: "Walk around the car slowly", body: "Move at a relaxed pace and follow each guided step in order. We'll cover front, sides, rear, wheels, dashboard, and engine bay." },
  { icon: Hand,       title: "Hold the camera steady",     body: "A steady frame lets the AI detect scratches, dents, paint mismatch, and rust accurately." },
  { icon: Camera,     title: "Get close for damage checks", body: "When inspecting scratches, rust spots, or tire tread — move closer until the on-screen prompt confirms a good view." },
  { icon: Sun,        title: "Use good lighting",           body: "Daylight or a well-lit garage works best. Avoid direct sun glare on the panel you're inspecting." },
  { icon: ScanSearch, title: "Follow on-screen guidance",   body: "We'll show arrows, target areas, and confirmations as you go. Capture only when the overlay says 'good view'." },
];

export function shouldShowWalkthrough(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) !== "1";
}

export function markWalkthroughSeen() {
  if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "1");
}

export function resetWalkthrough() {
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
}

export function WalkthroughModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (dontShowAgain: boolean) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (open) setIdx(0);
  }, [open]);

  if (!open) return null;

  const step = STEPS[idx];
  const Icon = step.icon;
  const isLast = idx === STEPS.length - 1;

  function next() {
    if (isLast) onClose(dontShow);
    else setIdx(idx + 1);
  }
  function skip() {
    onClose(dontShow);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-md p-4 sm:items-center"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-primary/30 bg-gradient-elevated shadow-decision">
        {/* Top close */}
        <button
          type="button"
          onClick={skip}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground hover:text-foreground"
          aria-label="Skip walkthrough"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="grid-bg p-6 pt-10">
          <div className="mb-4 flex items-center gap-2">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  i <= idx ? "bg-primary" : "bg-border/60"
                }`}
              />
            ))}
          </div>

          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
            <Icon className="h-8 w-8" />
          </div>

          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Step {idx + 1} of {STEPS.length}
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{step.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
        </div>

        {/* Footer */}
        <div className="space-y-3 border-t border-border/60 bg-background/40 p-4">
          {isLast && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={dontShow}
                onChange={(e) => setDontShow(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-background"
              />
              Don't show this again
            </label>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={skip} className="flex-1">
              Skip
            </Button>
            <Button onClick={next} className="flex-1 shadow-glow">
              {isLast ? (
                <>
                  <Check className="h-4 w-4" /> Start inspection
                </>
              ) : (
                <>
                  Next <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

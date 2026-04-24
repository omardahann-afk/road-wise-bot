import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CameraAnalysisResult } from "@/components/diagnostics/camera-analysis-result";
import { CoachingOverlay } from "@/components/diagnostics/coaching-overlay";
import { useSmartCamera } from "@/hooks/use-smart-camera";
import {
  CLEANING_GUIDES,
  getCleaningGuide,
  matchCleaningArea,
  type CleaningAreaId,
} from "@/lib/cleaning-guides";
import { analyzeCameraPhoto, type AiCameraResult } from "@/lib/camera-analysis";
import {
  Sparkles,
  Camera,
  Loader2,
  RotateCcw,
  RefreshCw,
  Upload,
  ShieldAlert,
  ShieldCheck,
  Ban,
} from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({
  area: z.string().optional(),
  issue: z.string().optional(),
});

export const Route = createFileRoute("/cleaning")({
  validateSearch: (s) => searchSchema.parse(s),
  component: CleaningPage,
});

function CleaningPage() {
  const search = Route.useSearch();
  const initialArea = useMemo<CleaningAreaId>(
    () => matchCleaningArea(search.area ?? search.issue) ?? "interior",
    [search.area, search.issue],
  );
  const [selectedArea, setSelectedArea] = useState<CleaningAreaId>(initialArea);

  // If the deep-link param changes after mount, re-sync.
  useEffect(() => {
    setSelectedArea(initialArea);
  }, [initialArea]);
  const [aiBusy, setAiBusy] = useState(false);
  const [analysis, setAnalysis] = useState<AiCameraResult | null>(null);
  const guide = useMemo(() => getCleaningGuide(selectedArea), [selectedArea]);

  const {
    videoRef,
    overlayRef,
    captureCanvasRef,
    scratchCanvasRef,
    streaming,
    modelLoading,
    hint,
    liveInsights,
    capturedPreview,
    startStream,
    stopStream,
    flipCamera,
    captureFrame,
    loadUploadedImage,
    clearCapturedPreview,
  } = useSmartCamera(guide.cameraStepId);

  async function handleAnalyzeCapture() {
    const payload = captureFrame();
    if (!payload) {
      toast.error("Camera not ready yet — give it a moment.");
      return;
    }

    if (hint?.tone === "bad") {
      toast.warning(hint.message);
    }

    setAnalysis(null);
    setAiBusy(true);
    try {
      const result = await analyzeCameraPhoto({
        dataUrl: payload.dataUrl,
        detections: payload.detections,
        area: guide.title,
        goal: "cleaning",
        notes:
          `User wants to clean the ${guide.title.toLowerCase()} of their car. ` +
          `Identify the actual material visible (leather, fabric, plastic, painted clear-coat, alloy, glass, rubber, etc.). ` +
          `Return a "cleaning" object with: material, risk_level (low|medium|high), safe_products (array), unsafe_products (array of items to AVOID), and cleaning_steps (ordered array). ` +
          `Be honest if confidence is low — ask for a clearer photo instead of guessing.`,
      });
      setAnalysis(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI analysis failed");
    } finally {
      setAiBusy(false);
    }
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    try {
      const payload = await loadUploadedImage(file);
      setAnalysis(null);
      setAiBusy(true);
      const result = await analyzeCameraPhoto({
        dataUrl: payload.dataUrl,
        detections: payload.detections,
        area: guide.title,
        goal: "cleaning",
        notes:
          `User uploaded a photo of the ${guide.title.toLowerCase()} for cleaning guidance. ` +
          `Identify the actual material visible. Return a "cleaning" object with material, risk_level, safe_products, unsafe_products, and cleaning_steps. ` +
          `If the photo is unclear, ask for a cleaner recapture instead of guessing.`,
      });
      setAnalysis(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not analyze uploaded photo");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <AppShell title="Cleaning" showBack>
      <div className="mb-6">
        <Badge variant="outline" className="mb-3 border-primary/40 bg-primary/10 text-primary">
          <Sparkles className="mr-1 h-3 w-3" /> Cleaning & Care
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">Clean with confidence</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick an area, follow the manual guide, or capture a photo for cleaning-specific guidance.
        </p>
      </div>

      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Select an area
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {CLEANING_GUIDES.map((area) => {
            const active = area.id === selectedArea;
            return (
              <button
                key={area.id}
                type="button"
                onClick={() => {
                  setSelectedArea(area.id);
                  setAnalysis(null);
                  clearCapturedPreview();
                }}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  active
                    ? "border-primary/50 bg-primary/10 shadow-glow"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <div className="text-sm font-semibold text-foreground">{area.title}</div>
                <p className="mt-1 text-[11px] text-muted-foreground">{area.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">{guide.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{guide.description}</p>
          </div>

          <div className="relative mb-4 aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-black">
            <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
            <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
            <canvas ref={captureCanvasRef} className="hidden" />
            <canvas ref={scratchCanvasRef} className="hidden" />

            {streaming && !capturedPreview && <CoachingOverlay hint={hint} />}

            {capturedPreview && (
              <img
                src={capturedPreview}
                alt="Captured cleaning area"
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}

            {!streaming && !capturedPreview && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center">
                <Camera className="h-10 w-10 text-primary" />
                <p className="text-sm text-foreground">
                  Open the camera or upload a photo for tailored cleaning guidance.
                </p>
                <div className="flex w-full flex-col gap-2 sm:flex-row">
                  <Button onClick={() => startStream()} disabled={modelLoading} className="flex-1">
                    {modelLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading vision…
                      </>
                    ) : (
                      <>
                        <Camera className="h-4 w-4" /> Start camera
                      </>
                    )}
                  </Button>
                  <Button asChild variant="outline" className="flex-1">
                    <label>
                      <Upload className="h-4 w-4" /> Upload photo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => handleUpload(event.target.files?.[0] ?? null)}
                      />
                    </label>
                  </Button>
                </div>
              </div>
            )}

            {streaming && !capturedPreview && (
              <div className="absolute right-3 top-3 flex gap-2">
                <Button size="icon" variant="secondary" onClick={() => void flipCamera()} aria-label="Flip camera">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {streaming && !capturedPreview && liveInsights.length > 0 && (
            <div className="mb-4 rounded-xl border border-border bg-muted/30 p-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Stable live hints
              </div>
              <div className="flex flex-wrap gap-1.5">
                {liveInsights.slice(0, 4).map((insight, index) => (
                  <span
                    key={`${insight.class}-${index}`}
                    className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px]"
                  >
                    {insight.label} · {insight.confidencePct}%
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Live labels are hints only. Final guidance is based on the captured photo.
              </p>
            </div>
          )}

          <div className="mb-4 flex flex-wrap gap-2">
            {streaming && !capturedPreview ? (
              <>
                <Button onClick={handleAnalyzeCapture} disabled={aiBusy} className="flex-1" size="lg">
                  {aiBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Analyze area
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={stopStream}>Stop</Button>
              </>
            ) : capturedPreview ? (
              <Button variant="outline" onClick={clearCapturedPreview} className="flex-1">
                <RefreshCw className="h-4 w-4" /> Clear photo
              </Button>
            ) : null}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5">
              <span className="font-semibold text-foreground">Material:</span>{" "}
              <span className="text-muted-foreground">{guide.material}</span>
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 font-semibold uppercase tracking-wider ${
                guide.riskLevel === "high"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : guide.riskLevel === "medium"
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-success/40 bg-success/10 text-success"
              }`}
            >
              {guide.riskLevel} risk
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <GuideBlock title="Tools" items={guide.tools} />
            <GuideBlock title="Safe products" items={guide.safeProducts} tone="success" />
          </div>

          <div className="mt-4">
            <GuideBlock title="Avoid these" items={guide.unsafeProducts} tone="destructive" />
          </div>

          <Card className="mt-4 border-warning/30 bg-warning/10">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2 text-warning">
                <ShieldAlert className="h-4 w-4" />
                <h3 className="text-sm font-semibold">Safety tips</h3>
              </div>
              <ul className="list-disc space-y-1 pl-4 text-sm text-foreground">
                {guide.safety.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="p-4">
          <h2 className="mb-3 text-lg font-semibold">Step-by-step process</h2>
          <ol className="space-y-3">
            {guide.steps.map((step, index) => (
              <li key={step.title} className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Step {index + 1}
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">{step.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{step.detail}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {analysis ? <CameraAnalysisResult result={analysis} label="Cleaning analysis" /> : null}
    </AppShell>
  );
}

function GuideBlock({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: string[];
  tone?: "default" | "success" | "destructive";
}) {
  const toneCls =
    tone === "success"
      ? "border-success/30 bg-success/5"
      : tone === "destructive"
      ? "border-destructive/30 bg-destructive/5"
      : "border-border bg-muted/30";
  const headingCls =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className={`rounded-xl border p-4 ${toneCls}`}>
      <h3 className={`text-sm font-semibold ${headingCls}`}>{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

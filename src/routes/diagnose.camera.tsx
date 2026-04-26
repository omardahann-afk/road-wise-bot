import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CameraAnalysisResult } from "@/components/diagnostics/camera-analysis-result";
import { CoachingOverlay } from "@/components/diagnostics/coaching-overlay";
import { LowVisibilityBadge } from "@/components/diagnostics/low-visibility-badge";
import { ManualDamageMark } from "@/components/diagnostics/manual-damage-mark";
import { useSmartCamera } from "@/hooks/use-smart-camera";
import { analyzeCameraPhoto, type AiCameraResult } from "@/lib/camera-analysis";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { recordLearningEvent } from "@/lib/learning";
import type { SurfaceVisibility } from "@/lib/camera-visibility";
import type { Finding } from "@/lib/valuation";
import { Trash2 } from "lucide-react";
import {
  Camera,
  RotateCcw,
  Sparkles,
  Loader2,
  RefreshCw,
  Upload,
  Crosshair,
  Sun,
  Hand,
  Search,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/diagnose/camera")({
  component: CameraDiagnose,
});

const FRAMING_TIPS = [
  { icon: Crosshair, text: "Center the part in the frame" },
  { icon: Hand, text: "Hold steady — let auto-focus settle" },
  { icon: Sun, text: "Avoid direct sunlight & strong glare" },
];

function CameraDiagnose() {
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<AiCameraResult | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savingReport, setSavingReport] = useState(false);
  const { user } = useAuth();

  const {
    videoRef,
    overlayRef,
    captureCanvasRef,
    scratchCanvasRef,
    streaming,
    modelLoading,
    hint,
    visibility,
    capturedPreview,
    startStream,
    stopStream,
    flipCamera,
    captureFrame,
    loadUploadedImage,
    clearCapturedPreview,
  } = useSmartCamera("front_exterior");

  async function runAnalysis(payload: { dataUrl: string; detections: { class: string; score: number }[]; visibility?: SurfaceVisibility | null }) {
    setAiResult(null);
    setSavedId(null);
    setAiBusy(true);
    try {
      const result = await analyzeCameraPhoto({
        dataUrl: payload.dataUrl,
        detections: payload.detections,
        goal: "diagnose",
        visibility: payload.visibility ?? null,
        notes:
          "User pointed camera at a part of their car for diagnosis. " +
          "Be honest if confidence is low — prefer asking the user to retake than guessing wrong. " +
          "When you do identify a part, also describe the most likely issue and an urgency level the user can act on.",
      });
      setAiResult(result);

      // Auto-save when confident, regardless of user action.
      if (user && result.overall_confidence !== "low") {
        await persistDiagnostic(result);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI analysis failed");
    } finally {
      setAiBusy(false);
    }
  }

  async function persistDiagnostic(result: AiCameraResult) {
    if (!user) return;
    setSavingReport(true);
    try {
      const { data, error } = await supabase
        .from("diagnostics")
        .insert({
          user_id: user.id,
          mode: "camera",
          input: { detected_objects: [] },
          ai_output: result as never,
          summary: result.summary,
        })
        .select("id")
        .single();
      if (error) throw error;
      setSavedId(data?.id ?? null);
    } catch (err) {
      console.error(err);
      toast.error("Could not save report");
    } finally {
      setSavingReport(false);
    }
  }

  async function handleAnalyzeCapture() {
    const payload = captureFrame();
    if (!payload) {
      toast.error("Camera not ready yet — give it a moment.");
      return;
    }
    if (hint?.tone === "bad") {
      toast.warning(hint.message);
    }
    await runAnalysis(payload);
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    try {
      const payload = await loadUploadedImage(file);
      await runAnalysis(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not analyze uploaded photo");
    }
  }

  function handleRetake() {
    setAiResult(null);
    setSavedId(null);
    clearCapturedPreview();
    if (!streaming) void startStream();
  }

  return (
    <AppShell title="Camera diagnose" showBack>
      <section className="mb-4">
        <Badge variant="outline" className="mb-2 border-primary/40 bg-primary/10 text-primary">
          <Camera className="mr-1 h-3 w-3" /> Capture & analyze
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight">Scan your car</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Frame the part, tap capture, and let AI identify it and suggest a next step.
        </p>
      </section>

      <div className="relative mb-4 aspect-[3/4] overflow-hidden rounded-3xl border border-border bg-black shadow-card">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover"
        />
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        <canvas ref={captureCanvasRef} className="hidden" />
        <canvas ref={scratchCanvasRef} className="hidden" />

        {/* Live coaching only when actively streaming pre-capture */}
        {streaming && !capturedPreview && <CoachingOverlay hint={hint} />}
        {streaming && !capturedPreview && <LowVisibilityBadge visibility={visibility} />}

        {/* Captured preview */}
        {capturedPreview && (
          <img
            src={capturedPreview}
            alt="Captured frame"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/* Idle state — clear "what to do" CTA */}
        {!streaming && !capturedPreview && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/75 p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 text-primary">
              <Camera className="h-7 w-7" />
            </div>
            <p className="max-w-[20rem] text-sm text-foreground">
              Open the camera and frame the part you have a question about, or upload a photo from your gallery.
            </p>
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Button onClick={() => void startStream()} disabled={modelLoading} className="flex-1">
                {modelLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading vision…
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4" /> Open camera
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
                    onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
                  />
                </label>
              </Button>
            </div>
          </div>
        )}

        {/* Camera flip during streaming */}
        {streaming && !capturedPreview && (
          <div className="absolute right-3 top-3 flex gap-2">
            <Button
              size="icon"
              variant="secondary"
              onClick={() => void flipCamera()}
              aria-label="Flip camera"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Analyzing overlay */}
        {aiBusy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/65 backdrop-blur-sm">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <span className="text-sm font-medium text-primary-foreground">Analyzing image…</span>
            <span className="text-[11px] text-muted-foreground">Usually under 5 seconds</span>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="mb-4 flex gap-2">
        {streaming && !capturedPreview ? (
          <>
            <Button
              onClick={() => void handleAnalyzeCapture()}
              disabled={aiBusy}
              className="flex-1 shadow-glow"
              size="lg"
            >
              {aiBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Capture & analyze
                </>
              )}
            </Button>
            <Button variant="outline" onClick={stopStream} aria-label="Stop camera">
              Stop
            </Button>
          </>
        ) : capturedPreview ? (
          <>
            <Button variant="outline" onClick={handleRetake} className="flex-1">
              <RefreshCw className="h-4 w-4" /> Retake photo
            </Button>
            {!aiResult && !aiBusy && (
              <Button
                onClick={() => {
                  void runAnalysis({
                    dataUrl: capturedPreview,
                    detections: [],
                  });
                }}
                className="flex-1 shadow-glow"
              >
                <Sparkles className="h-4 w-4" /> Re-analyze
              </Button>
            )}
          </>
        ) : null}
      </div>

      {/* Results */}
      {aiResult ? (
        <CameraAnalysisResult
          result={aiResult}
          label="Diagnosis"
          actions={{
            showRepair: true,
            showCleaning: true,
            onSave: user
              ? () => {
                  void persistDiagnostic(aiResult);
                }
              : undefined,
            saving: savingReport,
            saved: !!savedId,
          }}
        />
      ) : (
        // Pre-capture coaching tips card.
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-primary">
              <Search className="h-4 w-4" />
              <h2 className="text-sm font-semibold">Quick framing tips</h2>
            </div>
            <ul className="mt-3 space-y-2">
              {FRAMING_TIPS.map((tip) => {
                const Icon = tip.icon;
                return (
                  <li
                    key={tip.text}
                    className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm">{tip.text}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">
              The live preview is for framing only. The actual diagnosis comes from the captured photo —
              that's why the system asks you to tap capture.
            </p>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

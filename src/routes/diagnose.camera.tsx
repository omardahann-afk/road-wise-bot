import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CameraAnalysisResult } from "@/components/diagnostics/camera-analysis-result";
import { CoachingOverlay } from "@/components/diagnostics/coaching-overlay";
import { useSmartCamera } from "@/hooks/use-smart-camera";
import { analyzeCameraPhoto, type AiCameraResult } from "@/lib/camera-analysis";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Camera, RotateCcw, Sparkles, Loader2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/diagnose/camera")({
  component: CameraDiagnose,
});

function CameraDiagnose() {
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<AiCameraResult | null>(null);
  const { user } = useAuth();

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
  } = useSmartCamera("front_exterior");

  async function handleAnalyzeCapture() {
    const payload = captureFrame();
    if (!payload) {
      toast.error("Camera not ready yet — give it a moment.");
      return;
    }

    if (hint?.tone === "bad") {
      toast.warning(hint.message);
    }

    setAiResult(null);
    setAiBusy(true);
    try {
      const result = await analyzeCameraPhoto({
        dataUrl: payload.dataUrl,
        detections: payload.detections,
        goal: "diagnose",
        notes: "User pointed camera at a part of their car for diagnosis. Prefer an honest low-confidence response over guessing.",
      });
      setAiResult(result);

      if (user) {
        await supabase.from("diagnostics").insert({
          user_id: user.id,
          mode: "camera",
          input: { detected_objects: payload.detections },
          ai_output: result as never,
          summary: result.summary,
        });
      }
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
      setAiBusy(true);
      const result = await analyzeCameraPhoto({
        dataUrl: payload.dataUrl,
        detections: payload.detections,
        goal: "diagnose",
        notes: "User uploaded a photo of a car part for diagnosis. If unclear, instruct them to retake from a better angle or lighting.",
      });
      setAiResult(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not analyze uploaded photo");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <AppShell title="Live Camera" showBack>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Camera Diagnose</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Aim at a car part, follow the guidance overlay, then capture or upload a clear image for a stronger diagnosis.
      </p>

      <div className="relative mb-4 aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-black">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
        <canvas ref={captureCanvasRef} className="hidden" />
        <canvas ref={scratchCanvasRef} className="hidden" />

        {streaming && !capturedPreview && <CoachingOverlay hint={hint} />}

        {capturedPreview && (
          <img
            src={capturedPreview}
            alt="Captured diagnosis frame"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {!streaming && !capturedPreview && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center">
            <Camera className="h-10 w-10 text-primary" />
            <p className="text-sm text-foreground">
              Start the camera or upload a photo to analyze a specific area.
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
        <Card className="mb-4">
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Stable detections</h3>
            <div className="flex flex-wrap gap-1.5">
              {liveInsights.slice(0, 6).map((insight, index) => (
                <span
                  key={`${insight.class}-${index}`}
                  className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px]"
                >
                  {insight.label} · {insight.confidencePct}%
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Live detections are stabilized hints only. Final results come from the captured image.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex gap-2">
        {streaming && !capturedPreview ? (
          <>
            <Button onClick={handleAnalyzeCapture} disabled={aiBusy} className="flex-1" size="lg">
              {aiBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Capture & Analyze
                </>
              )}
            </Button>
            <Button variant="outline" onClick={stopStream}>
              Stop
            </Button>
          </>
        ) : capturedPreview ? (
          <Button onClick={clearCapturedPreview} variant="outline" className="flex-1">
            <RefreshCw className="h-4 w-4" /> Clear photo
          </Button>
        ) : null}
      </div>

      {aiResult ? <CameraAnalysisResult result={aiResult} /> : null}
    </AppShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, RotateCcw, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { callAi } from "@/lib/ai";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { severityClass } from "@/lib/severity";

export const Route = createFileRoute("/diagnose/camera")({
  component: CameraDiagnose,
});

interface Detection {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

interface AiCameraResult {
  summary: string;
  likely_components: { name: string; confidence: string; what_to_check: string[] }[];
  warnings: string[];
  next_action: string;
  follow_up_questions: string[];
}

function CameraDiagnose() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<unknown>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [detections, setDetections] = useState<Detection[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<AiCameraResult | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    return () => {
      stopStream();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        clearTimeout(rafRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ensureModel() {
    if (modelRef.current) return modelRef.current;
    setModelLoading(true);
    try {
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      modelRef.current = await cocoSsd.load({ base: "lite_mobilenet_v2" });
      return modelRef.current;
    } finally {
      setModelLoading(false);
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
  }

  async function startStream(facingMode: "environment" | "user" = facing) {
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setStreaming(true);
      await ensureModel();
      detectLoop();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not access camera. Check permissions.",
      );
    }
  }

  async function detectLoop() {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const model = modelRef.current as
      | { detect: (v: HTMLVideoElement) => Promise<Detection[]> }
      | null;
    if (!video || !overlay || !model || !streamRef.current) return;

    if (video.readyState >= 2) {
      // Match overlay size to video for stable bbox alignment
      if (overlay.width !== video.videoWidth) overlay.width = video.videoWidth;
      if (overlay.height !== video.videoHeight) overlay.height = video.videoHeight;
      try {
        const preds = await model.detect(video);
        // Filter low-confidence noise to reduce flicker
        const stable = preds.filter((p) => p.score >= 0.55);
        setDetections(stable);
        drawOverlay(overlay, stable);
      } catch (e) {
        console.error("detect error", e);
      }
    }
    // Throttle to ~6fps so the preview stays buttery and the bboxes don't jitter
    rafRef.current = window.setTimeout(
      () => requestAnimationFrame(detectLoop),
      160,
    ) as unknown as number;
  }

  function drawOverlay(overlay: HTMLCanvasElement, preds: Detection[]) {
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.lineWidth = 3;
    ctx.font = "16px sans-serif";
    preds.forEach((p) => {
      const [x, y, w, h] = p.bbox;
      ctx.strokeStyle = "rgba(255,180,60,0.95)";
      ctx.fillStyle = "rgba(255,180,60,0.18)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      const label = `${p.class} ${(p.score * 100).toFixed(0)}%`;
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(x, Math.max(0, y - 22), tw, 22);
      ctx.fillStyle = "rgba(255,200,90,1)";
      ctx.fillText(label, x + 5, Math.max(14, y - 6));
    });
  }

  async function captureAndAnalyze() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setAiBusy(true);
    try {
      const objects = detections.map((d) => ({ class: d.class, score: d.score }));
      const result = await callAi<AiCameraResult>("camera", {
        detected_objects: objects,
        notes: "User pointed camera at a part of their car for inspection.",
      });
      setAiResult(result);

      if (user) {
        await supabase.from("diagnostics").insert({
          user_id: user.id,
          mode: "camera",
          input: { detected_objects: objects },
          ai_output: result as never,
          summary: result.summary,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI analysis failed");
    } finally {
      setAiBusy(false);
    }
  }

  function flipCamera() {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    if (streaming) startStream(next);
  }

  return (
    <AppShell title="Live Camera">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Live Camera Diagnose</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Browser-side AI detects objects in real time. Tap Analyze for an AI-driven car-component
        interpretation.
      </p>

      <div className="relative mb-4 overflow-hidden rounded-2xl border border-border bg-black aspect-[3/4]">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />
        {!streaming && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-6 text-center">
            <Camera className="h-10 w-10 text-primary" />
            <p className="text-sm text-foreground">
              Grant camera permission to begin live detection.
            </p>
            <Button onClick={() => startStream()} disabled={modelLoading}>
              {modelLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading vision model…
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" /> Start camera
                </>
              )}
            </Button>
          </div>
        )}
        {streaming && (
          <div className="absolute right-3 top-3 flex gap-2">
            <Button size="icon" variant="secondary" onClick={flipCamera} aria-label="Flip camera">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {streaming && (
        <div className="mb-4 flex gap-2">
          <Button onClick={captureAndAnalyze} disabled={aiBusy} className="flex-1">
            {aiBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Analyze with AI
              </>
            )}
          </Button>
          <Button variant="outline" onClick={stopStream}>
            Stop
          </Button>
        </div>
      )}

      {detections.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Detected ({detections.length})</h3>
            <div className="flex flex-wrap gap-1.5">
              {detections.slice(0, 12).map((d, i) => (
                <span
                  key={i}
                  className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px]"
                >
                  {d.class} · {(d.score * 100).toFixed(0)}%
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {aiResult && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <span
                className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityClass("info")}`}
              >
                AI insight
              </span>
              <p className="mt-2 text-sm">{aiResult.summary}</p>
            </div>

            {aiResult.likely_components?.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Likely components
                </h4>
                <ul className="space-y-2">
                  {aiResult.likely_components.map((c, i) => (
                    <li key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{c.name}</span>
                        <span className="text-[11px] text-muted-foreground">{c.confidence}</span>
                      </div>
                      <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                        {c.what_to_check?.map((x, j) => <li key={j}>{x}</li>)}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aiResult.warnings?.length > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                <h4 className="text-xs font-semibold text-warning">Safety</h4>
                <ul className="mt-1 list-disc pl-4 text-xs">
                  {aiResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {aiResult.next_action && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Next action
                </h4>
                <p className="mt-1 text-sm">{aiResult.next_action}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

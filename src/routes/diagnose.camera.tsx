import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, RotateCcw, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { callAi } from "@/lib/ai";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { severityClass } from "@/lib/severity";
import { CoachingOverlay } from "@/components/diagnostics/coaching-overlay";
import {
  sampleFrameStats,
  coachForStep,
  type CoachingHint,
} from "@/lib/camera-coaching";

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
  overall_confidence?: "low" | "medium" | "high";
  image_quality?: {
    lighting?: "poor" | "ok" | "good";
    focus?: "poor" | "ok" | "good";
    framing?: "poor" | "ok" | "good";
  };
  likely_components: {
    name: string;
    confidence: string;
    what_to_check: string[];
    likely_issue?: string | null;
  }[];
  warnings: string[];
  next_action: string;
  recapture_tip?: string | null;
  follow_up_questions: string[];
}

const CONF_THRESHOLD = 0.65; // higher = fewer false labels
const SMOOTH_WINDOW = 5; // last N detection ticks
const STABLE_HITS = 3; // class must appear in >= N of last SMOOTH_WINDOW ticks

function CameraDiagnose() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<unknown>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopHandleRef = useRef<number | null>(null);
  const historyRef = useRef<Detection[][]>([]);
  const prevPixelsRef = useRef<Uint8ClampedArray | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [stableDetections, setStableDetections] = useState<Detection[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<AiCameraResult | null>(null);
  const [hint, setHint] = useState<CoachingHint | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    return () => {
      stopStream();
      if (loopHandleRef.current !== null) {
        clearTimeout(loopHandleRef.current);
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
    setHint(null);
  }

  async function startStream(facingMode: "environment" | "user" = facing) {
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      // Apply continuous-focus / continuous-exposure hints when supported.
      const track = stream.getVideoTracks()[0];
      try {
        const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
        const advanced: MediaTrackConstraintSet[] = [];
        if (Array.isArray(caps.focusMode) && (caps.focusMode as string[]).includes("continuous")) {
          advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
        }
        if (
          Array.isArray(caps.exposureMode) &&
          (caps.exposureMode as string[]).includes("continuous")
        ) {
          advanced.push({ exposureMode: "continuous" } as MediaTrackConstraintSet);
        }
        if (
          Array.isArray(caps.whiteBalanceMode) &&
          (caps.whiteBalanceMode as string[]).includes("continuous")
        ) {
          advanced.push({ whiteBalanceMode: "continuous" } as MediaTrackConstraintSet);
        }
        if (advanced.length) {
          await track.applyConstraints({ advanced });
        }
      } catch {
        /* not all browsers support advanced constraints */
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setStreaming(true);
      historyRef.current = [];
      prevPixelsRef.current = null;
      await ensureModel();
      detectLoop();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not access camera. Check permissions.",
      );
    }
  }

  /** Smooth labels: only show classes seen in >= STABLE_HITS of last SMOOTH_WINDOW ticks. */
  function smoothDetections(latest: Detection[]): Detection[] {
    const hist = historyRef.current;
    hist.push(latest);
    if (hist.length > SMOOTH_WINDOW) hist.shift();

    const counts = new Map<string, { hits: number; sumScore: number; latest: Detection }>();
    for (const tick of hist) {
      const seen = new Set<string>();
      for (const d of tick) {
        if (seen.has(d.class)) continue;
        seen.add(d.class);
        const cur = counts.get(d.class) ?? { hits: 0, sumScore: 0, latest: d };
        cur.hits += 1;
        cur.sumScore += d.score;
        cur.latest = d;
        counts.set(d.class, cur);
      }
    }

    return Array.from(counts.entries())
      .filter(([, v]) => v.hits >= STABLE_HITS)
      .sort((a, b) => b[1].sumScore - a[1].sumScore)
      .map(([, v]) => v.latest);
  }

  async function detectLoop() {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const scratch = scratchCanvasRef.current;
    const model = modelRef.current as
      | { detect: (v: HTMLVideoElement) => Promise<Detection[]> }
      | null;
    if (!video || !overlay || !model || !scratch || !streamRef.current) return;

    if (video.readyState >= 2 && video.videoWidth > 0) {
      if (overlay.width !== video.videoWidth) overlay.width = video.videoWidth;
      if (overlay.height !== video.videoHeight) overlay.height = video.videoHeight;
      try {
        const preds = await model.detect(video);
        const filtered = preds.filter((p) => p.score >= CONF_THRESHOLD);
        const stable = smoothDetections(filtered);
        setStableDetections(stable);
        drawOverlay(overlay, stable);

        // Coaching: derive frame stats and pick a hint.
        const sampled = sampleFrameStats(
          video,
          prevPixelsRef.current,
          filtered.map((p) => ({ bbox: p.bbox, class: p.class, score: p.score })),
          scratch,
        );
        prevPixelsRef.current = sampled.pixels;
        setHint(coachForStep("front_exterior", sampled.stats));
      } catch (e) {
        console.error("detect error", e);
      }
    }
    // ~5fps — stable, smooth, low CPU on phones
    loopHandleRef.current = window.setTimeout(() => detectLoop(), 200);
  }

  function drawOverlay(overlay: HTMLCanvasElement, preds: Detection[]) {
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.lineWidth = 3;
    ctx.font = "16px sans-serif";
    preds.forEach((p) => {
      const [x, y, w, h] = p.bbox;
      ctx.strokeStyle = "rgba(61, 169, 252, 0.95)";
      ctx.fillStyle = "rgba(61, 169, 252, 0.12)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      const label = `${p.class} ${(p.score * 100).toFixed(0)}%`;
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = "rgba(0,0,0,0.78)";
      ctx.fillRect(x, Math.max(0, y - 22), tw, 22);
      ctx.fillStyle = "rgba(34,211,154,1)";
      ctx.fillText(label, x + 5, Math.max(14, y - 6));
    });
  }

  /** Capture a high-quality still from the live video and send it to AI. */
  async function captureAndAnalyze() {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) {
      toast.error("Camera not ready yet — give it a moment.");
      return;
    }

    // Soft guard — if coaching says it's bad, warn but allow.
    if (hint?.tone === "bad") {
      toast.warning(hint.message);
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCapturedPreview(dataUrl);
    setAiResult(null);

    setAiBusy(true);
    try {
      const objects = stableDetections.map((d) => ({ class: d.class, score: d.score }));
      const result = await callAi<AiCameraResult>("camera", {
        detected_objects: objects,
        image_base64: dataUrl,
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

  function retake() {
    setCapturedPreview(null);
    setAiResult(null);
  }

  return (
    <AppShell title="Live Camera">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Camera Diagnose</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Aim at a car part. Follow the on-screen guidance, then capture a clear photo for an
        AI-powered inspection.
      </p>

      <div className="relative mb-4 aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-black">
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

        {streaming && !capturedPreview && <CoachingOverlay hint={hint} />}

        {capturedPreview && (
          <img
            src={capturedPreview}
            alt="Captured frame"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {!streaming && !capturedPreview && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center">
            <Camera className="h-10 w-10 text-primary" />
            <p className="text-sm text-foreground">
              Grant camera permission to begin.
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

        {streaming && !capturedPreview && (
          <div className="absolute right-3 top-3 flex gap-2">
            <Button size="icon" variant="secondary" onClick={flipCamera} aria-label="Flip camera">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {streaming && !capturedPreview && (
        <div className="mb-4 flex gap-2">
          <Button onClick={captureAndAnalyze} disabled={aiBusy} className="flex-1" size="lg">
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
        </div>
      )}

      {capturedPreview && (
        <div className="mb-4 flex gap-2">
          <Button onClick={retake} variant="outline" className="flex-1">
            <RefreshCw className="h-4 w-4" /> Retake
          </Button>
          {aiBusy && (
            <Button disabled className="flex-1">
              <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
            </Button>
          )}
        </div>
      )}

      {stableDetections.length > 0 && !capturedPreview && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Stable detections</h3>
            <div className="flex flex-wrap gap-1.5">
              {stableDetections.slice(0, 12).map((d, i) => (
                <span
                  key={i}
                  className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px]"
                >
                  {d.class} · {(d.score * 100).toFixed(0)}%
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Live labels are hints only — the AI analyzes the captured photo for the real diagnosis.
            </p>
          </CardContent>
        </Card>
      )}

      {aiResult && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityClass("info")}`}
                >
                  AI insight
                </span>
                <p className="mt-2 text-sm">{aiResult.summary}</p>
              </div>
              {aiResult.overall_confidence && (
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    aiResult.overall_confidence === "high"
                      ? "border-success/60 bg-success/10 text-success"
                      : aiResult.overall_confidence === "medium"
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-warning/60 bg-warning/10 text-warning"
                  }`}
                >
                  {aiResult.overall_confidence} confidence
                </span>
              )}
            </div>

            {aiResult.recapture_tip && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                <strong className="text-warning">Recapture tip:</strong>{" "}
                {aiResult.recapture_tip}
              </div>
            )}

            {aiResult.likely_components?.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Likely components
                </h4>
                <ul className="space-y-2">
                  {aiResult.likely_components.map((c, i) => (
                    <li key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{c.name}</span>
                        <span className="text-[11px] text-muted-foreground">{c.confidence}</span>
                      </div>
                      {c.likely_issue && (
                        <p className="mt-1 text-xs text-foreground">{c.likely_issue}</p>
                      )}
                      {c.what_to_check?.length > 0 && (
                        <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                          {c.what_to_check.map((x, j) => <li key={j}>{x}</li>)}
                        </ul>
                      )}
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

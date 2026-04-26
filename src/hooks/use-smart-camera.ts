import { useEffect, useRef, useState } from "react";
import {
  coachForStep,
  sampleFrameStats,
  type CoachingHint,
  type FrameStats,
} from "@/lib/camera-coaching";
import {
  interpretDetections,
  type InterpretedDetection,
} from "@/lib/camera-intelligence";
import {
  assessSurfaceVisibility,
  sampleEdgeStrength,
  lowVisibilityCoach,
  type SurfaceVisibility,
} from "@/lib/camera-visibility";

interface RawDetection {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

const CONFIDENCE_THRESHOLD = 0.68;
const SMOOTH_WINDOW = 5;
const STABLE_HITS = 3;
const INFERENCE_INTERVAL_MS = 220; // ~4-5 inferences/sec — phone-friendly
const STATE_COMMIT_INTERVAL_MS = 280; // React commits at most ~3-4x/sec
const EXPOSURE_ADJUST_MS = 1500; // re-evaluate exposure tweak every 1.5s

export function useSmartCamera(stepId: string) {
  const stepIdRef = useRef(stepId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<unknown>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const rafRef = useRef<number | null>(null);
  const inferenceInFlightRef = useRef(false);
  const lastInferenceAtRef = useRef(0);
  const lastCommitAtRef = useRef(0);
  const lastExposureAdjustAtRef = useRef(0);
  const exposureCompensationRef = useRef<number | null>(null);
  const historyRef = useRef<RawDetection[][]>([]);
  const prevPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const stableRawRef = useRef<RawDetection[]>([]);
  const lockedClassRef = useRef<{ className: string; ttl: number } | null>(null);
  const latestInsightsRef = useRef<InterpretedDetection[]>([]);
  const latestHintRef = useRef<CoachingHint | null>(null);
  const latestVisibilityRef = useRef<SurfaceVisibility | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [hint, setHint] = useState<CoachingHint | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [liveInsights, setLiveInsights] = useState<InterpretedDetection[]>([]);
  const [visibility, setVisibility] = useState<SurfaceVisibility | null>(null);

  useEffect(() => {
    stepIdRef.current = stepId;
  }, [stepId]);

  useEffect(() => {
    return () => {
      stopStream();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
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
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    trackRef.current = null;
    exposureCompensationRef.current = null;
    setStreaming(false);
    setHint(null);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  async function startStream(nextFacing: "environment" | "user" = facing) {
    stopStream();
    setCapturedPreview(null);
    try {
      // 1280x720 @ 24fps balances clarity for AI detection with phone CPU/thermal load.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: false,
      });

      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      try {
        const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
        const advanced: MediaTrackConstraintSet[] = [];
        if (Array.isArray(caps.focusMode) && (caps.focusMode as string[]).includes("continuous")) {
          advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
        }
        if (Array.isArray(caps.exposureMode) && (caps.exposureMode as string[]).includes("continuous")) {
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
        // Some browsers don't expose or allow advanced controls.
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      setFacing(nextFacing);
      setStreaming(true);
      historyRef.current = [];
      prevPixelsRef.current = null;
      stableRawRef.current = [];
      lockedClassRef.current = null;
      latestInsightsRef.current = [];
      latestHintRef.current = null;
      lastInferenceAtRef.current = 0;
      lastCommitAtRef.current = 0;
      lastExposureAdjustAtRef.current = 0;
      inferenceInFlightRef.current = false;

      await ensureModel();
      scheduleFrame();
    } catch (error) {
      throw error;
    }
  }

  /** Push the latest detection tick into the rolling window and return the
   * stable, label-locked subset. Frames marked invalid (washed out) skip the
   * window entirely so glare can't promote phantom detections. */
  function smoothDetections(latest: RawDetection[], frameValid: boolean): RawDetection[] {
    const history = historyRef.current;
    if (frameValid) {
      history.push(latest);
      if (history.length > SMOOTH_WINDOW) history.shift();
    }

    const counts = new Map<
      string,
      {
        hits: number;
        scoreSum: number;
        bboxSums: [number, number, number, number];
      }
    >();

    for (const tick of history) {
      const seen = new Set<string>();
      for (const detection of tick) {
        if (seen.has(detection.class)) continue;
        seen.add(detection.class);
        const current = counts.get(detection.class) ?? {
          hits: 0,
          scoreSum: 0,
          bboxSums: [0, 0, 0, 0] as [number, number, number, number],
        };
        current.hits += 1;
        current.scoreSum += detection.score;
        current.bboxSums[0] += detection.bbox[0];
        current.bboxSums[1] += detection.bbox[1];
        current.bboxSums[2] += detection.bbox[2];
        current.bboxSums[3] += detection.bbox[3];
        counts.set(detection.class, current);
      }
    }

    const stable = Array.from(counts.entries())
      .filter(([, entry]) => entry.hits >= STABLE_HITS)
      .map(([className, entry]) => ({
        class: className,
        score: entry.scoreSum / entry.hits,
        bbox: [
          entry.bboxSums[0] / entry.hits,
          entry.bboxSums[1] / entry.hits,
          entry.bboxSums[2] / entry.hits,
          entry.bboxSums[3] / entry.hits,
        ] as [number, number, number, number],
        hits: entry.hits,
      }))
      .sort((a, b) => b.score - a.score);

    const locked = lockedClassRef.current;
    const dominant = stable[0];
    if (frameValid && dominant && dominant.score >= 0.8 && dominant.hits >= 4) {
      lockedClassRef.current = { className: dominant.class, ttl: 4 };
    } else if (locked) {
      locked.ttl -= 1;
      if (locked.ttl <= 0) {
        lockedClassRef.current = null;
      }
    }

    const lock = lockedClassRef.current;
    if (!lock) {
      return stable.map(({ hits: _hits, ...detection }) => detection);
    }

    return stable
      .sort((a, b) => {
        if (a.class === lock.className) return -1;
        if (b.class === lock.className) return 1;
        return b.score - a.score;
      })
      .map(({ hits: _hits, ...detection }) => detection);
  }

  /** When highlights stay blown for a while, nudge exposureCompensation down
   * (where supported — iOS Safari + many Android Chrome devices). */
  function maybeAdjustExposure(stats: FrameStats, now: number) {
    const track = trackRef.current;
    if (!track) return;
    if (now - lastExposureAdjustAtRef.current < EXPOSURE_ADJUST_MS) return;

    const caps = (track.getCapabilities?.() ?? {}) as {
      exposureCompensation?: { min?: number; max?: number; step?: number };
    };
    const range = caps.exposureCompensation;
    if (!range || typeof range.min !== "number" || typeof range.max !== "number") return;

    const step = range.step && range.step > 0 ? range.step : 0.33;
    let target = exposureCompensationRef.current ?? 0;

    if (stats.highlightClip > 0.18 || stats.brightness > 220) {
      target = Math.max(range.min, target - step);
    } else if (stats.highlightClip < 0.04 && stats.brightness < 110 && target < 0) {
      target = Math.min(range.max, target + step);
    } else {
      return;
    }

    if (target === exposureCompensationRef.current) return;
    exposureCompensationRef.current = target;
    lastExposureAdjustAtRef.current = now;
    track
      .applyConstraints({
        advanced: [{ exposureCompensation: target } as unknown as MediaTrackConstraintSet],
      })
      .catch(() => {
        // Ignore — capability not actually writable on this device.
      });
  }

  function scheduleFrame() {
    rafRef.current = requestAnimationFrame(handleFrame);
  }

  /** Per-rAF tick:
   *  1. Repaint the overlay from the latest known insights (smooth).
   *  2. If enough time has passed AND no inference is in flight, kick off
   *     a new detection on the current video frame.
   *  3. Throttle React state commits so the UI never re-renders faster
   *     than ~3-4x/sec.
   */
  function handleFrame() {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const scratch = scratchCanvasRef.current;
    const model = modelRef.current as
      | { detect: (videoEl: HTMLVideoElement) => Promise<RawDetection[]> }
      | null;

    if (!video || !overlay || !scratch || !model || !streamRef.current) {
      rafRef.current = null;
      return;
    }

    if (overlay.width !== video.videoWidth) overlay.width = video.videoWidth;
    if (overlay.height !== video.videoHeight) overlay.height = video.videoHeight;

    // Always repaint the overlay from cached insights for buttery smoothness.
    drawOverlay(overlay, latestInsightsRef.current);

    const now = performance.now();
    const dueForInference =
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      !inferenceInFlightRef.current &&
      now - lastInferenceAtRef.current >= INFERENCE_INTERVAL_MS;

    if (dueForInference) {
      inferenceInFlightRef.current = true;
      lastInferenceAtRef.current = now;
      runInference(video, scratch, model).finally(() => {
        inferenceInFlightRef.current = false;
      });
    }

    // Throttle React state commits: copy refs into state at most every ~280ms.
    if (now - lastCommitAtRef.current >= STATE_COMMIT_INTERVAL_MS) {
      lastCommitAtRef.current = now;
      setLiveInsights(latestInsightsRef.current);
      setHint(latestHintRef.current);
    }

    scheduleFrame();
  }

  async function runInference(
    video: HTMLVideoElement,
    scratch: HTMLCanvasElement,
    model: { detect: (v: HTMLVideoElement) => Promise<RawDetection[]> },
  ) {
    try {
      const raw = await model.detect(video);
      const filtered = raw.filter((item) => item.score >= CONFIDENCE_THRESHOLD);

      // Coaching first — also tells us if the frame is glare-corrupted.
      const sampled = sampleFrameStats(
        video,
        prevPixelsRef.current,
        filtered.map((item) => ({
          bbox: item.bbox,
          class: item.class,
          score: item.score,
        })),
        scratch,
      );
      prevPixelsRef.current = sampled.pixels;
      latestHintRef.current = coachForStep(stepIdRef.current, sampled.stats);
      maybeAdjustExposure(sampled.stats, performance.now());

      // Reject washed-out / overexposed frames from the smoothing pipeline so
      // glare never promotes phantom detections.
      const frameValid =
        sampled.stats.brightness >= 35 &&
        sampled.stats.brightness <= 230 &&
        sampled.stats.highlightClip < 0.25 &&
        sampled.stats.contrast > 0.18 &&
        sampled.stats.motion < 0.6;

      const stable = smoothDetections(filtered, frameValid);
      stableRawRef.current = stable;

      latestInsightsRef.current = interpretDetections(
        stable,
        stepIdRef.current,
        video.videoWidth,
        video.videoHeight,
      );
    } catch (error) {
      console.error("Camera detect error", error);
    }
  }

  function drawOverlay(overlay: HTMLCanvasElement, insights: InterpretedDetection[]) {
    const context = overlay.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, overlay.width, overlay.height);
    context.lineWidth = 3;
    context.font = "16px sans-serif";

    for (const item of insights) {
      const [x, y, w, h] = item.bbox;
      context.strokeStyle = "rgba(61, 169, 252, 0.95)";
      context.fillStyle = "rgba(61, 169, 252, 0.12)";
      context.fillRect(x, y, w, h);
      context.strokeRect(x, y, w, h);

      const label = `${item.label} ${item.confidencePct}%`;
      const textWidth = context.measureText(label).width + 10;
      context.fillStyle = "rgba(0, 0, 0, 0.78)";
      context.fillRect(x, Math.max(0, y - 24), textWidth, 24);
      context.fillStyle = "rgba(34, 211, 154, 1)";
      context.fillText(label, x + 5, Math.max(16, y - 7));
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    setCapturedPreview(dataUrl);

    return {
      dataUrl,
      detections: stableRawRef.current.map((item) => ({
        class: item.class,
        score: item.score,
      })),
    };
  }

  async function loadUploadedImage(file: File) {
    stopStream();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Could not read the selected image"));
      reader.readAsDataURL(file);
    });
    setCapturedPreview(dataUrl);
    return {
      dataUrl,
      detections: stableRawRef.current.map((item) => ({
        class: item.class,
        score: item.score,
      })),
    };
  }

  function clearCapturedPreview() {
    setCapturedPreview(null);
  }

  async function flipCamera() {
    const nextFacing = facing === "environment" ? "user" : "environment";
    setFacing(nextFacing);
    await startStream(nextFacing);
  }

  return {
    videoRef,
    overlayRef,
    captureCanvasRef,
    scratchCanvasRef,
    streaming,
    modelLoading,
    facing,
    hint,
    liveInsights,
    capturedPreview,
    startStream,
    stopStream,
    flipCamera,
    captureFrame,
    loadUploadedImage,
    clearCapturedPreview,
  };
}

import { useEffect, useRef, useState } from "react";
import {
  coachForStep,
  sampleFrameStats,
  type CoachingHint,
} from "@/lib/camera-coaching";
import {
  interpretDetections,
  type InterpretedDetection,
} from "@/lib/camera-intelligence";

interface RawDetection {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

const CONFIDENCE_THRESHOLD = 0.68;
const SMOOTH_WINDOW = 5;
const STABLE_HITS = 3;
const LOOP_DELAY_MS = 180;

export function useSmartCamera(stepId: string) {
  const stepIdRef = useRef(stepId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<unknown>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopHandleRef = useRef<number | null>(null);
  const historyRef = useRef<RawDetection[][]>([]);
  const prevPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const stableRawRef = useRef<RawDetection[]>([]);
  const lockedClassRef = useRef<{ className: string; ttl: number } | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [hint, setHint] = useState<CoachingHint | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [liveInsights, setLiveInsights] = useState<InterpretedDetection[]>([]);

  useEffect(() => {
    stepIdRef.current = stepId;
  }, [stepId]);

  useEffect(() => {
    return () => {
      stopStream();
      if (loopHandleRef.current !== null) {
        clearTimeout(loopHandleRef.current);
      }
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
    setStreaming(false);
    setHint(null);
  }

  async function startStream(nextFacing: "environment" | "user" = facing) {
    stopStream();
    setCapturedPreview(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      const track = stream.getVideoTracks()[0];
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
      await ensureModel();
      detectLoop();
    } catch (error) {
      throw error;
    }
  }

  function smoothDetections(latest: RawDetection[]): RawDetection[] {
    const history = historyRef.current;
    history.push(latest);
    if (history.length > SMOOTH_WINDOW) history.shift();

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
    if (dominant && dominant.score >= 0.8 && dominant.hits >= 4) {
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

  async function detectLoop() {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const scratch = scratchCanvasRef.current;
    const model = modelRef.current as
      | { detect: (videoEl: HTMLVideoElement) => Promise<RawDetection[]> }
      | null;

    if (!video || !overlay || !scratch || !model || !streamRef.current) return;

    if (video.readyState >= 2 && video.videoWidth > 0) {
      if (overlay.width !== video.videoWidth) overlay.width = video.videoWidth;
      if (overlay.height !== video.videoHeight) overlay.height = video.videoHeight;

      try {
        const raw = await model.detect(video);
        const filtered = raw.filter((item) => item.score >= CONFIDENCE_THRESHOLD);
        const stable = smoothDetections(filtered);
        stableRawRef.current = stable;

        const interpreted = interpretDetections(
          stable,
          stepIdRef.current,
          video.videoWidth,
          video.videoHeight,
        );
        setLiveInsights(interpreted);
        drawOverlay(overlay, interpreted);

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
        setHint(coachForStep(stepIdRef.current, sampled.stats));
      } catch (error) {
        console.error("Camera detect error", error);
      }
    }

    loopHandleRef.current = window.setTimeout(() => detectLoop(), LOOP_DELAY_MS);
  }

  function drawOverlay(overlay: HTMLCanvasElement, insights: InterpretedDetection[]) {
    const context = overlay.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, overlay.width, overlay.height);
    context.lineWidth = 3;
    context.font = "16px sans-serif";

    insights.forEach((item) => {
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
    });
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

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Camera,
  Loader2,
  Check,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  Gauge,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { callAi } from "@/lib/ai";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { severityClass } from "@/lib/severity";
import {
  computeInspectionScores,
  estimateVehicleValue,
  type Finding,
  type InspectionScores,
  type ValuationOutput,
} from "@/lib/valuation";

export const Route = createFileRoute("/inspection")({
  component: InspectionFlow,
});

interface VehicleForm {
  year: string;
  make: string;
  model: string;
  mileage: string;
  asking_price: string;
}

interface Step {
  id: string;
  title: string;
  category: Finding["category"];
  instruction: string;
  /** dashboard step doesn't need camera */
  manualOnly?: boolean;
}

const STEPS: Step[] = [
  {
    id: "front_exterior",
    title: "Front exterior",
    category: "exterior",
    instruction:
      "Stand 6–8 ft in front of the car. Capture the entire bumper, headlights, hood line, and grille.",
  },
  {
    id: "side_panels",
    title: "Side panels",
    category: "exterior",
    instruction: "Walk along each side. Look for panel gaps, dents, or paint mismatch under sunlight.",
  },
  {
    id: "rear",
    title: "Rear",
    category: "exterior",
    instruction: "Capture the rear bumper, tail lights, exhaust, and trunk seam.",
  },
  {
    id: "wheels_tires",
    title: "Wheels & tires",
    category: "tires",
    instruction: "Capture each tire tread and sidewall. Check for cracks, uneven wear, low tread.",
  },
  {
    id: "interior",
    title: "Interior",
    category: "interior",
    instruction: "Capture seats, steering wheel, headliner, and floor for wear that matches mileage.",
  },
  {
    id: "dashboard",
    title: "Dashboard (ignition on)",
    category: "dashboard",
    instruction:
      "Turn ignition to ON (do not start). Look for warning lights that stay lit after self-test: check engine, ABS, airbag, oil.",
    manualOnly: true,
  },
  {
    id: "engine_bay",
    title: "Engine bay",
    category: "engine",
    instruction: "Open the hood. Capture the engine, belts, fluid reservoirs. Look for leaks, corrosion, frayed belts.",
  },
];

interface AiFrameResult {
  step_summary: string;
  findings: { issue: string; category: Finding["category"]; severity: Finding["severity"]; notes: string }[];
  what_to_check_manually: string[];
  next_step_hint: string;
}

interface AiFinalResult {
  headline: string;
  summary: string;
  top_concerns: { issue: string; severity: string; impact: string }[];
  negotiation_advice: string;
  talking_points: string[];
  estimated_repair_cost?: { low: number; high: number; currency: string };
  decision: "BUY" | "NEGOTIATE" | "AVOID";
  decision_reason: string;
}

type Phase = "setup" | "step" | "report";

function InspectionFlow() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("setup");
  const [stepIdx, setStepIdx] = useState(0);
  const [vehicle, setVehicle] = useState<VehicleForm>({
    year: "",
    make: "",
    model: "",
    mileage: "",
    asking_price: "",
  });
  const [findings, setFindings] = useState<Finding[]>([]);
  const [stepFrames, setStepFrames] = useState<Record<string, string | null>>({});
  const [aiByStep, setAiByStep] = useState<Record<string, AiFrameResult | null>>({});
  const [manualNotes, setManualNotes] = useState<Record<string, string>>({});
  const [warningLightToggles, setWarningLightToggles] = useState<Record<string, boolean>>({
    check_engine: false,
    abs: false,
    airbag: false,
    oil: false,
    battery: false,
  });
  const [scores, setScores] = useState<InspectionScores | null>(null);
  const [valuation, setValuation] = useState<ValuationOutput | null>(null);
  const [aiFinal, setAiFinal] = useState<AiFinalResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) navigate({ to: "/auth" });
  }, [user, navigate]);

  const currentStep = STEPS[stepIdx];
  const progressPct = phase === "report" ? 100 : Math.round((stepIdx / STEPS.length) * 100);

  function startInspection() {
    if (!vehicle.year || !vehicle.make || !vehicle.model || !vehicle.mileage) {
      toast.error("Please fill in year, make, model, and mileage.");
      return;
    }
    setPhase("step");
    setStepIdx(0);
  }

  function recordFrameFindings(stepId: string, ai: AiFrameResult) {
    setAiByStep((p) => ({ ...p, [stepId]: ai }));
    const newFindings: Finding[] = ai.findings.map((f) => ({
      step: stepId,
      category: f.category,
      issue: f.issue,
      severity: f.severity,
      notes: f.notes,
    }));
    setFindings((prev) => [...prev.filter((f) => f.step !== stepId), ...newFindings]);
  }

  function recordManualFinding(stepId: string, category: Finding["category"], issue: string, severity: Finding["severity"]) {
    setFindings((prev) => [
      ...prev,
      { step: stepId, category, issue, severity, notes: "Manual entry" },
    ]);
  }

  function removeFinding(idx: number) {
    setFindings((prev) => prev.filter((_, i) => i !== idx));
  }

  function nextStep() {
    if (stepIdx < STEPS.length - 1) setStepIdx(stepIdx + 1);
    else finalize();
  }

  function prevStep() {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
    else setPhase("setup");
  }

  async function finalize() {
    // Pull warning-light toggles into findings (dashboard step)
    const lights = Object.entries(warningLightToggles).filter(([, v]) => v);
    const lightFindings: Finding[] = lights.map(([k]) => ({
      step: "dashboard",
      category: "dashboard",
      issue:
        k === "check_engine" ? "Check engine warning light"
        : k === "abs" ? "ABS warning light"
        : k === "airbag" ? "Airbag warning light"
        : k === "oil" ? "Oil pressure warning light"
        : "Battery / charging warning light",
      severity: k === "airbag" || k === "oil" || k === "check_engine" ? "high" : "medium",
      notes: "User-confirmed dashboard light",
    }));
    const allFindings = [...findings.filter((f) => f.step !== "dashboard"), ...lightFindings];
    setFindings(allFindings);

    const computedScores = computeInspectionScores(allFindings);
    setScores(computedScores);

    const val = estimateVehicleValue({
      year: Number(vehicle.year),
      make: vehicle.make,
      model: vehicle.model,
      mileage: Number(vehicle.mileage),
      condition_score: computedScores.overall_score,
      asking_price: vehicle.asking_price ? Number(vehicle.asking_price) : null,
    });
    setValuation(val);

    setPhase("report");

    // Async AI summary
    try {
      setSubmitting(true);
      const ai = await callAi<AiFinalResult>(
        "inspection_final",
        {
          findings: allFindings,
          scores: computedScores,
          valuation: val,
          asking_price: vehicle.asking_price ? Number(vehicle.asking_price) : null,
        },
        {
          year: Number(vehicle.year),
          make: vehicle.make,
          model: vehicle.model,
          mileage: Number(vehicle.mileage),
        },
      );
      setAiFinal(ai);

      if (user) {
        const { data: insp, error } = await supabase
          .from("inspections")
          .insert({
            user_id: user.id,
            vehicle_info: {
              year: Number(vehicle.year),
              make: vehicle.make,
              model: vehicle.model,
              mileage: Number(vehicle.mileage),
            } as never,
            asking_price: vehicle.asking_price ? Number(vehicle.asking_price) : null,
            findings: allFindings as never,
            scores: computedScores as never,
            recommendation: ai.decision,
            notes: ai.summary,
          })
          .select("id")
          .single();
        if (error) throw error;
        await supabase.from("valuation_reports").insert({
          user_id: user.id,
          inspection_id: insp?.id ?? null,
          vehicle_info: {
            year: Number(vehicle.year),
            make: vehicle.make,
            model: vehicle.model,
            mileage: Number(vehicle.mileage),
          } as never,
          base_price: val.base_price,
          fair_value_low: val.low_value,
          fair_value_avg: val.avg_value,
          fair_value_high: val.high_value,
          asking_price: vehicle.asking_price ? Number(vehicle.asking_price) : null,
          decision: ai.decision,
          negotiation_advice: ai.negotiation_advice,
          ai_output: ai as never,
        });
        toast.success("Inspection saved to history");
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "AI summary failed — report still available");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="Used Car Inspection">
      {phase === "setup" && (
        <SetupScreen vehicle={vehicle} setVehicle={setVehicle} onStart={startInspection} />
      )}
      {phase === "step" && currentStep && (
        <StepScreen
          step={currentStep}
          stepIdx={stepIdx}
          totalSteps={STEPS.length}
          progressPct={progressPct}
          frame={stepFrames[currentStep.id] ?? null}
          ai={aiByStep[currentStep.id] ?? null}
          notes={manualNotes[currentStep.id] ?? ""}
          onNotes={(v) => setManualNotes((p) => ({ ...p, [currentStep.id]: v }))}
          warningLightToggles={warningLightToggles}
          setWarningLightToggles={setWarningLightToggles}
          onFrame={(dataUrl) => setStepFrames((p) => ({ ...p, [currentStep.id]: dataUrl }))}
          onAi={(ai) => recordFrameFindings(currentStep.id, ai)}
          onAddManual={(issue, severity) =>
            recordManualFinding(currentStep.id, currentStep.category, issue, severity)
          }
          findings={findings.filter((f) => f.step === currentStep.id)}
          allFindings={findings}
          onRemoveFinding={removeFinding}
          vehicle={vehicle}
          onNext={nextStep}
          onPrev={prevStep}
          isLast={stepIdx === STEPS.length - 1}
        />
      )}
      {phase === "report" && scores && valuation && (
        <ReportScreen
          vehicle={vehicle}
          findings={findings}
          scores={scores}
          valuation={valuation}
          ai={aiFinal}
          submitting={submitting}
          onRestart={() => {
            setPhase("setup");
            setStepIdx(0);
            setFindings([]);
            setStepFrames({});
            setAiByStep({});
            setManualNotes({});
            setScores(null);
            setValuation(null);
            setAiFinal(null);
          }}
        />
      )}
    </AppShell>
  );
}

/* ----------------------------- Setup screen ----------------------------- */
function SetupScreen({
  vehicle,
  setVehicle,
  onStart,
}: {
  vehicle: VehicleForm;
  setVehicle: (v: VehicleForm) => void;
  onStart: () => void;
}) {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Used Car Inspection</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Guided 7-step walkaround. We score each system, estimate fair value, and tell you whether
        to BUY, NEGOTIATE, or AVOID.
      </p>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                inputMode="numeric"
                placeholder="2018"
                value={vehicle.year}
                onChange={(e) => setVehicle({ ...vehicle, year: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="make">Make</Label>
              <Input
                id="make"
                placeholder="Toyota"
                value={vehicle.make}
                onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              placeholder="Camry SE"
              value={vehicle.model}
              onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mileage">Mileage</Label>
              <Input
                id="mileage"
                inputMode="numeric"
                placeholder="78000"
                value={vehicle.mileage}
                onChange={(e) => setVehicle({ ...vehicle, mileage: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="asking">Asking price (optional)</Label>
              <Input
                id="asking"
                inputMode="numeric"
                placeholder="14500"
                value={vehicle.asking_price}
                onChange={(e) => setVehicle({ ...vehicle, asking_price: e.target.value })}
              />
            </div>
          </div>
          <Button className="mt-2 w-full" onClick={onStart}>
            Start guided inspection
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="p-4">
          <h3 className="mb-2 text-sm font-semibold">What we check</h3>
          <ol className="space-y-1 text-xs text-muted-foreground">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <span className="font-medium text-foreground">{i + 1}.</span> {s.title}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </>
  );
}

/* ----------------------------- Step screen ----------------------------- */
function StepScreen(props: {
  step: Step;
  stepIdx: number;
  totalSteps: number;
  progressPct: number;
  frame: string | null;
  ai: AiFrameResult | null;
  notes: string;
  onNotes: (v: string) => void;
  warningLightToggles: Record<string, boolean>;
  setWarningLightToggles: (
    fn: (p: Record<string, boolean>) => Record<string, boolean>,
  ) => void;
  onFrame: (dataUrl: string) => void;
  onAi: (ai: AiFrameResult) => void;
  onAddManual: (issue: string, severity: Finding["severity"]) => void;
  findings: Finding[];
  allFindings: Finding[];
  onRemoveFinding: (idx: number) => void;
  vehicle: VehicleForm;
  onNext: () => void;
  onPrev: () => void;
  isLast: boolean;
}) {
  const { step, stepIdx, totalSteps, progressPct } = props;

  return (
    <>
      {/* Progress tracker */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Step {stepIdx + 1} of {totalSteps}
          </span>
          <span>{progressPct}% complete</span>
        </div>
        <Progress value={progressPct} />
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] ${
                i < stepIdx
                  ? "border-success/30 bg-success/10 text-success"
                  : i === stepIdx
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {i < stepIdx && <Check className="mr-1 inline h-3 w-3" />}
              {s.title}
            </span>
          ))}
        </div>
      </div>

      <h2 className="text-xl font-bold tracking-tight">{step.title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{step.instruction}</p>

      {step.manualOnly ? (
        <DashboardChecklist
          toggles={props.warningLightToggles}
          setToggles={props.setWarningLightToggles}
        />
      ) : (
        <CameraCapture
          stepId={step.id}
          category={step.category}
          frame={props.frame}
          ai={props.ai}
          onFrame={props.onFrame}
          onAi={props.onAi}
          vehicle={props.vehicle}
        />
      )}

      <ManualFinding onAdd={props.onAddManual} />

      <NotesField value={props.notes} onChange={props.onNotes} />

      <FindingsList
        findings={props.findings}
        onRemove={(idx) => {
          const globalIdx = props.allFindings.findIndex(
            (f) => f === props.findings[idx],
          );
          if (globalIdx >= 0) props.onRemoveFinding(globalIdx);
        }}
      />

      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={props.onPrev}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <Button className="flex-1" onClick={props.onNext}>
          {props.isLast ? "Generate report" : "Next step"} <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

/* ----------------------------- Camera capture ----------------------------- */
function CameraCapture({
  stepId,
  category,
  frame,
  ai,
  onFrame,
  onAi,
  vehicle,
}: {
  stepId: string;
  category: Finding["category"];
  frame: string | null;
  ai: AiFrameResult | null;
  onFrame: (dataUrl: string) => void;
  onAi: (ai: AiFrameResult) => void;
  vehicle: VehicleForm;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelRef = useRef<unknown>(null);
  const rafRef = useRef<number | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastDetections, setLastDetections] = useState<{ class: string; score: number }[]>([]);

  useEffect(() => {
    return () => {
      stopStream();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When step changes, stop previous stream
  useEffect(() => {
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  async function ensureModel() {
    if (modelRef.current) return modelRef.current;
    setLoadingModel(true);
    try {
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      modelRef.current = await cocoSsd.load({ base: "lite_mobilenet_v2" });
      return modelRef.current;
    } finally {
      setLoadingModel(false);
    }
  }

  async function startCamera() {
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = stream;
      await v.play();
      setStreaming(true);
      await ensureModel();
      detectLoop();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not access camera");
    }
  }

  async function detectLoop() {
    const v = videoRef.current;
    const overlay = overlayRef.current;
    const model = modelRef.current as
      | { detect: (v: HTMLVideoElement) => Promise<{ bbox: number[]; class: string; score: number }[]> }
      | null;
    if (!v || !overlay || !model || !streamRef.current) return;
    if (v.readyState >= 2) {
      overlay.width = v.videoWidth;
      overlay.height = v.videoHeight;
      try {
        const preds = await model.detect(v);
        setLastDetections(preds.map((p) => ({ class: p.class, score: p.score })));
        const ctx = overlay.getContext("2d");
        if (ctx) {
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
      } catch (e) {
        console.error(e);
      }
    }
    rafRef.current = requestAnimationFrame(detectLoop);
  }

  async function captureFrame() {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    const dataUrl = c.toDataURL("image/jpeg", 0.7);
    onFrame(dataUrl);

    setAnalyzing(true);
    try {
      const result = await callAi<AiFrameResult>(
        "inspection_frame",
        {
          step: stepId,
          category,
          detected_objects: lastDetections,
        },
        {
          year: Number(vehicle.year) || null,
          make: vehicle.make,
          model: vehicle.model,
          mileage: Number(vehicle.mileage) || null,
        },
      );
      onAi(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <>
      <div className="relative mb-3 overflow-hidden rounded-2xl border border-border bg-black aspect-[3/4]">
        {frame && !streaming ? (
          <img src={frame} alt="Captured frame" className="h-full w-full object-cover" />
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <canvas
              ref={overlayRef}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
        {!streaming && !frame && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-6 text-center">
            <Camera className="h-10 w-10 text-primary" />
            <Button onClick={startCamera} disabled={loadingModel}>
              {loadingModel ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading vision…
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" /> Open camera
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {streaming ? (
          <>
            <Button onClick={captureFrame} disabled={analyzing} className="flex-1">
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Capture & analyze
                </>
              )}
            </Button>
            <Button variant="outline" onClick={stopStream}>
              Stop
            </Button>
          </>
        ) : frame ? (
          <Button variant="outline" onClick={startCamera} className="flex-1">
            Recapture
          </Button>
        ) : null}
      </div>

      {ai && (
        <Card className="mb-3">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm">{ai.step_summary}</p>
            {ai.what_to_check_manually?.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Verify manually
                </h4>
                <ul className="list-disc pl-4 text-xs">
                  {ai.what_to_check_manually.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {ai.next_step_hint && (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Tip:</span> {ai.next_step_hint}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

/* ----------------------------- Dashboard checklist ----------------------------- */
function DashboardChecklist({
  toggles,
  setToggles,
}: {
  toggles: Record<string, boolean>;
  setToggles: (fn: (p: Record<string, boolean>) => Record<string, boolean>) => void;
}) {
  const lights: { id: string; label: string; severity: Finding["severity"] }[] = [
    { id: "check_engine", label: "Check engine", severity: "high" },
    { id: "abs", label: "ABS / brake", severity: "medium" },
    { id: "airbag", label: "Airbag (SRS)", severity: "high" },
    { id: "oil", label: "Oil pressure", severity: "high" },
    { id: "battery", label: "Battery / charging", severity: "medium" },
  ];
  return (
    <Card className="mb-4">
      <CardContent className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground">
          Tap any warning light that stays lit after the bulb-check self-test.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {lights.map((l) => {
            const active = toggles[l.id];
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setToggles((p) => ({ ...p, [l.id]: !p[l.id] }))}
                className={`rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
                  active
                    ? "border-destructive/40 bg-destructive/15 text-destructive"
                    : "border-border bg-muted/30 text-foreground hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">{l.label}</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider opacity-70">
                  {active ? "on — recorded" : "tap if lit"}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Manual finding ----------------------------- */
function ManualFinding({
  onAdd,
}: {
  onAdd: (issue: string, severity: Finding["severity"]) => void;
}) {
  const [val, setVal] = useState("");
  const [sev, setSev] = useState<Finding["severity"]>("medium");
  return (
    <Card className="mb-3">
      <CardContent className="space-y-2 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Add manual finding
        </h4>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. Scratch on driver door"
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
          <select
            className="rounded-md border border-input bg-background px-2 text-sm"
            value={sev}
            onChange={(e) => setSev(e.target.value as Finding["severity"])}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <Button
            type="button"
            onClick={() => {
              if (!val.trim()) return;
              onAdd(val.trim(), sev);
              setVal("");
            }}
          >
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NotesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-3">
      <Label htmlFor="step-notes" className="text-xs uppercase tracking-wider text-muted-foreground">
        Notes (optional)
      </Label>
      <Textarea
        id="step-notes"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder="Anything else you noticed at this step…"
      />
    </div>
  );
}

function FindingsList({
  findings,
  onRemove,
}: {
  findings: Finding[];
  onRemove: (idx: number) => void;
}) {
  if (findings.length === 0) return null;
  return (
    <Card className="mb-3">
      <CardContent className="p-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Findings at this step ({findings.length})
        </h4>
        <ul className="space-y-2">
          {findings.map((f, i) => (
            <li
              key={i}
              className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/30 p-2"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${severityClass(f.severity)}`}
                  >
                    {f.severity}
                  </span>
                  <span className="text-sm font-medium">{f.issue}</span>
                </div>
                {f.notes && <p className="mt-1 text-[11px] text-muted-foreground">{f.notes}</p>}
              </div>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Report screen ----------------------------- */
function ReportScreen({
  vehicle,
  findings,
  scores,
  valuation,
  ai,
  submitting,
  onRestart,
}: {
  vehicle: VehicleForm;
  findings: Finding[];
  scores: InspectionScores;
  valuation: ValuationOutput;
  ai: AiFinalResult | null;
  submitting: boolean;
  onRestart: () => void;
}) {
  const decision = ai?.decision ?? valuation.decision;
  const decisionTone =
    decision === "BUY"
      ? "border-success/40 bg-success/15 text-success"
      : decision === "AVOID"
      ? "border-destructive/40 bg-destructive/15 text-destructive"
      : "border-warning/40 bg-warning/15 text-warning";

  const sortedFindings = useMemo(
    () =>
      [...findings].sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        return order[a.severity] - order[b.severity];
      }),
    [findings],
  );

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Inspection Report</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {vehicle.year} {vehicle.make} {vehicle.model} · {Number(vehicle.mileage).toLocaleString()} mi
      </p>

      {/* Decision card */}
      <Card className={`mb-4 border-2 ${decisionTone}`}>
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-7 w-7 shrink-0" />
            <div className="flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                Decision
              </div>
              <div className="text-3xl font-bold tracking-tight">{decision}</div>
              <p className="mt-1 text-sm opacity-90">
                {ai?.decision_reason ?? valuation.reasoning[0] ?? ""}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scores */}
      <Card className="mb-4">
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Condition scores</h3>
          <ScoreRow label="Exterior" value={scores.exterior_score} />
          <ScoreRow label="Interior" value={scores.interior_score} />
          <ScoreRow label="Engine bay" value={scores.engine_score} />
          <ScoreRow label="Tires" value={scores.tire_score} />
          <div className="mt-2 border-t border-border pt-3">
            <ScoreRow label="Overall" value={scores.overall_score} bold />
          </div>
        </CardContent>
      </Card>

      {/* Risk flags */}
      {scores.risk_flags.length > 0 && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" /> Risk flags
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {scores.risk_flags.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Valuation */}
      <Card className="mb-4">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Gauge className="h-4 w-4" /> Estimated value
            </h3>
            {valuation.deal && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  valuation.deal === "good_deal"
                    ? "border-success/40 bg-success/15 text-success"
                    : valuation.deal === "fair"
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-destructive/40 bg-destructive/15 text-destructive"
                }`}
              >
                {valuation.deal.replace("_", " ")}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <ValueCell label="Low" value={valuation.low_value} />
            <ValueCell label="Avg" value={valuation.avg_value} highlight />
            <ValueCell label="High" value={valuation.high_value} />
          </div>
          {vehicle.asking_price && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Asking price</span>
                <span className="font-semibold">
                  ${Number(vehicle.asking_price).toLocaleString()}
                </span>
              </div>
              {valuation.delta_vs_avg !== null && (
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">vs fair avg</span>
                  <span
                    className={
                      valuation.delta_vs_avg > 0 ? "text-destructive" : "text-success"
                    }
                  >
                    {valuation.delta_vs_avg > 0 ? "+" : ""}${valuation.delta_vs_avg.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}
          {valuation.reasoning.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {valuation.reasoning.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* AI summary */}
      {submitting && (
        <Card className="mb-4">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Generating AI negotiation summary…
          </CardContent>
        </Card>
      )}
      {ai && (
        <Card className="mb-4">
          <CardContent className="space-y-3 p-4">
            <div>
              <h3 className="text-sm font-semibold">{ai.headline}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{ai.summary}</p>
            </div>
            {ai.top_concerns?.length > 0 && (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Top concerns
                </h4>
                <ul className="space-y-1">
                  {ai.top_concerns.map((c, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-2 text-sm"
                    >
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${severityClass(c.severity)}`}
                      >
                        {c.severity}
                      </span>
                      <div>
                        <div className="font-medium">{c.issue}</div>
                        <div className="text-xs text-muted-foreground">{c.impact}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ai.negotiation_advice && (
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Negotiation advice
                </h4>
                <p className="mt-1 text-sm">{ai.negotiation_advice}</p>
              </div>
            )}
            {ai.talking_points?.length > 0 && (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Talking points
                </h4>
                <ul className="list-disc space-y-1 pl-5 text-xs">
                  {ai.talking_points.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
            {ai.estimated_repair_cost && (
              <div className="text-xs text-muted-foreground">
                Estimated repair cost: ${ai.estimated_repair_cost.low.toLocaleString()} – $
                {ai.estimated_repair_cost.high.toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* All findings */}
      {sortedFindings.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold">All findings ({sortedFindings.length})</h3>
            <ul className="space-y-2">
              {sortedFindings.map((f, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-2"
                >
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${severityClass(f.severity)}`}
                  >
                    {f.severity}
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{f.issue}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {f.category} · step: {f.step.replace(/_/g, " ")}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={onRestart} className="flex-1">
          New inspection
        </Button>
      </div>
    </>
  );
}

function ScoreRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  const tone =
    value >= 80
      ? "text-success"
      : value >= 60
      ? "text-primary"
      : value >= 40
      ? "text-warning"
      : "text-destructive";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className={bold ? "font-semibold" : ""}>{label}</span>
        <span className={`${tone} ${bold ? "text-lg font-bold" : "font-medium"}`}>{value}</span>
      </div>
      <Progress value={value} />
    </div>
  );
}

function ValueCell({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-2 ${
        highlight ? "border-primary/40 bg-primary/10" : "border-border bg-muted/30"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-bold ${highlight ? "text-primary" : ""}`}>
        ${value.toLocaleString()}
      </div>
    </div>
  );
}

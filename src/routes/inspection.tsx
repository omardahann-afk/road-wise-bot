import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  Loader2,
  Check,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Gauge,
  Trash2,
  Wrench,
  Car,
  Lightbulb,
  ScanSearch,
  TrendingDown,
  TrendingUp,
  Banknote,
  Crosshair,
  Sofa,
} from "lucide-react";
import { toast } from "sonner";
import { callAi } from "@/lib/ai";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { severityClass } from "@/lib/severity";
import {
  classifyRepair,
  computeFinalDecision,
  computeInspectionScores,
  estimateRepairBurden,
  estimateVehicleValue,
  type FinalDecision,
  type Finding,
  type InspectionScores,
  type RepairCostEstimate,
  type ValuationOutput,
} from "@/lib/valuation";
import { estimateBurdenCAD, pricingForFinding, formatCAD, type BurdenResult } from "@/lib/pricing";
import { RepairPricingCard } from "@/components/diagnostics/repair-pricing-card";
import { sampleFrameStats, coachForStep, STEP_GUIDANCE, type CoachingHint } from "@/lib/camera-coaching";
import { CoachingOverlay } from "@/components/diagnostics/coaching-overlay";
import { WalkthroughModal, shouldShowWalkthrough, markWalkthroughSeen } from "@/components/diagnostics/walkthrough-modal";
import { interpretDetections, type InterpretedDetection } from "@/lib/camera-intelligence";
import { DetectionChips } from "@/components/diagnostics/detection-chips";
import { computeDecisionTrust } from "@/lib/decision-trust";
import { DecisionTrustBlock } from "@/components/diagnostics/decision-trust-block";

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
  icon: React.ComponentType<{ className?: string }>;
  manualOnly?: boolean;
}

const STEPS: Step[] = [
  { id: "front_exterior", title: "Front exterior", category: "exterior", icon: Car, instruction: "Stand 6–8 ft in front. Capture the bumper, headlights, hood line, and grille." },
  { id: "side_panels", title: "Side panels", category: "exterior", icon: Car, instruction: "Walk along each side. Look for panel gaps, dents, or paint mismatch in sunlight." },
  { id: "rear", title: "Rear", category: "exterior", icon: Car, instruction: "Capture the rear bumper, tail lights, exhaust, and trunk seam." },
  { id: "wheels_tires", title: "Wheels & tires", category: "tires", icon: Crosshair, instruction: "Capture each tire tread and sidewall. Check for cracks, uneven wear, low tread." },
  { id: "interior", title: "Interior", category: "interior", icon: Sofa, instruction: "Capture seats, steering wheel, headliner, and floor for wear that matches mileage." },
  { id: "dashboard", title: "Dashboard", category: "dashboard", icon: Lightbulb, instruction: "Turn ignition to ON (do not start). Tap any warning light that stays lit after self-test.", manualOnly: true },
  { id: "engine_bay", title: "Engine bay", category: "engine", icon: Wrench, instruction: "Open the hood. Capture the engine, belts, fluid reservoirs. Look for leaks, corrosion, frayed belts." },
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
  const [vehicle, setVehicle] = useState<VehicleForm>({ year: "", make: "", model: "", mileage: "", asking_price: "" });
  const [findings, setFindings] = useState<Finding[]>([]);
  const [stepFrames, setStepFrames] = useState<Record<string, string | null>>({});
  const [aiByStep, setAiByStep] = useState<Record<string, AiFrameResult | null>>({});
  const [manualNotes, setManualNotes] = useState<Record<string, string>>({});
  const [warningLightToggles, setWarningLightToggles] = useState<Record<string, boolean>>({
    check_engine: false, abs: false, airbag: false, oil: false, battery: false,
  });
  const [scores, setScores] = useState<InspectionScores | null>(null);
  const [valuation, setValuation] = useState<ValuationOutput | null>(null);
  const [repairBurden, setRepairBurden] = useState<RepairCostEstimate | null>(null);
  const [burdenCAD, setBurdenCAD] = useState<BurdenResult | null>(null);
  const [finalDecision, setFinalDecision] = useState<FinalDecision | null>(null);
  const [aiFinal, setAiFinal] = useState<AiFinalResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedInspectionId, setSavedInspectionId] = useState<string | null>(null);

  const [showWalk, setShowWalk] = useState(false);

  useEffect(() => {
    if (!user) navigate({ to: "/auth" });
  }, [user, navigate]);

  useEffect(() => {
    if (phase === "step" && shouldShowWalkthrough()) setShowWalk(true);
  }, [phase]);

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
      step: stepId, category: f.category, issue: f.issue, severity: f.severity, notes: f.notes,
    }));
    setFindings((prev) => [...prev.filter((f) => f.step !== stepId), ...newFindings]);
  }

  function recordManualFinding(stepId: string, category: Finding["category"], issue: string, severity: Finding["severity"]) {
    setFindings((prev) => [...prev, { step: stepId, category, issue, severity, notes: "Manual entry" }]);
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

    const askingPrice = vehicle.asking_price ? Number(vehicle.asking_price) : null;
    const val = estimateVehicleValue({
      year: Number(vehicle.year),
      make: vehicle.make,
      model: vehicle.model,
      mileage: Number(vehicle.mileage),
      condition_score: computedScores.overall_score,
      asking_price: askingPrice,
    });
    setValuation(val);

    const burden = estimateRepairBurden(allFindings);
    setRepairBurden(burden);

    const burdenCad = estimateBurdenCAD(allFindings, {
      year: Number(vehicle.year) || null,
      make: vehicle.make,
      model: vehicle.model,
    });
    setBurdenCAD(burdenCad);

    const fd = computeFinalDecision({
      valuation: val,
      scores: computedScores,
      findings: allFindings,
      repair: burden,
      asking_price: askingPrice,
    });
    setFinalDecision(fd);

    setPhase("report");

    // Async AI narrative — does NOT override deterministic decision.
    try {
      setSubmitting(true);
      const ai = await callAi<AiFinalResult>(
        "inspection_final",
        {
          findings: allFindings,
          scores: computedScores,
          valuation: val,
          repair_burden: burden,
          deterministic_decision: fd.decision,
          deterministic_reasons: fd.reasons,
          asking_price: askingPrice,
        },
        { year: Number(vehicle.year), make: vehicle.make, model: vehicle.model, mileage: Number(vehicle.mileage) },
      );
      setAiFinal(ai);

      if (user) {
        const { data: insp, error } = await supabase
          .from("inspections")
          .insert({
            user_id: user.id,
            vehicle_info: {
              year: Number(vehicle.year), make: vehicle.make, model: vehicle.model, mileage: Number(vehicle.mileage),
            } as never,
            asking_price: askingPrice,
            findings: allFindings as never,
            scores: { ...computedScores, repair_burden: burden, burden_cad: burdenCad, final_decision: fd } as never,
            recommendation: fd.decision,
            notes: ai.summary,
          })
          .select("id")
          .single();
        if (error) throw error;
        setSavedInspectionId(insp?.id ?? null);

        await supabase.from("valuation_reports").insert({
          user_id: user.id,
          inspection_id: insp?.id ?? null,
          vehicle_info: {
            year: Number(vehicle.year), make: vehicle.make, model: vehicle.model, mileage: Number(vehicle.mileage),
          } as never,
          base_price: val.base_price,
          fair_value_low: val.low_value,
          fair_value_avg: val.avg_value,
          fair_value_high: val.high_value,
          asking_price: askingPrice,
          decision: fd.decision,
          negotiation_advice: ai.negotiation_advice,
          ai_output: { ai, deterministic: fd } as never,
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
          onAddManual={(issue, severity) => recordManualFinding(currentStep.id, currentStep.category, issue, severity)}
          findings={findings.filter((f) => f.step === currentStep.id)}
          allFindings={findings}
          onRemoveFinding={removeFinding}
          vehicle={vehicle}
          onNext={nextStep}
          onPrev={prevStep}
          isLast={stepIdx === STEPS.length - 1}
        />
      )}
      {phase === "report" && scores && valuation && repairBurden && finalDecision && (
        <ReportScreen
          vehicle={vehicle}
          findings={findings}
          scores={scores}
          valuation={valuation}
          repairBurden={repairBurden}
          burdenCAD={burdenCAD}
          finalDecision={finalDecision}
          ai={aiFinal}
          submitting={submitting}
          inspectionId={savedInspectionId}
          onRestart={() => {
            setPhase("setup"); setStepIdx(0); setFindings([]); setStepFrames({}); setAiByStep({});
            setManualNotes({}); setScores(null); setValuation(null); setRepairBurden(null);
            setBurdenCAD(null); setFinalDecision(null); setAiFinal(null); setSavedInspectionId(null);
          }}
        />
      )}
      <WalkthroughModal
        open={showWalk}
        onClose={(dontShow) => {
          setShowWalk(false);
          if (dontShow) markWalkthroughSeen();
        }}
      />
    </AppShell>
  );
}

/* ============================== Setup screen ============================== */
function SetupScreen({
  vehicle, setVehicle, onStart,
}: { vehicle: VehicleForm; setVehicle: (v: VehicleForm) => void; onStart: () => void }) {
  return (
    <>
      {/* Hero */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-border bg-gradient-elevated p-6 shadow-card grid-bg">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-transparent" />
        <div className="relative">
          <Badge variant="outline" className="mb-3 border-primary/40 bg-primary/10 text-primary">
            <ScanSearch className="mr-1 h-3 w-3" /> Used Car Inspection
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight">
            Inspect like a <span className="text-gradient">pro mechanic</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            7-step guided walkaround. We score every system, estimate fair value, and tell you
            whether to <strong className="text-success">BUY</strong>,{" "}
            <strong className="text-warning">NEGOTIATE</strong>, or{" "}
            <strong className="text-destructive">AVOID</strong>.
          </p>
        </div>
      </div>

      <Card className="mb-4 bg-gradient-card shadow-card">
        <CardContent className="space-y-4 p-5">
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Vehicle details
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="year" className="text-[11px]">Year</Label>
                <Input id="year" inputMode="numeric" placeholder="2018" value={vehicle.year}
                  onChange={(e) => setVehicle({ ...vehicle, year: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="make" className="text-[11px]">Make</Label>
                <Input id="make" placeholder="Toyota" value={vehicle.make}
                  onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })} />
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor="model" className="text-[11px]">Model</Label>
              <Input id="model" placeholder="Camry SE" value={vehicle.model}
                onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="mileage" className="text-[11px]">Mileage</Label>
                <Input id="mileage" inputMode="numeric" placeholder="78,000" value={vehicle.mileage}
                  onChange={(e) => setVehicle({ ...vehicle, mileage: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="asking" className="text-[11px]">Asking price (CAD)</Label>
                <Input id="asking" inputMode="numeric" placeholder="14,500" value={vehicle.asking_price}
                  onChange={(e) => setVehicle({ ...vehicle, asking_price: e.target.value })} />
              </div>
            </div>
          </div>
          <Button className="mt-2 h-12 w-full text-base font-semibold shadow-glow" onClick={onStart}>
            Start guided inspection <ChevronRight className="h-5 w-5" />
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-gradient-card">
        <CardContent className="p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What we check ({STEPS.length} steps)
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{s.title}</div>
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    0{i + 1}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ============================== Step screen ============================== */
function StepScreen(props: {
  step: Step; stepIdx: number; totalSteps: number; progressPct: number;
  frame: string | null; ai: AiFrameResult | null; notes: string;
  onNotes: (v: string) => void;
  warningLightToggles: Record<string, boolean>;
  setWarningLightToggles: (fn: (p: Record<string, boolean>) => Record<string, boolean>) => void;
  onFrame: (dataUrl: string) => void; onAi: (ai: AiFrameResult) => void;
  onAddManual: (issue: string, severity: Finding["severity"]) => void;
  findings: Finding[]; allFindings: Finding[]; onRemoveFinding: (idx: number) => void;
  vehicle: VehicleForm; onNext: () => void; onPrev: () => void; isLast: boolean;
}) {
  const { step, stepIdx, totalSteps, progressPct } = props;
  const StepIcon = step.icon;

  return (
    <>
      {/* Premium progress tracker */}
      <Card className="mb-4 bg-gradient-elevated shadow-card">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                Step {stepIdx + 1} / {totalSteps}
              </span>
              <span className="text-[10px] text-muted-foreground">{progressPct}% complete</span>
            </div>
          </div>
          <Progress value={progressPct} className="h-1.5" />
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {STEPS.map((s, i) => (
              <span key={s.id}
                className={`flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-medium transition-all ${
                  i < stepIdx ? "border-success/40 bg-success/10 text-success"
                  : i === stepIdx ? "border-primary/50 bg-primary/15 text-primary shadow-glow"
                  : "border-border/60 bg-background/30 text-muted-foreground"
                }`}>
                {i < stepIdx && <Check className="h-3 w-3" />}
                {s.title}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step header */}
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
          <StepIcon className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight">{step.title}</h2>
          <p className="text-sm text-muted-foreground">{step.instruction}</p>
        </div>
      </div>

      {step.manualOnly ? (
        <DashboardChecklist toggles={props.warningLightToggles} setToggles={props.setWarningLightToggles} />
      ) : (
        <CameraCapture
          stepId={step.id} category={step.category} frame={props.frame} ai={props.ai}
          onFrame={props.onFrame} onAi={props.onAi} vehicle={props.vehicle}
        />
      )}

      <ManualFinding onAdd={props.onAddManual} />
      <NotesField value={props.notes} onChange={props.onNotes} />
      <FindingsList
        findings={props.findings}
        onRemove={(idx) => {
          const globalIdx = props.allFindings.findIndex((f) => f === props.findings[idx]);
          if (globalIdx >= 0) props.onRemoveFinding(globalIdx);
        }}
      />

      <div className="sticky bottom-20 z-10 mt-4 flex gap-2 rounded-2xl border border-border bg-card/95 p-2 shadow-card backdrop-blur">
        <Button variant="outline" onClick={props.onPrev}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <Button className="flex-1 shadow-glow" onClick={props.onNext}>
          {props.isLast ? "Generate report" : "Next step"} <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

/* ============================== Camera capture ============================== */
function CameraCapture({
  stepId, category, frame, ai, onFrame, onAi, vehicle,
}: {
  stepId: string; category: Finding["category"]; frame: string | null;
  ai: AiFrameResult | null; onFrame: (dataUrl: string) => void;
  onAi: (ai: AiFrameResult) => void; vehicle: VehicleForm;
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
  const [lastDetections, setLastDetections] = useState<{ class: string; score: number; bbox: [number,number,number,number] }[]>([]);
  const [coach, setCoach] = useState<CoachingHint | null>(null);
  const prevPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  if (typeof document !== "undefined" && !scratchRef.current) {
    scratchRef.current = document.createElement("canvas");
  }

  useEffect(() => {
    return () => {
      stopStream();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
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
    } finally { setLoadingModel(false); }
  }

  async function startCamera() {
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current; if (!v) return;
      v.srcObject = stream; await v.play();
      setStreaming(true);
      await ensureModel();
      detectLoop();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not access camera");
    }
  }

  async function detectLoop() {
    const v = videoRef.current; const overlay = overlayRef.current;
    const model = modelRef.current as
      | { detect: (v: HTMLVideoElement) => Promise<{ bbox: number[]; class: string; score: number }[]> }
      | null;
    if (!v || !overlay || !model || !streamRef.current) return;
    if (v.readyState >= 2) {
      overlay.width = v.videoWidth; overlay.height = v.videoHeight;
      try {
        const preds = await model.detect(v);
        const lite = preds.map((p) => ({ class: p.class, score: p.score, bbox: p.bbox as [number,number,number,number] }));
        setLastDetections(lite);
        const ctx = overlay.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          ctx.lineWidth = 3; ctx.font = "16px sans-serif";
          preds.forEach((p) => {
            const [x, y, w, h] = p.bbox;
            ctx.strokeStyle = "rgba(96,165,250,0.95)";
            ctx.fillStyle = "rgba(96,165,250,0.16)";
            ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
            const label = `${p.class} ${(p.score * 100).toFixed(0)}%`;
            const tw = ctx.measureText(label).width + 10;
            ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(x, Math.max(0, y - 22), tw, 22);
            ctx.fillStyle = "rgba(160,200,255,1)"; ctx.fillText(label, x + 5, Math.max(14, y - 6));
          });
        }
        // Coaching: deterministic frame analysis
        if (scratchRef.current) {
          const { stats, pixels } = sampleFrameStats(v, prevPixelsRef.current, lite, scratchRef.current);
          prevPixelsRef.current = pixels;
          setCoach(coachForStep(stepId, stats));
        }
      } catch (e) { console.error(e); }
    }
    rafRef.current = requestAnimationFrame(detectLoop);
  }

  async function captureFrame() {
    const v = videoRef.current; const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    const dataUrl = c.toDataURL("image/jpeg", 0.7);
    onFrame(dataUrl);
    setAnalyzing(true);
    try {
      const result = await callAi<AiFrameResult>(
        "inspection_frame",
        { step: stepId, category, detected_objects: lastDetections },
        { year: Number(vehicle.year) || null, make: vehicle.make, model: vehicle.model, mileage: Number(vehicle.mileage) || null },
      );
      onAi(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI analysis failed");
    } finally { setAnalyzing(false); }
  }

  return (
    <>
      <div className="relative mb-3 overflow-hidden rounded-3xl border border-border bg-black aspect-[3/4] shadow-card">
        {frame && !streaming ? (
          <img src={frame} alt="Captured frame" className="h-full w-full object-cover" />
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />

        {/* Viewfinder corners */}
        {streaming && (
          <>
            <div className="pointer-events-none absolute left-3 top-3 h-6 w-6 border-l-2 border-t-2 border-primary" />
            <div className="pointer-events-none absolute right-3 top-3 h-6 w-6 border-r-2 border-t-2 border-primary" />
            <div className="pointer-events-none absolute bottom-3 left-3 h-6 w-6 border-b-2 border-l-2 border-primary" />
            <div className="pointer-events-none absolute bottom-3 right-3 h-6 w-6 border-b-2 border-r-2 border-primary" />
            <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-primary backdrop-blur">
              ● LIVE • {STEP_GUIDANCE[stepId]?.hint ?? "Inspecting"}
            </div>
            <CoachingOverlay hint={coach} />
          </>
        )}

        {!streaming && !frame && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 text-primary">
              <Camera className="h-7 w-7" />
            </div>
            <Button onClick={startCamera} disabled={loadingModel}>
              {loadingModel ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading vision…</>
                : <><Camera className="h-4 w-4" /> Open camera</>}
            </Button>
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {streaming ? (
          <>
            <Button onClick={captureFrame} disabled={analyzing} className="flex-1 shadow-glow">
              {analyzing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</>
                : <><Sparkles className="h-4 w-4" /> Capture & analyze</>}
            </Button>
            <Button variant="outline" onClick={stopStream}>Stop</Button>
          </>
        ) : frame ? (
          <Button variant="outline" onClick={startCamera} className="flex-1">Recapture</Button>
        ) : null}
      </div>

      {ai && (
        <Card className="mb-3 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">AI Analysis</span>
            </div>
            <p className="text-sm">{ai.step_summary}</p>
            {ai.what_to_check_manually?.length > 0 && (
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Verify manually
                </h4>
                <ul className="list-disc space-y-0.5 pl-4 text-xs">
                  {ai.what_to_check_manually.map((x, i) => <li key={i}>{x}</li>)}
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

/* ============================== Dashboard checklist ============================== */
function DashboardChecklist({
  toggles, setToggles,
}: {
  toggles: Record<string, boolean>;
  setToggles: (fn: (p: Record<string, boolean>) => Record<string, boolean>) => void;
}) {
  const lights: { id: string; label: string; severity: Finding["severity"]; hint: string }[] = [
    { id: "check_engine", label: "Check Engine", severity: "high", hint: "Powertrain fault code" },
    { id: "abs", label: "ABS / Brake", severity: "medium", hint: "Anti-lock brake system" },
    { id: "airbag", label: "Airbag (SRS)", severity: "high", hint: "Safety restraint" },
    { id: "oil", label: "Oil Pressure", severity: "high", hint: "Stop driving immediately" },
    { id: "battery", label: "Battery", severity: "medium", hint: "Charging system" },
  ];
  return (
    <Card className="mb-4 bg-gradient-elevated shadow-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-semibold">Warning lights checklist</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Tap any light that <strong>stays lit</strong> after the bulb-check self-test.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {lights.map((l) => {
            const active = toggles[l.id];
            return (
              <button
                key={l.id} type="button"
                onClick={() => setToggles((p) => ({ ...p, [l.id]: !p[l.id] }))}
                className={`group relative overflow-hidden rounded-2xl border-2 p-3 text-left transition-all ${
                  active
                    ? "border-destructive/60 bg-destructive/15 shadow-decision text-destructive"
                    : "border-border/60 bg-background/40 hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 ${active ? "animate-pulse" : ""}`} />
                  <span className="text-sm font-semibold">{l.label}</span>
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wider opacity-80">
                  {active ? "● recorded" : l.hint}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================== Manual finding ============================== */
function ManualFinding({ onAdd }: { onAdd: (issue: string, severity: Finding["severity"]) => void }) {
  const [val, setVal] = useState("");
  const [sev, setSev] = useState<Finding["severity"]>("medium");
  return (
    <Card className="mb-3 bg-gradient-card">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <ScanSearch className="h-3.5 w-3.5 text-muted-foreground" />
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Add manual finding
          </h4>
        </div>
        <div className="flex gap-2">
          <Input placeholder="e.g. Scratch on driver door" value={val} onChange={(e) => setVal(e.target.value)} />
          <select className="rounded-md border border-input bg-background px-2 text-sm"
            value={sev} onChange={(e) => setSev(e.target.value as Finding["severity"])}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <Button type="button" onClick={() => { if (!val.trim()) return; onAdd(val.trim(), sev); setVal(""); }}>
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
      <Label htmlFor="step-notes" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Notes (optional)
      </Label>
      <Textarea id="step-notes" value={value} onChange={(e) => onChange(e.target.value)}
        rows={2} placeholder="Anything else you noticed at this step…" />
    </div>
  );
}

function FindingsList({ findings, onRemove }: { findings: Finding[]; onRemove: (idx: number) => void }) {
  if (findings.length === 0) return null;
  return (
    <Card className="mb-3 bg-gradient-card">
      <CardContent className="p-4">
        <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Findings at this step ({findings.length})
        </h4>
        <ul className="space-y-2">
          {findings.map((f, i) => (
            <li key={i} className="flex items-start justify-between gap-2 rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${severityClass(f.severity)}`}>
                    {f.severity}
                  </span>
                  <span className="text-sm font-medium">{f.issue}</span>
                </div>
                {f.notes && <p className="mt-1 text-[11px] text-muted-foreground">{f.notes}</p>}
              </div>
              <button type="button" onClick={() => onRemove(i)}
                className="text-muted-foreground hover:text-destructive" aria-label="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ============================== Report screen ============================== */
function ReportScreen({
  vehicle, findings, scores, valuation, repairBurden, burdenCAD, finalDecision, ai, submitting, inspectionId, onRestart,
}: {
  vehicle: VehicleForm; findings: Finding[]; scores: InspectionScores;
  valuation: ValuationOutput; repairBurden: RepairCostEstimate; burdenCAD: BurdenResult | null;
  finalDecision: FinalDecision; ai: AiFinalResult | null; submitting: boolean;
  inspectionId: string | null; onRestart: () => void;
}) {
  const decision = finalDecision.decision;
  const decisionMeta = {
    BUY: { tone: "border-success/50 bg-success/10 text-success shadow-decision", icon: ShieldCheck, gradient: "bg-gradient-success", label: "Recommended buy" },
    NEGOTIATE: { tone: "border-warning/50 bg-warning/10 text-warning shadow-decision", icon: TrendingDown, gradient: "bg-gradient-warning", label: "Negotiate first" },
    AVOID: { tone: "border-destructive/50 bg-destructive/10 text-destructive shadow-decision", icon: ShieldAlert, gradient: "bg-gradient-danger", label: "High risk — walk away" },
  }[decision];
  const DecisionIcon = decisionMeta.icon;

  const groupedByCategory = useMemo(() => {
    const groups: Record<string, Finding[]> = {};
    findings.filter((f) => f.severity !== "info").forEach((f) => {
      (groups[f.category] = groups[f.category] || []).push(f);
    });
    Object.values(groups).forEach((g) =>
      g.sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;
        return order[a.severity] - order[b.severity];
      })
    );
    return groups;
  }, [findings]);

  const categoryMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
    exterior: { label: "Exterior", icon: Car },
    interior: { label: "Interior", icon: Sofa },
    engine: { label: "Engine", icon: Wrench },
    tires: { label: "Tires", icon: Crosshair },
    dashboard: { label: "Dashboard", icon: Lightbulb },
  };

  return (
    <>
      {/* Vehicle summary */}
      <Card className="mb-4 overflow-hidden bg-gradient-elevated shadow-card grid-bg">
        <CardContent className="p-5">
          <Badge variant="outline" className="mb-2 text-[10px]">Inspection Report</Badge>
          <h1 className="text-2xl font-bold tracking-tight">
            {vehicle.year} {vehicle.make} <span className="text-gradient">{vehicle.model}</span>
          </h1>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{Number(vehicle.mileage).toLocaleString()} mi</span>
            {vehicle.asking_price && (
              <span>Asking {formatCAD(Number(vehicle.asking_price))}</span>
            )}
            <span>{findings.length} findings</span>
          </div>
        </CardContent>
      </Card>

      {/* Decision card — premium */}
      <Card className={`mb-4 border-2 ${decisionMeta.tone} ${decisionMeta.gradient}`}>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-current bg-background/30">
              <DecisionIcon className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">
                {decisionMeta.label}
              </div>
              <div className="mt-1 text-4xl font-black tracking-tight">{decision}</div>
              <p className="mt-2 text-sm opacity-95">
                {ai?.decision_reason ?? finalDecision.reasons[0] ?? ""}
              </p>
              {finalDecision.net_value !== null && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-current bg-background/40 px-3 py-1.5 text-xs font-semibold">
                  Net value after repairs: {formatCAD(finalDecision.net_value)}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Score grid */}
      <Card className="mb-4 bg-gradient-card shadow-card">
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Condition scores
            </h3>
            <div className={`text-3xl font-black ${scoreTone(scores.overall_score)}`}>
              {scores.overall_score}<span className="text-sm text-muted-foreground">/100</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ScoreTile label="Exterior" value={scores.exterior_score} />
            <ScoreTile label="Interior" value={scores.interior_score} />
            <ScoreTile label="Engine" value={scores.engine_score} />
            <ScoreTile label="Tires" value={scores.tire_score} />
          </div>
        </CardContent>
      </Card>

      {/* Risk flags */}
      {scores.risk_flags.length > 0 && (
        <Card className="mb-4 border-destructive/40 bg-gradient-danger">
          <CardContent className="p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-destructive">
              <AlertTriangle className="h-4 w-4" /> Risk flags
            </h3>
            <ul className="space-y-1.5">
              {scores.risk_flags.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Valuation */}
      <Card className="mb-4 bg-gradient-card shadow-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              <Gauge className="h-4 w-4" /> Fair value range
            </h3>
            {valuation.deal && (
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                valuation.deal === "good_deal" ? "border-success/40 bg-success/15 text-success"
                : valuation.deal === "fair" ? "border-primary/40 bg-primary/15 text-primary"
                : "border-destructive/40 bg-destructive/15 text-destructive"
              }`}>
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
            <div className="rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Banknote className="h-3.5 w-3.5" /> Asking price
                </span>
                <span className="font-bold">{formatCAD(Number(vehicle.asking_price))}</span>
              </div>
              {valuation.delta_vs_avg !== null && (
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">vs fair avg</span>
                  <span className={`flex items-center gap-1 font-semibold ${
                    valuation.delta_vs_avg > 0 ? "text-destructive" : "text-success"
                  }`}>
                    {valuation.delta_vs_avg > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {valuation.delta_vs_avg > 0 ? "+" : ""}{formatCAD(valuation.delta_vs_avg)}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Repair burden — Canadian shop pricing */}
      {burdenCAD && burdenCAD.high > 0 && (
        <Card className="mb-4 bg-gradient-card shadow-card">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                <Wrench className="h-4 w-4" /> Estimated repair burden
              </h3>
              <span className="text-xl font-black text-warning">
                {formatCAD(burdenCAD.low)}–{formatCAD(burdenCAD.high)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Aggregated across {burdenCAD.breakdown.length} finding{burdenCAD.breakdown.length === 1 ? "" : "s"}.
              Estimates based on typical Canadian shop pricing (labor + parts).
            </p>
          </CardContent>
        </Card>
      )}

      {/* Negotiation leverage */}
      {finalDecision.leverage_points.length > 0 && (
        <Card className="mb-4 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card shadow-card">
          <CardContent className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-primary">
              <Crosshair className="h-4 w-4" /> Negotiation leverage
            </h3>
            <ul className="space-y-1.5">
              {finalDecision.leverage_points.map((l, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
            {ai?.negotiation_advice && (
              <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-primary">AI advice</h4>
                <p className="mt-1 text-sm">{ai.negotiation_advice}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Issues by category — with repair handoff */}
      {Object.keys(groupedByCategory).length > 0 && (
        <Card className="mb-4 bg-gradient-card shadow-card">
          <CardContent className="p-5">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Issues by system
            </h3>
            <div className="space-y-4">
              {Object.entries(groupedByCategory).map(([cat, items]) => {
                const meta = categoryMeta[cat] ?? { label: cat, icon: Wrench };
                const Icon = meta.icon;
                return (
                  <div key={cat}>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-wider">{meta.label}</h4>
                      <span className="text-[10px] text-muted-foreground">({items.length})</span>
                    </div>
                    <ul className="space-y-2">
                      {items.map((f, i) => {
                        const handoff = classifyRepair(f);
                        const pricing = pricingForFinding(f, {
                          year: Number(vehicle.year) || null,
                          make: vehicle.make,
                          model: vehicle.model,
                        });
                        return (
                          <li key={i} className="rounded-xl border border-border/60 bg-background/40 p-3">
                            <div className="flex items-start gap-2">
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${severityClass(f.severity)}`}>
                                {f.severity}
                              </span>
                              <div className="flex-1">
                                <div className="text-sm font-medium">{f.issue}</div>
                                <div className="mt-0.5 text-[11px] text-muted-foreground">
                                  Location: {f.step.replace(/_/g, " ")} · Est. {formatCAD(pricing.low_estimate)}–{formatCAD(pricing.high_estimate)}
                                </div>
                              </div>
                            </div>
                            <Button asChild size="sm" variant="outline" className="mt-3 w-full border-primary/30 text-primary hover:bg-primary/10">
                              <Link
                                to="/repair"
                                search={{
                                  workflow: handoff.workflow,
                                  issue: handoff.issue,
                                  severity: handoff.severity,
                                  location: handoff.location,
                                  category: handoff.category,
                                  inspection_id: inspectionId ?? undefined,
                                }}
                              >
                                <Wrench className="h-3.5 w-3.5" /> View repair options · {handoff.label}
                              </Link>
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI summary */}
      {submitting && (
        <Card className="mb-4">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Generating AI negotiation narrative…
          </CardContent>
        </Card>
      )}
      {ai && (
        <Card className="mb-4 bg-gradient-card shadow-card">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold">{ai.headline}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{ai.summary}</p>
            {ai.talking_points?.length > 0 && (
              <div>
                <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Talking points
                </h4>
                <ul className="list-disc space-y-1 pl-5 text-xs">
                  {ai.talking_points.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 pb-4">
        <Button variant="outline" onClick={onRestart} className="flex-1">
          New inspection
        </Button>
        <Button asChild className="flex-1 shadow-glow">
          <Link to="/history">View history</Link>
        </Button>
      </div>
    </>
  );
}

function scoreTone(value: number) {
  if (value >= 80) return "text-success";
  if (value >= 60) return "text-primary";
  if (value >= 40) return "text-warning";
  return "text-destructive";
}

function ScoreTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={`text-lg font-black ${scoreTone(value)}`}>{value}</span>
      </div>
      <Progress value={value} className="h-1" />
    </div>
  );
}

function ValueCell({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border-2 p-3 ${
      highlight ? "border-primary/40 bg-primary/10" : "border-border/60 bg-background/40"
    }`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-black ${highlight ? "text-primary" : ""}`}>
        {formatCAD(value)}
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  classifyIssueType,
  estimateRepairCost,
  formatCAD,
  type IssueType,
} from "@/lib/pricing";
import { checkQuote, type QuoteCheckResult } from "@/lib/diagnosis-orchestrator";
import { Receipt, ShieldCheck, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/quote-check")({
  component: QuoteCheckPage,
});

const COMMON_REPAIRS: { label: string; type: IssueType }[] = [
  { label: "Brake pads / rotors", type: "brake_service" },
  { label: "Battery replacement", type: "battery" },
  { label: "Alternator / starter", type: "alternator_starter" },
  { label: "Tire service", type: "tire_service" },
  { label: "Engine misfire", type: "misfire" },
  { label: "Fluid leak", type: "fluid_leak" },
  { label: "Cooling system", type: "cooling_system" },
  { label: "Suspension", type: "suspension" },
  { label: "Transmission", type: "transmission" },
  { label: "Dent / body", type: "dent" },
  { label: "Scratch / paint", type: "scratch_paint" },
  { label: "Warning light diagnostic", type: "warning_light_diagnostic" },
  { label: "General repair", type: "general_repair" },
];

function QuoteCheckPage() {
  const [repairType, setRepairType] = useState<IssueType>("brake_service");
  const [customDescription, setCustomDescription] = useState("");
  const [quote, setQuote] = useState("");
  const [vehicle, setVehicle] = useState({ year: "", make: "", model: "" });
  const [submitted, setSubmitted] = useState(false);

  const result = useMemo<{ pricing: ReturnType<typeof estimateRepairCost>; check: QuoteCheckResult } | null>(() => {
    if (!submitted) return null;
    const quoteNum = Number(quote);
    if (!Number.isFinite(quoteNum) || quoteNum <= 0) return null;
    const issueType = customDescription.trim()
      ? classifyIssueType(customDescription)
      : repairType;
    const pricing = estimateRepairCost({
      issue_type: issueType,
      severity: "medium",
      vehicle_year: vehicle.year ? Number(vehicle.year) : null,
      vehicle_make: vehicle.make || null,
      vehicle_model: vehicle.model || null,
      region: "canada",
    });
    const check = checkQuote(quoteNum, pricing.low_estimate, pricing.high_estimate);
    return { pricing, check };
  }, [submitted, quote, repairType, customDescription, vehicle]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <AppShell title="Quote check" showBack>
      <section className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Mechanic quote check</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a quote and we'll tell you if it's fair, high, or suspiciously low — based on
          typical Canadian shop pricing. No AI required.
        </p>
      </section>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Repair type</Label>
          <Select value={repairType} onValueChange={(v) => setRepairType(v as IssueType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_REPAIRS.map((r) => (
                <SelectItem key={r.type} value={r.type}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Or describe the work (optional)</Label>
          <Input
            value={customDescription}
            onChange={(e) => setCustomDescription(e.target.value)}
            placeholder="e.g. front brake pads and rotors"
          />
        </div>

        <div className="space-y-2">
          <Label>Quoted price (CAD)</Label>
          <Input
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 850"
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Vehicle (optional)</Label>
          <div className="grid grid-cols-3 gap-2">
            <Input
              placeholder="Year"
              inputMode="numeric"
              value={vehicle.year}
              onChange={(e) => setVehicle({ ...vehicle, year: e.target.value })}
            />
            <Input
              placeholder="Make"
              value={vehicle.make}
              onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })}
            />
            <Input
              placeholder="Model"
              value={vehicle.model}
              onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })}
            />
          </div>
        </div>

        <Button type="submit" className="w-full shadow-glow">
          <Receipt className="h-4 w-4" /> Check this quote
        </Button>
      </form>

      {result && <QuoteVerdict result={result} quoted={Number(quote)} />}
    </AppShell>
  );
}

function QuoteVerdict({
  result,
  quoted,
}: {
  result: { pricing: ReturnType<typeof estimateRepairCost>; check: QuoteCheckResult };
  quoted: number;
}) {
  const { check } = result;
  const tone =
    check.verdict === "fair"
      ? { bg: "border-success/40 bg-success/10", text: "text-success", label: "Fair price", Icon: ShieldCheck }
      : check.verdict === "high"
      ? { bg: "border-warning/40 bg-warning/10", text: "text-warning", label: "Looks high", Icon: TrendingUp }
      : check.verdict === "very_high"
      ? { bg: "border-destructive/40 bg-destructive/10", text: "text-destructive", label: "Overpriced", Icon: AlertTriangle }
      : { bg: "border-primary/40 bg-primary/10", text: "text-primary", label: "Suspiciously low", Icon: TrendingDown };
  const { Icon } = tone;

  return (
    <Card className="mt-6 bg-gradient-card shadow-card">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Verdict
          </h3>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone.bg} ${tone.text}`}
          >
            <Icon className="h-3 w-3" /> {tone.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border/60 bg-background/40 p-3">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Your quote
            </div>
            <div className="text-base font-black leading-tight">{formatCAD(quoted)}</div>
          </div>
          <div className="rounded-xl border-2 border-primary/40 bg-primary/10 p-3">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Expected range
            </div>
            <div className="text-base font-black leading-tight text-primary">
              {formatCAD(check.expectedLow)} – {formatCAD(check.expectedHigh)}
            </div>
          </div>
        </div>

        <p className="text-sm">{check.message}</p>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Negotiation advice
          </div>
          <p className="mt-1 text-sm">{check.negotiationAdvice}</p>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Questions to ask the shop
          </h4>
          <ul className="list-disc space-y-1 pl-4 text-xs">
            {check.questionsToAsk.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>

        <p className="border-t border-border/60 pt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Based on typical Canadian shop pricing · No AI required
        </p>
      </CardContent>
    </Card>
  );
}

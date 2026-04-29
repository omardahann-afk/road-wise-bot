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
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Receipt,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Save,
  MessageSquareQuote,
  Flag,
  Users,
} from "lucide-react";

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
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const { user } = useAuth();

  const result = useMemo<{
    pricing: ReturnType<typeof estimateRepairCost>;
    check: QuoteCheckResult;
    issueType: IssueType;
  } | null>(() => {
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
    return { pricing, check, issueType };
  }, [submitted, quote, repairType, customDescription, vehicle]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavedId(null);
    setSubmitted(true);
  }

  async function saveResult() {
    if (!user || !result) {
      if (!user) toast.info("Sign in to save quote checks to your history.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("diagnostics")
        .insert({
          user_id: user.id,
          mode: "symptom",
          input: {
            quote_check: true,
            quoted: Number(quote),
            repair_type: result.issueType,
            description: customDescription || null,
            vehicle,
          } as never,
          ai_output: {
            pricing: result.pricing,
            check: result.check,
            source: "quote_check",
          } as never,
          severity: "info",
          summary: `Quote check: ${COMMON_REPAIRS.find((r) => r.type === result.issueType)?.label ?? result.issueType} — ${result.check.verdict}`,
        })
        .select("id")
        .single();
      if (error) throw error;
      setSavedId(data?.id ?? null);
      toast.success("Saved to your history");
    } catch (err) {
      console.warn("Save quote check failed:", err);
      toast.info("Couldn't save right now — your result is still on screen.");
    } finally {
      setSaving(false);
    }
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

      {result && (
        <QuoteVerdict
          result={result}
          quoted={Number(quote)}
          onSave={saveResult}
          saving={saving}
          saved={!!savedId}
          canSave={!!user}
        />
      )}
    </AppShell>
  );
}

function QuoteVerdict({
  result,
  quoted,
  onSave,
  saving,
  saved,
  canSave,
}: {
  result: { pricing: ReturnType<typeof estimateRepairCost>; check: QuoteCheckResult };
  quoted: number;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  canSave: boolean;
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

  const showOverpay =
    (check.verdict === "high" || check.verdict === "very_high") && check.overpayAmount > 0;

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

        {showOverpay && (
          <div className="rounded-xl border-2 border-destructive/40 bg-destructive/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-destructive">
              You may be overpaying
            </div>
            <div className="mt-0.5 text-lg font-black leading-tight text-destructive">
              ~{formatCAD(check.overpayAmount)} above typical · {check.markupPct}% markup
            </div>
          </div>
        )}

        <p className="text-sm">{check.message}</p>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Negotiation advice
          </div>
          <p className="mt-1 text-sm">{check.negotiationAdvice}</p>
        </div>

        {check.negotiationScript.length > 0 && (
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <MessageSquareQuote className="h-3 w-3" /> Negotiation script
            </h4>
            <ul className="space-y-1.5">
              {check.negotiationScript.map((s, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-border/60 bg-background/40 p-2.5 text-xs italic leading-snug"
                >
                  "{s}"
                </li>
              ))}
            </ul>
          </div>
        )}

        {check.redFlags.length > 0 && (
          <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
            <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-warning">
              <Flag className="h-3 w-3" /> Red flags to watch for
            </h4>
            <ul className="list-disc space-y-0.5 pl-4 text-xs">
              {check.redFlags.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}

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

        {check.suggestSecondOpinion && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-primary">
              <Users className="h-3 w-3" /> Get a second opinion
            </div>
            <p className="mt-1 text-muted-foreground">
              At this markup level, a 5-minute call to one or two other shops is usually worth it.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
          <Button
            type="button"
            size="sm"
            variant={saved ? "outline" : "default"}
            disabled={saving || saved}
            onClick={onSave}
            className="flex-1"
          >
            <Save className="h-3.5 w-3.5" />
            {saved ? "Saved to history" : saving ? "Saving…" : canSave ? "Save result" : "Sign in to save"}
          </Button>
        </div>

        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Based on typical Canadian shop pricing · No AI required
        </p>
      </CardContent>
    </Card>
  );
}

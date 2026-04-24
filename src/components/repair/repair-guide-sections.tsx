import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldAlert,
  Wrench as WrenchIcon,
  AlertTriangle,
  PlayCircle,
  Clock,
  Gauge,
  PhoneCall,
  Settings2,
} from "lucide-react";
import type { RepairGuideMeta } from "@/lib/repair-engine";

/**
 * Premium header for the "Fix it" repair guide screen.
 * Surfaces the three things a user wants to know first: what they're fixing,
 * how hard it is, and how long it takes.
 */
export function RepairGuideHeader({
  title,
  subtitle,
  difficulty,
  timeEstimate,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  timeEstimate: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const difficultyLabel: Record<typeof difficulty, string> = {
    beginner: "Easy",
    intermediate: "Medium",
    advanced: "Hard",
  };
  const difficultyTone: Record<typeof difficulty, string> = {
    beginner: "border-success/40 bg-success/15 text-success",
    intermediate: "border-warning/40 bg-warning/15 text-warning",
    advanced: "border-destructive/40 bg-destructive/15 text-destructive",
  };

  return (
    <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card shadow-card">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
            <Icon className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <Badge variant="outline" className="mb-1 text-[10px]">
              Repair guide
            </Badge>
            <h1 className="text-xl font-bold leading-tight tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className={`rounded-xl border px-3 py-2 ${difficultyTone[difficulty]}`}>
            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider opacity-80">
              <Gauge className="h-3 w-3" /> Difficulty
            </div>
            <div className="mt-0.5 text-sm font-bold">{difficultyLabel[difficulty]}</div>
          </div>
          <div className="rounded-xl border border-border bg-background/40 px-3 py-2">
            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3 w-3" /> Estimated time
            </div>
            <div className="mt-0.5 text-sm font-bold">{timeEstimate}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * MANDATORY safety section — always rendered at the top of every guide.
 * Combines deterministic per-workflow safety with any AI-generated warnings.
 */
export function SafetySection({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <Card className="border-2 border-warning/40 bg-warning/10">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-warning">
          <ShieldAlert className="h-5 w-5" />
          <h3 className="text-sm font-bold uppercase tracking-wider">
            Safety first
          </h3>
        </div>
        <ul className="space-y-1.5 text-xs leading-relaxed">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Tools required — short, human-readable list (3–6 items). */
export function ToolsSection({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <WrenchIcon className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">Tools required</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {items.slice(0, 6).map((t, i) => (
            <span
              key={i}
              className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium"
            >
              {t}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Common mistakes & risks — "Watch out for". */
export function WatchOutSection({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <h3 className="text-sm font-bold">Watch out for</h3>
        </div>
        <ul className="space-y-1.5 text-xs leading-relaxed">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * "When to stop and see a mechanic" — escalation triggers. Always-render-able
 * section that prevents users from continuing into territory that's unsafe or
 * outside the scope of a DIY guide. Mechanic-grade honesty over upsell.
 */
export function WhenToStopSection({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <Card className="border-2 border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-primary">
          <PhoneCall className="h-4 w-4" />
          <h3 className="text-sm font-bold uppercase tracking-wider">
            When to stop and see a mechanic
          </h3>
        </div>
        <ul className="space-y-1.5 text-xs leading-relaxed">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Torque / spec note — vehicle-dependent values. We never invent torque
 * numbers; we tell users to look them up. Honest by design.
 */
export function TorqueNoteSection({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <Card className="border-border bg-muted/30">
      <CardContent className="flex items-start gap-3 p-4">
        <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Torque & specs
          </h3>
          <p className="mt-1 text-xs leading-relaxed">{note}</p>
        </div>
      </CardContent>
    </Card>
  );
}
 * (no live YouTube/video API yet) — labeled honestly so users know it's
 * a written summary, not embedded video. Replace with real API later.
 */
export function VideoGuideSection({ videos }: { videos: RepairGuideMeta["videos"] }) {
  if (!videos || videos.length === 0) return null;
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <PlayCircle className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">Quick video guide</h3>
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Short walkthrough summaries — common patterns from typical tutorials.
        </p>
        <div className="space-y-2">
          {videos.slice(0, 2).map((v, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-background/50 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold leading-tight">{v.title}</h4>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {v.channel}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {v.duration}
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-foreground/90">
                {v.summary}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

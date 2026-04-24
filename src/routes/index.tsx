import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/lib/auth-context";
import {
  Camera,
  Sparkles,
  Search,
  Wrench,
  ScanLine,
  Stethoscope,
  GraduationCap,
  Car,
  ChevronRight,
} from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

const PRIMARY_PATHS = [
  {
    to: "/diagnose/camera",
    eyebrow: "Something is wrong",
    title: "Diagnose my car",
    desc: "Scan a part with your camera, decode an OBD2 code, or describe a symptom — get an AI diagnosis with repair steps.",
    icon: Camera,
    accent: "from-primary to-primary-glow",
    cta: "Scan your car",
  },
  {
    to: "/cleaning",
    eyebrow: "Maintain & care",
    title: "Clean or maintain",
    desc: "Pick an area (interior, wheels, engine bay) and get safe products, tools, and a step-by-step cleaning plan.",
    icon: Sparkles,
    accent: "from-success to-emerald-400",
    cta: "Open cleaning guide",
  },
  {
    to: "/inspection",
    eyebrow: "Buying a used car",
    title: "Inspect before you buy",
    desc: "7-step guided walkaround, repair burden in CAD, and a clear BUY / NEGOTIATE / AVOID call.",
    icon: Search,
    accent: "from-warning to-amber-400",
    cta: "Start inspection",
  },
] as const;

const SHORTCUTS = [
  { to: "/diagnose/obd2", title: "OBD2 code lookup", icon: ScanLine },
  { to: "/diagnose/symptom", title: "Symptom checker", icon: Stethoscope },
  { to: "/repair", title: "Repair workflows", icon: Wrench },
  { to: "/valuation", title: "Value & negotiate", icon: Search },
  { to: "/beginner", title: "Beginner mode", icon: GraduationCap },
  { to: "/vehicles", title: "Saved vehicles", icon: Car },
] as const;

function HomePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth" });
    }
  }, [loading, user, navigate]);

  return (
    <AppShell>
      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          AutoSage AI
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          Hello{user?.email ? `, ${user.email.split("@")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What do you want to do today?
        </p>
      </section>

      {/* Primary hero CTA */}
      <Link
        to="/diagnose/camera"
        className="group mb-5 block overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/20 via-card to-card p-5 shadow-glow transition-all hover:border-primary/60"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
            <Camera className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              Primary action
            </div>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight">Scan your car</h2>
            <p className="text-xs text-muted-foreground">
              Point the camera at any part and let AI tell you what it is.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
        </div>
      </Link>

      {/* 3 user paths */}
      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Choose your path
        </h2>
        <div className="grid grid-cols-1 gap-3">
          {PRIMARY_PATHS.map((path) => {
            const Icon = path.icon;
            return (
              <Link
                key={path.to}
                to={path.to}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-elegant transition-all hover:border-primary/40 hover:shadow-glow"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${path.accent} text-primary-foreground shadow-glow`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {path.eyebrow}
                    </div>
                    <h3 className="mt-0.5 text-base font-bold tracking-tight">{path.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{path.desc}</p>
                    <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      {path.cta}
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Quick shortcuts (compact) */}
      <section className="mb-2">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick tools
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {SHORTCUTS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.to}
                to={s.to}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-3 text-center transition-colors hover:border-primary/40"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-[11px] font-medium leading-tight">{s.title}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}

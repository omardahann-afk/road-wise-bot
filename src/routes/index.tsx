import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Wrench,
  ScanLine,
  Stethoscope,
  Sparkles,
  Search,
  Car,
  GraduationCap,
  DollarSign,
} from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

const primaryModes = [
  { to: "/diagnose/camera", title: "Live Camera Diagnose", desc: "Point your phone at the issue", icon: Camera, hot: true },
  { to: "/diagnose/obd2", title: "OBD2 Code Lookup", desc: "Decode any P/B/C/U trouble code", icon: ScanLine, hot: true },
  { to: "/diagnose/symptom", title: "Symptom Checker", desc: "Describe what's happening", icon: Stethoscope, hot: true },
] as const;

const moreModes = [
  { to: "/repair", title: "Repair Mode", desc: "Wrap, paint, dent, rust", icon: Wrench },
  { to: "/cleaning", title: "Cleaning & LED", desc: "Detailing & mods", icon: Sparkles },
  { to: "/inspection", title: "Used Car Inspection", desc: "Buy with confidence", icon: Search },
  { to: "/valuation", title: "Value & Negotiate", desc: "Fair price + advice", icon: DollarSign },
  { to: "/beginner", title: "Beginner Mode", desc: "Learn your car", icon: GraduationCap },
  { to: "/vehicles", title: "Saved Vehicles", desc: "Your garage", icon: Car },
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
        <h1 className="text-2xl font-bold tracking-tight">
          Hello{user?.email ? `, ${user.email.split("@")[0]}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">What are we working on today?</p>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Diagnose
        </h2>
        <div className="grid grid-cols-1 gap-3">
          {primaryModes.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.to}
                to={m.to}
                className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-elegant transition-all hover:border-primary/40 hover:shadow-glow"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{m.title}</h3>
                    {m.hot && (
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                        Live
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{m.desc}</p>
                </div>
                <span className="text-muted-foreground transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          More tools
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {moreModes.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.to}
                to={m.to}
                className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold">{m.title}</h3>
                <p className="text-[11px] text-muted-foreground">{m.desc}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {!user && !loading && (
        <Button asChild className="w-full">
          <Link to="/auth">Sign in to save your work</Link>
        </Button>
      )}
    </AppShell>
  );
}

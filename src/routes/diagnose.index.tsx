import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Camera, ScanLine, Stethoscope } from "lucide-react";

export const Route = createFileRoute("/diagnose/")({
  component: DiagnoseIndex,
});

const modes = [
  { to: "/diagnose/camera", title: "Live Camera", desc: "Real-time vision", icon: Camera },
  { to: "/diagnose/obd2", title: "OBD2 Code", desc: "Decode trouble codes", icon: ScanLine },
  { to: "/diagnose/symptom", title: "Symptom Checker", desc: "Describe the issue", icon: Stethoscope },
] as const;

function DiagnoseIndex() {
  return (
    <AppShell title="Diagnose">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Diagnose</h1>
      <p className="mb-6 text-sm text-muted-foreground">Pick how you want to investigate.</p>
      <div className="grid grid-cols-1 gap-3">
        {modes.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.to}
              to={m.to}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-glow"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
                <Icon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{m.title}</h3>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </div>
              <span className="text-muted-foreground">→</span>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Car, Plus, Loader2, Heart, BellRing } from "lucide-react";
import { toast } from "sonner";
import { SignInEmptyState } from "@/components/layout/sign-in-empty-state";
import {
  computeVehicleHealth,
  computeReminders,
  healthToneClass,
  reminderToneClass,
  type HealthSummary,
  type Reminder,
} from "@/lib/vehicle-health";

export const Route = createFileRoute("/vehicles")({
  component: VehiclesPage,
});

interface Vehicle {
  id: string;
  nickname: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  mileage: number | null;
}

interface DiagSeverityRow {
  vehicle_id: string | null;
  severity: string | null;
  created_at: string;
}

function VehiclesPage() {
  const { user, loading: authLoading } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [diagsByVehicle, setDiagsByVehicle] = useState<Record<string, DiagSeverityRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ nickname: "", year: "", make: "", model: "", mileage: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!user) return;
    const [vehRes, diagRes] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id,nickname,year,make,model,mileage")
        .order("created_at", { ascending: false }),
      supabase
        .from("diagnostics")
        .select("vehicle_id,severity,created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    const list = (vehRes.data as Vehicle[] | null) ?? [];
    setVehicles(list);

    const grouped: Record<string, DiagSeverityRow[]> = {};
    ((diagRes.data as DiagSeverityRow[] | null) ?? []).forEach((row) => {
      if (!row.vehicle_id) return;
      (grouped[row.vehicle_id] ||= []).push(row);
    });
    setDiagsByVehicle(grouped);
    setLoading(false);
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!form.year.trim() || !form.make.trim() || !form.model.trim()) {
      toast.error("Year, Make, and Model are required.");
      return;
    }
    try {
      const { error } = await supabase.from("vehicles").insert({
        user_id: user.id,
        nickname: form.nickname || null,
        year: form.year ? Number(form.year) : null,
        make: form.make || null,
        model: form.model || null,
        mileage: form.mileage ? Number(form.mileage) : null,
      });
      if (error) throw error;
      toast.success("Vehicle saved");
      setForm({ nickname: "", year: "", make: "", model: "", mileage: "" });
      setAdding(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save vehicle");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Garage" showBack>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your garage</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Add your car to personalize results, track health, and surface reminders.
          </p>
        </div>
        {user && (
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        )}
      </div>

      {!user && <SignInEmptyState context="vehicles, diagnostics, inspections, and reports" />}

      {adding && user && (
        <Card className="mb-4">
          <CardContent className="space-y-3 p-4">
            <form onSubmit={add} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nickname (optional)</Label>
                <Input
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  placeholder="My daily"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  placeholder="Year *"
                  inputMode="numeric"
                  required
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                />
                <Input
                  placeholder="Make *"
                  required
                  value={form.make}
                  onChange={(e) => setForm({ ...form, make: e.target.value })}
                />
                <Input
                  placeholder="Model *"
                  required
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
              </div>
              <Input
                placeholder="Mileage (km)"
                inputMode="numeric"
                value={form.mileage}
                onChange={(e) => setForm({ ...form, mileage: e.target.value })}
              />
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save vehicle"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {user && loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {user && !loading && vehicles.length === 0 && !adding && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <Car className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No vehicles yet.</p>
            <Button size="sm" className="mt-2" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add your car
            </Button>
          </CardContent>
        </Card>
      )}

      <ul className="space-y-3">
        {vehicles.map((v) => {
          const health = computeVehicleHealth(diagsByVehicle[v.id] ?? []);
          const reminders = computeReminders(v.mileage);
          return (
            <li key={v.id}>
              <VehicleCard vehicle={v} health={health} reminders={reminders} />
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}

function VehicleCard({
  vehicle,
  health,
  reminders,
}: {
  vehicle: Vehicle;
  health: HealthSummary;
  reminders: Reminder[];
}) {
  const title =
    vehicle.nickname ||
    `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() ||
    "Vehicle";
  const sub = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-gradient-card shadow-elegant">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
          <Car className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-bold">{title}</h3>
              <p className="text-[11px] text-muted-foreground">
                {sub}
                {vehicle.mileage ? ` · ${vehicle.mileage.toLocaleString()} km` : ""}
              </p>
            </div>
            <span
              className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${healthToneClass(health.status)}`}
            >
              <Heart className="h-3 w-3" />
              {health.label}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{health.reason}</p>
        </div>
      </div>

      {reminders.length > 0 && (
        <div className="border-t border-border/60 bg-background/40 px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <BellRing className="h-3 w-3" /> Reminders
          </div>
          <ul className="space-y-1.5">
            {reminders.slice(0, 3).map((r) => (
              <li
                key={r.task.id}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${reminderToneClass(r.status)}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold">{r.task.title}</div>
                  <div className="truncate text-[10px] opacity-80">{r.task.description}</div>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {r.status === "overdue"
                    ? `Overdue by ${Math.abs(r.km_remaining).toLocaleString()} km`
                    : `Due in ${r.km_remaining.toLocaleString()} km`}
                </Badge>
              </li>
            ))}
          </ul>
          {reminders.length > 3 && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              +{reminders.length - 3} more reminder{reminders.length - 3 === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Car, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

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

function VehiclesPage() {
  const { user, loading: authLoading } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ nickname: "", year: "", make: "", model: "", mileage: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!user) return;
    const { data } = await supabase
      .from("vehicles")
      .select("id,nickname,year,make,model,mileage")
      .order("created_at", { ascending: false });
    setVehicles((data as Vehicle[] | null) ?? []);
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
    setBusy(true);
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
    <AppShell title="Garage">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Saved Vehicles</h1>
        {user && (
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        )}
      </div>

      {!user && <p className="text-sm text-muted-foreground">Sign in to save vehicles.</p>}

      {adding && user && (
        <Card className="mb-4">
          <CardContent className="space-y-3 p-4">
            <form onSubmit={add} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nickname</Label>
                <Input
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  placeholder="My daily"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  placeholder="Year"
                  inputMode="numeric"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                />
                <Input
                  placeholder="Make"
                  value={form.make}
                  onChange={(e) => setForm({ ...form, make: e.target.value })}
                />
                <Input
                  placeholder="Model"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
              </div>
              <Input
                placeholder="Mileage"
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
          </CardContent>
        </Card>
      )}

      <ul className="space-y-2">
        {vehicles.map((v) => (
          <li
            key={v.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
              <Car className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">
                {v.nickname || `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim() || "Vehicle"}
              </p>
              <p className="text-xs text-muted-foreground">
                {[v.year, v.make, v.model].filter(Boolean).join(" ")}
                {v.mileage ? ` · ${v.mileage.toLocaleString()} mi` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
